import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { can, PERMISSION_LABEL, type Permission } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';
import { sessionCookie, SESSION_COOKIE, SessionService, type SessionPayload } from './session.service.js';

export const ROLES_KEY = 'admin:roles';
export const PERMISSIONS_KEY = 'admin:permissions';

/** §5.9 — deny by default; a route opts into a wider set, never out of the guard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * §45 — the permission a route needs. The guard checks it against the role
 * table in @avida/types on every request; the admin UI reading the same table
 * to hide a button is a convenience, never the control.
 */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export interface AdminRequest extends FastifyRequest {
  admin?: SessionPayload & { name: string };
}

/** Refresh the idle window once it is more than ten minutes old. */
const REFRESH_AFTER_MS = 10 * 60 * 1000;

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const raw = this.readCookie(req, SESSION_COOKIE);
    const session = this.sessions.verify(raw);
    if (!session) throw new UnauthorizedException('Sign in to continue');

    // Read the user fresh on every request: a removed, deactivated or demoted
    // account stops working immediately rather than when its cookie expires.
    const user = await this.prisma.client.adminUser.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, name: true, active: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Sign in to continue');

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw new ForbiddenException('Your role does not allow that');
    }

    const needed = this.reflector.getAllAndMerge<Permission[]>(PERMISSIONS_KEY, [context.getClass(), context.getHandler()]);
    const missing = (needed ?? []).find((p) => !can(user.role, p));
    if (missing) {
      throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[missing].toLowerCase()}.`);
    }

    // Sliding idle window (§5.9): an active session stays signed in until the
    // 12-hour absolute limit; an idle one ends after 60 minutes.
    const idleAge = 60 * 60 * 1000 - (session.idle - Date.now());
    if (idleAge > REFRESH_AFTER_MS) {
      const reply = context.switchToHttp().getResponse<FastifyReply>();
      void reply.header('set-cookie', sessionCookie(this.sessions.refresh(session)));
    }

    req.admin = { ...session, role: user.role, name: user.name };
    return true;
  }

  private readCookie(req: FastifyRequest, name: string): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return undefined;
  }
}
