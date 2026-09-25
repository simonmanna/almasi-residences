import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthService } from './google-auth.service.js';

/**
 * The ID token is the only proof of who is signing in with Google, so every
 * claim the service relies on is tested against a token that gets it wrong.
 */

const CLIENT = 'client-123.apps.googleusercontent.com';

function idToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

const good = () => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 300,
  email: 'Owner@Gmail.com',
  email_verified: true,
  name: 'Owner',
});

function googleReturns(claims: Record<string, unknown> | null, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 400, json: async () => ({ id_token: claims ? idToken(claims) : undefined }), text: async () => '' })),
  );
}

describe('GoogleAuthService', () => {
  const service = new GoogleAuthService();

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT;
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    delete process.env.GOOGLE_REDIRECT_URI;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('is off until both the client id and secret are set', () => {
    expect(service.enabled()).toBe(true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(service.enabled()).toBe(false);
  });

  it('builds the redirect URI from the request unless it is pinned', () => {
    expect(service.redirectUri('https', 'admin.example.com')).toBe('https://admin.example.com/api/v1/admin/auth/google/callback');
    process.env.GOOGLE_REDIRECT_URI = 'https://pinned.example.com/cb';
    expect(service.redirectUri('http', 'localhost:3011')).toBe('https://pinned.example.com/cb');
  });

  it('asks Google for identity only, carrying the state', () => {
    const url = new URL(service.authUrl('https://a.example.com/cb', 'st4te'));
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
  });

  it('returns the lower-cased email from a valid token', async () => {
    googleReturns(good());
    await expect(service.identify('code', 'https://a.example.com/cb')).resolves.toEqual({ email: 'owner@gmail.com', name: 'Owner' });
  });

  it.each([
    ['a token for another app', { aud: 'someone-else' }],
    ['a token from another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['an unverified email', { email_verified: false }],
    ['no email', { email: undefined }],
  ])('refuses %s', async (_label, patch) => {
    googleReturns({ ...good(), ...patch });
    await expect(service.identify('code', 'https://a.example.com/cb')).rejects.toThrow();
  });

  it('refuses when Google rejects the code', async () => {
    googleReturns(good(), false);
    await expect(service.identify('bad', 'https://a.example.com/cb')).rejects.toThrow(/did not complete/);
  });
});
