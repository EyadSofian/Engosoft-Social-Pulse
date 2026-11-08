/**
 * The course library's source: the courses engosoft.com shows, read from the site's own public endpoints.
 *
 * - `/engosoft_homepage_products/get_products_data` lists every course on the website (the shop's catalog,
 *   without the per-run "event" registration products), with its category.
 * - `/product_section_1/get_product_info` returns one course page's content: its goals (الأهداف), what you
 *   will learn, the target audience, entry requirements, duration and delivery modes. The page fills its
 *   sections from this data, so the HTML itself only carries template placeholders.
 *
 * Nothing here is guessed from course names; a field the website leaves empty stays empty.
 */
export const WEBSITE = 'https://engosoft.com';

export interface WebsiteCourse {
  courseId: string;
  courseName: string;
  category: string;
  description: string;
  objectives: string[];
  outcomes: string[];
  audience: string;
  notes: string;
  sourceUrl: string;
}
export interface WebsiteCatalog { source: string; retrievedAt: string; discovered: number; courses: WebsiteCourse[] }

/** One row of the website's course list. */
export interface FeedProduct { product_template_id: number; product_variant_id: number; name: string; website_url: string; category_id: number | null; course_type: string; website_published?: boolean }
interface Item { title?: string; description?: string; text?: string }
/** The fields of a course page this library uses. */
export interface CourseInfo {
  display_name?: string; description_sale?: string; course_description_html?: string;
  learn_items?: string[]; tab1_items?: Item[]; tab5_items?: Item[]; tab6_items?: Item[];
  tab2_item1_title?: string; tab2_item2_title?: string; tab2_item3_title?: string; tab2_item4_title?: string;
  course_duration_text?: string; attendance_duration_text?: string; course_language_text?: string;
  instructors?: { name?: string }[]; attendance_instructors?: { name?: string }[];
  is_exam_simulator?: boolean; exam_description?: string; exam_duration?: string; exam_questions_count?: string; exam_pass_rate?: string;
  exam_features?: Item[]; exam_benefits?: Item[]; exam_eligibility?: Item[];
}

/** Website categories when the menu cannot be read. 9 is "best sellers", a list rather than a field. */
const FALLBACK_CATEGORIES: Record<number, string> = { 2: 'التصميم الداخلي والديكور', 3: 'ميكانيكا', 4: 'الإدارة والسلامة', 5: 'كهرباء', 6: 'المدني والإنشائي', 7: 'دورات BIM', 10: 'أنظمة ميكانيكا وكهرباء السيارات' };
const NOT_A_FIELD = new Set([9]);
const EXAM_CATEGORY = 'محاكيات الاختبارات';

const LIMITS = { items: 12, itemChars: 300, audience: 600, description: 2000, notes: 2000, name: 300, category: 150 };

/** Plain text: tags out, entities decoded, invisible direction marks and repeated spaces removed. */
export function plainText(html: string | undefined | null): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufeff]/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
/** A list of short lines, at most 12, each within the library's limit. */
const lines = (values: (string | undefined)[]) => [...new Set(values.map((v) => plainText(v).replace(/\n/g, ' ').replace(/[:：]\s*$/, '').trim()).filter((v) => v.length >= 2))]
  .slice(0, LIMITS.items).map((v) => clip(v, LIMITS.itemChars));
/** Audience entries joined into one line, without each entry's own closing full stop. */
const joined = (values: (string | undefined)[]) => clip(lines(values).map((v) => v.replace(/[.،,]+$/, '').trim()).join('، '), LIMITS.audience);
const titled = (items: Item[] | undefined) => (items ?? []).map((i) => [plainText(i.title).replace(/[:：]\s*$/, ''), plainText(i.description)].filter(Boolean).join(': '));

/** The opening paragraphs of the course description, up to about 600 characters. */
function overview(html: string | undefined, fallback: string | undefined): string {
  const paragraphs = [...String(html ?? '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => plainText(m[1]).replace(/\n/g, ' ')).filter((p) => p.length > 20);
  const chosen: string[] = [];
  for (const p of paragraphs) { if (chosen.join(' ').length > 350) break; chosen.push(p); }
  const text = chosen.join('\n') || plainText(fallback).split('\n')[0] || '';
  return clip(text, LIMITS.description);
}

/** A course page's content as a library profile. */
export function courseFromInfo(product: FeedProduct, info: CourseInfo, category: string): WebsiteCourse {
  const exam = Boolean(info.is_exam_simulator) || product.course_type === 'exam_simulator';
  const name = clip(plainText(info.display_name || product.name).replace(/\n/g, ' '), LIMITS.name);
  const sourceUrl = new URL(product.website_url, WEBSITE).toString();
  if (exam) {
    const notes = [info.exam_duration, info.exam_questions_count, info.exam_pass_rate].map((v) => plainText(v)).filter(Boolean).join(' · ');
    return {
      courseId: `product.template:${product.product_template_id}`, courseName: name, category: EXAM_CATEGORY,
      description: overview(info.exam_description, ''), objectives: lines(titled(info.exam_benefits)), outcomes: lines(titled(info.exam_features)),
      audience: joined((info.exam_eligibility ?? []).map((i) => i.title)), notes: clip(notes, LIMITS.notes), sourceUrl,
    };
  }
  const modes = [info.tab2_item1_title, info.tab2_item2_title, info.tab2_item3_title, info.tab2_item4_title].map((v) => plainText(v)).filter((v) => v.length > 2);
  const hours = [info.course_duration_text && `مسجلة: ${plainText(info.course_duration_text)}`, product.course_type !== 'recorded' && info.attendance_duration_text && `حضوري/مباشر: ${plainText(info.attendance_duration_text)}`]
    .filter((v): v is string => Boolean(v) && !/^\S+: مدة الدورة$/.test(v as string));
  const instructors = [...new Set([...(info.instructors ?? []), ...(info.attendance_instructors ?? [])].map((i) => plainText(i.name)).filter(Boolean))];
  const requirements = titled(info.tab5_items).filter(Boolean);
  const notes = [
    hours.length && `المدة: ${hours.join(' · ')}`,
    plainText(info.course_language_text) && `اللغة: ${plainText(info.course_language_text)}`,
    modes.length && `طرق الدراسة: ${modes.join('، ')}`,
    instructors.length && `المحاضرون: ${instructors.slice(0, 6).join('، ')}`,
    requirements.length && `شروط الالتحاق:\n- ${requirements.join('\n- ')}`,
  ].filter(Boolean).join('\n');
  return {
    courseId: `product.template:${product.product_template_id}`, courseName: name, category: clip(category, LIMITS.category),
    description: overview(info.course_description_html, info.description_sale),
    objectives: lines((info.tab1_items ?? []).map((i) => i.title)), outcomes: lines(info.learn_items ?? []),
    audience: joined((info.tab6_items ?? []).map((i) => i.title)),
    notes: clip(notes, LIMITS.notes), sourceUrl,
  };
}

type Fetch = typeof fetch;
async function rpc<T>(path: string, params: Record<string, unknown>, fetchImpl: Fetch): Promise<T> {
  const response = await fetchImpl(new URL(path, WEBSITE), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Social-Pulse/1 (course library sync)' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }), signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { message?: string; data?: { message?: string } } };
  if (payload.error || payload.result === undefined) throw new Error(`${path}: ${payload.error?.data?.message || payload.error?.message || 'no result'}`);
  return payload.result;
}

/** Category names from the website's menu, or the known list if the menu cannot be read. */
async function categoryNames(fetchImpl: Fetch): Promise<Record<number, string>> {
  try {
    const response = await fetchImpl(WEBSITE + '/', { headers: { 'User-Agent': 'Engosoft-Social-Pulse/1 (course library sync)' }, signal: AbortSignal.timeout(25_000) });
    const html = await response.text();
    const found = Object.fromEntries([...html.matchAll(/data-category-id="(\d+)">\s*<span class="cmn-mega-cat-name">([^<]+)</g)].map((m) => [Number(m[1]), plainText(m[2])]));
    return Object.keys(found).length ? found : FALLBACK_CATEGORIES;
  } catch { return FALLBACK_CATEGORIES; }
}

/** Runs `work` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index]); }
  }));
  return results;
}

/** Every course on engosoft.com with its page content. Courses whose page cannot be read are skipped and counted. */
export async function fetchWebsiteCatalog(fetchImpl: Fetch = fetch): Promise<WebsiteCatalog & { failed: string[] }> {
  const listed = await rpc<{ products: FeedProduct[]; total_count: number }>('/engosoft_homepage_products/get_products_data', { limit: 1000, filter_type: 'all', lang: 'ar_001' }, fetchImpl);
  const products = listed.products.filter((p) => p.website_published !== false && p.website_url?.startsWith('/shop/'));
  const names = await categoryNames(fetchImpl);
  // The list gives one category per course, often "best sellers"; each field's own list gives the real one.
  const fieldOf = new Map<number, string>();
  for (const [id, name] of Object.entries(names)) {
    if (NOT_A_FIELD.has(Number(id))) continue;
    const inField = await rpc<{ products: FeedProduct[] }>('/engosoft_homepage_products/get_products_data', { limit: 1000, filter_type: 'category', category_id: Number(id), lang: 'ar_001' }, fetchImpl).catch(() => ({ products: [] }));
    for (const p of inField.products) if (!fieldOf.has(p.product_template_id)) fieldOf.set(p.product_template_id, name);
  }
  const failed: string[] = [];
  const courses = await pool(products, 4, async (product) => {
    const courseType = product.course_type === 'attendance' ? 'attendance' : product.course_type === 'exam_simulator' ? 'exam_simulator' : 'recorded';
    try {
      const info = await rpc<CourseInfo & { success?: boolean }>('/product_section_1/get_product_info', { product_template_id: product.product_template_id, product_id: product.product_variant_id, course_type: courseType, lang: 'ar_001' }, fetchImpl);
      const category = fieldOf.get(product.product_template_id) ?? (product.category_id && !NOT_A_FIELD.has(product.category_id) ? names[product.category_id] ?? '' : '');
      return courseFromInfo(product, info, category);
    } catch { failed.push(product.name); return null; }
  });
  const unique = new Map<string, WebsiteCourse>();
  for (const course of courses) if (course && !unique.has(course.courseId)) unique.set(course.courseId, course);
  return { source: `${WEBSITE}/shop`, retrievedAt: new Date().toISOString(), discovered: products.length, courses: [...unique.values()], failed };
}
