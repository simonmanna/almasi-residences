import { join } from 'node:path';
import { expect, request, type APIRequestContext } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3011';

/**
 * Joined by hand rather than through `baseURL`: an absolute path resolves
 * against the origin and silently drops the `/api/v1` prefix.
 */
const BASE = `${API}/api/v1`;
const url = (path: string) => `${BASE}${path}`;

/** Seeded local accounts. Never created outside development (seed.ts:650). */
export const ACCOUNTS = {
  owner: 'owner@example.invalid',
  property: 'property@example.invalid',
  sales: 'sales@example.invalid',
  content: 'content@example.invalid',
  viewer: 'viewer@example.invalid',
} as const;

export type Role = keyof typeof ACCOUNTS;

export const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'phase-one-local-only';

/** Where global setup leaves each role's signed-in cookies. */
export const authFile = (role: string): string => join(process.cwd(), 'e2e', '.auth', `${role}.json`);

/**
 * A signed-in admin API client.
 *
 * Mutating requests carry the CSRF token the API signed into the session, the
 * same way the admin app does — so these tests exercise that path rather than
 * going round it.
 */
export class AdminApi {
  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly csrf: string,
  ) {}

  /** Reuses the session global setup established; never signs in again. */
  static async as(role: Role = 'owner'): Promise<AdminApi> {
    const ctx = await request.newContext({ storageState: authFile(role) });
    const state = await ctx.storageState();
    const csrf = state.cookies.find((c) => c.name === 'avida_csrf')?.value ?? '';
    expect(csrf, `no CSRF cookie for ${role}; did global setup run?`).not.toEqual('');
    return new AdminApi(ctx, csrf);
  }

  get headers(): Record<string, string> {
    return { 'x-csrf-token': this.csrf };
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.ctx.get(url(path));
    expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
    return (await res.json()) as T;
  }

  /** For asserting a refusal rather than reading a body. */
  status(path: string): Promise<number> {
    return this.ctx.get(url(path)).then((r) => r.status());
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const res = await this.ctx.post(url(path), { data: data ?? {}, headers: this.headers });
    expect(res.ok(), `POST ${path} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json().catch(() => ({}))) as T;
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    const res = await this.ctx.patch(url(path), { data, headers: this.headers });
    expect(res.ok(), `PATCH ${path} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json().catch(() => ({}))) as T;
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    const res = await this.ctx.put(url(path), { data, headers: this.headers });
    expect(res.ok(), `PUT ${path} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json().catch(() => ({}))) as T;
  }

  async del(path: string): Promise<void> {
    const res = await this.ctx.delete(url(path), { headers: this.headers });
    expect(res.ok(), `DELETE ${path} -> ${res.status()}`).toBeTruthy();
  }

  /** For the few calls that need their own shape, such as a multipart upload. */
  raw(): APIRequestContext {
    return this.ctx;
  }

  apiUrl(path: string): string {
    return url(path);
  }

  dispose(): Promise<void> {
    return this.ctx.dispose();
  }
}

export interface ResidenceRow {
  id: string;
  code: string;
  status: string;
  published: boolean;
  priceMinor: number;
  currency: string;
  areaSqm: number;
  bedrooms: number;
  floorId: string;
  typologyId: string;
  placedInModel: boolean;
  floor: { id: string; level: number; label: string };
}

/** An anonymous caller, the way a visitor's browser reaches the API. */
export async function publicJson<T>(path: string): Promise<T> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(url(path));
    expect(res.ok(), `public GET ${path} -> ${res.status()}`).toBeTruthy();
    return (await res.json()) as T;
  } finally {
    await ctx.dispose();
  }
}

export async function publicContext(): Promise<APIRequestContext> {
  return request.newContext();
}

export const apiUrl = url;

/**
 * The public site renders with ISR. An admin write revalidates it, but the
 * request that triggers the rebuild can still be served the old page, so a
 * check that reads rendered HTML retries briefly rather than asserting once.
 */
export async function eventually(
  check: () => Promise<boolean>,
  { timeout = 30000, interval = 1000 } = {},
): Promise<boolean> {
  const until = Date.now() + timeout;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
}
