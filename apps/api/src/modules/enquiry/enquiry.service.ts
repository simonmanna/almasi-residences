import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { buildWhatsAppUrl } from '@avida/types';
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

    const units = await this.prisma.client.unit.findMany({
      where: { id: { in: dto.unitIds } },
      select: {
        id: true,
        code: true,
        priceMinor: true,
        currency: true,
        areaSqm: true,
        typology: { select: { name: true } },
        floor: {
          select: {
            building: {
              select: { development: { select: { name: true, country: true, slug: true } } },
            },
          },
        },
      },
    });

    const development =
      units[0]?.floor.building.development ??
      (await this.prisma.client.development.findFirst({
        select: { name: true, country: true, slug: true },
      }));
    if (!development) throw new BadRequestException('No development configured');

    // §5.7 step 3 — normalise to E.164, defaulting to the development's country.
    const phone = this.normalisePhone(dto.phone, development.country);

    const now = new Date();
    const purgeAfter = new Date(now);
    purgeAfter.setMonth(purgeAfter.getMonth() + RETENTION_MONTHS);

    // §5.7 step 4 — enquiry and its unit links in one transaction.
    const enquiry = await this.prisma.client.enquiry.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone,
        countryIso: development.country,
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

  private normalisePhone(input: string, defaultCountry: string): string {
    try {
      const parsed = parsePhoneNumberWithError(input, defaultCountry as never);
      if (!parsed.isValid()) throw new Error('invalid');
      return parsed.number;
    } catch {
      throw new BadRequestException(
        'That phone number does not look valid. Include the country code, for example +250 788 123 456.',
      );
    }
  }
}
