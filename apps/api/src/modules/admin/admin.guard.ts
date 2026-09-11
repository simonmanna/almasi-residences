import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../common/prisma.service.js';
import { SESSION_COOKIE, SessionService, type SessionPayload } from './session.service.js';

export const ROLES_KEY = 'admin:roles';
/** §5.9 — deny by default; a route opts into a wider set, never out of the guard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export interface AdminRequest extends FastifyRequest {
  admin?: SessionPayload;
}

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

    // Read the user fresh on every request: a removed or demoted account stops
    // working immediately rather than when its cookie happens to expire.
    const user = await this.prisma.client.adminUser.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Sign in to continue');

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(user.role)) {
      throw new ForbiddenException('Your role does not allow that');
    }

    req.admin = { ...session, role: user.role };
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
