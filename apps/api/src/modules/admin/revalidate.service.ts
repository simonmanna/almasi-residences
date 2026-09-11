import { Injectable, Logger } from '@nestjs/common';

/**
 * §11 — on any inventory or content change the API tells Next.js which paths to
 * rebuild. Fire-and-forget: a failed revalidation means the public site is stale
 * for up to its ISR window, and the client's 60-second poll of /inventory/live
 * covers the §9 guarantee in the meantime. It must never fail an admin write.
 */
@Injectable()
export class RevalidateService {
  private readonly log = new Logger(RevalidateService.name);

  async developmentChanged(slug: string): Promise<void> {
    const url = process.env.WEB_REVALIDATE_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (!url || !secret) {
      this.log.debug('Revalidation not configured; skipping');
      return;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ slug, paths: ['/', '/availability', '/residences'] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.log.warn(`Revalidation responded ${res.status}`);
    } catch (error) {
      this.log.warn(`Revalidation failed: ${(error as Error).message}`);
    }
  }
}
