import { beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../../common/redis.service.js';
import { csrfCookie, sessionCookie, SessionService, SESSION_COOKIE } from './session.service.js';

/**
 * The session cookie is the only thing standing between a stranger and the
 * admin, so its edges get tested directly rather than only through the guard.
 */

/** No Redis in a unit test: revocation degrades to "not revoked", by design. */
const noRedis = { client: null } as unknown as RedisService;

describe('SessionService', () => {
  let sessions: SessionService;

  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'a-test-secret-that-is-certainly-long-enough';
    sessions = new SessionService(noRedis);
  });

  it('issues a token that verifies back to the same account', () => {
    const { token, csrf } = sessions.issue('user-1', 'SUPER_ADMIN', 3);
    const payload = sessions.verify(token);
    expect(payload?.userId).toBe('user-1');
    expect(payload?.role).toBe('SUPER_ADMIN');
    expect(payload?.v).toBe(3);
    expect(payload?.csrf).toBe(csrf);
    expect(payload?.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a token whose body has been edited', () => {
    const { token } = sessions.issue('user-1', 'VIEWER', 0);
    const [body, signature] = token.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), role: 'SUPER_ADMIN' }),
    ).toString('base64url');
    expect(sessions.verify(`${tampered}.${signature}`)).toBeNull();
  });

  it('refuses a token signed with a different secret', () => {
    const { token } = sessions.issue('user-1', 'VIEWER', 0);
    process.env.ADMIN_SESSION_SECRET = 'a-completely-different-secret-of-the-right-length';
    expect(new SessionService(noRedis).verify(token)).toBeNull();
  });

  it('refuses a malformed or absent token instead of throwing', () => {
    expect(sessions.verify(undefined)).toBeNull();
    expect(sessions.verify('')).toBeNull();
    expect(sessions.verify('not-a-token')).toBeNull();
    expect(sessions.verify('a.b.c')).toBeNull();
  });

  it('refuses a token past its idle window', () => {
    const { token } = sessions.issue('user-1', 'VIEWER', 0);
    const payload = sessions.verify(token)!;
    const stale = sessions.refresh({ ...payload, idle: Date.now() - 1000 });
    // `refresh` slides the window forward, so build the stale one by hand.
    expect(sessions.verify(stale)).not.toBeNull();
    const [body] = stale.split('.');
    const expired = JSON.parse(Buffer.from(body!, 'base64url').toString());
    expired.idle = Date.now() - 1;
    const forged = Buffer.from(JSON.stringify(expired)).toString('base64url');
    expect(sessions.verify(`${forged}.${stale.split('.')[1]}`)).toBeNull();
  });

  it('refuses to work without a long enough secret', () => {
    process.env.ADMIN_SESSION_SECRET = 'too-short';
    expect(() => new SessionService(noRedis).issue('u', 'VIEWER', 0)).toThrow(/at least 32/);
  });

  it('compares the CSRF token in a way that rejects near misses', () => {
    expect(SessionService.csrfMatches('abc', 'abc')).toBe(true);
    expect(SessionService.csrfMatches('abc', 'abd')).toBe(false);
    expect(SessionService.csrfMatches('ab', 'abc')).toBe(false);
    expect(SessionService.csrfMatches(undefined, 'abc')).toBe(false);
    // An empty token never matches, even against an empty expectation: a
    // session issued before the CSRF field existed must not pass.
    expect(SessionService.csrfMatches('', '')).toBe(false);
  });

  it('issues recovery codes that are distinct and readable aloud', () => {
    const codes = SessionService.newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });
});

describe('cookie attributes', () => {
  it('always marks the session cookie HttpOnly and SameSite=Strict', () => {
    const cookie = sessionCookie('token-value');
    expect(cookie).toContain(`${SESSION_COOKIE}=token-value`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('adds Secure for an HTTPS request even outside production', () => {
    delete process.env.NODE_ENV;
    expect(sessionCookie('t', false)).not.toContain('Secure');
    expect(sessionCookie('t', true)).toContain('Secure');
  });

  it('leaves the CSRF cookie readable by the client on purpose', () => {
    // The admin has to echo it in a header, so it must not be HttpOnly.
    expect(csrfCookie('csrf-value')).not.toContain('HttpOnly');
    expect(csrfCookie('csrf-value')).toContain('SameSite=Strict');
  });

  it('expires both cookies when the token is empty', () => {
    expect(sessionCookie('')).toContain('Max-Age=0');
    expect(csrfCookie('')).toContain('Max-Age=0');
  });
});
