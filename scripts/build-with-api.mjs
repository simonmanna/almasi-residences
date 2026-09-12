#!/usr/bin/env node
/**
 * Build with API: starts API → waits for health → runs build → stops API.
 * Fixes the build-time failure where Next.js prerendering calls the API.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';
const HEALTH_URL = `${API_URL}/api/v1/health`;
const TIMEOUT_MS = 90000;
const INTERVAL_MS = 1000;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
      ...opts,
    });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
    child.on('error', reject);
  });
}

async function waitForApi() {
  const start = Date.now();
  process.stdout.write('[build] Waiting for API at ' + HEALTH_URL + ' ');
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        console.log('\n[build] API ready');
        return;
      }
    } catch {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  throw new Error(`API not ready after ${TIMEOUT_MS}ms`);
}

async function main() {
  console.log('[build] Starting API...');
  const api = spawn('pnpm', ['--filter', '@avida/api', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  // Give API a head start
  await new Promise(r => setTimeout(r, 3000));

  try {
    await waitForApi();
  } catch (e) {
    api.kill();
    throw e;
  }

  console.log('[build] Running build...');
  try {
    await run('pnpm', ['build']);
    console.log('[build] Build completed successfully');
  } finally {
    console.log('[build] Stopping API...');
    api.kill();
    // Give it a moment to shut down cleanly
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => { console.error('[build] Fatal:', e.message); process.exit(1); });