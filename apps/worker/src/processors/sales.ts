import { prisma, type NotificationKind } from '@avida/db';
import {
  emailLeadsDigest,
  emailReservationExpiring,
  emailViewingReminder,
  FIRST_RESPONSE_HOURS,
  RESERVATION_WARNING_HOURS,
  SCOPE_TAGS,
  VIEWING_REMINDER_HOURS,
} from '@avida/types';

type Queue = (notificationId: string) => Promise<void>;

async function notify(queue: Queue, data: { developmentId: string; kind: NotificationKind; to: string[]; subject: string; text: string; viewingId?: string | null }) {
  const recipients = data.to.map((t) => t.trim()).filter(Boolean);
  if (recipients.length === 0) {
    await prisma.notification.create({ data: { developmentId: data.developmentId, kind: data.kind, recipient: '(none configured)', subject: data.subject, text: data.text, viewingId: data.viewingId ?? null, status: 'SKIPPED', lastError: 'No recipient is configured (ENQUIRY_NOTIFY_EMAILS).' } });
    return;
  }
  for (const to of recipients) {
    const row = await prisma.notification.create({ data: { developmentId: data.developmentId, kind: data.kind, recipient: to, subject: data.subject, text: data.text, viewingId: data.viewingId ?? null } });
    await queue(row.id);
  }
}

const salesTeam = () => (process.env.ENQUIRY_NOTIFY_EMAILS ?? '').split(',');

/** §15.2 — the visitor's reminder, once, the day before a confirmed viewing. */
export async function sendViewingReminders(queue: Queue, now = new Date()): Promise<number> {
  const due = await prisma.viewing.findMany({
    where: { status: 'CONFIRMED', reminderSentAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + VIEWING_REMINDER_HOURS * 3_600_000) } },
    include: { development: { select: { name: true, contactPhone: true, officeAddress: true } } },
  });
  for (const v of due) {
    const mail = emailViewingReminder({ developmentName: v.development.name, firstName: v.name.split(/\s+/)[0] ?? v.name, at: v.scheduledAt!, location: v.location ?? v.development.officeAddress, phone: v.development.contactPhone });
    // Claim first, so a second worker never sends it again.
    const { count } = await prisma.viewing.updateMany({ where: { id: v.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (count) await notify(queue, { developmentId: v.developmentId, kind: 'VIEWING_REMINDER', to: [v.email], subject: mail.subject, text: mail.text, viewingId: v.id });
  }
  return due.length;
}

/**
 * Holds that lapse: the agent is warned RESERVATION_WARNING_HOURS before, and
 * at the end the reservation expires and the residence returns to its previous
 * status. The website is told through a SyncEvent the API delivers.
 */
export async function processReservations(queue: Queue, now = new Date()): Promise<{ warned: number; expired: number }> {
  const warn = await prisma.reservation.findMany({
    where: { status: 'ACTIVE', expiryNoticeSentAt: null, heldUntil: { gt: now, lte: new Date(now.getTime() + RESERVATION_WARNING_HOURS * 3_600_000) } },
    include: { unit: { select: { code: true } }, buyer: { select: { fullName: true } }, agent: { select: { email: true } }, development: { select: { name: true } } },
  });
  for (const r of warn) {
    const { count } = await prisma.reservation.updateMany({ where: { id: r.id, expiryNoticeSentAt: null }, data: { expiryNoticeSentAt: now } });
    if (!count) continue;
    const mail = emailReservationExpiring({ developmentName: r.development.name, code: r.unit.code, heldUntil: r.heldUntil, buyerName: r.buyer?.fullName ?? null, reservationId: r.id });
    await notify(queue, { developmentId: r.developmentId, kind: 'RESERVATION_EXPIRING', to: r.agent?.email ? [r.agent.email] : salesTeam(), subject: mail.subject, text: mail.text });
  }

  const lapsed = await prisma.reservation.findMany({ where: { status: 'ACTIVE', heldUntil: { lte: now } }, include: { unit: true, development: { select: { slug: true } } } });
  for (const r of lapsed) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', closedAt: now, closedReason: 'Hold lapsed' } });
      if (!claimed.count) return;
      // Only undo the hold if nobody has moved the residence on since.
      if (r.unit.status === 'ON_HOLD' || r.unit.status === 'RESERVED') {
        await tx.unit.update({ where: { id: r.unitId }, data: { status: r.previousStatus } });
        await tx.unitStatusLog.create({ data: { unitId: r.unitId, from: r.unit.status, to: r.previousStatus, actor: 'system', note: 'Reservation lapsed' } });
      }
      if (r.enquiryId) {
        await tx.leadNote.create({ data: { enquiryId: r.enquiryId, kind: 'SYSTEM', body: `The hold on ${r.unit.code} lapsed and the residence returned to sale.` } });
      }
      await tx.syncEvent.create({ data: { developmentSlug: r.development.slug, scope: 'inventory', tags: SCOPE_TAGS.inventory } });
    });
  }
  return { warned: warn.length, expired: lapsed.length };
}

/** Roadmap item 41 — the morning email: who has not been answered, what is overdue, who is visiting today. */
export async function sendLeadsDigest(queue: Queue, now = new Date()): Promise<number> {
  const developments = await prisma.development.findMany({ select: { id: true, name: true } });
  let sent = 0;
  for (const d of developments) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [uncontacted, overdue, today] = await Promise.all([
      prisma.enquiry.findMany({ where: { developmentId: d.id, status: 'NEW', contactedAt: null }, orderBy: { createdAt: 'asc' }, include: { units: { include: { unit: { select: { code: true } } } } } }),
      prisma.enquiry.findMany({
        where: { developmentId: d.id, status: { notIn: ['LOST', 'SPAM', 'SOLD'] }, OR: [{ followUpAt: { lt: now } }, { status: 'NEW', contactedAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_HOURS * 3_600_000) } }] },
        orderBy: { followUpAt: 'asc' },
      }),
      prisma.viewing.findMany({ where: { developmentId: d.id, status: 'CONFIRMED', scheduledAt: { gte: dayStart, lt: dayEnd } }, orderBy: { scheduledAt: 'asc' }, include: { agent: { select: { name: true } } } }),
    ]);
    if (!uncontacted.length && !overdue.length && !today.length) continue;
    const mail = emailLeadsDigest({
      developmentName: d.name,
      uncontacted: uncontacted.map((l) => ({ name: l.name, createdAt: l.createdAt, units: l.units.map((u) => u.unit.code).join(', ') })),
      overdue: overdue.map((l) => ({ name: l.name, followUpAt: l.followUpAt, status: l.status })),
      viewingsToday: today.map((v) => ({ name: v.name, at: v.scheduledAt!, agent: v.agent?.name ?? null })),
    });
    await notify(queue, { developmentId: d.id, kind: 'LEADS_DIGEST', to: salesTeam(), subject: mail.subject, text: mail.text });
    sent++;
  }
  return sent;
}

/** Rows queued while Redis was unreachable: put them on the queue now. */
export async function sweepQueuedNotifications(queue: Queue, now = new Date()): Promise<number> {
  const stale = await prisma.notification.findMany({ where: { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, select: { id: true }, take: 100 });
  for (const n of stale) {
    await prisma.notification.update({ where: { id: n.id }, data: { updatedAt: now } });
    await queue(n.id);
  }
  return stale.length;
}
