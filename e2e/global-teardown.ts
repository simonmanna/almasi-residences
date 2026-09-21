import { readFile } from 'node:fs/promises';
import { authFile } from './admin-api';
import { sessionFromState, sweepFixtures } from './fixtures.mjs';

const API = process.env.E2E_API_URL ?? 'http://localhost:3011';

/** Catches whatever a failed test's `finally` did not; global setup sweeps again for crashed runs. */
export default async function globalTeardown(): Promise<void> {
  const state = JSON.parse(await readFile(authFile('owner'), 'utf8'));
  const removed = await sweepFixtures(API, sessionFromState(state));
  if (removed.length) console.log(`E2E teardown swept ${removed.length} leftover fixture(s): ${removed.join(', ')}`);
}
