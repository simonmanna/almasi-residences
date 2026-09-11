import { Injectable, Logger } from '@nestjs/common';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 4000;

export type TurnstileResult = 'passed' | 'failed' | 'unavailable';

@Injectable()
export class TurnstileService {
  private readonly log = new Logger(TurnstileService.name);

  /**
   * §5.7 step 1 verifies the token; §6.7 says an unreachable Turnstile must not
   * cost a lead. So this distinguishes "Cloudflare said no" (reject) from
   * "Cloudflare did not answer" (accept, flag for manual review).
   */
  async verify(token: string | undefined, ip?: string): Promise<TurnstileResult> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return 'unavailable'; // not configured yet — Phase 1 dev
    if (!token) return 'failed';

    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);

    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.log.warn(`Turnstile responded ${res.status}; accepting for manual review`);
        return 'unavailable';
      }
      const json = (await res.json()) as { success?: boolean };
      return json.success ? 'passed' : 'failed';
    } catch (error) {
      this.log.warn(`Turnstile unreachable (${(error as Error).message}); accepting for review`);
      return 'unavailable';
    }
  }
}
