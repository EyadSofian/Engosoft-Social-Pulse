/**
 * Course search shared by the browser and the server: Arabic and English names of the same course meet
 * ("أوتوكاد" finds "AutoCAD"), Arabic spelling variants are unified (أ/إ/آ, ة/ه, ى/ي, diacritics), short codes
 * match (CFM, PMP, BIM) and one-letter typos in longer words are forgiven.
 */

/** Arabic → English course vocabulary. Each group is treated as one meaning. */
const SYNONYMS: string[][] = [
  ['autocad', 'اوتوكاد', 'الاوتوكاد', 'اتوكاد'],
  ['revit', 'ريفيت', 'الريفيت', 'رفيت'],
  ['3ds', '3dsmax', 'max', 'ثري', 'ماكس', 'ثريدي'],
  ['vray', 'فيراي', 'في راي'],
  ['photoshop', 'فوتوشوب', 'الفوتوشوب'],
  ['sketchup', 'سكتش', 'سكيتش', 'اسكتش'],
  ['lumion', 'لوميون'],
  ['primavera', 'بريمافيرا', 'البريمافيرا', 'p6'],
  ['etabs', 'ايتابس', 'الايتابس'],
  ['sap', 'sap2000', 'ساب'],
  ['safe', 'سيف'],
  ['excel', 'اكسل', 'الاكسل', 'إكسل'],
  ['powerbi', 'power', 'bi', 'باور'],
  ['odoo', 'اودو', 'الاودو', 'أودو'],
  ['ai', 'الذكاء', 'ذكاء', 'اصطناعي', 'الاصطناعي'],
  ['pmp', 'ادارة المشاريع', 'المشاريع', 'مشاريع', 'project', 'projects'],
  ['management', 'ادارة', 'الادارة', 'اداره'],
  ['cfm', 'facility', 'facilities', 'المرافق', 'مرافق'],
  ['cmrp', 'reliability', 'الموثوقية'],
  ['maintenance', 'صيانة', 'الصيانة', 'صيانه'],
  ['safety', 'السلامة', 'سلامة', 'osha', 'nebosh', 'نيبوش', 'اوشا'],
  ['interior', 'الديكور', 'ديكور', 'الداخلي', 'داخلي'],
  ['design', 'تصميم', 'التصميم'],
  ['architecture', 'معماري', 'المعماري', 'العمارة', 'عمارة', 'architectural'],
  ['civil', 'مدني', 'المدني', 'انشائي', 'الانشائي', 'structure', 'structural'],
  ['mechanical', 'ميكانيكا', 'ميكانيكي', 'الميكانيكا', 'hvac', 'تكييف'],
  ['electrical', 'كهرباء', 'الكهرباء', 'كهربائي'],
  ['plumbing', 'سباكة', 'السباكة'],
  ['fire', 'حريق', 'الحريق', 'الحرائق', 'fighting'],
  ['bim', 'بيم'],
  ['mep', 'ام اي بي'],
  ['english', 'انجليزي', 'الانجليزي', 'الانجليزية', 'انجليزية'],
  ['sales', 'مبيعات', 'المبيعات'],
  ['marketing', 'تسويق', 'التسويق'],
  ['hr', 'الموارد', 'البشرية', 'موارد'],
  ['finance', 'مالية', 'المالية', 'محاسبة', 'المحاسبة', 'accounting'],
  ['quantity', 'حصر', 'الحصر', 'كميات', 'الكميات', 'surveying'],
  ['planning', 'تخطيط', 'التخطيط'],
  ['quality', 'الجودة', 'جودة', 'qa', 'qc'],
  ['automotive', 'سيارات', 'السيارات'],
  ['technology', 'تكنولوجيا', 'التكنولوجيا', 'tech'],
];

/** Words that say "course" or "post" and carry no topic. */
const STOP = new Set(['course', 'courses', 'training', 'webinar', 'event', 'post', 'design post', 'engosoft', 'diploma', 'program', 'دورة', 'دوره', 'كورس', 'تدريب', 'دبلومة', 'دبلوم', 'برنامج', 'ويبينار', 'فعالية', 'منشور', 'بوست', 'من', 'في', 'عن', 'على', 'الى', 'الي', 'و', 'لل', 'the', 'for', 'and', 'of', 'to', 'in', 'with', 'اعمل', 'صمم', 'ابدا', 'جديد', 'جديدة', 'القادم', 'القادمة', 'الجاي', 'الجاية', 'اعلان', 'الاسبوع', 'للفيسبوك', 'وانستجرام', 'وواتساب', 'فيسبوك', 'انستجرام', 'واتساب', 'لينكدان', 'تيك', 'توك']);

/** Unifies Arabic letter variants and strips diacritics, tatweel and punctuation. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const GROUP = new Map<string, number>();
SYNONYMS.forEach((group, index) => group.forEach((word) => GROUP.set(normalizeSearch(word), index)));
const STOPS = new Set([...STOP].map(normalizeSearch));

/** A word's meaning key: its synonym group when it has one, else the word (with Arabic "ال" removed). */
function meaning(word: string): string {
  const bare = word.replace(/^(ال|وال|بال|لل)(?=\p{L}{3})/u, '');
  const hit = GROUP.get(word) ?? GROUP.get(bare);
  if (hit != null) return `#${hit}`;
  // A misspelled course term ("ريفت" for "ريفيت") still lands in its group.
  if (bare.length >= 4) for (const [known, index] of GROUP) if (!known.includes(' ') && closeEnough(bare, known)) return `#${index}`;
  return bare;
}

export function searchTerms(text: string): string[] {
  const normalized = normalizeSearch(text);
  const terms: string[] = [];
  // Multi-word synonyms first ("ادارة المشاريع").
  for (const [phrase, index] of GROUP) if (phrase.includes(' ') && normalized.includes(phrase)) terms.push(`#${index}`);
  for (const word of normalized.split(' ')) {
    if (!word || STOPS.has(word) || (word.length < 2 && !/\d/.test(word))) continue;
    terms.push(meaning(word));
  }
  return [...new Set(terms)];
}

function closeEnough(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How well `query` describes a record: name matches count most, then category and description. 0 = no match.
 * Every query term must match something for a full score; partial matches still rank, lower.
 */
export function scoreRecord(query: string, record: { name: string; category?: string; description?: string }): number {
  const terms = searchTerms(query);
  if (!terms.length) return 0;
  const fields: [string[], number][] = [
    [searchTerms(record.name), 3],
    [searchTerms(record.category ?? ''), 1.2],
    [searchTerms((record.description ?? '').slice(0, 600)), 0.6],
  ];
  let score = 0, matched = 0;
  for (const term of terms) {
    let best = 0;
    for (const [words, weight] of fields) {
      if (words.includes(term)) best = Math.max(best, weight);
      else if (!term.startsWith('#') && words.some((w) => !w.startsWith('#') && ((term.length >= 4 && w.startsWith(term)) || closeEnough(term, w)))) best = Math.max(best, weight * 0.7);
    }
    if (best) matched++;
    score += best;
  }
  if (!matched) return 0;
  // Reward covering the whole query; a single shared generic word should not outrank a precise match.
  return score * (matched / terms.length);
}

/** Records ranked by `scoreRecord`, best first; ties keep their original order. */
export function rankRecords<T extends { name: string; category?: string; description?: string }>(query: string, records: T[], limit = 20): (T & { score: number })[] {
  return records
    .map((record, index) => ({ record, index, score: scoreRecord(query, record) }))
    .filter((entry) => entry.score > 0.5)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ record, score }) => ({ ...record, score }));
}
