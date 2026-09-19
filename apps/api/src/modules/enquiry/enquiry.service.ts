import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { buildWhatsAppUrl, emailEnquiryAcknowledgement, emailEnquiryAlert, ENQUIRY_DEDUP_HOURS, leadSourceFromUtm } from '@avida/types';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NotificationService } from '../../common/notification.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { CreateEnquiryDto } from './enquiry.dto.js';

/** §5.9 — enquiries are hard-deleted 24 months after their last status change. */
const RETENTION_MONTHS = 24;

/**
 * §5.7 / roadmap phase 3 — the public enquiry intake.
 *
 * What changed from phase 0: a viewing request becomes a Viewing record with
 * the day and time the visitor asked for (§15.2); the same person asking again
 * within a day joins their existing lead instead of creating a duplicate
 * (§15.6); and the sales alert and the visitor's acknowledgement are
 * Notification rows delivered by the worker with retries (§15.1), not a
 * fire-and-forget call.
 */
@Injectable()
export class EnquiryService {
  private readonly log = new Logger(EnquiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly dev: CurrentDevelopment,
    private readonly crm: CrmService,
  ) {}

  async create(dto: CreateEnquiryDto, meta: { ip?: string; userAgent?: string }) {
    // §5.7 step 2 — honeypot. A normal-looking success, and nothing persisted.
    if (dto.company && dto.company.trim() !== '') {
      this.log.debug('Honeypot triggered; discarding submission');
      return { id: 'discarded', whatsappUrl: null };
    }

    // §40.5 — a lead belongs to this property and may only name residences a
    // visitor can see on it.
    const current = await this.dev.get();
    const development = await this.prisma.client.development.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, name: true, country: true, contactPhone: true, whatsappNumber: true },
    });
    const units = await this.prisma.client.unit.findMany({
      where: { id: { in: dto.unitIds }, developmentId: development.id, published: true, archivedAt: null },
      select: { id: true, code: true, priceMinor: true, currency: true, areaSqm: true, status: true, typology: { select: { name: true } } },
    });

    const { phone, country } = this.normalisePhone(dto.phone, development.country);
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const message = dto.message?.trim() || null;
    const wantsViewing = dto.intent === 'VIEWING';
    const viewingDate = wantsViewing && dto.viewingDate ? this.parseDay(dto.viewingDate) : null;

    const now = new Date();
    const purgeAfter = new Date(now);
    purgeAfter.setMonth(purgeAfter.getMonth() + RETENTION_MONTHS);

    // §15.6 — the same address, on an open lead, within the window: one lead, not five.
    const existing = await this.prisma.client.enquiry.findFirst({
      where: {
        developmentId: development.id,
        email,
        createdAt: { gte: new Date(now.getTime() - ENQUIRY_DEDUP_HOURS * 3_600_000) },
        status: { notIn: ['SPAM', 'LOST', 'SOLD', 'DISQUALIFIED'] },
        archivedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, assignedToId: true },
    });

    // CRM intake: the channel from the UTM tags, a matching campaign, the first
    // pipeline column, and an owner by the configured assignment rule.
    await this.crm.ensureStages(development.id);
    const leadSource = leadSourceFromUtm(dto.utm?.source, dto.utm?.medium, dto.referrer);
    const campaign = dto.utm?.campaign
      ? await this.prisma.client.campaign.findFirst({ where: { developmentId: development.id, active: true, utmCampaign: { equals: dto.utm.campaign, mode: 'insensitive' } }, select: { id: true, channel: true } })
      : null;
    const firstStage = existing ? null : this.crm.firstOf(await this.crm.stages(development.id), 'NEW');
    const assignedToId = existing ? null : await this.crm.autoAssign(development.id);
    // An older lead with the same phone or email, outside the join window: flagged for a person to merge, never merged silently.
    const tail = phone.replace(/\D/g, '').slice(-9);
    const earlier = existing
      ? null
      : await this.prisma.client.enquiry.findFirst({
          where: { developmentId: development.id, archivedAt: null, OR: [{ email }, { phone: { endsWith: tail } }] },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, assignedToId: true },
        });

    const enquiry = await this.prisma.client.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        id = existing.id;
        await tx.enquiry.update({
          where: { id },
          data: {
            repeatCount: { increment: 1 },
            lastActivityAt: now,
            purgeAfter,
            ...(wantsViewing ? { intent: 'VIEWING' } : {}),
            units: { connectOrCreate: units.map((u) => ({ where: { enquiryId_unitId: { enquiryId: id, unitId: u.id } }, create: { unitId: u.id } })) },
          },
        });
        await tx.leadNote.create({
          data: { enquiryId: id, kind: 'SYSTEM', body: `Asked again from the website${units.length ? ` about ${units.map((u) => u.code).join(', ')}` : ''}${message ? `:\n\n${message}` : '.'}` },
        });
      } else {
        const row = await tx.enquiry.create({
          data: {
            developmentId: development.id,
            name,
            email,
            phone,
            // The visitor's country, from their number — not the property's (audit §15.7).
            countryIso: country,
            message,
            intent: dto.intent,
            source: dto.source ?? null,
            utmSource: dto.utm?.source ?? null,
            utmMedium: dto.utm?.medium ?? null,
            utmCampaign: dto.utm?.campaign ?? null,
            referrer: dto.referrer ?? null,
            landingPath: dto.landingPath ?? null,
            userAgent: meta.userAgent ?? null,
            leadSource: campaign ? (campaign.channel === 'CAMPAIGN' ? leadSource === 'WEBSITE' ? 'CAMPAIGN' : leadSource : campaign.channel) : leadSource,
            campaignId: campaign?.id ?? null,
            stageId: firstStage?.id ?? null,
            assignedToId: earlier?.assignedToId ?? assignedToId,
            primaryUnitId: units.length === 1 ? units[0]!.id : null,
            lastActivityAt: now,
            purgeAfter,
            units: { create: units.map((u) => ({ unitId: u.id })) },
          },
          select: { id: true },
        });
        id = row.id;
        await tx.leadStageChange.create({ data: { enquiryId: id, toStageId: firstStage?.id ?? null, toStatus: 'NEW' } });
        await tx.leadNote.create({ data: { enquiryId: id, kind: 'SYSTEM', direction: 'IN', body: `New ${wantsViewing ? 'viewing request' : 'enquiry'} from the website${units.length ? ` about ${units.map((u) => u.code).join(', ')}` : ''}${message ? `:\n\n${message}` : '.'}` } });
        if (earlier) await tx.leadNote.create({ data: { enquiryId: id, kind: 'SYSTEM', body: `Possible duplicate of ${earlier.name} — same phone or email. Review and merge if it is the same person.`, meta: { duplicateOfId: earlier.id } } });
      }

      let viewingId: string | null = null;
      if (wantsViewing) {
        const viewing = await tx.viewing.create({
          data: {
            developmentId: development.id,
            enquiryId: id,
            name,
            email,
            phone,
            requestedDate: viewingDate,
            requestedSlot: dto.viewingSlot ?? null,
            status: 'REQUESTED',
            notes: message,
            units: { create: units.map((u) => ({ unitId: u.id })) },
          },
          select: { id: true },
        });
        viewingId = viewing.id;
      }
      return { id, viewingId };
    });

    // In-app: the owner (or, for an unassigned lead, the managers) hears at once.
    const owner = existing?.assignedToId ?? (await this.prisma.client.enquiry.findUnique({ where: { id: enquiry.id }, select: { assignedToId: true } }))?.assignedToId ?? null;
    await this.crm.notify(owner ? [owner] : await this.crm.managerIds(), {
      kind: existing ? 'lead.replied' : 'lead.new',
      title: existing ? `${name} asked again` : `New lead: ${name}`,
      body: `${wantsViewing ? 'Viewing request' : 'Website enquiry'}${units.length ? ` · ${units.map((u) => u.code).join(', ')}` : ''}${owner ? '' : ' · unassigned'}`,
      link: `/crm/leads/${enquiry.id}`,
      enquiryId: enquiry.id,
    });
    await this.crm.rescore(enquiry.id);

    // §15.1 — tell the sales team and the visitor, through the delivery queue.
    const alert = emailEnquiryAlert({
      developmentName: development.name,
      enquiryId: enquiry.id,
      name,
      email,
      phone,
      intent: dto.intent,
      message,
      source: dto.source,
      repeat: Boolean(existing),
      viewing: wantsViewing ? { date: viewingDate, slot: dto.viewingSlot ?? null } : null,
      units: units.map((u) => ({ code: u.code, priceMinor: u.priceMinor, currency: u.currency, typologyName: u.typology.name, status: u.status })),
    });
    await this.notifications.send({
      developmentId: development.id,
      kind: wantsViewing ? 'VIEWING_REQUESTED' : 'ENQUIRY_ALERT',
      to: this.notifications.salesRecipients(),
      subject: alert.subject,
      text: alert.text,
      replyTo: email,
      enquiryId: enquiry.id,
      viewingId: enquiry.viewingId,
    });
    if (!existing) {
      const ack = emailEnquiryAcknowledgement({
        developmentName: development.name,
        firstName: name.split(/\s+/)[0] ?? name,
        residenceCodes: units.map((u) => u.code),
        viewing: wantsViewing,
        phone: development.contactPhone,
        whatsapp: development.whatsappNumber,
      });
      await this.notifications.send({ developmentId: development.id, kind: 'ENQUIRY_ACKNOWLEDGEMENT', to: email, subject: ack.subject, text: ack.text, enquiryId: enquiry.id });
    }

    const whatsappNumber = development.whatsappNumber ?? process.env.WHATSAPP_NUMBER ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    const whatsappUrl = whatsappNumber
      ? buildWhatsAppUrl({
          phoneE164: whatsappNumber,
          developmentName: development.name,
          visitorName: name,
          units: units.map((u) => ({ code: u.code, typologyName: u.typology.name, areaSqm: u.areaSqm })),
        })
      : null;

    return { id: enquiry.id, viewingId: enquiry.viewingId, whatsappUrl };
  }

  /** `2026-10-02` → that day at noon UTC, refusing the past and anything a year out. */
  private parseDay(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (!d || Number.isNaN(d.getTime()) || d < today || d.getTime() > Date.now() + 366 * 86_400_000) {
      throw new BadRequestException('Please choose a viewing day from today onwards.');
    }
    return d;
  }

  private normalisePhone(input: string, defaultCountry: string): { phone: string; country: string | null } {
    try {
      const parsed = parsePhoneNumberWithError(input, defaultCountry as never);
      if (!parsed.isValid()) throw new Error('invalid');
      return { phone: parsed.number, country: parsed.country ?? null };
    } catch {
      throw new BadRequestException(
        'That phone number does not look valid. Include the country code, for example +250 788 123 456.',
      );
    }
  }
}
