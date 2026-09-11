import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
// otplib 13's functional API ships with its crypto and base32 plugins wired
// in; a bare `new TOTP()` has neither and throws on every verify.
import { verify as verifyTotp } from 'otplib';
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
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password);
  }

  async login(email: string, password: string, totp?: string) {
    const user = await this.prisma.client.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Same message and roughly the same work either way — a different response
    // for "no such account" tells an attacker which emails are staff.
    if (!user) {
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
      // A one-step tolerance: phone clocks drift, and a 30-second window with
      // no slack locks out real people.
      const result = await verifyTotp({
        secret: user.totpSecret,
        token: totp,
        epochTolerance: 30,
      });
      if (!result.valid) return this.recordFailure(user.id, user.failedLoginCount);
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('This account must complete two-factor enrolment first');
    }

    await this.prisma.client.adminUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return {
      token: this.sessions.issue(user.id, user.role),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async me(userId: string) {
    return this.prisma.client.adminUser.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, lastLoginAt: true },
    });
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
