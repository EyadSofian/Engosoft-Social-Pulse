/** Read-only schedule bridge for Odoo 19+ JSON-2. No Odoo secret reaches the browser. */
export interface ScheduleEntry { id: string; title: string; startsAt: string; endsAt: string; source: string }
type OdooRow = Record<string, unknown>;

async function jsonRpc(base: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const response = await fetch(`${base}/jsonrpc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Social-Pulse/1' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }), signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({})) as { result?: unknown; error?: { data?: { message?: string }; message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.data?.message || payload.error?.message || `Odoo RPC HTTP ${response.status}`);
  return payload.result;
}

export function mapScheduleRows(rows: OdooRow[], model: string, startField: string, endField: string): ScheduleEntry[] {
  return rows.flatMap((row) => {
    const title = typeof row.name === 'string' ? row.name.trim() : '';
    const start = typeof row[startField] === 'string' ? row[startField] : '';
    const end = typeof row[endField] === 'string' ? row[endField] : start;
    if (!title || !start) return [];
    const toIso = (value: string) => value.includes('T') ? value : value.replace(' ', 'T') + (value.length === 10 ? 'T00:00:00Z' : 'Z');
    return [{ id: `${model}:${row.id}`, title, startsAt: toIso(start), endsAt: toIso(end), source: model }];
  });
}

export async function readOdooSchedule(env: NodeJS.ProcessEnv = process.env): Promise<{ status: 'connected' | 'needs_setup' | 'error'; events: ScheduleEntry[]; message?: string }> {
  const base = env.ODOO_URL?.trim().replace(/\/+$/, '');
  const key = env.ODOO_API_KEY?.trim();
  if (!base || !key) return { status: 'needs_setup', events: [], message: 'أضف ODOO_URL و ODOO_API_KEY على السيرفر.' };
  if (!/^https:\/\//.test(base) && !/^http:\/\/localhost(?::\d+)?$/.test(base)) return { status: 'error', events: [], message: 'استخدم رابط Odoo آمنًا (HTTPS).' };
  const headers: Record<string, string> = { Authorization: `bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'Engosoft-Social-Pulse/1' };
  if (env.ODOO_DATABASE?.trim()) headers['X-Odoo-Database'] = env.ODOO_DATABASE.trim();
  const models = [
    { name: 'calendar.event', start: 'start', end: 'stop' },
    { name: 'event.event', start: 'date_begin', end: 'date_end' },
  ];
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
        rows = await jsonRpc(base, 'object', 'execute_kw', [env.ODOO_DATABASE, rpcUid, key, model.name, 'search_read', [[[model.start, '>=', since]]], { fields: ['id', 'name', model.start, model.end], limit: 150, order: `${model.start} asc` }]);
      } else {
        const url = `${base}/json/2/${encodeURIComponent(model.name)}/search_read`;
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ domain: [[model.start, '>=', since]], fields: ['id', 'name', model.start, model.end], limit: 150, order: `${model.start} asc` }), signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`${model.name}: HTTP ${response.status}`);
        rows = await response.json();
      }
      if (!Array.isArray(rows)) throw new Error(`${model.name}: invalid response`);
      successfulModels++;
      events.push(...mapScheduleRows(rows, model.name, model.start, model.end));
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!successfulModels) return { status: 'error', events: [], message: `تعذّرت قراءة مواعيد Odoo: ${errors.join('; ')}` };
  return { status: 'connected', events: events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)), message: errors.length ? `بعض موديلات Odoo غير متاحة: ${errors.join('; ')}` : undefined };
}
