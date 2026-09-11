import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * The workspace keeps a single .env at the repo root. Anything importing the db
 * package (API, worker, seed, scripts) needs DATABASE_URL before the client is
 * constructed, so loading happens here and this module is imported first.
 *
 * The root is found by walking up for pnpm-workspace.yaml rather than from
 * `import.meta.url`: this package is consumed from both an ESM build (worker,
 * web) and a CommonJS one (the Nest API), and import.meta is illegal in the
 * latter. Values already in the environment win — a deployment sets real
 * variables and must not be overridden by a stray local file.
 */
function findRepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const root = findRepoRoot(process.cwd());
if (root) {
  const envPath = join(root, '.env');
  if (existsSync(envPath)) loadEnv({ path: envPath });
}
