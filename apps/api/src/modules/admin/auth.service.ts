import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
// otplib 13's functional API ships with its crypto and base32 plugins wired
// in; a bare `new TOTP()` has neither and throws on every verify.
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { canSignIn, PERMISSIONS, scopeOf } from '@avida/types';
import { AccessService, principalSelect } from '../../common/access.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SessionService } from './session.service.js';

/** §5.9 — five failed attempts per account, then a 15-minute lock. */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly dev: CurrentDevelopment,
    private readonly access: AccessService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password);
  }

  async login(email: string, password: string, totp?: string) {
    const user = await this.prisma.client.adminUser.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: { select: { key: true } } },
    });

    // Same message and roughly the same work either way — a different response
    // for "no such account" tells an attacker which emails are staff. A
    // deactivated account is answered exactly like a missing one.
    if (!user || !user.active || !canSignIn(user.status)) {
      await hash('decoy-work-to-equalise-timing');
      throw new UnauthorizedException('Those details do not match an account');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Too many attempts. Try again shortly.');
    }

    const passwordOk = await verify(user.passwordHash, password).catch(() => false);
    if (!passwordOk) return this.recordFailure(user.id, user.failedLoginCount);

    // §3.1 — TOTP is mandatory. An enrolled user must present a code; an
    // un-enrolled one is told to enrol rather than let through.
    if (user.totpSecret) {
      if (!totp) throw new UnauthorizedException('Enter the code from your authenticator app');
      const entered = totp.trim();
      // otplib throws on anything that is not six digits, so the shape decides
      // which check runs: a six-digit code goes to the authenticator, anything
      // else is treated as a recovery code.
      const looksLikeCode = /^\d{6}$/.test(entered);
      // A one-step tolerance: phone clocks drift, and a 30-second window with
      // no slack locks out real people.
      const valid = looksLikeCode
        ? await verifyTotp({ secret: user.totpSecret, token: entered, epochTolerance: 30 })
            .then((r) => r.valid)
            .catch(() => false)
        : false;
      if (!valid) {
        // §24.8 — a recovery code stands in for the authenticator exactly once.
        const used = looksLikeCode
          ? false
          : await this.consumeRecoveryCode(user.id, user.recoveryCodeHashes, entered);
        if (!used) return this.recordFailure(user.id, user.failedLoginCount);
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('This account must complete two-factor enrolment first');
    }

    await this.prisma.client.adminUser.update({
      where: { id: user.id },
      // An invited account becomes active the first time it signs in.
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastActiveAt: new Date(), ...(user.status === 'INVITED' ? { status: 'ACTIVE' } : {}) },
    });

    const { token, csrf } = this.sessions.issue(user.id, user.role.key, user.tokenVersion);
    return {
      token,
      csrf,
      user: { id: user.id, name: user.name, email: user.email, role: user.role.key },
    };
  }

  /**
   * §24.8 — step one of enrolment. The secret is stored immediately but
   * `totpEnrolledAt` stays null until a code proves the authenticator has it,
   * so an abandoned enrolment cannot lock anybody out.
   */
  async startTotpEnrolment(userId: string): Promise<{ secret: string; uri: string }> {
    const user = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnrolledAt) {
      throw new BadRequestException('Two-factor authentication is already set up. Turn it off first to start again.');
    }
    const secret = generateSecret();
    await this.prisma.client.adminUser.update({ where: { id: userId }, data: { totpSecret: secret } });
    const { name } = await this.dev.get();
    return { secret, uri: generateURI({ issuer: `${name} admin`, label: user.email, secret }) };
  }

  /** Step two: prove the code works, then hand over the recovery codes once. */
  async confirmTotpEnrolment(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new BadRequestException('Start the setup again: there is no pending secret.');
    const result = await verifyTotp({ secret: user.totpSecret, token: code, epochTolerance: 30 });
    if (!result.valid) throw new BadRequestException('That code is not right. Check the clock on your phone and try the current code.');

    const recoveryCodes = SessionService.newRecoveryCodes();
    const recoveryCodeHashes = await Promise.all(recoveryCodes.map((c) => hash(c)));
    await this.prisma.client.adminUser.update({
      where: { id: userId },
      data: { totpEnrolledAt: new Date(), recoveryCodeHashes },
    });
    return { recoveryCodes };
  }

  /** Turning it off needs the password, so a borrowed session cannot do it. */
  async disableTotp(userId: string, password: string): Promise<void> {
    const user = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new BadRequestException('That password is not correct.');
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Two-factor authentication cannot be switched off on this deployment. Ask a super admin to reset it instead.');
    }
    await this.clearTotp(userId);
  }

  /** A super admin resetting someone who lost their phone. */
  async resetTotpFor(userId: string): Promise<void> {
    await this.clearTotp(userId);
  }

  /** How many single-use recovery codes are left. */
  async me(userId: string) {
    const user = await this.prisma.client.adminUser.findUnique({
      where: { id: userId },
      select: { ...principalSelect, email: true, lastLoginAt: true, totpEnrolledAt: true, recoveryCodeHashes: true, jobTitle: true, role: { select: { key: true, name: true, description: true, active: true, updatedAt: true } } },
    });
    if (!user) throw new UnauthorizedException('Sign in to continue');
    const grants = await this.access.grantsOf(user);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
      department: user.department,
      status: user.status,
      role: user.role.key,
      roleName: user.role.name,
      roleDescription: user.role.description,
      lastLoginAt: user.lastLoginAt,
      twoFactor: user.totpEnrolledAt !== null,
      recoveryCodesLeft: user.recoveryCodeHashes.length,
      // What the admin uses to decide what to show. The API re-resolves it on every request.
      grants,
      permissions: PERMISSIONS.filter((p) => scopeOf({ grants }, p) !== 'NONE'),
      overrides: user.overrides.length,
    };
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verify(user.passwordHash, current).catch(() => false);
    if (!ok) throw new BadRequestException('Your current password is not correct.');
    if (current === next) throw new BadRequestException('Choose a password you have not used here before.');
    // §24.5 — a password change ends every other session, which is the whole
    // point of changing it. `tokenVersion` is signed into each cookie.
    await this.prisma.client.adminUser.update({
      where: { id: userId },
      data: { passwordHash: await hash(next), tokenVersion: { increment: 1 } },
    });
  }

  private async clearTotp(userId: string): Promise<void> {
    await this.prisma.client.adminUser.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnrolledAt: null, recoveryCodeHashes: [], tokenVersion: { increment: 1 } },
    });
  }

  /**
   * Recovery codes are stored hashed and are single use, so this checks each
   * one and removes the match. Comparing every hash keeps the work constant
   * whether or not the code was right.
   */
  private async consumeRecoveryCode(userId: string, hashes: string[], candidate: string): Promise<boolean> {
    const code = candidate.trim().toLowerCase();
    let matched = -1;
    for (let i = 0; i < hashes.length; i += 1) {
      const ok = await verify(hashes[i]!, code).catch(() => false);
      if (ok && matched === -1) matched = i;
    }
    if (matched === -1) return false;
    await this.prisma.client.adminUser.update({
      where: { id: userId },
      data: { recoveryCodeHashes: hashes.filter((_, i) => i !== matched) },
    });
    this.log.warn(`Recovery code used for ${userId}; ${hashes.length - 1} remain`);
    return true;
  }

  private async recordFailure(userId: string, current: number): Promise<never> {
    const next = current + 1;
    await this.prisma.client.adminUser.update({
      where: { id: userId },
      data: {
        failedLoginCount: next,
        lockedUntil:
          next >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    this.log.warn(`Failed admin login attempt ${next} for user ${userId}`);
    throw new UnauthorizedException('Those details do not match an account');
  }
}
