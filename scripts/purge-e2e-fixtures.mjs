#!/usr/bin/env node
/**
 * Removes E2E fixtures (residences E2E#####, Z####, Q####; content labelled "E2E …")
 * through the admin API, so every normal side effect runs: audit log, website
 * revalidation, delete guards.
 *
 *   pnpm test:e2e:purge                  # local stack from .env
 *   E2E_API_URL=https://admin.example.com E2E_ALLOW_REMOTE=1 \
 *   PURGE_EMAIL=… PURGE_PASSWORD=… pnpm test:e2e:purge
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { assertLocalTarget, sweepFixtures } from '../e2e/fixtures.mjs';

if (existsSync('.env')) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync('.env', 'utf8')))) process.env[k] ??= v;
}
assertLocalTarget();

const api = process.env.E2E_API_URL ?? 'http://localhost:3011';
const email = process.env.PURGE_EMAIL ?? 'owner@example.invalid';
const password = process.env.PURGE_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? 'phase-one-local-only';

const res = await fetch(`${api}/api/v1/admin/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, ...(process.env.PURGE_TOTP ? { totp: process.env.PURGE_TOTP } : {}) }),
});
if (!res.ok) {
  console.error(`Sign-in as ${email} failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const jar = res.headers.getSetCookie().map((c) => c.split(';')[0]);
const csrf = jar.find((c) => c.startsWith('avida_csrf='))?.slice('avida_csrf='.length) ?? '';
const removed = await sweepFixtures(api, { cookie: jar.join('; '), csrf });

console.log(removed.length ? `Removed ${removed.length} fixture(s):\n  ${removed.join('\n  ')}` : 'No E2E fixtures found.');
