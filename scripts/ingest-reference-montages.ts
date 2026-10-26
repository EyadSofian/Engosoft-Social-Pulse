import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

/** Curated panel labels; visual analysis and human verification may enrich them later. */
const sheets = [
  { name: 'engineering-posts', rows: 3, cols: 5, entries: [
    'student_project|interior|student drawing architecture', 'corporate|engagement|question audience', 'student_project|interior|cad technical carousel', 'student_project|interior|floor plan cad', 'student_project|interior|floor plan cad',
    'student_project|interior|student drawing cad', 'corporate|team|team achievement photo', 'webinar|cmrp|instructor event blue', 'engineering_carousel|automotive|mechanic car photo', 'engineering_carousel|automotive|electric car technical',
    'engineering_carousel|automotive|diagnostic device', 'engineering_carousel|automotive|engine technical', 'engineering_carousel|automotive|transmission technical', 'corporate|automotive|brand facility', 'engineering_carousel|interior|architecture design photo',
  ] },
  { name: 'corporate-projects', rows: 3, cols: 5, entries: [
    'corporate|riyadh|branch announcement map', 'corporate|engosoft|brand introduction', 'corporate|engineering|training benefits', 'corporate|engosoft|social proof number', 'engineering_carousel|electrical|power technical',
    'student_project|electrical|low current cad', 'student_project|electrical|lighting cad', 'student_project|electrical|low current cad', 'student_project|electrical|lighting cad', 'student_project|electrical|power cad',
    'student_project|electrical|power cad', 'course_instructor|electrical|industrial training', 'corporate|egypt|national occasion', 'course_instructor|interior|instructor portrait', 'course_instructor|automotive|instructor portrait',
  ] },
  { name: 'instructors-webinars', rows: 3, cols: 5, entries: [
    'course_instructor|bim|two instructors blue', 'course_instructor|bim|two instructors blue', 'course_instructor|mechanical|instructor white', 'course_instructor|electrical|instructor white', 'course_instructor|maintenance|instructor white',
    'course_instructor|pmp|two instructors blue', 'corporate|teachers|recognition blue', 'course_instructor|cfm|instructor white', 'operational_schedule|courses|calendar table', 'operational_schedule|courses|calendar table',
    'webinar|cfm|instructor registration blue', 'corporate|teachers|celebration typography', 'corporate|engosoft|logo blue', 'webinar|bim|instructor registration blue', 'saudi_campaign|bim|dark green career',
  ] },
  { name: 'saudi-campaign', rows: 3, cols: 5, entries: [
    'saudi_campaign|bim|dark green offer', 'saudi_campaign|bim|dark green portrait', 'promotion|cfm|dark green price', 'promotion|pmp|dark green price', 'promotion|career|dark green offer portrait',
    'saudi_campaign|career|dark green learner', 'saudi_campaign|career|dark green architecture', 'saudi_campaign|career|dark green portrait', 'saudi_campaign|career|dark green engineering', 'saudi_campaign|career|dark green editorial',
    'saudi_campaign|national|green brand', 'saudi_campaign|national|green brand typography', 'saudi_campaign|national|green statement', 'saudi_campaign|national|green statement', 'saudi_campaign|national|green statement',
  ] },
  { name: 'majd-promotions', rows: 4, cols: 5, entries: [
    'webinar|cfm|instructor credentials', 'course_instructor|cfm|building expert', 'majd_ai|assistant|character interface', 'webinar|pmp|instructor dark', 'course_instructor|maintenance|facility dark',
    'majd_ai|assistant|character question', 'webinar|pmp|instructor dark', 'course_instructor|cmrp|industrial course', 'majd_ai|assistant|character technology', 'majd_ai|assistant|character purple',
    'engineering_carousel|pmp|questions number', 'promotion|courses|discount number', 'course_instructor|pmp|tablet technology', 'course_instructor|bim|architecture learner', 'promotion|website|website discount',
    'course_instructor|cfm|certificate', 'course_instructor|bim|architecture building', 'corporate|hijri|occasion beige', 'promotion|saudi|sports discount green', 'corporate|career|growth typography',
  ] },
] as const;

const destination = new URL('../public/reference-cards/', import.meta.url);
mkdirSync(destination, { recursive: true });
const records: Record<string, unknown>[] = [];
for (const sheet of sheets) {
  const input = fileURLToPath(new URL(`../public/visual-references/${sheet.name}.jpg`, import.meta.url));
  const { width = 0, height = 0 } = await sharp(input).metadata();
  if (!width || !height) throw new Error(`Bad montage: ${sheet.name}`);
  const cellW = Math.floor(width / sheet.cols), cellH = Math.floor(height / sheet.rows);
  for (let i = 0; i < sheet.entries.length; i++) {
    const row = Math.floor(i / sheet.cols), col = i % sheet.cols;
    const left = col * cellW + 8, top = row * cellH + 8;
    // Leave the contact sheet gutter outside each crop; the source sheets use uneven card gaps.
    const cropW = Math.min(cellW - 36, width - left), cropH = Math.min(cellH - 16, height - top);
    const [family, course, note] = sheet.entries[i].split('|');
    const id = `${sheet.name}-${row + 1}-${col + 1}`;
    await sharp(input).extract({ left, top, width: cropW, height: cropH }).webp({ quality: 83 }).toFile(fileURLToPath(new URL(`${id}.webp`, destination)));
    records.push({ id, title: `${family.replaceAll('_', ' ')} · ${course}`, image: `/reference-cards/${id}.webp`, sheet: sheet.name, panel: { row: row + 1, column: col + 1 }, source: 'user_supplied_montage', capturedAt: '2026-10-26', platform: 'unknown', family, course, tags: `${family} ${course} ${note}`.split(' '), visualGrammar: note, contentType: family, campaign: course, hasInstructor: /instructor|portrait/.test(note), hasTechnicalDrawing: /cad|drawing|technical/.test(note), hasOffer: family === 'promotion', manualVerified: false, qualityScore: null, performance: null, embedding: null, designerNotes: '', analysisStatus: 'needs_review' });
  }
}
writeFileSync(new URL('../public/data/reference-cards.json', import.meta.url), JSON.stringify(records, null, 2));
console.log(`Ingested ${records.length} individual reference cards`);
