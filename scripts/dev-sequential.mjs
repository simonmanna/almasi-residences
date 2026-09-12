#!/usr/bin/env node
/**
 * Sequential dev startup: API → wait for health → web/admin/worker in parallel.
 * Solves the race where web starts before API is ready.
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
  process.stdout.write('[dev] Waiting for API at ' + HEALTH_URL + ' ');
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        console.log('\n[dev] API ready');
        return;
      }
    } catch {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  throw new Error(`API not ready after ${TIMEOUT_MS}ms`);
}

async function main() {
  console.log('[dev] Starting API...');
  const api = spawn('pnpm', ['--filter', '@avida/api', 'dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  // Give API a head start before polling
  await new Promise(r => setTimeout(r, 3000));

  try {
    await waitForApi();
  } catch (e) {
    api.kill();
    throw e;
  }

  console.log('[dev] Starting web, admin, worker...');
  const procs = [
    spawn('pnpm', ['--filter', '@avida/web', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, FORCE_COLOR: '1' } }),
    spawn('pnpm', ['--filter', '@avida/admin', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, FORCE_COLOR: '1' } }),
    spawn('pnpm', ['--filter', '@avida/worker', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, FORCE_COLOR: '1' } }),
  ];

  // Forward exit from any child
  procs.forEach(p => p.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] Process exited with ${code}`);
      procs.forEach(p2 => p2.kill());
      api.kill();
      process.exit(code);
    }
  }));

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[dev] Shutting down...');
    procs.forEach(p => p.kill());
    api.kill();
    process.exit(0);
  });
}

main().catch(e => { console.error('[dev] Fatal:', e.message); process.exit(1); });