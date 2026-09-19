import { Prisma, prisma, type NotificationKind } from '@avida/db';
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
    where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, reminderSentAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + VIEWING_REMINDER_HOURS * 3_600_000) } },
    include: { development: { select: { name: true, contactPhone: true, officeAddress: true } } },
  });
  for (const v of due) {
    const mail = emailViewingReminder({ developmentName: v.development.name, firstName: v.name.split(/\s+/)[0] ?? v.name, at: v.scheduledAt!, location: v.location ?? v.development.officeAddress, phone: v.development.contactPhone });
    // Claim first, so a second worker never sends it again.
    const { count } = await prisma.viewing.updateMany({ where: { id: v.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (count) await notify(queue, { developmentId: v.developmentId, kind: 'VIEWING_REMINDER', to: v.email ? [v.email] : [], subject: mail.subject, text: mail.text, viewingId: v.id });
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

  const lapsed = await prisma.reservation.findMany({ where: { status: 'ACTIVE', heldUntil: { lte: now } }, include: { unit: true, deal: { select: { id: true, status: true } }, development: { select: { slug: true } } } });
  for (const r of lapsed) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', closedAt: now, closedReason: 'Hold lapsed' } });
      if (!claimed.count) return;
      // Only undo the hold if nobody has moved the residence on since.
      if (r.unit.status === 'BOOKED' || r.unit.status === 'RESERVED') {
        await tx.unit.update({ where: { id: r.unitId }, data: { status: r.previousStatus } });
        await tx.unitStatusLog.create({ data: { unitId: r.unitId, from: r.unit.status, to: r.previousStatus, actor: 'system', note: 'Reservation lapsed' } });
      }
      // The deal goes back to negotiation, and so does its lead; the API files
      // the lead into its pipeline column (stageId null → first column of its category).
      if (r.deal && (r.deal.status === 'RESERVED' || r.deal.status === 'CONTRACT')) {
        await tx.deal.update({ where: { id: r.deal.id }, data: { status: 'NEGOTIATION', reservationId: null } });
      }
      if (r.enquiryId) {
        const lead = await tx.enquiry.findUnique({ where: { id: r.enquiryId }, select: { status: true } });
        if (lead && (lead.status === 'RESERVED' || lead.status === 'CONTRACT')) {
          await tx.enquiry.update({ where: { id: r.enquiryId }, data: { status: 'NEGOTIATION', stageId: null, stageChangedAt: now } });
          await tx.leadStageChange.create({ data: { enquiryId: r.enquiryId, fromStatus: lead.status, toStatus: 'NEGOTIATION', actorId: null } });
        }
        await tx.leadNote.create({ data: { enquiryId: r.enquiryId, kind: 'RESERVATION', body: `The hold on ${r.unit.code} lapsed and the residence returned to sale.` } });
      }
      if (r.agentId) {
        await tx.adminNotification.create({ data: { userId: r.agentId, kind: 'reservation.expired', title: `Hold on ${r.unit.code} lapsed`, body: 'The residence is back on sale and the deal is in negotiation again.', link: r.enquiryId ? `/crm/leads/${r.enquiryId}` : '/reservations', enquiryId: r.enquiryId } });
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
      prisma.enquiry.findMany({ where: { developmentId: d.id, archivedAt: null, status: 'NEW', contactedAt: null }, orderBy: { createdAt: 'asc' }, include: { units: { include: { unit: { select: { code: true } } } } } }),
      prisma.enquiry.findMany({
        where: { developmentId: d.id, archivedAt: null, status: { notIn: ['LOST', 'SPAM', 'SOLD', 'DISQUALIFIED', 'ON_HOLD'] }, OR: [{ followUpAt: { lt: now } }, { status: 'NEW', contactedAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_HOURS * 3_600_000) } }] },
        orderBy: { followUpAt: 'asc' },
      }),
      prisma.viewing.findMany({ where: { developmentId: d.id, status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] }, scheduledAt: { gte: dayStart, lt: dayEnd } }, orderBy: { scheduledAt: 'asc' }, include: { agent: { select: { name: true } } } }),
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

/** Phase 6 — claim and execute due publish/unpublish jobs exactly once. */
export async function processPublicationSchedules(now = new Date()): Promise<number> {
  const due = await prisma.publicationSchedule.findMany({ where: { status: 'PENDING', runAt: { lte: now } }, orderBy: { runAt: 'asc' }, take: 50 });
  let completed = 0;
  for (const job of due) {
    const claimed = await prisma.publicationSchedule.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { status: 'RUNNING' } });
    if (!claimed.count) continue;
    try {
      const data = job.action === 'publish'
        ? { published: true, publishedAt: now, publishedById: job.requestedById, unpublishedAt: null }
        : { published: false, unpublishedAt: now };
      if (job.entity === 'page') {
        const page = await prisma.contentPage.findUniqueOrThrow({ where: { developmentId_key: { developmentId: job.developmentId, key: job.entityId } } });
        const published = (page.content ?? {}) as Record<string, unknown>;
        const draft = (page.draftContent ?? {}) as Record<string, unknown>;
        await prisma.$transaction([
          prisma.contentRevision.create({ data: { developmentId: job.developmentId, pageKey: job.entityId, content: published as Prisma.InputJsonValue, createdById: job.requestedById } }),
          prisma.contentPage.update({ where: { id: page.id }, data: job.action === 'publish' ? { ...data, content: { ...published, ...draft } as Prisma.InputJsonValue, draftContent: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null } : data }),
        ]);
      } else switch (job.entity) {
        case 'amenity': await prisma.amenity.update({ where: { id: job.entityId }, data }); break;
        case 'faq': await prisma.faq.update({ where: { id: job.entityId }, data }); break;
        case 'progress': await prisma.progressUpdate.update({ where: { id: job.entityId }, data }); break;
        case 'specification': await prisma.specification.update({ where: { id: job.entityId }, data }); break;
        case 'gallery': await prisma.gallery.update({ where: { id: job.entityId }, data }); break;
        case 'tour': await prisma.tour.update({ where: { id: job.entityId }, data }); break;
        case 'media': await prisma.media.update({ where: { id: job.entityId }, data }); break;
        case 'type': await prisma.typology.update({ where: { id: job.entityId }, data }); break;
        case 'payment-plan': await prisma.paymentPlan.update({ where: { id: job.entityId }, data }); break;
        case 'floor': await prisma.floor.update({ where: { id: job.entityId }, data }); break;
        default: throw new Error(`Unsupported scheduled entity: ${job.entity}`);
      }
      const development = await prisma.development.findUniqueOrThrow({ where: { id: job.developmentId }, select: { slug: true } });
      const scope: keyof typeof SCOPE_TAGS = ['media', 'gallery'].includes(job.entity) ? 'media' : job.entity === 'tour' ? 'presentation' : ['type', 'payment-plan', 'floor'].includes(job.entity) ? 'inventory' : 'content';
      await prisma.$transaction([
        prisma.publicationSchedule.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: now } }),
        prisma.syncEvent.create({ data: { developmentSlug: development.slug, scope, tags: SCOPE_TAGS[scope] } }),
      ]);
      completed++;
    } catch (error) {
      await prisma.publicationSchedule.update({ where: { id: job.id }, data: { status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error' } });
    }
  }
  return completed;
}
