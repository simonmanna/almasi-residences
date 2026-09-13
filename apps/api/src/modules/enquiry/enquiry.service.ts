import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { buildWhatsAppUrl } from '@avida/types';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { CreateEnquiryDto } from './enquiry.dto.js';
import { NotifyService } from './notify.service.js';
import { TurnstileService } from './turnstile.service.js';

/** §5.9 — enquiries are hard-deleted 24 months after their last status change. */
const RETENTION_MONTHS = 24;

@Injectable()
export class EnquiryService {
  private readonly log = new Logger(EnquiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly turnstile: TurnstileService,
    private readonly notify: NotifyService,
    private readonly dev: CurrentDevelopment,
  ) {}

  async create(dto: CreateEnquiryDto, meta: { ip?: string; userAgent?: string }) {
    // §5.7 step 2 — honeypot. Return a normal-looking success so a bot learns
    // nothing, but persist nothing.
    if (dto.company && dto.company.trim() !== '') {
      this.log.debug('Honeypot triggered; discarding submission');
      return { id: 'discarded', whatsappUrl: null };
    }

    // §5.7 step 1 / §6.7
    const verification = await this.turnstile.verify(dto.turnstileToken, meta.ip);
    if (verification === 'failed') {
      throw new BadRequestException('Could not verify that you are human. Please try again.');
    }

    // §40.5 — a lead belongs to this property, and may only name residences a
    // visitor can see on it. An id from another property, an unpublished or an
    // archived residence is ignored rather than linked.
    const current = await this.dev.get();
    const development = await this.prisma.client.development.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, name: true, country: true, slug: true },
    });
    const units = await this.prisma.client.unit.findMany({
      where: { id: { in: dto.unitIds }, developmentId: development.id, published: true, archivedAt: null },
      select: { id: true, code: true, priceMinor: true, currency: true, areaSqm: true, typology: { select: { name: true } } },
    });

    // §5.7 step 3 — normalise to E.164, defaulting to the development's country.
    const { phone, country } = this.normalisePhone(dto.phone, development.country);

    const now = new Date();
    const purgeAfter = new Date(now);
    purgeAfter.setMonth(purgeAfter.getMonth() + RETENTION_MONTHS);

    // §5.7 step 4 — enquiry and its unit links in one transaction.
    const enquiry = await this.prisma.client.enquiry.create({
      data: {
        developmentId: development.id,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone,
        // The visitor's country, from their number — not the property's (audit §15.7).
        countryIso: country,
        message: dto.message?.trim() || null,
        intent: dto.intent,
        source: dto.source ?? null,
        utmSource: dto.utm?.source ?? null,
        utmMedium: dto.utm?.medium ?? null,
        utmCampaign: dto.utm?.campaign ?? null,
        referrer: dto.referrer ?? null,
        landingPath: dto.landingPath ?? null,
        userAgent: meta.userAgent ?? null,
        // §6.7 — kept for manual review rather than lost.
        verificationSkipped: verification === 'unavailable',
        purgeAfter,
        units: { create: units.map((u) => ({ unitId: u.id })) },
      },
      select: { id: true },
    });

    // §5.7 step 7 — the email must not block the response. Fire and forget;
    // failures surface in the log now and on the jobs board in Phase 2.
    void this.notify.enquiryReceived({
      enquiryId: enquiry.id,
      name: dto.name,
      email: dto.email,
      phone,
      intent: dto.intent,
      message: dto.message,
      developmentName: development.name,
      units: units.map((u) => ({
        code: u.code,
        priceMinor: u.priceMinor,
        currency: u.currency,
        typologyName: u.typology.name,
      })),
    });

    const whatsappNumber = process.env.WHATSAPP_NUMBER ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    const whatsappUrl = whatsappNumber
      ? buildWhatsAppUrl({
          phoneE164: whatsappNumber,
          developmentName: development.name,
          visitorName: dto.name.trim(),
          units: units.map((u) => ({
            code: u.code,
            typologyName: u.typology.name,
            areaSqm: u.areaSqm,
          })),
        })
      : null;

    return { id: enquiry.id, whatsappUrl };
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
