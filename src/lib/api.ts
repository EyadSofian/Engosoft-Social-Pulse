export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Fired when the server says the session has ended; the auth layer shows the login screen. */
export const SESSION_ENDED = 'social-pulse:session-ended';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError('تعذّر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.', 0);
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 401) window.dispatchEvent(new Event(SESSION_ENDED));
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `تعذّر تنفيذ الطلب (HTTP ${response.status}).`;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** JSON call with a full /api path and an optional JSON body (POST when a body is given). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('تعذّر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.', 0);
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(SESSION_ENDED));
  if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`, response.status, data);
  return data;
}
