import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Attempts before an event stops retrying and waits on the dashboard for a person. */
export const MAX_SYNC_ATTEMPTS = 8;
const RETRY_TICK_MS = 15_000;

/** 10 s, 20 s, 40 s … capped at ten minutes. */
export function nextDelayMs(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(0, attempts - 1), 600_000);
}

/**
 * §3.4 — telling the website that something changed, reliably.
 *
 * Before this, a revalidation was one fire-and-forget POST: if the web app was
 * restarting when an admin published, the change never propagated and nothing
 * recorded that it had not. Now every change is a SyncEvent row written before
 * delivery is attempted. A failed delivery is retried with backoff by a timer
 * in this process; after MAX_SYNC_ATTEMPTS it is marked FAILED and counted on
 * the dashboard, where a person can retry it. Nothing here can fail the admin
 * write that caused it.
 */
@Injectable()
export class RevalidateService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RevalidateService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  get configured(): boolean {
    return Boolean(process.env.WEB_REVALIDATE_URL && process.env.REVALIDATE_SECRET);
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.retryDue(), RETRY_TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Records the change, then tries to deliver it at once. */
  async tags(slug: string, scope: string, tags: string[]): Promise<void> {
    if (!this.configured) {
      this.log.debug('Revalidation not configured; skipping');
      return;
    }
    try {
      const event = await this.prisma.client.syncEvent.create({ data: { developmentSlug: slug, scope, tags } });
      void this.deliver(event.id);
    } catch (error) {
      this.log.error(`Could not record a sync event: ${(error as Error).message}`);
    }
  }

  /** One delivery attempt. Claims the row first so two processes never send it twice. */
  async deliver(id: string): Promise<boolean> {
    const claimed = await this.prisma.client.syncEvent.updateMany({
      where: { id, status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      data: { nextAttemptAt: new Date(Date.now() + 60_000), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return false;
    const event = await this.prisma.client.syncEvent.findUniqueOrThrow({ where: { id } });
    try {
      const res = await fetch(process.env.WEB_REVALIDATE_URL!, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': process.env.REVALIDATE_SECRET! },
        body: JSON.stringify({ slug: event.developmentSlug, tags: event.tags }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`the website answered ${res.status}`);
      await this.prisma.client.syncEvent.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null } });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      const failed = event.attempts >= MAX_SYNC_ATTEMPTS;
      await this.prisma.client.syncEvent.update({
        where: { id },
        data: { status: failed ? 'FAILED' : 'PENDING', lastError: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + nextDelayMs(event.attempts)) },
      });
      this.log.warn(`Revalidation ${failed ? 'gave up' : 'will retry'} (attempt ${event.attempts}): ${message}`);
      return false;
    }
  }

  /** The retry timer: every due event, oldest first. */
  async retryDue(): Promise<number> {
    if (this.running || !this.configured) return 0;
    this.running = true;
    try {
      const due = await this.prisma.client.syncEvent.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { id: true },
      });
      let delivered = 0;
      for (const e of due) if (await this.deliver(e.id)) delivered++;
      return delivered;
    } catch (error) {
      this.log.warn(`Retry pass failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** A person asked to try the failed ones again. */
  async retryFailed(): Promise<number> {
    const { count } = await this.prisma.client.syncEvent.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
    void this.retryDue();
    return count;
  }

  /** What the dashboard shows: is the website keeping up? */
  async health() {
    const [pending, failed, lastDelivered, lastFailure] = await Promise.all([
      this.prisma.client.syncEvent.count({ where: { status: 'PENDING', attempts: { gt: 0 } } }),
      this.prisma.client.syncEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.client.syncEvent.findFirst({ where: { status: 'DELIVERED' }, orderBy: { deliveredAt: 'desc' }, select: { deliveredAt: true } }),
      this.prisma.client.syncEvent.findFirst({ where: { status: { in: ['FAILED', 'PENDING'] }, lastError: { not: null } }, orderBy: { createdAt: 'desc' }, select: { lastError: true, createdAt: true } }),
    ]);
    return {
      configured: this.configured,
      retrying: pending,
      failed,
      lastDeliveredAt: lastDelivered?.deliveredAt ?? null,
      lastError: lastFailure?.lastError ?? null,
      lastErrorAt: lastFailure?.createdAt ?? null,
    };
  }
}
