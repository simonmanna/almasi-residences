#!/usr/bin/env node
/**
 * Launch preflight. Every value here decides whether a real visitor can reach
 * the sales team; an empty one is a silent failure in production, so this
 * refuses the deploy instead of discovering it from a missing lead.
 *
 * Run against the file that will be deployed:
 *   node scripts/check-launch.mjs .env.production
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';

const file = process.argv[2] ?? '.env.production';

const REQUIRED = [
  { key: 'DOMAIN', why: 'every absolute URL — sitemap, canonicals, JSON-LD, OG tags' },
  { key: 'RESEND_API_KEY', why: 'no enquiry notification or confirmation email is sent' },
  { key: 'ENQUIRY_NOTIFY_EMAILS', why: 'nobody is told when a lead arrives' },
  { key: 'ENQUIRY_FROM_EMAIL', why: 'confirmation emails have no sender' },
  { key: 'WHATSAPP_NUMBER', why: 'every WhatsApp call-to-action silently falls back to the form' },
  { key: 'POSTGRES_PASSWORD', why: 'the database would run with no password' },
  { key: 'ADMIN_SESSION_SECRET', why: 'admin sessions would not be signed' },
  { key: 'REVALIDATE_SECRET', why: 'admin edits would never reach the public site' },
];

const ADVISORY = [
  { key: 'MAP_STYLE_URL', why: 'the location map falls back to a plain drawing' },
  { key: 'SENTRY_DSN', why: 'production errors go unreported' },
  { key: 'UMAMI_ID', why: 'optional — first-party analytics already run through the API' },
];

if (!existsSync(file)) {
  console.error(`✗ ${file} does not exist. Copy infra/env.production.example and fill it in.`);
  process.exit(1);
}

const env = parseEnv(readFileSync(file, 'utf8'));
const missing = [];
const advisories = [];

for (const { key, why } of REQUIRED) {
  if (!(env[key] ?? '').trim()) missing.push({ key, why });
}
for (const { key, why } of ADVISORY) {
  if (!(env[key] ?? '').trim()) advisories.push({ key, why });
}

for (const { key, why } of advisories) console.warn(`  ! ${key} is empty — ${why}`);

if (missing.length === 0) {
  console.log(`✓ ${file}: every launch-critical value is set.`);
  process.exit(0);
}

console.error(`\n✗ ${file} is not ready to deploy.\n`);
for (const { key, why } of missing) console.error(`  ${key} is empty — ${why}`);
console.error('');
process.exit(1);
