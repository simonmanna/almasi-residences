import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export type GoogleIdentity = { email: string; name: string | null };

/**
 * "Sign in with Google" for the admin — the OAuth authorisation-code flow,
 * asking only for the openid/email/profile scopes (no Google review needed).
 * Google proves who the person is; whether they may sign in is still decided
 * by an active admin account with the same email.
 */
@Injectable()
export class GoogleAuthService {
  private readonly log = new Logger(GoogleAuthService.name);

  /** Off until both values are set, and the login page hides the button. */
  enabled(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  /**
   * Must match an "Authorised redirect URI" on the Google OAuth client exactly.
   * Derived from the request (Caddy passes Host through and the API trusts the
   * proxy's protocol) unless pinned by GOOGLE_REDIRECT_URI.
   */
  redirectUri(protocol: string, host: string | undefined): string {
    return process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/v1/admin/auth/google/callback`;
  }

  authUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${params}`;
  }

  /**
   * Swaps the code for an ID token. The token comes straight from Google's
   * token endpoint over TLS, so (per OpenID Connect §3.1.3.7) its claims are
   * checked rather than its signature.
   */
  async identify(code: string, redirectUri: string): Promise<GoogleIdentity> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      this.log.warn(`Google token exchange failed: ${res.status} ${await res.text().catch(() => '')}`);
      throw new UnauthorizedException('Google sign-in did not complete. Try again.');
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    const claims = decodeJwtPayload(idToken);
    if (
      !claims ||
      !ISSUERS.has(String(claims.iss)) ||
      claims.aud !== process.env.GOOGLE_CLIENT_ID ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 < Date.now() ||
      typeof claims.email !== 'string'
    ) {
      throw new UnauthorizedException('Google sign-in did not complete. Try again.');
    }
    if (claims.email_verified !== true) {
      throw new UnauthorizedException('That Google account has not verified its email address.');
    }
    return { email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name : null };
  }
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
