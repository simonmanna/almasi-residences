import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// DECISIONS D-03 — one .env, at the repo root. The suite needs SEED_ADMIN_PASSWORD
// to sign in and REDIS_URL to reset rate-limit counters between runs. Anything
// already in the environment (CI) wins.
if (existsSync('.env')) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync('.env', 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value as string;
  }
}

/**
 * The end-to-end suite for the admin → database → API → website chain.
 *
 * Roadmap gate 0, item 15. Everything in gate 1 converts a static surface into
 * a database-backed one; without a test that watches an admin change appear on
 * the public site, each of those conversions is unverifiable.
 *
 * The servers are expected to be running (`pnpm dev`, or the three commands
 * below). CI starts them with `webServer`; locally, reusing what is already up
 * keeps a run to a few seconds.
 */
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API = process.env.E2E_API_URL ?? 'http://localhost:3011';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // The chain is stateful: a test that publishes a residence and a test that
  // unpublishes it must not interleave.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  metadata: { api: API },
});
