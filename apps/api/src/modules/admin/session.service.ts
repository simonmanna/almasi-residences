import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface SessionPayload {
  userId: string;
  role: string;
  /** Absolute expiry — §5.9 caps a session at 12 hours regardless of activity. */
  exp: number;
  /** Idle expiry — refreshed on each request, 60 minutes. */
  idle: number;
}

export const SESSION_COOKIE = 'avida_admin';
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 60 * 60 * 1000;

/**
 * §5.9 — a signed, stateless session cookie. Stateless because the staff list is
 * tiny and a revoked user is handled by the role guard's fresh database read on
 * every admin request, not by a session store.
 */
@Injectable()
export class SessionService {
  private get secret(): string {
    const s = process.env.ADMIN_SESSION_SECRET;
    if (!s || s.length < 32) {
      throw new Error('ADMIN_SESSION_SECRET must be set and at least 32 characters');
    }
    return s;
  }

  issue(userId: string, role: string): string {
    const now = Date.now();
    return this.sign({ userId, role, exp: now + ABSOLUTE_MS, idle: now + IDLE_MS });
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

  static newRecoveryCodes(count = 8): string[] {
    return Array.from({ length: count }, () => randomBytes(5).toString('hex'));
  }

  private sign(payload: SessionPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  private hmac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
