import records from '../../../public/data/reference-cards.json';

export interface VisualReference {
  id: string; title: string; image: string; sheet: string; panel: { row: number; column: number };
  source: string; capturedAt: string; platform: string; family: string; course: string;
  tags: string[]; visualGrammar: string; contentType: string; campaign: string;
  hasInstructor: boolean; hasTechnicalDrawing: boolean; hasOffer: boolean;
  manualVerified: boolean; qualityScore: number | null; performance: number | null;
  embedding: number[] | null; designerNotes: string; analysisStatus: string;
}
export type ReferenceRole = 'content' | 'composition' | 'color-and-mood' | 'subject-treatment';
export interface RetrievedReference extends VisualReference { matchScore: number; role: ReferenceRole; reason: string }
export const VISUAL_REFERENCES: VisualReference[] = records as VisualReference[];
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
const familyHints: Record<string, string[]> = {
  course_launch: ['course_instructor', 'engineering_carousel'], course_schedule: ['operational_schedule'],
  certificate: ['course_instructor', 'student_project'], education: ['engineering_carousel'],
  event: ['webinar', 'saudi_campaign'], general: ['corporate', 'engineering_carousel'],
};
/** Rank individual cropped cards. Unknown performance and unverified quality never boost a result. */
export function retrieveVisualReferences(prompt: string, objective: string, count = 4): RetrievedReference[] {
  const tokens = new Set(normalize(prompt).split(' ').filter((token) => token.length > 2));
  const topic = /سيار|محرك|ميكانيك|automotive|vehicle|engine/.test(prompt.toLowerCase()) ? 'automotive' : /معمار|داخلي|architecture|interior/.test(prompt.toLowerCase()) ? 'interior' : /كهرب|electrical|power/.test(prompt.toLowerCase()) ? 'electrical' : /bim|نمذجة/.test(prompt.toLowerCase()) ? 'bim' : /cfm/i.test(prompt) ? 'cfm' : /pmp/i.test(prompt) ? 'pmp' : '';
  const cultural = /سعود|وطني|اليوم الوطني|saudi|national day/i.test(prompt);
  const promotion = /خصم|تخفيض|عرض خاص|discount|offer/i.test(prompt);
  const ranked = VISUAL_REFERENCES.map((reference) => {
    const tokenHits = reference.tags.reduce((sum, tag) => sum + (tokens.has(normalize(tag).trim()) ? 5 : 0), 0);
    const course = tokens.has(reference.course.toLowerCase()) || (topic && reference.course.toLowerCase() === topic) ? 12 : 0;
    const family = (familyHints[objective] ?? []).includes(reference.family) ? 5 : 0;
    const unrelatedCampaign = reference.sheet.startsWith('saudi-campaign') && !cultural ? -12 : reference.family === 'saudi_campaign' && !cultural ? -8 : reference.family === 'promotion' && !promotion ? -5 : reference.family === 'majd_ai' && !/ماجد|majd/i.test(prompt) ? -7 : 0;
    const score = tokenHits + course + family + unrelatedCampaign + (reference.manualVerified ? 2 : 0) + (reference.qualityScore ?? 0) / 5;
    return { reference, score };
  }).sort((a, b) => b.score - a.score || a.reference.id.localeCompare(b.reference.id));
  const selected: RetrievedReference[] = [];
  const usedSheets = new Set<string>();
  for (const { reference, score } of ranked) {
    if (selected.length >= count) break;
    if (usedSheets.has(reference.sheet) && selected.length < Math.min(count, 3)) continue;
    const role: ReferenceRole = selected.length === 0 ? 'content' : selected.length === 1 ? 'composition' : selected.length === 2 ? 'color-and-mood' : 'subject-treatment';
    selected.push({ ...reference, matchScore: score, role, reason: role === 'content' ? `Relevant ${reference.course} / ${reference.family} content` : role === 'composition' ? `Useful ${reference.family} information hierarchy` : role === 'color-and-mood' ? `Approved visual mood from ${reference.sheet}` : `Subject treatment: ${reference.visualGrammar}` });
    usedSheets.add(reference.sheet);
  }
  return selected;
}
