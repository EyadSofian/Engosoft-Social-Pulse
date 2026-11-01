/**
 * Approved Engosoft posts given to the image model as reference images. The model only ever read a text
 * description before, so its posts did not look like the Engosoft feed; with three real posts (and the
 * campaign's key visual) attached it matches the colour world, the Arabic display type, the green highlight
 * bars and the photo treatment, while composing something new. CREATIVE_REFERENCE_IMAGES=off disables it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

/** Curated from public/design-references: the closest approved posts per kind of post, best first. */
export const HOUSE_REFERENCE_SETS = {
  course: ['revit-mep.png', 'automotive-hero.jpg', 'automotive-enroll.jpg'],
  graduation: ['automotive-graduation.jpg', 'student-esra.jpg', 'automotive-hero.jpg'],
  occasion: ['artists-day.jpg', 'awareness.jpg', 'automotive-enroll.jpg'],
  service: ['support.jpg', 'awareness.jpg', 'revit-mep.png'],
  ai: ['majed-ai.jpg', 'revit-mep.png', 'automotive-enroll.jpg'],
} as const;
export type HouseReferenceKind = keyof typeof HOUSE_REFERENCE_SETS;

/** The kind of post, from the brief's objective, audience and copy. */
export function referenceKind(text: string): HouseReferenceKind {
  const t = text.toLowerCase();
  if (/تخر[جّ]|خريج|شهاد|certif|graduat|achiev|إنجاز|انجاز|مشروع طالب|student/.test(t)) return 'graduation';
  if (/الذكاء الاصطناعي|ذكاء اصطناعي|ماجد|\bai\b|chatbot|assistant/.test(t)) return 'ai';
  if (/دعم|استفسار|خدمة العملاء|support|help ?desk|customer service/.test(t)) return 'service';
  if (/مناسب|اليوم العالمي|يوم |عيد|تهنئ|occasion|celebrat|national day|world day|event|فعالي/.test(t)) return 'occasion';
  return 'course';
}

export interface ReferenceImage { name: string; data: Buffer; mime: 'image/jpeg' }

/** Up to three house references (plus the campaign key visual first, when there is one), as ~1024 px JPEGs. */
export async function houseReferences(text: string, keyVisualPath = '', env: NodeJS.ProcessEnv = process.env): Promise<ReferenceImage[]> {
  if (env.CREATIVE_REFERENCE_IMAGES?.trim() === 'off') return [];
  const files = [
    ...(keyVisualPath && existsSync(keyVisualPath) ? [{ name: 'campaign key visual', path: keyVisualPath }] : []),
    ...HOUSE_REFERENCE_SETS[referenceKind(text)].map((file) => ({ name: file, path: resolve(process.cwd(), 'public/design-references', file) })),
  ].filter((f) => existsSync(f.path)).slice(0, 4);
  return Promise.all(files.map(async (f) => ({ name: f.name, mime: 'image/jpeg' as const, data: await sharp(readFileSync(f.path)).flatten({ background: '#ffffff' }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer() })));
}

/** The prompt section that tells the model what the attached images are for. */
export function referencePrompt(images: ReferenceImage[]): string {
  if (!images.length) return '';
  const key = images[0].name === 'campaign key visual';
  return `\n\nREFERENCE IMAGES\nThe ${images.length} attached images are ${key ? 'the campaign key visual (image 1) and ' : ''}approved Engosoft posts. They define the house style: match their colour world, the bold Arabic display typography with kashida and the green highlight bars, the photographic subject treatment, the spacing and the overall finish, so the new post clearly belongs to the same feed. Create a completely NEW post for this brief with its own composition — do not copy their layout one-to-one, their people, their text, their logos, footers, partner marks or website lines.`;
}
