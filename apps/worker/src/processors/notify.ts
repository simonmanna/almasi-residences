import { prisma } from '@avida/db';
import { NOTIFICATION_MAX_ATTEMPTS } from '@avida/types';

export interface Mailer {
  send(message: { from: string; to: string; subject: string; text: string; replyTo?: string }): Promise<void>;
}

/** Resend, when configured. Null means "email is not set up" — recorded, not thrown away. */
export async function resendMailer(): Promise<Mailer | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = await import('resend');
  const client = new Resend(key);
  return {
    async send(m) {
      const { error } = await client.emails.send({ from: m.from, to: m.to, subject: m.subject, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}) });
      if (error) throw new Error(error.message);
    },
  };
}

export type DeliveryOutcome = 'SENT' | 'RETRY' | 'FAILED' | 'SKIPPED' | 'GONE';

/**
 * §15.1 — delivers one Notification row. Idempotent: a row already SENT is not
 * sent twice. The outcome is written to the row before the job ends, so the
 * dashboard shows the truth even if the job's own record is lost.
 *
 * Returns RETRY to make BullMQ try again with backoff; after
 * NOTIFICATION_MAX_ATTEMPTS the row is FAILED and waits for a person.
 */
export async function deliverNotification(id: string, mailer: Mailer | null): Promise<DeliveryOutcome> {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) return 'GONE';
  if (n.status === 'SENT') return 'SENT';

  if (!mailer) {
    await prisma.notification.update({ where: { id }, data: { status: 'SKIPPED', lastError: 'Email is not configured (RESEND_API_KEY).', attempts: { increment: 1 } } });
    return 'SKIPPED';
  }

  const attempts = n.attempts + 1;
  try {
    await mailer.send({ from: process.env.ENQUIRY_FROM_EMAIL ?? 'sales@example.invalid', to: n.recipient, subject: n.subject, text: n.text, replyTo: n.replyTo ?? undefined });
    await prisma.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), attempts, lastError: null } });
    return 'SENT';
  } catch (error) {
    const failed = attempts >= NOTIFICATION_MAX_ATTEMPTS;
    await prisma.notification.update({ where: { id }, data: { status: failed ? 'FAILED' : 'QUEUED', attempts, lastError: (error as Error).message.slice(0, 500) } });
    return failed ? 'FAILED' : 'RETRY';
  }
}
