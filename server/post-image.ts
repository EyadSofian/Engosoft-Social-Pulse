import { z } from 'zod';
import { assessImage } from './image-quality.js';
import { compileDefaultImagePrompt } from './image-prompt-compiler.js';
import type { CreativeDirection } from '../src/features/creative-studio/design-plan.js';

export const imageRequest = z.object({ subject: z.string().trim().min(5).max(500), objective: z.string().max(60).default('general'), direction: z.object({ id: z.string(), name: z.string(), family: z.enum(['course_instructor','webinar','engineering_carousel','student_project','corporate','saudi_campaign','majd_ai','promotion','operational_schedule']), composition: z.enum(['full_bleed_editorial','centered_portrait','technical_gallery','typographic_impact','floating_panel','offer_focus']), imageTreatment: z.enum(['full_bleed','framed','portrait','accent']), headlineHierarchy: z.enum(['hero','balanced']), informationDensity: z.enum(['low','medium','high']), ctaTreatment: z.enum(['pill','underline','bottom_banner','text_link','none']), colorMode: z.enum(['brand_blue','light_technical','dark_navy','emerald_gold','purple_tech']), rationale: z.string(), referenceIds: z.array(z.string()) }).optional(), size: z.enum(['square', 'portrait', 'story', 'facebook-wide', 'linkedin-wide', 'video-wide']), referenceImageDataUrl: z.string().max(2_800_000).optional(), count: z.union([z.literal(1),z.literal(3)]).default(1) });
const imageSize = (size: string) => ['story', 'portrait'].includes(size) ? '1024x1536' : ['facebook-wide', 'linkedin-wide', 'video-wide'].includes(size) ? '1536x1024' : '1024x1024';

export async function generatePostImage(subject: string, size: string, env: NodeJS.ProcessEnv = process.env, referenceImageDataUrl?: string, count = 1, objective = 'general', direction?: CreativeDirection): Promise<{ imageDataUrl: string; imageDataUrls: string[]; model: string; rejectedCount: number; candidateScores: number[]; promptVersion: string; referenceIds: string[] }> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY غير مضبوط على السيرفر.');
  const model = env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';
  const plan = compileDefaultImagePrompt(subject, objective, direction);
  const prompt = plan.prompt;
  const reference = referenceImageDataUrl ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(referenceImageDataUrl) : null;
  if (referenceImageDataUrl && !reference) throw new Error('الصورة المرجعية لازم تكون PNG أو JPEG أو WebP.');
  const callModel = async (n: number, revision = ''): Promise<string[]> => {
    const requestedPrompt = revision ? `${prompt}\n\nImprove the rejected attempt: ${revision.slice(0, 700)}. Preserve the subject and text zone.` : prompt;
    let response: Response;
    if (reference) {
      const form = new FormData();
      form.append('image', new Blob([Buffer.from(reference[2], 'base64')], { type: `image/${reference[1]}` }), `reference.${reference[1] === 'jpeg' ? 'jpg' : reference[1]}`);
      form.append('model', model); form.append('prompt', `${requestedPrompt} Use the attached image only for subject or visual direction. Do not reproduce any existing text or logo.`);
      form.append('size', imageSize(size)); form.append('quality', 'medium'); form.append('output_format', 'png'); form.append('n', String(n));
      response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(180000) });
    } else response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: requestedPrompt, size: imageSize(size), quality: 'medium', output_format: 'png', n }), signal: AbortSignal.timeout(180000) });
    const result = await response.json().catch(() => ({})) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    if (!response.ok || !result.data?.[0]?.b64_json) throw new Error(result.error?.message || `تعذّر توليد الصورة (HTTP ${response.status}).`);
    return result.data.filter((item) => item.b64_json).map((item) => `data:image/png;base64,${item.b64_json}`);
  };
  const review = async (images: string[]) => {
    const checks = await Promise.all(images.map((image) => assessImage(image, env, `${subject}; ${direction?.name || 'editorial asset'}`)));
    return { approved: images.map((image, index) => ({ image, check: checks[index] })).filter((entry) => entry.check.pass), rejected: checks.filter((check) => !check.pass).length, revision: checks.filter((check) => !check.pass).map((check) => check.revision).filter(Boolean).join(' ') };
  };
  const first = await review(await callModel(count));
  let approved = first.approved;
  let rejectedCount = first.rejected;
  for (let attempt = 0, revision = first.revision; attempt < 2 && approved.length < count; attempt++) {
    const next = await review(await callModel(count - approved.length, revision));
    approved = [...approved, ...next.approved];
    rejectedCount += next.rejected;
    revision = next.revision;
  }
  if (!approved.length) throw new Error('الصور المولّدة لم تجتز مراجعة الجودة. جرّب وصفًا بصريًا أوضح.');
  approved.sort((a, b) => b.check.score - a.check.score);
  return { imageDataUrl: approved[0].image, imageDataUrls: approved.slice(0, count).map((entry) => entry.image), candidateScores: approved.slice(0, count).map((entry) => entry.check.score), model, rejectedCount, promptVersion: plan.version, referenceIds: plan.referenceIds };
}
