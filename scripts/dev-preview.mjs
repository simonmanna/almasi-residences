#!/usr/bin/env node
/**
 * A second Next dev server for the web app, on its own port and its own build
 * directory, so it can run beside `pnpm dev` (which owns apps/web/.next on
 * :3000) for previews and browser tests.
 *
 *   node scripts/dev-preview.mjs [port]      default 3100
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? '3100';
const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const win = process.platform === 'win32';

const child = spawn(win ? 'pnpm.cmd' : 'pnpm', ['exec', 'next', 'dev', '-p', port], {
  cwd: web,
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, NEXT_DIST_DIR: '.next-preview', NEXT_PUBLIC_SITE_URL: `http://localhost:${port}` },
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
