import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { AuditService } from '../../common/audit.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, isHttps, type AdminRequest } from './admin.guard.js';
import { ChangePasswordDto, LoginDto, TotpConfirmDto, TotpDisableDto } from './admin.dto.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from './google-auth.service.js';
import { csrfCookie, sessionCookie, SessionService } from './session.service.js';

/** Sign-in and the signed-in user. Every other admin route lives in the platform module. */
@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly google: GoogleAuthService,
  ) {}

  /** Which sign-in methods the login page should offer. */
  @Get('auth/providers')
  providers() {
    return { google: this.google.enabled() };
  }

  /**
   * Step one of "Sign in with Google": a random state in a short-lived cookie,
   * then off to Google. Lax, not Strict — Google's redirect back is a
   * cross-site navigation, and a Strict cookie would not come with it.
   */
  @Get('auth/google')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  googleStart(@Req() req: AdminRequest, @Res() reply: FastifyReply) {
    if (!this.google.enabled()) return this.backToLogin(reply, 'Google sign-in is not set up on this server.');
    const state = randomBytes(24).toString('base64url');
    const uri = this.google.redirectUri(req.protocol, req.headers.host);
    void reply.header('set-cookie', stateCookie(state, isHttps(req)));
    return reply.status(302).header('location', this.google.authUrl(uri, state)).send();
  }

  /** Step two: Google sends the person back here with a one-time code. */
  @Get('auth/google/callback')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: AdminRequest,
    @Res() reply: FastifyReply,
  ) {
    const https = isHttps(req);
    const expected = readCookie(req.headers.cookie, STATE_COOKIE);
    void reply.header('set-cookie', stateCookie('', https));
    if (error) return this.backToLogin(reply, error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in did not complete. Try again.');
    if (!code || !state || !expected || !sameString(state, expected)) {
      return this.backToLogin(reply, 'That Google sign-in link has expired. Try again.');
    }
    try {
      const identity = await this.google.identify(code, this.google.redirectUri(req.protocol, req.headers.host));
      const { token, csrf, user } = await this.auth.loginWithGoogle(identity.email);
      void reply.header('set-cookie', [stateCookie('', https), sessionCookie(token, https), csrfCookie(csrf, https)]);
      await this.audit.record({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, target: user.email, summary: 'Signed in with Google', req });
      return reply.status(302).header('location', `${adminOrigin()}/`).send();
    } catch (err) {
      return this.backToLogin(reply, (err as Error).message);
    }
  }

  private backToLogin(reply: FastifyReply, message: string) {
    return reply.status(302).header('location', `${adminOrigin()}/?login_error=${encodeURIComponent(message)}`).send();
  }

  /** §5.9 — five attempts per fifteen minutes per IP; per-account lock is in AuthService. */
  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { token, csrf, user } = await this.auth.login(dto.email, dto.password, dto.totp);
    const https = isHttps(req);
    void reply.header('set-cookie', [sessionCookie(token, https), csrfCookie(csrf, https)]);
    // §24.14 — who signed in, and from where, is part of the audit trail.
    await this.audit.record({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, target: user.email, summary: 'Signed in', req });
    return { user };
  }

  /**
   * Signing out revokes the token, not just the browser's copy of it: a cookie
   * captured beforehand used to stay valid for the rest of its twelve hours.
   */
  @Post('auth/logout')
  @UseGuards(AdminGuard)
  async logout(@Req() req: AdminRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const https = isHttps(req);
    if (req.admin) {
      await this.sessions.revoke(req.admin);
      await this.audit.record({ actorId: req.admin.userId, action: 'auth.logout', entity: 'user', entityId: req.admin.userId, summary: 'Signed out', req });
    }
    void reply.header('set-cookie', [sessionCookie('', https), csrfCookie('', https)]);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: AdminRequest) {
    return this.auth.me(req.admin!.userId);
  }

  /**
   * §24.8 — two-factor enrolment, in the admin rather than over SSH. Production
   * refuses a sign-in without it, so this is how an account becomes usable.
   */
  @Post('me/totp/start')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  startTotp(@Req() req: AdminRequest) {
    return this.auth.startTotpEnrolment(req.admin!.userId);
  }

  /** Returns the recovery codes once; they are stored hashed and never shown again. */
  @Post('me/totp/confirm')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async confirmTotp(@Body() dto: TotpConfirmDto, @Req() req: AdminRequest) {
    const result = await this.auth.confirmTotpEnrolment(req.admin!.userId, dto.code);
    await this.audit.record({ actorId: req.admin!.userId, action: 'user.totp-enrol', entity: 'user', entityId: req.admin!.userId, summary: 'Set up two-factor authentication', req });
    return result;
  }

  @Post('me/totp/disable')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async disableTotp(@Body() dto: TotpDisableDto, @Req() req: AdminRequest) {
    await this.auth.disableTotp(req.admin!.userId, dto.password);
    await this.audit.record({ actorId: req.admin!.userId, action: 'user.totp-disable', entity: 'user', entityId: req.admin!.userId, summary: 'Turned off two-factor authentication', req });
    return { ok: true };
  }

  @Post('me/password')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AdminRequest) {
    await this.auth.changePassword(req.admin!.userId, dto.current, dto.next);
    await this.audit.record({ actorId: req.admin!.userId, action: 'user.password', entity: 'user', entityId: req.admin!.userId, summary: 'Changed own password', req });
    return { ok: true };
  }
}

const STATE_COOKIE = 'avida_oauth_state';

function stateCookie(value: string, https: boolean): string {
  const attrs = `${STATE_COOKIE}=${value}; Path=/api/v1/admin/auth/google; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}`;
  return value ? `${attrs}; Max-Age=600` : `${attrs}; Max-Age=0`;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function adminOrigin(): string {
  return process.env.ADMIN_ORIGIN ?? 'http://localhost:3002';
}
