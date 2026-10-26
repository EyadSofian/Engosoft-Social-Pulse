/** Read-only schedule bridge for Odoo 17 JSON-RPC or Odoo 19+ JSON-2. No secret reaches the browser. */
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
export interface ScheduleEntry { id: string; title: string; startsAt: string; endsAt: string; source: string; location?: string; registrationUrl?: string; websitePublished?: boolean }
type OdooRow = Record<string, unknown>;

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; payload: unknown }> {
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(target, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 10_000_000) { req.destroy(new Error('Odoo response too large')); return; } chunks.push(chunk); });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(new Error('Odoo returned invalid JSON')); }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Odoo connection timed out')));
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

async function jsonRpc(base: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const response = await postJson(`${base}/jsonrpc`, { jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }, { 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Social-Pulse/1' });
  const payload = response.payload as { result?: unknown; error?: { data?: { message?: string }; message?: string } };
  if (response.status < 200 || response.status >= 300 || payload.error) throw new Error(payload.error?.data?.message || payload.error?.message || `Odoo RPC HTTP ${response.status}`);
  return payload.result;
}

export function mapScheduleRows(rows: OdooRow[], model: string, startField: string, endField: string): ScheduleEntry[] {
  return rows.flatMap((row) => {
    const title = typeof row.name === 'string' ? row.name.trim() : '';
    const start = typeof row[startField] === 'string' ? row[startField] : '';
    const end = typeof row[endField] === 'string' ? row[endField] : start;
    if (!title || !start) return [];
    const toIso = (value: string) => value.includes('T') ? value : value.replace(' ', 'T') + (value.length === 10 ? 'T00:00:00Z' : 'Z');
    const location = Array.isArray(row.address_id) && typeof row.address_id[1] === 'string' ? row.address_id[1] : '';
    const registrationUrl = row.website_published === true && typeof row.website_url === 'string' ? row.website_url : '';
    return [{ id: `${model}:${row.id}`, title, startsAt: toIso(start), endsAt: toIso(end), source: model,
      ...(location ? { location } : {}), ...(registrationUrl ? { registrationUrl } : {}),
      ...(typeof row.website_published === 'boolean' ? { websitePublished: row.website_published } : {}),
    }];
  });
}

export async function readOdooSchedule(env: NodeJS.ProcessEnv = process.env): Promise<{ status: 'connected' | 'needs_setup' | 'error'; events: ScheduleEntry[]; message?: string }> {
  const base = env.ODOO_URL?.trim().replace(/\/+$/, '');
  const key = env.ODOO_API_KEY?.trim();
  if (!base || !key) return { status: 'needs_setup', events: [], message: 'أضف ODOO_URL و ODOO_API_KEY على الخادم.' };
  if (!/^https:\/\//.test(base) && !/^http:\/\/localhost(?::\d+)?$/.test(base)) return { status: 'error', events: [], message: 'استخدم رابط Odoo آمنًا (HTTPS).' };
  const headers: Record<string, string> = { Authorization: `bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Social-Pulse/1' };
  if (env.ODOO_DATABASE?.trim()) headers['X-Odoo-Database'] = env.ODOO_DATABASE.trim();
  const models = [{ name: 'event.event', start: 'date_begin', end: 'date_end' }];
  if (env.ODOO_INCLUDE_CALENDAR_EVENTS === 'true') models.push({ name: 'calendar.event', start: 'start', end: 'stop' });
  if (env.ODOO_COURSE_MODEL?.trim()) models.push({ name: env.ODOO_COURSE_MODEL.trim(), start: env.ODOO_COURSE_START_FIELD?.trim() || 'date_begin', end: env.ODOO_COURSE_END_FIELD?.trim() || 'date_end' });
  const events: ScheduleEntry[] = [];
  const errors: string[] = [];
  let successfulModels = 0;
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  let rpcUid: number | null = null;
  const rpcMode = env.ODOO_API_MODE === 'jsonrpc';
  if (rpcMode && (!env.ODOO_DATABASE?.trim() || !env.ODOO_USERNAME?.trim())) return { status: 'needs_setup', events: [], message: 'الربط مع Odoo JSON-RPC يحتاج ODOO_DATABASE و ODOO_USERNAME.' };
  for (const model of models) {
    try {
      let rows: unknown;
      if (rpcMode) {
        if (rpcUid === null) {
          const uid = await jsonRpc(base, 'common', 'authenticate', [env.ODOO_DATABASE, env.ODOO_USERNAME, key, {}]);
          if (typeof uid !== 'number' || uid < 1) throw new Error('Odoo رفض بيانات حساب القراءة.');
          rpcUid = uid;
        }
        rows = await jsonRpc(base, 'object', 'execute_kw', [env.ODOO_DATABASE, rpcUid, key, model.name, 'search_read', [[[model.start, '>=', since]]], { fields: ['id', 'name', model.start, model.end, ...(model.name === 'event.event' ? ['address_id', 'website_url', 'website_published'] : [])], limit: 600, order: `${model.start} asc` }]);
      } else {
        const url = `${base}/json/2/${encodeURIComponent(model.name)}/search_read`;
        const response = await postJson(url, { domain: [[model.start, '>=', since]], fields: ['id', 'name', model.start, model.end, ...(model.name === 'event.event' ? ['address_id', 'website_url', 'website_published'] : [])], limit: 600, order: `${model.start} asc` }, headers);
        if (response.status < 200 || response.status >= 300) throw new Error(`${model.name}: HTTP ${response.status}`);
        rows = response.payload;
      }
      if (!Array.isArray(rows)) throw new Error(`${model.name}: invalid response`);
      successfulModels++;
      events.push(...mapScheduleRows(rows, model.name, model.start, model.end).map((event) => ({ ...event, ...(event.registrationUrl && event.registrationUrl.startsWith('/') ? { registrationUrl: `${base}${event.registrationUrl}` } : {}) })));
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!successfulModels) return { status: 'error', events: [], message: `تعذّرت قراءة مواعيد Odoo: ${errors.join('; ')}` };
  return { status: 'connected', events: events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)), message: errors.length ? `بعض موديلات Odoo غير متاحة: ${errors.join('; ')}` : undefined };
}

/* ── Course catalog ──────────────────────────────────────────────────── */

export interface OdooCourse {
  id: string;
  kind: 'course' | 'elearning';
  name: string;
  category: string;
  description: string;
  url?: string;
  price?: number;
  /** Upcoming scheduled runs of this course (event.event), soonest first. */
  nextRuns: ScheduleEntry[];
}

/** search_read over whichever Odoo API the server is configured for (JSON-2 or JSON-RPC). */
async function odooSearchRead(env: NodeJS.ProcessEnv, model: string, domain: unknown[], fields: string[], options: { limit?: number; order?: string } = {}): Promise<OdooRow[]> {
  const base = env.ODOO_URL!.trim().replace(/\/+$/, '');
  const key = env.ODOO_API_KEY!.trim();
  if (env.ODOO_API_MODE === 'jsonrpc') {
    const uid = await jsonRpc(base, 'common', 'authenticate', [env.ODOO_DATABASE, env.ODOO_USERNAME, key, {}]);
    if (typeof uid !== 'number' || uid < 1) throw new Error('Odoo رفض بيانات حساب القراءة.');
    const rows = await jsonRpc(base, 'object', 'execute_kw', [env.ODOO_DATABASE, uid, key, model, 'search_read', [domain], { fields, ...options }]);
    if (!Array.isArray(rows)) throw new Error(`${model}: invalid response`);
    return rows as OdooRow[];
  }
  const headers: Record<string, string> = { Authorization: `bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Mobde3/1' };
  if (env.ODOO_DATABASE?.trim()) headers['X-Odoo-Database'] = env.ODOO_DATABASE.trim();
  const response = await postJson(`${base}/json/2/${encodeURIComponent(model)}/search_read`, { domain, fields, ...options }, headers);
  if (response.status < 200 || response.status >= 300 || !Array.isArray(response.payload)) throw new Error(`${model}: HTTP ${response.status}`);
  return response.payload as OdooRow[];
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** Run titles carry a session code ("Interior Design - AutoCAD - 5812"); the course name is what precedes it. */
export const runCourseName = (title: string) => title.replace(/\s*[-–]\s*\d{3,}\s*$/, '').trim();

let catalogCache: { at: number; result: Awaited<ReturnType<typeof loadCatalog>> } | null = null;

async function loadCatalog(env: NodeJS.ProcessEnv) {
  const base = env.ODOO_URL!.trim().replace(/\/+$/, '');
  const absolute = (url: string) => (url.startsWith('/') ? `${base}${url}` : url);
  const errors: string[] = [];
  // Sales courses: products under the course root category (default "revenue"), minus fees, discounts and the like.
  const root = (env.ODOO_COURSE_CATEGORY?.trim() || 'revenue').toLowerCase();
  const products: OdooRow[] = await (async () => {
    try {
      const categories = await odooSearchRead(env, 'product.category', [], ['id', 'complete_name'], { limit: 500 });
      const ids = categories.filter((c) => { const name = text(c.complete_name).toLowerCase(); return (name === root || name.startsWith(`${root} /`)) && !/miscellaneous|discount|payment|fee/.test(name); }).map((c) => c.id);
      if (!ids.length) return [];
      return await odooSearchRead(env, 'product.template', [['sale_ok', '=', true], ['categ_id', 'in', ids]], ['id', 'name', 'list_price', 'categ_id', 'website_url', 'is_published', 'description_sale'], { limit: 1000, order: 'name asc' });
    } catch (error) { errors.push(`product.template: ${error instanceof Error ? error.message : error}`); return []; }
  })();
  // The internal catalog includes courses that have not been published on the website yet.
  const channels: OdooRow[] = await odooSearchRead(env, 'slide.channel', [], ['id', 'name', 'description_short', 'website_url', 'is_published'], { limit: 500, order: 'name asc' })
    .catch((error) => { errors.push(`slide.channel: ${error instanceof Error ? error.message : error}`); return []; });
  const schedule = await readOdooSchedule(env);
  const upcoming = schedule.events.filter((event) => Date.parse(event.startsAt) >= Date.now() - 3_600_000);
  const { scoreRecord } = await import('../src/features/creative-studio/course-search.js');
  const runsFor = (name: string) => upcoming
    .map((event) => ({ event, score: scoreRecord(name, { name: runCourseName(event.title) }) }))
    .filter((entry) => entry.score >= 2.4)
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt))
    .slice(0, 3)
    .map((entry) => entry.event);
  const courses: OdooCourse[] = [
    ...products.flatMap((row): OdooCourse[] => {
      const name = text(row.name);
      // Discounts, fees and the per-event registration products are not courses.
      if (!name || /discount|\bfees?\b|installation|%\s*on\b|خصم|-\s*event$/i.test(name)) return [];
      const category = Array.isArray(row.categ_id) ? text(row.categ_id[1]).split(' / ').slice(1).join(' / ') : '';
      return [{ id: `product.template:${row.id}`, kind: 'course', name, category, description: text(row.description_sale).slice(0, 800), ...(row.is_published === true && text(row.website_url) ? { url: absolute(text(row.website_url)) } : {}), ...(typeof row.list_price === 'number' && row.list_price > 0 ? { price: row.list_price } : {}), nextRuns: runsFor(name) }];
    }),
    ...channels.flatMap((row): OdooCourse[] => {
      const name = text(row.name);
      if (!name) return [];
      return [{ id: `slide.channel:${row.id}`, kind: 'elearning', name, category: 'eLearning', description: plain(text(row.description_short)).slice(0, 800), ...(row.is_published === true && text(row.website_url) ? { url: absolute(text(row.website_url)) } : {}), nextRuns: [] }];
    }),
  ];
  return { courses, events: upcoming, errors: [...errors, ...(schedule.status === 'connected' ? [] : [schedule.message ?? 'schedule unavailable'])] };
}

/** All courses (sales catalog + published eLearning) with their next runs; cached for 15 minutes. */
export async function readOdooCatalog(env: NodeJS.ProcessEnv = process.env): Promise<{ status: 'connected' | 'needs_setup' | 'error'; courses: OdooCourse[]; events: ScheduleEntry[]; message?: string }> {
  if (!env.ODOO_URL?.trim() || !env.ODOO_API_KEY?.trim()) return { status: 'needs_setup', courses: [], events: [], message: 'أضف ODOO_URL و ODOO_API_KEY على الخادم.' };
  if (catalogCache && Date.now() - catalogCache.at < 15 * 60_000) return { status: 'connected', ...catalogCache.result, message: catalogCache.result.errors.join('; ') || undefined };
  try {
    const result = await loadCatalog(env);
    if (!result.courses.length && !result.events.length) return { status: 'error', courses: [], events: [], message: result.errors.join('; ') || 'لا توجد دورات في Odoo.' };
    catalogCache = { at: Date.now(), result };
    return { status: 'connected', ...result, message: result.errors.join('; ') || undefined };
  } catch (error) {
    return { status: 'error', courses: [], events: [], message: error instanceof Error ? error.message : String(error) };
  }
}
