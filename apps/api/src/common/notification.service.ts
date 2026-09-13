import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { NotificationKind } from '@avida/db';
import { PrismaService } from './prisma.service.js';

/** The wire name of the worker's email queue (apps/worker/src/queues.ts). */
export const NOTIFY_QUEUE = 'notify-email';

export interface NotificationInput {
  developmentId: string;
  kind: NotificationKind;
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string | null;
  enquiryId?: string | null;
  viewingId?: string | null;
}

/**
 * §15.1 — every email the platform owes someone is a Notification row first
 * and a queued job second. The worker delivers it with retries and records the
 * outcome on the row; a row that is never picked up (Redis down when it was
 * queued) is swept up by the worker's own scan. So a lead's alert can be late,
 * but it cannot be silently lost — and when it cannot be delivered, the
 * dashboard says so.
 */
@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly log = new Logger(NotificationService.name);
  private queue: Queue | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private q(): Queue | null {
    if (this.queue) return this.queue;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    this.queue = new Queue(NOTIFY_QUEUE, {
      connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false } as never,
      defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: { age: 86_400, count: 1000 }, removeOnFail: false },
    });
    this.queue.on('error', (e) => this.log.warn(`Notification queue unavailable: ${e.message}`));
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close().catch(() => undefined);
  }

  /** The sales team's inboxes, from ENQUIRY_NOTIFY_EMAILS. */
  salesRecipients(): string[] {
    return (process.env.ENQUIRY_NOTIFY_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Records one notification per recipient and queues each for delivery. Never throws into the caller. */
  async send(input: NotificationInput): Promise<string[]> {
    const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((r) => r.trim()).filter(Boolean);
    const ids: string[] = [];
    try {
      if (recipients.length === 0) {
        // Nobody to tell is itself worth recording: the dashboard shows it as undelivered.
        const row = await this.prisma.client.notification.create({
          data: { developmentId: input.developmentId, kind: input.kind, recipient: '(none configured)', subject: input.subject, text: input.text, replyTo: input.replyTo ?? null, enquiryId: input.enquiryId ?? null, viewingId: input.viewingId ?? null, status: 'SKIPPED', lastError: 'No recipient is configured (ENQUIRY_NOTIFY_EMAILS).' },
        });
        return [row.id];
      }
      for (const to of recipients) {
        const row = await this.prisma.client.notification.create({
          data: { developmentId: input.developmentId, kind: input.kind, recipient: to, subject: input.subject, text: input.text, replyTo: input.replyTo ?? null, enquiryId: input.enquiryId ?? null, viewingId: input.viewingId ?? null },
        });
        ids.push(row.id);
        await this.enqueue(row.id);
      }
    } catch (error) {
      this.log.error(`Could not record a ${input.kind} notification: ${(error as Error).message}`);
    }
    return ids;
  }

  async enqueue(id: string): Promise<void> {
    try {
      await this.q()?.add('send', { notificationId: id }, { jobId: `notification:${id}:${Date.now()}` });
    } catch (error) {
      // The row stays QUEUED; the worker's sweep picks it up when Redis returns.
      this.log.warn(`Notification ${id} not queued yet: ${(error as Error).message}`);
    }
  }

  /** Puts failed and skipped notifications back in the queue. */
  async retry(developmentId: string): Promise<number> {
    const rows = await this.prisma.client.notification.findMany({ where: { developmentId, status: { in: ['FAILED', 'SKIPPED'] }, recipient: { not: '(none configured)' } }, select: { id: true } });
    await this.prisma.client.notification.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'QUEUED', attempts: 0, lastError: null } });
    for (const r of rows) await this.enqueue(r.id);
    return rows.length;
  }

  async health(developmentId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [grouped, lastFailure] = await Promise.all([
      this.prisma.client.notification.groupBy({ by: ['status'], where: { developmentId, createdAt: { gte: since } }, _count: true }),
      this.prisma.client.notification.findFirst({ where: { developmentId, status: { in: ['FAILED', 'SKIPPED'] } }, orderBy: { updatedAt: 'desc' }, select: { lastError: true, updatedAt: true, kind: true } }),
    ]);
    const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
    return {
      configured: Boolean(process.env.RESEND_API_KEY) && this.salesRecipients().length > 0,
      sent: count('SENT'),
      queued: count('QUEUED'),
      undelivered: count('FAILED') + count('SKIPPED'),
      lastError: lastFailure?.lastError ?? null,
      lastErrorAt: lastFailure?.updatedAt ?? null,
    };
  }
}
