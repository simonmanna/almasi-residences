import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis.service.js';

export interface SessionPayload {
  userId: string;
  role: string;
  /** Absolute expiry — §5.9 caps a session at 12 hours regardless of activity. */
  exp: number;
  /** Idle expiry — refreshed on each request, 60 minutes. */
  idle: number;
  /** This session's own id, so signing out can revoke exactly this cookie. */
  jti: string;
  /** The account's token version; bumped by a password change to end every session. */
  v: number;
  /** Double-submit token. Signed into the cookie, echoed by the admin in a header. */
  csrf: string;
}

export const SESSION_COOKIE = 'avida_admin';
/** Readable by the admin app on purpose: it has to echo the value in a header. */
export const CSRF_COOKIE = 'avida_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 60 * 60 * 1000;

const COOKIE_ATTRS = 'Path=/; SameSite=Strict';

/**
 * Transport security is a property of the request, not of NODE_ENV. A staging
 * deployment served over HTTPS without NODE_ENV=production used to send the
 * admin session cookie without `Secure`.
 */
function secureSuffix(https: boolean): string {
  return https || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

/** The Set-Cookie value for a session token; an empty token clears the cookie. */
export function sessionCookie(token: string, https = false): string {
  const secure = secureSuffix(https);
  return token
    ? `${SESSION_COOKIE}=${token}; ${COOKIE_ATTRS}; HttpOnly${secure}`
    : `${SESSION_COOKIE}=; ${COOKIE_ATTRS}; HttpOnly; Max-Age=0${secure}`;
}

/** The companion CSRF cookie. Deliberately not HttpOnly — the client must read it. */
export function csrfCookie(token: string, https = false): string {
  const secure = secureSuffix(https);
  return token
    ? `${CSRF_COOKIE}=${token}; ${COOKIE_ATTRS}${secure}`
    : `${CSRF_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0${secure}`;
}

/**
 * §5.9 — a signed session cookie, with a Redis denylist for the one thing a
 * stateless token cannot do on its own: stop working the moment someone signs
 * out. The guard still reads the user fresh on every request, so a removed,
 * deactivated or demoted account stops working immediately either way.
 */
@Injectable()
export class SessionService {
  constructor(private readonly redis: RedisService) {}

  private get secret(): string {
    const s = process.env.ADMIN_SESSION_SECRET;
    if (!s || s.length < 32) {
      throw new Error('ADMIN_SESSION_SECRET must be set and at least 32 characters');
    }
    return s;
  }

  issue(userId: string, role: string, tokenVersion: number): { token: string; csrf: string } {
    const now = Date.now();
    const csrf = randomBytes(18).toString('base64url');
    const token = this.sign({
      userId,
      role,
      exp: now + ABSOLUTE_MS,
      idle: now + IDLE_MS,
      jti: randomUUID(),
      v: tokenVersion,
      csrf,
    });
    return { token, csrf };
  }

  /** Slides the idle window without extending the absolute lifetime. */
  refresh(payload: SessionPayload): string {
    return this.sign({ ...payload, idle: Date.now() + IDLE_MS });
  }

  verify(token: string | undefined): SessionPayload | null {
    if (!token) return null;
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = this.hmac(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
      const now = Date.now();
      if (payload.exp < now || payload.idle < now) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /** Signing out revokes this cookie for the rest of its life, not just the browser's copy. */
  async revoke(payload: SessionPayload): Promise<void> {
    const client = this.redis.client;
    if (!client || !payload.jti) return;
    const ttl = Math.ceil((payload.exp - Date.now()) / 1000);
    if (ttl <= 0) return;
    await client.set(this.denyKey(payload.jti), '1', 'EX', ttl).catch(() => undefined);
  }

  async isRevoked(payload: SessionPayload): Promise<boolean> {
    const client = this.redis.client;
    if (!client || !payload.jti) return false;
    const hit = await client.get(this.denyKey(payload.jti)).catch(() => null);
    return hit !== null;
  }

  /** A constant-time comparison for the CSRF header against the signed value. */
  static csrfMatches(header: string | undefined, expected: string): boolean {
    if (!header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  static newRecoveryCodes(count = 10): string[] {
    // Grouped for reading aloud over the phone: `a1b2c-3d4e5`.
    return Array.from({ length: count }, () => {
      const raw = randomBytes(5).toString('hex');
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }

  private denyKey(jti: string): string {
    return `session:revoked:${jti}`;
  }

  private sign(payload: SessionPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private hmac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
