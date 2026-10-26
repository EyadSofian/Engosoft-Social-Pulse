import { z } from 'zod';

export const imageRequest = z.object({ subject: z.string().trim().min(5).max(500), size: z.enum(['square', 'portrait', 'story', 'facebook-wide', 'linkedin-wide', 'video-wide']) });
const imageSize = (size: string) => ['story', 'portrait'].includes(size) ? '1024x1536' : ['facebook-wide', 'linkedin-wide', 'video-wide'].includes(size) ? '1536x1024' : '1024x1024';

export async function generatePostImage(subject: string, size: string, env: NodeJS.ProcessEnv = process.env): Promise<{ imageDataUrl: string; model: string }> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY غير مضبوط على السيرفر.');
  const model = env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
  const prompt = `Create a single polished photographic or illustrative background for an Engosoft professional education social post. Subject: ${subject}. Composition should leave substantial clean negative space for an Arabic headline and call to action overlaid later. Engosoft visual language: confident blue #0046FF, deep navy, restrained orange #FF6600, modern engineering education. Absolutely no words, letters, numbers, typography, logos, watermarks, UI, or borders. The post designer will add editable text and the official mark separately.`;
  const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, size: imageSize(size), quality: 'medium', output_format: 'png', n: 1 }), signal: AbortSignal.timeout(180000) });
  const result = await response.json().catch(() => ({})) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  if (!response.ok || !result.data?.[0]?.b64_json) throw new Error(result.error?.message || `تعذّر توليد الصورة (HTTP ${response.status}).`);
  return { imageDataUrl: `data:image/png;base64,${result.data[0].b64_json}`, model };
}
