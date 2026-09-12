#!/usr/bin/env node
/**
 * Process Manager for Avida Platform
 * Runs each app independently with auto-restart, isolates crashes.
 * Usage: node scripts/dev-manager.mjs [--no-api-watch]
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ARGS = process.argv.slice(2);
const API_WATCH = !ARGS.includes('--no-api-watch');

const SERVICES = [
  {
    name: 'api',
    cmd: 'pnpm',
    args: ['--filter', '@avida/api', API_WATCH ? 'dev' : 'start:dev'],
    color: '\x1b[36m', // cyan
    critical: true,
    restartDelay: 3000,
    maxRestarts: 10,
    restarts: 0,
  },
  {
    name: 'web',
    cmd: 'pnpm',
    args: ['--filter', '@avida/web', 'dev'],
    color: '\x1b[32m', // green
    critical: true,
    restartDelay: 2000,
    maxRestarts: 5,
    restarts: 0,
  },
  {
    name: 'admin',
    cmd: 'pnpm',
    args: ['--filter', '@avida/admin', 'dev'],
    color: '\x1b[33m', // yellow
    critical: false,
    restartDelay: 2000,
    maxRestarts: 5,
    restarts: 0,
  },
  {
    name: 'worker',
    cmd: 'pnpm',
    args: ['--filter', '@avida/worker', 'dev'],
    color: '\x1b[35m', // magenta
    critical: false,
    restartDelay: 3000,
    maxRestarts: 5,
    restarts: 0,
  },
];

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let shuttingDown = false;
const processes = new Map();

function log(service, message, isError = false) {
  const prefix = `${service.color}[${service.name.toUpperCase()}]${RESET}`;
  const stream = isError ? process.stderr : process.stdout;
  stream.write(`${prefix} ${message}\n`);
}

function startService(service) {
  if (shuttingDown) return;

  const child = spawn(service.cmd, service.args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  processes.set(service.name, child);

  child.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line) log(service, line);
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line) log(service, line, true);
    }
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    const exitedNormally = code === 0 || code === null;
    const reason = signal ? `signal ${signal}` : `code ${code}`;

    if (exitedNormally) {
      log(service, `${BOLD}Exited normally (${reason})${RESET}`);
      return;
    }

    log(service, `${BOLD}Process crashed (${reason})${RESET}`, true);

    if (service.restarts >= service.maxRestarts) {
      log(service, `${BOLD}Max restarts (${service.maxRestarts}) reached. Giving up.${RESET}`, true);
      if (service.critical) {
        log(service, 'Critical service failed — shutting down all services', true);
        shutdown();
      }
      return;
    }

    service.restarts++;
    log(service, `Restarting in ${service.restartDelay}ms (attempt ${service.restarts}/${service.maxRestarts})...`);

    setTimeout(() => {
      if (!shuttingDown) startService(service);
    }, service.restartDelay);
  });

  child.on('error', (err) => {
    log(service, `Failed to start: ${err.message}`, true);
  });

  log(service, `Started (PID: ${child.pid})${API_WATCH && service.name === 'api' ? ' [watch mode]' : ''}`);
}

async function waitForApiHealth() {
  const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';
  const HEALTH_URL = `${API_URL}/api/v1/health`;
  const TIMEOUT_MS = 90000;
  const INTERVAL_MS = 1000;

  const start = Date.now();
  process.stdout.write(`[MANAGER] Waiting for API at ${HEALTH_URL} `);
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        console.log('\n[MANAGER] API ready');
        return true;
      }
    } catch {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  throw new Error(`API not ready after ${TIMEOUT_MS}ms`);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[MANAGER] Shutting down all services...');
  for (const [name, child] of processes) {
    log({ name, color: '' }, `Stopping ${name} (PID: ${child.pid})...`);
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const [, child] of processes) {
      if (!child.killed) child.kill('SIGKILL');
    }
    process.exit(0);
  }, 5000);
}

async function main() {
  console.log(`${BOLD}[MANAGER] Starting Avida Platform (${SERVICES.length} services)${RESET}`);
  console.log(`[MANAGER] API watch mode: ${API_WATCH ? 'enabled' : 'disabled'}`);
  console.log(`[MANAGER] Root: ${ROOT}\n`);

  // Start API first
  const apiService = SERVICES.find(s => s.name === 'api');
  startService(apiService);

  // Wait for API health before starting others
  try {
    await waitForApiHealth();
  } catch (e) {
    console.error(`\n[MANAGER] Fatal: ${e.message}`);
    shutdown();
    return;
  }

  // Start remaining services in parallel
  for (const service of SERVICES.filter(s => s.name !== 'api')) {
    startService(service);
  }

  // Handle shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  setInterval(() => {}, 1000);
}

main().catch(e => {
  console.error('[MANAGER] Fatal error:', e);
  shutdown();
});