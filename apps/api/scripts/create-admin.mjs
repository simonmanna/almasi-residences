#!/usr/bin/env node
/**
 * Creates an admin account, or resets one, with a fresh password and TOTP
 * secret. Production refuses a login without TOTP (§3.1) and the admin has no
 * enrolment screen yet, so this is how accounts get in.
 *
 *   node scripts/create-admin.mjs <email> "<name>" [OWNER|SALES]
 *
 * Prints the generated password and an otpauth:// URI: add it to an
 * authenticator app (most accept the URI pasted, or render it as a QR code).
 * Re-running for the same email rotates both and clears any lockout.
 */
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { generateSecret, generateURI } from 'otplib';
import db from '@avida/db';

const { prisma } = db;
const ROLES = Object.values(db.AdminRole ?? { OWNER: 'OWNER', SALES: 'SALES' });

const [emailArg, name, role = 'SALES'] = process.argv.slice(2);
if (!emailArg || !name || !ROLES.includes(role)) {
  console.error(`usage: create-admin.mjs <email> "<name>" [${ROLES.join('|')}]`);
  process.exit(2);
}

const email = emailArg.toLowerCase();
const password = randomBytes(18).toString('base64url');
const totpSecret = generateSecret();
const passwordHash = await hash(password);
const reset = {
  name,
  role,
  passwordHash,
  totpSecret,
  totpEnrolledAt: new Date(),
  failedLoginCount: 0,
  lockedUntil: null,
};

try {
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, ...reset },
    update: reset,
  });
} finally {
  await prisma.$disconnect();
}

console.log(`
  Admin account ready: ${email} (${role})

  Password:     ${password}
  TOTP secret:  ${totpSecret}
  TOTP URI:     ${generateURI({ issuer: 'Kivu Ridge admin', label: email, secret: totpSecret })}

  Shown once. Store the password in a password manager and add the secret to
  an authenticator app now.
`);
