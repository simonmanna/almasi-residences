import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import Redis from 'ioredis';
import { request } from '@playwright/test';
import { ACCOUNTS, authFile, SEED_PASSWORD } from './admin-api';

const API = process.env.E2E_API_URL ?? 'http://localhost:3011';

/**
 * Rate limits are real shared state now that they live in Redis, so a suite
 * that signs in and submits enquiries exhausts them across runs. Clearing the
 * throttle namespace before a run is fixture hygiene, the same category as
 * reseeding the database — it resets counters, it does not disable the limiter,
 * and the tests still go through every check the limiter guards.
 */
async function clearRateLimits(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys('throttle:*');
    if (keys.length) await redis.del(...keys);
  } catch {
    // No Redis: limits are per-process and a fresh API run starts clean anyway.
  } finally {
    redis.disconnect();
  }
}

/** Does the saved session still work? Cheaper than signing in, and not rate limited. */
async function stillValid(file: string): Promise<boolean> {
  if (!existsSync(file)) return false;
  const ctx = await request.newContext({ storageState: file });
  try {
    return (await ctx.get(`${API}/api/v1/admin/me`)).ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Sign in once per role, before anything runs, and reuse the session on a
 * rerun.
 *
 * Sign-in is rate limited to five attempts per fifteen minutes per IP — which
 * is the point of roadmap item 8 — and there are five seeded roles, so a suite
 * that signed in per test, or even per run, locked itself out. Storage state is
 * the standard way round it and keeps the tests honest: every request carries a
 * real session cookie and a real CSRF token rather than a back door.
 */
export default async function globalSetup(): Promise<void> {
  await clearRateLimits();

  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const file = authFile(role);
    if (await stillValid(file)) continue;

    const ctx = await request.newContext();
    const res = await ctx.post(`${API}/api/v1/admin/auth/login`, {
      data: { email, password: SEED_PASSWORD },
    });
    if (!res.ok()) {
      const hint =
        res.status() === 429
          ? 'The sign-in rate limit is per IP and resets after fifteen minutes; delete e2e/.auth to force a fresh sign-in once it has.'
          : 'Is the API running and seeded, and is SEED_ADMIN_PASSWORD set?';
      throw new Error(`Could not sign in as ${email} (${res.status()}). ${hint} ${await res.text()}`);
    }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(await ctx.storageState(), null, 2));
    await ctx.dispose();
  }
}
