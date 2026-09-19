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
import { can, canSignIn, PERMISSION_LABEL, SCOPE_LABEL, type Permission, type PermissionScope } from '@avida/types';
import { AccessService, principalSelect, type Principal } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import {
  CSRF_HEADER,
  sessionCookie,
  SESSION_COOKIE,
  SessionService,
  type SessionPayload,
} from './session.service.js';

export const ROLES_KEY = 'admin:roles';
export const PERMISSIONS_KEY = 'admin:permissions';
export const SCOPE_KEY = 'admin:scope';

/** §5.9 — deny by default; a route opts into a wider set, never out of the guard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * §45 — the permission a route needs. The guard checks it against the role
 * table in @avida/types on every request; the admin UI reading the same table
 * to hide a button is a convenience, never the control.
 */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** A permission held at least at a data scope — `RequireScope('enquiry.view', 'TEAM')` for a team view. */
export const RequireScope = (permission: Permission, min: PermissionScope) => SetMetadata(SCOPE_KEY, { permission, min });

export interface AdminRequest extends FastifyRequest {
  /** The signed-in person, with their effective access resolved from the database on this request. */
  admin?: SessionPayload & Principal & { name: string };
}

/** Refresh the idle window once it is more than ten minutes old. */
const REFRESH_AFTER_MS = 10 * 60 * 1000;

/**
 * Whether this request arrived over TLS. `trustProxy` is on, so Fastify reads
 * `x-forwarded-proto` from the gateway; behind one, `req.protocol` is the
 * browser's scheme rather than the hop's.
 */
export function isHttps(req: FastifyRequest): boolean {
  return req.protocol === 'https';
}

/** Methods that change something, and so need the CSRF header. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const raw = this.readCookie(req, SESSION_COOKIE);
    const session = this.sessions.verify(raw);
    if (!session) throw new UnauthorizedException('Sign in to continue');

    // Read the user fresh on every request: a removed, deactivated or demoted
    // account — or a role whose permissions were just changed — takes effect
    // immediately rather than when its cookie expires.
    const user = await this.prisma.client.adminUser.findUnique({
      where: { id: session.userId },
      select: principalSelect,
    });
    if (!user || !user.active || !canSignIn(user.status)) throw new UnauthorizedException('Sign in to continue');

    // §24.5 — a signed-out cookie, or one issued before a password change, is
    // refused for the rest of its life rather than until it expires.
    if ((session.v ?? 0) !== user.tokenVersion) throw new UnauthorizedException('Sign in again to continue');
    if (await this.sessions.isRevoked(session)) throw new UnauthorizedException('Sign in again to continue');

    // §24.2 — SameSite=Strict is the first line; this is the second. A request
    // that changes something must echo the token signed into its own cookie.
    if (MUTATING.has(req.method.toUpperCase())) {
      const header = req.headers[CSRF_HEADER] as string | undefined;
      if (!session.csrf || !SessionService.csrfMatches(header, session.csrf)) {
        throw new ForbiddenException('This request is missing its security token. Reload the admin and try again.');
      }
    }

    const principal = await this.access.principal(user);

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && roles.length > 0 && !roles.includes(principal.role)) {
      throw new ForbiddenException('Your role does not allow that');
    }

    const needed = this.reflector.getAllAndMerge<Permission[]>(PERMISSIONS_KEY, [context.getClass(), context.getHandler()]);
    const missing = (needed ?? []).find((p) => !can(principal, p));
    if (missing) {
      throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[missing].toLowerCase()}.`);
    }
    const scoped = this.reflector.getAllAndOverride<{ permission: Permission; min: PermissionScope } | undefined>(SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (scoped && !can(principal, scoped.permission, scoped.min)) {
      throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[scoped.permission].toLowerCase()} (${SCOPE_LABEL[scoped.min].toLowerCase()} or wider).`);
    }

    this.access.touch(user.id, user.lastActiveAt);

    // Sliding idle window (§5.9): an active session stays signed in until the
    // 12-hour absolute limit; an idle one ends after 60 minutes.
    const idleAge = 60 * 60 * 1000 - (session.idle - Date.now());
    if (idleAge > REFRESH_AFTER_MS) {
      const reply = context.switchToHttp().getResponse<FastifyReply>();
      void reply.header('set-cookie', sessionCookie(this.sessions.refresh(session), isHttps(req)));
    }

    req.admin = { ...session, ...principal, role: principal.role, name: user.name };
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
