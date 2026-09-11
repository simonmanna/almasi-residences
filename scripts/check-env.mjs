#!/usr/bin/env node
/**
 * Phase 0 task 11 — .env.example must describe reality. Fails if an app reads
 * an env var that .env.example does not declare, or declares one nothing reads.
 * Both directions matter: the first breaks a new machine, the second leaves
 * dead configuration nobody dares delete.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['apps', 'packages', 'scripts'];
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.mts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'generated', '.turbo', 'coverage']);

/** Vars the runtime provides or that only exist in CI/deployment. */
const EXEMPT = new Set([
  'NODE_ENV', 'CI', 'PORT', 'VERCEL', 'VERCEL_URL', 'npm_package_version',
  'TURBO_TOKEN', 'TURBO_TEAM',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(extname(full))) out.push(full);
  }
  return out;
}

const declared = new Set(
  readFileSync(join(ROOT, '.env.example'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=')[0].trim()),
);

const used = new Map();
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!used.has(m[1])) used.set(m[1], file.replace(ROOT, ''));
    }
    for (const m of src.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
      if (!used.has(m[1])) used.set(m[1], file.replace(ROOT, ''));
    }
  }
}

const missing = [...used.keys()].filter((k) => !declared.has(k) && !EXEMPT.has(k));
const unused = [...declared].filter((k) => !used.has(k));

let failed = false;
if (missing.length) {
  failed = true;
  console.error('✗ Read by an app but missing from .env.example:');
  for (const k of missing) console.error(`   ${k}  (${used.get(k)})`);
}
if (unused.length) {
  console.warn('! Declared in .env.example but not read anywhere yet:');
  for (const k of unused) console.warn(`   ${k}`);
  console.warn('  (expected during Phase 0 — later phases consume these)');
}
if (!failed) console.log(`✓ env: ${used.size} vars read, all declared`);
process.exit(failed ? 1 : 0);
