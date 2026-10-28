import { recordUsage, type OpenAIUsage } from '../../usage.js';
/** Image model adapter. Business logic talks to CreativeImageProvider; only this file knows OpenAI request syntax. */

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';
export interface ImageGenerateRequest { prompt: string; size: string; quality: ImageQuality; n?: number }
export interface ImageEditRequest extends ImageGenerateRequest {
  /** First image is edited; further images are references. PNG/JPEG/WebP buffers. */
  images: { data: Buffer; mime: 'image/png' | 'image/jpeg' | 'image/webp' }[];
  /** PNG the size of the first image; fully transparent pixels mark the area to change. */
  mask?: Buffer;
}
export interface GeneratedImage { png: Buffer; model: string; size: string; quality: ImageQuality; latencyMs: number }
export interface CreativeImageProvider {
  readonly name: string;
  readonly model: string;
  generate(request: ImageGenerateRequest): Promise<GeneratedImage[]>;
  edit(request: ImageEditRequest): Promise<GeneratedImage[]>;
}

export class ImageProviderError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

/** One retry for transient failures (network errors, HTTP 5xx, 429); client errors fail immediately. */
async function fetchWithRetry(url: string, init: () => RequestInit, attempts = 2): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init());
      if ((response.status >= 500 || response.status === 429) && attempt < attempts) { await new Promise((r) => setTimeout(r, 4000)); continue; }
      return response;
    } catch (error) {
      if (attempt >= attempts || (error instanceof Error && error.name === 'TimeoutError')) throw error;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

interface OpenAIImageResponse { data?: { b64_json?: string }[]; error?: { message?: string }; usage?: OpenAIUsage }

export class OpenAIImageProvider implements CreativeImageProvider {
  readonly name = 'openai';
  constructor(private readonly apiKey: string, readonly model: string, private readonly timeoutMs = 300_000) {
    if (!apiKey) throw new ImageProviderError('OPENAI_API_KEY is not configured on the server');
  }

  async generate(request: ImageGenerateRequest): Promise<GeneratedImage[]> {
    const started = Date.now();
    const response = await fetchWithRetry('https://api.openai.com/v1/images/generations', () => ({
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: request.prompt, size: request.size, quality: request.quality, output_format: 'png', n: request.n ?? 1 }),
      signal: AbortSignal.timeout(this.timeoutMs),
    }));
    return this.read(response, request, started, 'image');
  }

  async edit(request: ImageEditRequest): Promise<GeneratedImage[]> {
    const started = Date.now();
    const form = new FormData();
    form.append('model', this.model);
    form.append('prompt', request.prompt);
    form.append('size', request.size);
    form.append('quality', request.quality);
    form.append('output_format', 'png');
    form.append('n', String(request.n ?? 1));
    request.images.forEach((image, index) => form.append('image[]', new Blob([new Uint8Array(image.data)], { type: image.mime }), `image-${index}.${image.mime.split('/')[1]}`));
    if (request.mask) form.append('mask', new Blob([new Uint8Array(request.mask)], { type: 'image/png' }), 'mask.png');
    const response = await fetchWithRetry('https://api.openai.com/v1/images/edits', () => ({
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: AbortSignal.timeout(this.timeoutMs),
    }));
    return this.read(response, request, started, 'image_edit');
  }

  private async read(response: Response, request: ImageGenerateRequest, started: number, kind: 'image' | 'image_edit'): Promise<GeneratedImage[]> {
    const body = await response.json().catch(() => ({})) as OpenAIImageResponse;
    if (!response.ok) throw new ImageProviderError(body.error?.message || `Image generation failed (HTTP ${response.status})`, response.status);
    const images = (body.data ?? []).filter((item) => item.b64_json).map((item) => Buffer.from(item.b64_json!, 'base64'));
    recordUsage({ kind, model: this.model, usage: body.usage, images: images.length, size: request.size, quality: request.quality });
    if (!images.length) throw new ImageProviderError('Image model returned no image');
    const latencyMs = Date.now() - started;
    return images.map((png) => ({ png, model: this.model, size: request.size, quality: request.quality, latencyMs }));
  }
}

/** Structured JSON from an OpenAI text/vision model through the Responses API. */
export async function openAIJson<T>(input: {
  apiKey: string; model: string; instructions: string; schemaName: string; schema: object;
  content: ({ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' | 'high' | 'auto' } | { type: 'input_file'; filename: string; file_data: string })[];
  reasoning?: 'minimal' | 'low' | 'medium' | 'high';
  /** Hosted tools such as `{ type: 'web_search' }`; their citations are handed to `onCitations`. */
  tools?: Record<string, unknown>[];
  onCitations?: (citations: { url: string; title: string }[]) => void;
}): Promise<T> {
  const response = await fetchWithRetry('https://api.openai.com/v1/responses', () => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model, store: false, instructions: input.instructions,
      ...(input.reasoning ? { reasoning: { effort: input.reasoning } } : {}),
      ...(input.tools?.length ? { tools: input.tools } : {}),
      input: [{ role: 'user', content: input.content }],
      text: { format: { type: 'json_schema', name: input.schemaName, strict: true, schema: input.schema } },
    }),
    signal: AbortSignal.timeout(180_000),
  }));
  type Part = { type?: string; text?: string; annotations?: { type?: string; url?: string; title?: string }[] };
  const body = await response.json().catch(() => ({})) as { output?: { content?: Part[] }[]; error?: { message?: string }; usage?: OpenAIUsage };
  if (response.ok) recordUsage({ kind: 'text', model: input.model, usage: body.usage });
  if (!response.ok) throw new ImageProviderError(body.error?.message || `${input.model} request failed (HTTP ${response.status})`, response.status);
  const part = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text');
  if (!part?.text) throw new ImageProviderError(`${input.model} returned no structured output`);
  input.onCitations?.((part.annotations ?? []).filter((a) => a.type === 'url_citation' && a.url).map((a) => ({ url: a.url!, title: a.title || a.url! })));
  return JSON.parse(part.text) as T;
}
