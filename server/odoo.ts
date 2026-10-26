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
  if (!base || !key) return { status: 'needs_setup', events: [], message: 'أضف ODOO_URL و ODOO_API_KEY على السيرفر.' };
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
        rows = await jsonRpc(base, 'object', 'execute_kw', [env.ODOO_DATABASE, rpcUid, key, model.name, 'search_read', [[[model.start, '>=', since]]], { fields: ['id', 'name', model.start, model.end, ...(model.name === 'event.event' ? ['address_id', 'website_url', 'website_published'] : [])], limit: 150, order: `${model.start} asc` }]);
      } else {
        const url = `${base}/json/2/${encodeURIComponent(model.name)}/search_read`;
        const response = await postJson(url, { domain: [[model.start, '>=', since]], fields: ['id', 'name', model.start, model.end, ...(model.name === 'event.event' ? ['address_id', 'website_url', 'website_published'] : [])], limit: 150, order: `${model.start} asc` }, headers);
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
