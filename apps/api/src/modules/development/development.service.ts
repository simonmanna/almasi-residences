import { Injectable, NotFoundException } from '@nestjs/common';
import { effectivePriceMinor } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';

const LIVE = { published: true, archivedAt: null } as const;

@Injectable()
export class DevelopmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.3 — the full development payload. Media assets arrive grouped by time
   * state so the client can resolve `TimedImage` without a second request.
   * Only published records are included (§32), and the payment milestones are
   * the default plan's (D-33).
   */
  async findBySlug(slug: string) {
    const dev = await this.prisma.client.development.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        descriptionMd: true,
        city: true,
        country: true,
        addressLine: true,
        latitude: true,
        longitude: true,
        handoverDate: true,
        currency: true,
        status: true,
        propertyType: true,
        buildingConfig: true,
        constructionStatus: true,
        constructionPercent: true,
        developerName: true,
        architect: true,
        contactPhone: true,
        contactEmail: true,
        whatsappNumber: true,
        officeAddress: true,
        officeHours: true,
        socials: true,
        typologies: {
          where: { published: true },
          orderBy: [{ sortOrder: 'asc' }, { areaSqmMin: 'asc' }],
          include: { units: { where: LIVE, select: { status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true } } },
        },
        amenities: {
          where: { published: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, slug: true, name: true, shortDescription: true, descriptionMd: true, iconKey: true, location: true },
        },
        paymentPlans: {
          where: { isDefault: true },
          take: 1,
          select: { milestones: { orderBy: { sortOrder: 'asc' } } },
        },
        landmarks: { orderBy: { distanceM: 'asc' } },
        faqs: { where: { published: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, question: true, answerMd: true, category: true } },
        seo: true,
        mediaSets: { include: { assets: true }, orderBy: { sortOrder: 'asc' } },
        buildings: { select: { id: true, name: true, floorCount: true, modelUrl: true } },
      },
    });
    if (!dev) throw new NotFoundException(`No development with slug "${slug}"`);

    // §4.4 — counts and ranges are computed here, never stored.
    const summary = await this.summarise(dev.id);
    const { paymentPlans, contactPhone, contactEmail, whatsappNumber, officeAddress, officeHours, socials, ...rest } = dev;

    return {
      ...rest,
      contact: { phone: contactPhone, email: contactEmail, whatsapp: whatsappNumber, officeAddress, officeHours, socials: (socials ?? {}) as Record<string, string> },
      milestones: paymentPlans[0]?.milestones ?? [],
      typologies: dev.typologies.map(({ units, ...t }) => {
        const available = units.filter((u) => u.status === 'AVAILABLE').map((u) => effectivePriceMinor(u));
        return {
          ...t,
          summary: {
            total: units.length,
            available: available.length,
            priceMinorFrom: available.length ? Math.min(...available) : null,
          },
        };
      }),
      mediaSets: dev.mediaSets.map((set) => ({
        ...set,
        // §6.2 — keyed by time state, so one client state change resolves every image.
        assets: Object.fromEntries(set.assets.map((a) => [a.timeState, a])),
      })),
      summary,
    };
  }

  /** §4.4 — derived values, computed at query time. */
  async summarise(developmentId: string) {
    const units = await this.prisma.client.unit.findMany({
      where: { developmentId, ...LIVE, floor: { published: true } },
      select: { status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true },
    });
    const counts: Record<string, number> = {};
    for (const u of units) counts[u.status] = (counts[u.status] ?? 0) + 1;
    const total = units.length;
    const sold = (counts.SOLD ?? 0) + (counts.OCCUPIED ?? 0);
    const prices = units.filter((u) => u.status === 'AVAILABLE').map((u) => effectivePriceMinor(u));

    return {
      total,
      byStatus: counts,
      available: counts.AVAILABLE ?? 0,
      percentSold: total === 0 ? 0 : Math.round((sold / total) * 100),
      priceMinorMin: prices.length ? Math.min(...prices) : null,
      priceMinorMax: prices.length ? Math.max(...prices) : null,
    };
  }
}
