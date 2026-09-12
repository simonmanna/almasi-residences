import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { AuditService } from '../../common/audit.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, isHttps, type AdminRequest } from './admin.guard.js';
import { ChangePasswordDto, LoginDto, TotpConfirmDto, TotpDisableDto } from './admin.dto.js';
import { AuthService } from './auth.service.js';
import { csrfCookie, sessionCookie, SessionService } from './session.service.js';

/** Sign-in and the signed-in user. Every other admin route lives in the platform module. */
@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

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
