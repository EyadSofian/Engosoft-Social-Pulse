import { z } from 'zod';
import { recordUsage, type OpenAIUsage } from './usage.js';

export const creativeEditRequest = z.object({
  command: z.string().trim().min(3).max(400),
  platform: z.string().max(30),
  headline: z.string().max(130),
  body: z.string().max(500),
  cta: z.string().max(40),
  detail: z.string().max(100),
  visualDirection: z.string().max(500),
});
export type CreativeEditRequest = z.infer<typeof creativeEditRequest>;
const editResult = z.object({
  headline: z.string(), body: z.string(), cta: z.string(), detail: z.string(), visualDirection: z.string(),
  action: z.enum(['edit_text', 'regenerate_image', 'both']), explanation: z.string(),
});

export async function applyCreativeCommand(input: CreativeEditRequest, env: NodeJS.ProcessEnv = process.env) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY غير مضبوط على الخادم.');
  const schema = { type: 'object', additionalProperties: false, required: ['headline','body','cta','detail','visualDirection','action','explanation'], properties: {
    headline: { type: 'string' }, body: { type: 'string' }, cta: { type: 'string' }, detail: { type: 'string' }, visualDirection: { type: 'string' }, action: { type: 'string', enum: ['edit_text','regenerate_image','both'] }, explanation: { type: 'string' },
  } };
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4.1-mini', store: false,
    instructions: 'You edit an Engosoft social post. Apply the command only to editable copy and image direction. Preserve accurate facts. Never invent dates, instructors, prices, or claims. Never alter, recolor, redraw or suggest changing the approved logo. Return all fields, keeping unmodified values unchanged. For an image-only command, set action=regenerate_image and update visualDirection. Keep copy concise for the given platform.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(input) }] }],
    text: { format: { type: 'json_schema', name: 'engosoft_creative_edit', strict: true, schema } },
  }), signal: AbortSignal.timeout(90000) });
  const result = await response.json().catch(() => ({})) as { output?: { content?: { type?: string; text?: string }[] }[]; error?: { message?: string } };
  recordUsage({ kind: 'text', model: env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4.1-mini', usage: (result as { usage?: OpenAIUsage }).usage });
  if (!response.ok) throw new Error(result.error?.message || `AI edit failed (HTTP ${response.status}).`);
  const text = result.output?.flatMap((part) => part.content ?? []).find((part) => part.type === 'output_text')?.text;
  if (!text) throw new Error('AI لم يرجع تعديلاً صالحًا.');
  const parsed = editResult.parse(JSON.parse(text));
  return { ...parsed, headline: parsed.headline.slice(0,130), body: parsed.body.slice(0,500), cta: parsed.cta.slice(0,28), detail: parsed.detail.slice(0,90), visualDirection: parsed.visualDirection.slice(0,500) };
}
