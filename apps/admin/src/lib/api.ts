/**
 * Admin API client. Every request carries the session cookie, so the browser
 * enforces the SameSite=Strict rule the API sets (§5.9). The API enforces every
 * permission; this client never assumes a call is allowed.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
const BASE = `${API_ORIGIN}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * The CSRF token the API signed into the session and set as a readable cookie.
 * Echoed on every mutating request; the API compares it to the value inside the
 * session token, so a cross-site request cannot forge it even if it can send
 * the cookie.
 */
export function csrfToken(): string {
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'avida_csrf') return decodeURIComponent(v.join('='));
  }
  return '';
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Init = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function http<T>(path: string, init: Init = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const req: RequestInit = { method, credentials: 'include', signal: init.signal };
  const headers: Record<string, string> = {};
  if (MUTATING.has(method)) headers['x-csrf-token'] = csrfToken();
  if (init.form) req.body = init.form;
  else if (init.body !== undefined) {
    req.body = JSON.stringify(init.body);
    headers['content-type'] = 'application/json';
  }
  if (Object.keys(headers).length > 0) req.headers = headers;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, req);
  } catch {
    throw new ApiError('The server could not be reached. Check your connection and try again.', 0);
  }
  if (res.status === 204) return undefined as T;
  // §24.18 — sign-out is decided by the status, not by the body's content type.
  // A 401 with a non-JSON body used to leave the user in a half-signed-in app.
  if (res.status === 401) window.dispatchEvent(new CustomEvent('admin:signed-out'));
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) {
    const text = await res.text();
    if (!res.ok) throw new ApiError(text || res.statusText, res.status);
    return text as T;
  }
  const json = (await res.json()) as T & { detail?: string };
  if (!res.ok) throw new ApiError((json as { detail?: string }).detail ?? res.statusText, res.status);
  return json;
}

export const get = <T>(path: string, signal?: AbortSignal) => http<T>(path, { signal });
export const post = <T>(path: string, body?: unknown) => http<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown) => http<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body: unknown) => http<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => http<T>(path, { method: 'DELETE' });
export const upload = <T>(path: string, form: FormData) => http<T>(path, { method: 'POST', form });

/** `{a: 1, b: undefined}` → `?a=1`. Empty values are dropped. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Media URLs from the local storage driver are API-relative; R2 URLs are absolute. */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  return /^https?:\/\//.test(url) || url.startsWith('data:') ? url : `${API_ORIGIN}${url}`;
}

export function mediaSrcSet(srcSet: string | null | undefined): string | undefined {
  if (!srcSet) return undefined;
  return srcSet
    .split(', ')
    .map((part) => {
      const [u, w] = part.split(' ');
      return `${mediaUrl(u)} ${w}`;
    })
    .join(', ');
}

/** For file downloads (CSV exports): the browser sends the cookie with a plain link. */
export const downloadUrl = (path: string) => `${BASE}${path}`;
