import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { AuditService } from '../../common/audit.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { AdminGuard, type AdminRequest } from './admin.guard.js';
import { ChangePasswordDto, LoginDto } from './admin.dto.js';
import { AuthService } from './auth.service.js';
import { sessionCookie } from './session.service.js';

/** Sign-in and the signed-in user. Every other admin route lives in the platform module. */
@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** §5.9 — five attempts per fifteen minutes per IP; per-account lock is in AuthService. */
  @Post('auth/login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const { token, user } = await this.auth.login(dto.email, dto.password, dto.totp);
    void reply.header('set-cookie', sessionCookie(token));
    return { user };
  }

  @Post('auth/logout')
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    void reply.header('set-cookie', sessionCookie(''));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: AdminRequest) {
    return this.auth.me(req.admin!.userId);
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
