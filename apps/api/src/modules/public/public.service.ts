import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@avida/db';
import {
  CONTENT_PAGES,
  MEDIA_SLOTS,
  effectivePriceMinor,
  pricePerSqmMinor,
  PUBLIC_UNIT_STATUS,
  provenanceNote,
  type PublicUnitStatus,
  type UnitStatus,
} from '@avida/types';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { live, previewing, shown } from '../../common/preview.js';
import { csvList, numberOrUndefined } from '../../common/http.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { PricingService } from '../pricing/pricing.service.js';

/** What a visitor may see of a residence. Anything not here is private (§32). */
/** Residences a visitor may see; in a preview, unpublished ones too (never archived). */
const LIVE = (): Prisma.UnitWhereInput => ({ ...live(), floor: { ...live() } });

const cardSelect = {
  id: true,
  code: true,
  status: true,
  priceMinor: true,
  discountMinor: true,
  promoPriceMinor: true,
  promoEndsAt: true,
  currency: true,
  bedrooms: true,
  bathrooms: true,
  areaSqm: true,
  orientation: true,
  viewTags: true,
  featured: true,
  shortDescription: true,
  positionIndex: true,
  modelSlot: true,
  floor: { select: { id: true, level: true, label: true, displayName: true } },
  typology: {
    select: {
      id: true,
      slug: true,
      name: true,
      isPenthouse: true,
      // A residence with no photographs of its own shows its type's, the same
      // rule the residence page follows. Cards used to show an empty frame.
      media: { where: { kind: 'IMAGE', collection: 'LIBRARY', published: true, archivedAt: null, unitId: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
    },
  },
  media: { where: { kind: 'IMAGE', collection: 'LIBRARY', published: true, archivedAt: null, roomId: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
} satisfies Prisma.UnitSelect;

type CardRow = Prisma.UnitGetPayload<{ select: typeof cardSelect }>;

export interface PublicResidenceFilter {
  floor?: string;
  bedrooms?: string;
  type?: string;
  minSize?: string;
  maxSize?: string;
  minPrice?: string;
  maxPrice?: string;
  status?: string;
  featured?: string;
}

export const displayCode = (code: string) => code.replace(/-/g, ' ');
export const residenceSlug = (code: string) => code.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * §22 / §32 — the public read API. Every select below is written out field by
 * field: a private column (notes, buyer, residents, tags, audit) cannot leak by
 * being added to the table later, because nothing here selects "everything".
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly pricing: PricingService,
  ) {}

  /** §13 — a price is published only for something a visitor can buy. */
  private price(u: Pick<CardRow, 'status' | 'priceMinor' | 'discountMinor' | 'promoPriceMinor' | 'promoEndsAt' | 'areaSqm'>) {
    if (u.status !== 'AVAILABLE') return { priceMinor: null, listPriceMinor: null, pricePerSqmMinor: null };
    const now = effectivePriceMinor(u);
    return { priceMinor: now, listPriceMinor: now !== u.priceMinor ? u.priceMinor : null, pricePerSqmMinor: pricePerSqmMinor(now, u.areaSqm) };
  }

  card(u: CardRow) {
    return {
      id: u.id,
      code: u.code,
      label: displayCode(u.code),
      slug: residenceSlug(u.code),
      floor: { id: u.floor.id, level: u.floor.level, label: u.floor.displayName ?? u.floor.label },
      type: { id: u.typology.id, slug: u.typology.slug, name: u.typology.name, isPenthouse: u.typology.isPenthouse },
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      areaSqm: u.areaSqm,
      orientation: u.orientation,
      viewTags: u.viewTags,
      status: PUBLIC_UNIT_STATUS[u.status as UnitStatus],
      ...this.price(u),
      currency: u.currency,
      featured: u.featured,
      positionIndex: u.positionIndex,
      modelSlot: u.modelSlot,
      shortDescription: u.shortDescription,
      cover: u.media[0] ? this.publicMedia(u.media[0]) : u.typology.media[0] ? this.publicMedia(u.typology.media[0]) : null,
    };
  }

  /** A related file, if a visitor may see it (a preview also sees unpublished files). */
  mediaOrNull(m: (Parameters<StorageService['present']>[0] & { archivedAt?: Date | null }) | null | undefined) {
    if (!m || m.archivedAt || (!m.published && !previewing())) return null;
    return this.publicMedia(m);
  }

  /** The public face of a media row: URLs and words, never owner ids or storage keys. */
  publicMedia(m: Parameters<StorageService['present']>[0]) {
    const v = this.storage.present(m);
    return {
      id: v.id,
      kind: v.kind,
      category: v.category,
      title: v.title,
      caption: v.caption,
      altText: v.altText ?? v.title,
      width: v.width,
      height: v.height,
      url: v.url,
      thumbUrl: v.thumbUrl,
      srcSet: v.srcSet,
      blurDataUrl: v.blurDataUrl,
      mimeType: v.mimeType,
      /** §49 — what the file is, and the note the site prints beside it. */
      provenance: v.provenance,
      note: provenanceNote(v.provenance),
      /** CSS object-position from the admin's focal point. */
      focus: v.focusX !== null && v.focusY !== null ? `${v.focusX}% ${v.focusY}%` : null,
    };
  }

  // ─── Property ──────────────────────────────────────────────────────────

  async property() {
    const developmentId = await this.dev.id();
    const d = await this.prisma.client.development.findUniqueOrThrow({
      where: { id: developmentId },
      select: {
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
        contractor: true,
        yearStarted: true,
        contactPhone: true,
        contactEmail: true,
        whatsappNumber: true,
        whatsappIconVisible: true,
        officeAddress: true,
        officeHours: true,
        socials: true,
        logoMedia: true,
        heroMedia: true,
        mainMedia: true,
        videoMedia: true,
      },
    });
    const units = await this.prisma.client.unit.findMany({
      where: { developmentId, ...LIVE() },
      select: { status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true, areaSqm: true, bedrooms: true, typology: { select: { isPenthouse: true } } },
    });
    const byStatus: Record<PublicUnitStatus, number> = { available: 0, reserved: 0, booked: 0, sold: 0, unavailable: 0 };
    for (const u of units) byStatus[PUBLIC_UNIT_STATUS[u.status as UnitStatus]]++;
    const prices = units.filter((u) => u.status === 'AVAILABLE').map((u) => effectivePriceMinor(u));
    const { logoMedia, heroMedia, mainMedia, videoMedia, contactPhone, contactEmail, whatsappNumber, whatsappIconVisible, officeAddress, officeHours, socials, ...rest } = d;
    const m = (x: typeof logoMedia) => (x && x.published ? this.publicMedia(x) : null);
    return {
      ...rest,
      contact: { phone: contactPhone, email: contactEmail, whatsapp: whatsappNumber, whatsappIconVisible, officeAddress, officeHours, socials: (socials ?? {}) as Record<string, string> },
      logo: m(logoMedia),
      heroImage: m(heroMedia),
      mainImage: m(mainMedia),
      video: m(videoMedia),
      summary: {
        total: units.length,
        available: byStatus.available,
        byStatus,
        priceFromMinor: prices.length ? Math.min(...prices) : null,
        priceToMinor: prices.length ? Math.max(...prices) : null,
        penthouses: units.filter((u) => u.typology.isPenthouse).length,
        byBedrooms: units.reduce<Record<string, number>>((acc, u) => {
          if (!u.typology.isPenthouse) acc[u.bedrooms] = (acc[u.bedrooms] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  // ─── Floors ────────────────────────────────────────────────────────────

  async floors() {
    const developmentId = await this.dev.id();
    const floors = await this.prisma.client.floor.findMany({
      where: { building: { developmentId }, ...live() },
      orderBy: [{ sortOrder: 'desc' }, { level: 'desc' }],
      select: {
        id: true,
        level: true,
        label: true,
        displayName: true,
        description: true,
        units: { where: { ...live() }, select: { status: true } },
      },
    });
    return floors.map(({ units, displayName, label, ...f }) => ({
      ...f,
      label: displayName ?? label,
      total: units.length,
      available: units.filter((u) => u.status === 'AVAILABLE').length,
    }));
  }

  async floor(id: string) {
    const developmentId = await this.dev.id();
    const floor = await this.prisma.client.floor.findFirst({
      where: { building: { developmentId }, ...live(), OR: [{ id }, ...(/^-?\d+$/.test(id) ? [{ level: Number(id) }] : [])] },
      select: {
        id: true,
        level: true,
        label: true,
        displayName: true,
        description: true,
        media: { where: { ...live() }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!floor) throw new NotFoundException('No such floor');
    const units = await this.prisma.client.unit.findMany({ where: { floorId: floor.id, ...LIVE() }, select: cardSelect, orderBy: { positionIndex: 'asc' } });
    const { media, displayName, label, ...f } = floor;
    return {
      ...f,
      label: displayName ?? label,
      residences: units.map((u) => this.card(u)),
      floorPlans: media.filter((m) => m.collection === 'FLOOR_PLAN').map((m) => this.publicMedia(m)),
      images: media.filter((m) => m.collection === 'LIBRARY').map((m) => this.publicMedia(m)),
    };
  }

  // ─── Residences ────────────────────────────────────────────────────────

  /** §23 — every filter is applied in the database, against current values. */
  async residences(f: PublicResidenceFilter = {}) {
    const developmentId = await this.dev.id();
    const floors = csvList(f.floor).map(Number).filter(Number.isFinite);
    const beds = csvList(f.bedrooms).map(Number).filter(Number.isFinite);
    const types = csvList(f.type);
    const statuses = csvList(f.status);
    const toDb = (s: string): UnitStatus[] =>
      (Object.entries(PUBLIC_UNIT_STATUS) as [UnitStatus, PublicUnitStatus][]).filter(([, p]) => p === s).map(([k]) => k);
    const minSize = numberOrUndefined(f.minSize);
    const maxSize = numberOrUndefined(f.maxSize);
    const minPrice = numberOrUndefined(f.minPrice);
    const maxPrice = numberOrUndefined(f.maxPrice);

    const where: Prisma.UnitWhereInput = {
      developmentId,
      ...LIVE(),
      ...(floors.length ? { floor: { ...live(), level: { in: floors } } } : {}),
      ...(beds.length ? { bedrooms: { in: beds } } : {}),
      ...(types.length ? { OR: [{ typology: { slug: { in: types } } }, ...(types.includes('penthouse') ? [{ typology: { isPenthouse: true } }] : [])] } : {}),
      ...(statuses.length ? { status: { in: statuses.flatMap(toDb) } } : {}),
      ...(minSize !== undefined || maxSize !== undefined ? { areaSqm: { ...(minSize !== undefined ? { gte: minSize } : {}), ...(maxSize !== undefined ? { lte: maxSize } : {}) } } : {}),
      ...(f.featured === 'true' ? { featured: true } : {}),
    };
    const rows = await this.prisma.client.unit.findMany({ where, select: cardSelect, orderBy: [{ floor: { level: 'asc' } }, { positionIndex: 'asc' }] });
    let cards = rows.map((u) => this.card(u));
    // A price filter can only be met by a residence that shows a price (§13).
    if (minPrice !== undefined) cards = cards.filter((c) => c.priceMinor !== null && c.priceMinor >= minPrice * 100);
    if (maxPrice !== undefined) cards = cards.filter((c) => c.priceMinor !== null && c.priceMinor <= maxPrice * 100);
    return cards;
  }

  async residence(code: string) {
    const developmentId = await this.dev.id();
    const candidates = [code, code.toUpperCase(), code.toUpperCase().replace(/[\s-]+/g, '-'), code.toUpperCase().replace(/[\s-]+/g, '')];
    const unit = await this.prisma.client.unit.findFirst({
      where: { developmentId, ...LIVE(), code: { in: candidates, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('No such residence');
    return this.residenceById(unit.id);
  }

  /** One HTTP read for the complete residence page (roadmap item 56). */
  async residencePage(code: string) {
    const residence = await this.residence(code);
    const [property, schedule] = await Promise.all([this.property(), this.pricing.scheduleForUnit(residence.id).catch(() => null)]);
    return { property, residence, schedule };
  }

  /** The full public record. `includeUnpublished` is for the admin preview only. */
  async residenceById(id: string, opts: { includeUnpublished?: boolean } = {}) {
    const developmentId = await this.dev.id();
    const u = await this.prisma.client.unit.findFirst({
      where: { id, developmentId, ...(opts.includeUnpublished ? {} : LIVE()) },
      select: {
        ...cardSelect,
        typologyId: true,
        floorId: true,
        published: true,
        archivedAt: true,
        description: true,
        interiorSqm: true,
        exteriorSqm: true,
        balconySqm: true,
        terraceSqm: true,
        parkingIncluded: true,
        hasStorage: true,
        availabilityDate: true,
        reservationFeeMinor: true,
        depositPercent: true,
        typology: { select: { id: true, slug: true, name: true, isPenthouse: true, descriptionMd: true, media: { where: { kind: 'IMAGE', collection: 'LIBRARY', published: true, archivedAt: null, unitId: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 } } },
        features: { select: { feature: { select: { name: true, category: true, iconKey: true } } }, orderBy: { feature: { sortOrder: 'asc' } } },
        rooms: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, type: true, areaSqm: true, description: true, features: true, planX: true, planY: true, planW: true, planH: true, planOpen: true, media: { where: { ...live() }, orderBy: { sortOrder: 'asc' } } },
        },
        paymentPlan: { select: { name: true, description: true, depositPercent: true, published: true, milestones: { orderBy: { sortOrder: 'asc' }, select: { label: true, percent: true, triggerType: true, triggerDate: true, triggerNote: true } } } },
      },
    });
    if (!u) throw new NotFoundException('No such residence');

    const [media, plan, specifications] = await Promise.all([
      this.prisma.client.media.findMany({
        where: {
          developmentId,
          ...live(),
          OR: [{ unitId: u.id, roomId: null }, { typologyId: u.typologyId }, { floorId: u.floorId, collection: 'FLOOR_PLAN' }],
        },
        orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
      }),
      u.paymentPlan?.published ? Promise.resolve(u.paymentPlan) : this.defaultPlan(developmentId),
      this.specifications(developmentId, u.typologyId),
    ]);

    // A residence's own photographs win; until it has any, its type's stand in.
    const own = media.filter((m) => m.unitId === u.id && m.kind === 'IMAGE' && m.collection === 'LIBRARY');
    const typeImages = media.filter((m) => m.unitId === null && m.typologyId === u.typologyId && m.kind === 'IMAGE' && m.collection === 'LIBRARY');
    const images = own.length ? own : typeImages;
    const card = this.card({ ...u, media: images });
    const available = u.status === 'AVAILABLE';
    return {
      ...card,
      preview: opts.includeUnpublished ? { published: u.published && !u.archivedAt } : undefined,
      type: { ...card.type, description: u.typology.descriptionMd },
      description: u.description,
      interiorSqm: u.interiorSqm,
      exteriorSqm: u.exteriorSqm,
      balconySqm: u.balconySqm,
      terraceSqm: u.terraceSqm,
      parkingIncluded: u.parkingIncluded,
      hasStorage: u.hasStorage,
      availabilityDate: u.availabilityDate,
      reservationFeeMinor: available ? u.reservationFeeMinor : null,
      depositPercent: u.depositPercent ?? plan?.depositPercent ?? null,
      features: u.features.map((f) => f.feature),
      rooms: u.rooms.map((r) => ({ ...r, media: r.media.map((m) => this.publicMedia(m)) })),
      images: images.map((m) => this.publicMedia(m)),
      videos: media.filter((m) => m.unitId === u.id && m.kind === 'VIDEO').map((m) => this.publicMedia(m)),
      floorPlans: [
        ...media.filter((m) => m.collection === 'FLOOR_PLAN' && m.unitId === u.id),
        ...media.filter((m) => m.collection === 'FLOOR_PLAN' && m.unitId !== u.id && m.typologyId === u.typologyId),
        ...media.filter((m) => m.collection === 'FLOOR_PLAN' && m.floorId === u.floorId),
      ].map((m) => this.publicMedia(m)),
      paymentPlan: plan ? { name: plan.name, description: plan.description, milestones: plan.milestones } : null,
      specifications,
    };
  }

  private defaultPlan(developmentId: string) {
    return this.prisma.client.paymentPlan.findFirst({
      where: { developmentId, isDefault: true, ...live() },
      select: { name: true, description: true, depositPercent: true, published: true, milestones: { orderBy: { sortOrder: 'asc' }, select: { label: true, percent: true, triggerType: true, triggerDate: true, triggerNote: true } } },
    });
  }

  // ─── Amenities, galleries, media ───────────────────────────────────────

  async amenities() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.amenity.findMany({
      where: { developmentId, ...live() },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        shortDescription: true,
        descriptionMd: true,
        iconKey: true,
        location: true,
        specifications: true,
        media: { where: { ...live() }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }] },
      },
    });
    return rows.map(({ media, ...a }) => ({
      ...a,
      specifications: (a.specifications ?? []) as { label: string; value: string }[],
      images: media.filter((m) => m.kind === 'IMAGE').map((m) => this.publicMedia(m)),
      videos: media.filter((m) => m.kind === 'VIDEO').map((m) => this.publicMedia(m)),
    }));
  }

  async galleries() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.gallery.findMany({
      where: { developmentId, ...live() },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        title: true,
        description: true,
        coverMedia: true,
        items: { where: { media: { ...live() } }, orderBy: { sortOrder: 'asc' }, select: { media: true } },
      },
    });
    return rows
      .filter((g) => g.items.length > 0)
      .map(({ coverMedia, items, ...g }) => ({
        ...g,
        cover: (this.mediaOrNull(coverMedia) ?? this.publicMedia(items[0]!.media)),
        items: items.map((i) => this.publicMedia(i.media)),
      }));
  }

  /** One gallery by its slug, without loading every other gallery (roadmap item 58). */
  async gallery(slug: string) {
    const developmentId = await this.dev.id();
    const g = await this.prisma.client.gallery.findFirst({
      where: { developmentId, slug, ...live() },
      select: { slug: true, title: true, description: true, coverMedia: true, items: { where: { media: { ...live() } }, orderBy: { sortOrder: 'asc' }, select: { media: true } } },
    });
    if (!g || g.items.length === 0) throw new NotFoundException('No such gallery');
    const { coverMedia, items, ...rest } = g;
    return { ...rest, cover: (this.mediaOrNull(coverMedia) ?? this.publicMedia(items[0]!.media)), items: items.map((i) => this.publicMedia(i.media)) };
  }

  async media(category?: string, collection?: string) {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.media.findMany({
      where: {
        developmentId,
        ...live(),
        collection: (collection ?? 'LIBRARY') as Prisma.MediaWhereInput['collection'],
        ...(category ? { category: { in: csvList(category) } } : {}),
        // A residence's own photographs are shown with the residence, but
        // only while that residence is itself on the website.
        OR: [{ unitId: null }, { unit: LIVE() }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((m) => this.publicMedia(m));
  }

  /** §20 / §32 — counts only. Which bay belongs to whom is never public. */
  async parking() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.parkingSpace.findMany({ where: { developmentId }, select: { status: true, type: true, level: true } });
    return {
      total: rows.length,
      available: rows.filter((r) => r.status === 'AVAILABLE').length,
      visitor: rows.filter((r) => r.type === 'VISITOR' || r.type === 'ACCESSIBLE').length,
      evCharging: rows.filter((r) => r.type === 'EV').length,
      levels: [...new Set(rows.map((r) => r.level))],
    };
  }

  async paymentPlans() {
    const developmentId = await this.dev.id();
    return this.prisma.client.paymentPlan.findMany({
      where: { developmentId, ...live() },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        depositPercent: true,
        installmentCount: true,
        durationMonths: true,
        milestones: { orderBy: { sortOrder: 'asc' }, select: { label: true, percent: true, triggerType: true, triggerDate: true, triggerNote: true } },
      },
    });
  }

  // ─── Content ───────────────────────────────────────────────────────────

  /** Every page in two queries, not one per page and per media field (roadmap item 58). */
  async pages() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.contentPage.findMany({ where: { developmentId } });
    const contents = new Map(rows.map((r) => [r.key, this.pageContent(r)]));
    const ids = CONTENT_PAGES.flatMap((def) => def.fields.filter((f) => f.type === 'media').map((f) => contents.get(def.key)?.[f.key])).filter((v): v is string => typeof v === 'string');
    const media = ids.length ? await this.prisma.client.media.findMany({ where: { id: { in: ids }, developmentId, ...live() } }) : [];
    const byId = new Map(media.map((m) => [m.id, m]));
    const out: Record<string, Record<string, unknown>> = {};
    for (const def of CONTENT_PAGES) out[def.key] = this.resolvePage(def.key, contents.get(def.key) ?? {}, byId);
    return out;
  }

  async page(key: string) {
    const def = CONTENT_PAGES.find((p) => p.key === key);
    if (!def) throw new NotFoundException('No such page');
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key } } });
    const content = row ? this.pageContent(row) : {};
    const ids = def.fields.filter((f) => f.type === 'media').map((f) => content[f.key]).filter((v): v is string => typeof v === 'string');
    const media = ids.length ? await this.prisma.client.media.findMany({ where: { id: { in: ids }, developmentId, ...live() } }) : [];
    return { key, title: def.title, content: this.resolvePage(key, content, new Map(media.map((m) => [m.id, m]))), updatedAt: row?.updatedAt ?? null };
  }

  /** What a visitor reads of a page; a preview reads the unpublished draft over it (§40.2). */
  private pageContent(row: { published: boolean; content: unknown; draftContent: unknown }): Record<string, unknown> {
    const published = (row.content ?? {}) as Record<string, unknown>;
    if (previewing()) return { ...published, ...((row.draftContent ?? {}) as Record<string, unknown>) };
    return row.published === false ? {} : published;
  }

  /** Media fields resolve to the file itself, so the site needs no second request. */
  private resolvePage(key: string, content: Record<string, unknown>, media: Map<string, Parameters<StorageService['present']>[0]>) {
    const def = CONTENT_PAGES.find((p) => p.key === key)!;
    const resolved: Record<string, unknown> = { ...content };
    for (const f of def.fields.filter((x) => x.type === 'media')) {
      const id = content[f.key];
      if (typeof id === 'string') {
        const m = media.get(id);
        resolved[f.key.replace(/Id$/, '')] = m ? this.publicMedia(m) : null;
      }
    }
    return resolved;
  }

  async faqs() {
    const developmentId = await this.dev.id();
    return this.prisma.client.faq.findMany({
      where: { developmentId, ...live() },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, question: true, answerMd: true, category: true },
    });
  }

  // ─── Presentation: placements, walkthroughs, film, SEO (phase 1) ───────

  /** §52 — every media placement the site renders. An empty one is null, never a substitute. */
  async slots() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.mediaSlot.findMany({ where: { developmentId }, select: { key: true, image: true, video: true } });
    const out: Record<string, { image: PublicMedia | null; video: PublicMedia | null }> = {};
    for (const key of MEDIA_SLOTS.map((d) => d.key)) {
      const row = rows.find((r) => r.key === key);
      out[key] = {
        image: (this.mediaOrNull(row?.image)),
        video: row?.video?.published && row.video.kind === 'VIDEO' ? this.publicMedia(row.video) : null,
      };
    }
    return out;
  }

  /** The specification a residence of this type shows: type rows replace same-label development rows. */
  async specifications(developmentId: string, typologyId: string | null) {
    const rows = await this.prisma.client.specification.findMany({
      where: { developmentId, ...live(), OR: [{ typologyId: null }, ...(typologyId ? [{ typologyId }] : [])] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { category: true, label: true, value: true, typologyId: true },
    });
    const typed = new Set(rows.filter((r) => r.typologyId).map((r) => r.label.toLowerCase()));
    return rows.filter((r) => r.typologyId || !typed.has(r.label.toLowerCase())).map(({ category, label, value }) => ({ category, label, value }));
  }

  async tour(slug: string) {
    const developmentId = await this.dev.id();
    const t = await this.prisma.client.tour.findFirst({
      where: { developmentId, slug, ...live() },
      select: {
        slug: true,
        name: true,
        description: true,
        scenes: {
          where: { ...shown() },
          orderBy: { sortOrder: 'asc' },
          select: { key: true, label: true, place: true, body: true, level: true, image: true, video: true },
        },
      },
    });
    if (!t) throw new NotFoundException('No such tour');
    return {
      slug: t.slug,
      name: t.name,
      description: t.description,
      stations: t.scenes.map((sc) => ({
        key: sc.key,
        title: sc.label,
        place: sc.place,
        body: sc.body,
        level: sc.level,
        image: (this.mediaOrNull(sc.image)),
        video: sc.video?.published && sc.video.kind === 'VIDEO' ? this.publicMedia(sc.video) : null,
      })),
    };
  }

  async film() {
    const developmentId = await this.dev.id();
    const f = await this.prisma.client.videoAsset.findFirst({
      where: { developmentId, ...shown() },
      orderBy: { createdAt: 'asc' },
      select: {
        key: true,
        label: true,
        description: true,
        durationSec: true,
        media: true,
        posterMedia: true,
        chapters: { orderBy: [{ sortOrder: 'asc' }, { startSec: 'asc' }], select: { startSec: true, label: true, place: true } },
      },
    });
    if (!f || !f.media?.published) throw new NotFoundException('No film is published');
    return {
      key: f.key,
      label: f.label,
      description: f.description,
      durationSec: f.durationSec,
      video: this.publicMedia(f.media),
      poster: (this.mediaOrNull(f.posterMedia)),
      chapters: f.chapters,
    };
  }

  /** §5.6 — the site-wide metadata and every route the admin has written metadata for. */
  async seo() {
    const developmentId = await this.dev.id();
    const [site, pages] = await Promise.all([
      this.prisma.client.seoMeta.findUnique({ where: { developmentId }, select: { title: true, description: true, keywords: true } }),
      this.prisma.client.seoPage.findMany({ where: { developmentId }, select: { path: true, title: true, description: true, noindex: true, ogImage: true } }),
    ]);
    return {
      site: site ?? null,
      pages: Object.fromEntries(
        pages.map((pg) => [pg.path, { title: pg.title, description: pg.description, noindex: pg.noindex, ogImage: (this.mediaOrNull(pg.ogImage)) }]),
      ),
    };
  }

  /** The residence-type cards on the homepage: words and cover from the admin. */
  async typologyCards() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.typology.findMany({
      where: { developmentId, ...live() },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        bedrooms: true,
        isPenthouse: true,
        summary: true,
        media: { where: { ...live(), kind: 'IMAGE', collection: 'LIBRARY', unitId: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      },
    });
    return rows.map(({ media, ...t }) => ({ ...t, cover: media[0] ? this.publicMedia(media[0]) : null }));
  }
}

export type PublicMedia = ReturnType<PublicService['publicMedia']>;
