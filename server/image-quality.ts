import { z } from 'zod';

export const qualityResult = z.object({ score: z.number().min(0).max(100), issues: z.array(z.string()), strengths: z.array(z.string()), revision: z.string(), fatal: z.boolean() });
export type ImageAssessment = z.infer<typeof qualityResult> & { pass: boolean };
export function parseImageAssessment(value: unknown): ImageAssessment {
  const result = qualityResult.parse(value);
  return { ...result, pass: !result.fatal && result.score >= 75 };
}

/** Reject clear visual defects before a generated background reaches the editor. */
export async function assessImage(dataUrl: string, env: NodeJS.ProcessEnv = process.env, context = ''): Promise<ImageAssessment> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { pass: false, score: 0, issues: ['Invalid PNG output'], strengths: [], revision: 'Generate a valid PNG.', fatal: true };
  const png = Buffer.from(match[1], 'base64');
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { pass: false, score: 0, issues: ['Invalid PNG file'], strengths: [], revision: 'Generate a valid PNG.', fatal: true };
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width < 1000 || height < 1000) return { pass: false, score: 0, issues: ['Insufficient resolution'], strengths: [], revision: 'Generate at least 1000 pixels per side.', fatal: true };
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY missing for image quality review');
  const schema = { type: 'object', additionalProperties: false, required: ['score','issues','strengths','revision','fatal'], properties: { score: { type: 'number' }, issues: { type: 'array', items: { type: 'string' } }, strengths: { type: 'array', items: { type: 'string' } }, revision: { type: 'string' }, fatal: { type: 'boolean' } } };
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4.1-mini', store: false,
    instructions: 'You are a strict commercial art director. Score this source image from 0 to 100 across subject relevance (20), believable anatomy and objects (20), composition and text negative space (20), visual quality (20), and Engosoft brand compatibility (20). Mark fatal true for baked-in text/logos, obvious anatomy defects, wrong subject, or no usable copy area. 75 is the minimum acceptable score. Give short concrete issues, strengths, and one actionable revision prompt. Do not flatter mediocre work.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Assess this image asset for a polished engineering education post. No text or logo should be baked in. Intended context: ${context.slice(0, 1500)}` }, { type: 'input_image', image_url: dataUrl, detail: 'low' }] }],
    text: { format: { type: 'json_schema', name: 'engosoft_image_quality', strict: true, schema } },
  }), signal: AbortSignal.timeout(90000) });
  const result = await response.json().catch(() => ({})) as { output?: { content?: { type?: string; text?: string }[] }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Image quality check failed (HTTP ${response.status})`);
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!text) throw new Error('Image quality check returned no result');
  return parseImageAssessment(JSON.parse(text));
}
