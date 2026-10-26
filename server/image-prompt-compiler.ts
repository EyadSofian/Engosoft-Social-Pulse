import type { CreativeDirection } from '../src/features/creative-studio/design-plan.js';
import { retrieveVisualReferences, type RetrievedReference } from '../src/features/creative-studio/visual-references.js';

export const IMAGE_PROMPT_VERSION = 'engosoft-image-v2';
export interface ImagePromptPlan {
  prompt: string;
  version: typeof IMAGE_PROMPT_VERSION;
  referenceIds: string[];
  subject: string;
  negativeSpace: 'left' | 'right' | 'upper' | 'center';
}
const composition: Record<CreativeDirection['composition'], string> = {
  full_bleed_editorial: 'An immersive editorial photograph with the subject occupying the left third; the right half stays quiet for later live Arabic typography.',
  centered_portrait: 'An authentic environmental portrait with a confident subject in the central lower half and a calm upper field for later live typography.',
  technical_gallery: 'A meticulous real engineering workspace or technical artifact, viewed with strong geometry; preserve a clean upper third for later live typography.',
  typographic_impact: 'A bold minimal photographic accent in the lower third; most of the canvas stays richly textured yet uncluttered for later oversized live typography.',
  floating_panel: 'A cinematic but plausible engineering scene with a calm lower half able to hold a separate floating information panel.',
  offer_focus: 'A premium campaign photograph with a clean middle band for a separately composed offer; no graphic offer is generated in the image.',
};
const visualSubject: Record<CreativeDirection['family'], string> = {
  course_instructor: 'A credible engineering educator in a real teaching or professional environment, no invented identity.',
  webinar: 'A professional engineering educator in a real webinar or lecture context, no invented identity.',
  engineering_carousel: 'A relevant technical drawing, engineering equipment, or built environment specific to the stated discipline.',
  student_project: 'An authentic student engineering project with tangible work and no fabricated achievement claim.',
  corporate: 'A premium, believable modern engineering or professional education environment.',
  saudi_campaign: 'A respectful contemporary Saudi engineering or learning setting, without fake insignia or national symbols.',
  majd_ai: 'A contemporary digital learning environment, restrained and human-centred.',
  promotion: 'A premium relevant course or engineering subject with visual energy, not a price graphic.',
  operational_schedule: 'A quiet professional engineering education context leaving clear room for a separately rendered timetable.',
};
const mood: Record<CreativeDirection['colorMode'], string> = {
  brand_blue: 'confident saturated Engosoft blue #0046FF with natural photographic color and restrained orange #FF6600 accents',
  light_technical: 'bright architectural whites, deep navy, subtle Engosoft blue #0046FF and precise greenish technical accents',
  dark_navy: 'deep navy and Engosoft blue #0046FF, premium contrast, restrained orange #FF6600 glints',
  emerald_gold: 'deep emerald and warm restrained gold for a Saudi cultural campaign; keep it sophisticated and real',
  purple_tech: 'deep blue-violet technology mood with clean lighting and controlled contrast',
};
/** The model gets a visual-asset brief, never the user's raw request alone or a whole finished poster. */
export function compileImagePrompt(subject: string, direction?: CreativeDirection | null, references: RetrievedReference[] = []): ImagePromptPlan {
  const chosen = direction;
  const relevant = references.slice(0, 4);
  const negativeSpace: ImagePromptPlan['negativeSpace'] = chosen?.composition === 'full_bleed_editorial' ? 'right' : chosen?.composition === 'technical_gallery' ? 'upper' : chosen?.composition === 'centered_portrait' ? 'upper' : chosen?.composition === 'floating_panel' ? 'center' : 'center';
  const referenceNotes = relevant.map((ref) => `Reference ${ref.id}, role ${ref.role}: ${ref.reason}. ${ref.role === 'content' ? `Subject context: ${ref.contentType}.` : 'Borrow only visual treatment, not depicted objects or claims.'}`).join('\n');
  const prompt = [
    'Produce ONE production-quality IMAGE ASSET for a professional Engosoft social design. This is not a finished social poster.',
    `Actual requested subject: ${subject.trim()}.`,
    chosen ? `Creative concept: ${chosen.name}. ${chosen.rationale}. ${visualSubject[chosen.family]} ${composition[chosen.composition]} Mood: ${mood[chosen.colorMode]}. Image treatment: ${chosen.imageTreatment}.` : 'Create an editorial photographic scene with a relevant real-world engineering or professional education subject and generous quiet space for copy.',
    `Reserved live-text zone: ${negativeSpace}. Keep it uncluttered and sufficiently dark or light for later high-contrast Arabic copy.`,
    referenceNotes ? `Reference roles:\n${referenceNotes}` : '',
    'High-end commercial photography or technically accurate editorial illustration. Believable materials, controlled lighting, strong focal hierarchy, no visual clutter. Context must match the requested subject exactly. No subject matter borrowed from a style-only reference.',
    'Invariant: absolutely no text, letters, numerals, logos, watermarks, emblems, UI controls, labels, fake diagrams or certificates. The official Engosoft logo, Arabic headline, event facts and CTA will be added as separate locked/editable layers. Do not invent a person, course date, price, credential or building identity.',
  ].filter(Boolean).join('\n\n');
  return { prompt, version: IMAGE_PROMPT_VERSION, referenceIds: relevant.map((r) => r.id), subject: subject.trim(), negativeSpace };
}

export function compileDefaultImagePrompt(subject: string, objective: string, direction?: CreativeDirection | null) {
  return compileImagePrompt(subject, direction, retrieveVisualReferences(subject, objective, 4));
}
