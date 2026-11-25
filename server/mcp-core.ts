/**
 * A minimal, stateless MCP server over Streamable HTTP (JSON responses only),
 * for outside agents such as Nod.
 *
 * Why hand-rolled: an MCP client only needs `initialize`, `tools/list` and
 * `tools/call` here. Every request is answered on its own, with no session and
 * no SSE stream, so the protocol is a few JSON-RPC methods.
 *
 * Auth: every request needs `Authorization: Bearer <NOD_MCP_TOKEN>`. Without
 * that variable the endpoint is off (503), so deploying changes nothing until
 * the token is set.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type express from 'express';

export interface McpTool<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

export interface McpServerSpec<Ctx> {
  name: string;
  version: string;
  instructions: string;
  tools: McpTool<Ctx>[];
}

type Refusal = { error: string; status: number };
type JsonRpcId = string | number | null;
interface JsonRpcMessage { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> }

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** Thrown by a tool for a caller mistake; returned to the model as a tool error. */
export class McpToolError extends Error {}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function bearerMatches(header: string | undefined, expected: string): boolean {
  const supplied = String(header || '').replace(/^Bearer\s+/i, '').trim();
  if (!supplied || !expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function answer<Ctx>(spec: McpServerSpec<Ctx>, message: JsonRpcMessage, ctx: Ctx) {
  const id = message.id ?? null;
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: spec.name, version: spec.version },
          instructions: spec.instructions,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: spec.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
        },
      };
    case 'tools/call': {
      const tool = spec.tools.find((candidate) => candidate.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
      try {
        const output = await tool.run(args, ctx);
        const text = typeof output === 'string' ? output : JSON.stringify(output, null, 1);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text }],
            ...(output && typeof output === 'object' && !Array.isArray(output) ? { structuredContent: output } : {}),
            isError: false,
          },
        };
      } catch (error) {
        const known = error instanceof McpToolError;
        if (!known) console.error(`[mcp] ${tool.name} failed:`, error);
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: known ? (error as Error).message : 'The tool failed on the server.' }], isError: true },
        };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${String(message.method)}`);
  }
}

/** Express handler. `resolveContext` returns the tools' context, or a refusal. */
export function mcpHandler<Ctx extends object>(
  spec: McpServerSpec<Ctx>,
  resolveContext: (req: express.Request) => Promise<Ctx | Refusal>,
): express.RequestHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = String(process.env.NOD_MCP_TOKEN || '').trim();
    if (!token) { res.status(503).json({ error: 'MCP access is not enabled on this deployment.' }); return; }
    if (!bearerMatches(req.headers.authorization, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="mcp"');
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    // Stateless server: no SSE stream to resume and no session to end.
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Method not allowed.' }); return; }

    const ctx = await resolveContext(req);
    if ('error' in ctx && typeof ctx.error === 'string') { res.status((ctx as Refusal).status).json({ error: ctx.error }); return; }

    const body: unknown = req.body;
    if (!body || typeof body !== 'object') { res.status(400).json(rpcError(null, -32700, 'Parse error')); return; }
    const messages = (Array.isArray(body) ? body : [body]) as JsonRpcMessage[];
    const replies = [];
    for (const message of messages) {
      if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') { replies.push(rpcError(null, -32600, 'Invalid request')); continue; }
      // Notifications and client responses carry no id and get no reply.
      if (message.id === undefined || !message.method) continue;
      replies.push(await answer(spec, message, ctx as Ctx));
    }
    if (replies.length === 0) { res.status(202).end(); return; }
    res.json(Array.isArray(body) ? replies : replies[0]);
  };
}

/** Argument helpers. */
export const optString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new McpToolError(`"${key}" must be a string.`);
  return String(value).trim();
};
export const optInt = (args: Record<string, unknown>, key: string, fallback: number, max: number): number => {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) throw new McpToolError(`"${key}" must be a positive number.`);
  return Math.min(Math.floor(n), max);
};
