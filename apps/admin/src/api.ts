/**
 * Admin API client. Every request carries the session cookie, so the browser
 * enforces the SameSite=Strict rule the API sets (§5.9).
 */
const BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/admin`;

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as T & { detail?: string }) : ({} as T);
  if (!res.ok) {
    throw new AdminApiError((json as { detail?: string }).detail ?? res.statusText, res.status);
  }
  return json;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MARKETING' | 'SALES';
}

export interface AdminUnit {
  id: string;
  code: string;
  status: 'AVAILABLE' | 'RESERVED' | 'BOOKED' | 'SOLD' | 'NOT_RELEASED';
  priceMinor: number;
  currency: string;
  areaSqm: number;
  orientation: string;
  notes: string | null;
  floor: { level: number; label: string };
  typology: { slug: string; name: string };
}

export interface AdminEnquiry {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  intent: string;
  status: string;
  message: string | null;
  verificationSkipped: boolean;
  units: { unit: { code: string } }[];
}

export const api = {
  login: (email: string, password: string, totp?: string) =>
    request<{ user: AdminUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totp }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<AdminUser>('/me'),
  dashboard: () =>
    request<{
      units: Record<string, number>;
      enquiries: Record<string, number>;
      recentChanges: { id: string; from: string; to: string; createdAt: string; unit: { code: string } }[];
    }>('/dashboard'),
  units: (params: { status?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    );
    return request<{ data: AdminUnit[] }>(`/units${qs.toString() ? `?${qs}` : ''}`);
  },
  bulkStatus: (ids: string[], status: string) =>
    request<{ changed: number; unchanged: number }>('/units/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    }),
  enquiries: () => request<{ data: AdminEnquiry[] }>('/enquiries'),
  updateEnquiry: (id: string, status: string) =>
    request<AdminEnquiry>(`/enquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  exportUrl: `${BASE}/enquiries/export.csv`,
};
