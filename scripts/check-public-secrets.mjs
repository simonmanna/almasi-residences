#!/usr/bin/env node
/**
 * §5.9 — no secret may reach a NEXT_PUBLIC_* or VITE_* variable. Anything
 * prefixed that way is compiled into the browser bundle, where it is public
 * regardless of what the name says.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORBIDDEN = /(SECRET|PASSWORD|PRIVATE|TOKEN|_KEY$|ACCESS_KEY)/i;
/** Public identifiers that legitimately carry a "key"-shaped name. */
const ALLOW = new Set([]);

const lines = readFileSync(`${ROOT}.env.example`, 'utf8').split('\n');
const offenders = lines
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('=')[0].trim())
  .filter((k) => /^(NEXT_PUBLIC_|VITE_)/.test(k) && FORBIDDEN.test(k) && !ALLOW.has(k));

if (offenders.length) {
  console.error('✗ Client-exposed variables with secret-shaped names:');
  for (const k of offenders) console.error(`   ${k}`);
  console.error('  These are compiled into the browser bundle. Move them server-side.');
  process.exit(1);
}
console.log('✓ no secrets exposed to the client bundle');
