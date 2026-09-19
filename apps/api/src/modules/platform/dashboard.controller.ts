import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { can, effectivePriceMinor, PARKING_STATUSES, UNIT_STATUSES, type AccessSubject, type Permission, type UnitStatus } from '@avida/types';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';

const SOLD: UnitStatus[] = ['SOLD'];
const HELD: UnitStatus[] = ['RESERVED', 'BOOKED'];

/**
 * §3 / §39 / §49 — every number on the dashboard is counted from rows at
 * request time. Nothing here is stored, so adding a residence or selling one
 * changes the dashboard with no second write.
 */
/**
 * An audit summary about a person names that person. The feed is open to
 * anyone who can see the property, so rows about people are shown only to the
 * roles allowed to see those people in the first place.
 */
const ACTIVITY_GATE: Record<string, Permission> = {
  buyer: 'buyer.view',
  resident: 'resident.view',
  enquiry: 'enquiry.view',
  user: 'user.view',
};

function canSeeActivity(role: AccessSubject, entity: string | null): boolean {
  const needed = entity ? ACTIVITY_GATE[entity] : undefined;
  return !needed || can(role, needed);
}

@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly crm: CrmService,
  ) {}

  @Get('dashboard')
  @RequirePermission('property.view')
  async dashboard(@Req() req: AdminRequest) {
    const role = actorOf(req);
    const { id: developmentId, currency } = await this.dev.get();
    const weekAgo = new Date(Date.now() - 7 * 86400_000);

    const [dev, units, floors, residents, parking, amenities, enquiries, newThisWeek, activity, featured, recentImages, building] = await Promise.all([
      this.prisma.client.development.findUniqueOrThrow({
        where: { id: developmentId },
        select: { name: true, city: true, country: true, addressLine: true, buildingConfig: true, handoverDate: true, constructionStatus: true, constructionPercent: true, heroMedia: true, mainMedia: true },
      }),
      this.prisma.client.unit.findMany({
        where: { developmentId, archivedAt: null },
        select: { id: true, status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true, areaSqm: true, bedrooms: true, published: true, typology: { select: { isPenthouse: true } } },
      }),
      this.prisma.client.floor.findMany({ where: { building: { developmentId } }, select: { id: true, _count: { select: { units: { where: { archivedAt: null } } } } } }),
      this.prisma.client.resident.groupBy({ by: ['occupancyStatus'], where: { developmentId, archivedAt: null }, _count: true }),
      this.prisma.client.parkingSpace.groupBy({ by: ['status'], where: { developmentId }, _count: true }),
      this.prisma.client.amenity.count({ where: { developmentId, published: true } }),
      this.prisma.client.enquiry.groupBy({ by: ['status'], where: { developmentId }, _count: true }),
      this.prisma.client.enquiry.count({ where: { developmentId, createdAt: { gte: weekAgo } } }),
      // Recent activity is one-line summaries, but a summary about a person
      // names them ("Archived client Jane Doe"), so rows about people are
      // filtered below by the same permissions that gate their records.
      this.prisma.client.adminAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, action: true, entity: true, entityId: true, target: true, summary: true, createdAt: true, actor: { select: { name: true } } },
      }),
      this.prisma.client.unit.findMany({
        where: { developmentId, featured: true, archivedAt: null },
        take: 3,
        orderBy: { priceMinor: 'desc' },
        include: { floor: { select: { label: true } }, typology: { select: { name: true } }, media: { where: { kind: 'IMAGE' }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 5 } },
      }),
      this.prisma.client.media.findMany({ where: { developmentId, kind: 'IMAGE', collection: 'LIBRARY' }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.building(developmentId),
    ]);

    const byStatus = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Record<UnitStatus, number>;
    const valueByStatus = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Record<UnitStatus, number>;
    let totalArea = 0;
    for (const u of units) {
      byStatus[u.status]++;
      valueByStatus[u.status] += effectivePriceMinor(u);
      totalArea += u.areaSqm;
    }
    const totalValue = Object.values(valueByStatus).reduce((a, b) => a + b, 0);
    const sum = (statuses: UnitStatus[]) => statuses.reduce((a, s) => a + valueByStatus[s], 0);

    // §3 — breakdown by what a buyer asks for: bedrooms, and penthouses apart.
    const groups = new Map<string, { key: string; label: string; count: number; available: number; areaMin: number; areaMax: number; priceFromMinor: number | null; order: number }>();
    for (const u of units) {
      const key = u.typology.isPenthouse ? 'penthouse' : `${u.bedrooms}-bedroom`;
      const label = u.typology.isPenthouse ? `Penthouses` : `${u.bedrooms} bedroom${u.bedrooms === 1 ? '' : 's'}`;
      const g = groups.get(key) ?? { key, label, count: 0, available: 0, areaMin: Infinity, areaMax: 0, priceFromMinor: null, order: u.typology.isPenthouse ? 100 : u.bedrooms };
      g.count++;
      g.areaMin = Math.min(g.areaMin, u.areaSqm);
      g.areaMax = Math.max(g.areaMax, u.areaSqm);
      if (u.status === 'AVAILABLE') {
        g.available++;
        const p = effectivePriceMinor(u);
        g.priceFromMinor = g.priceFromMinor === null ? p : Math.min(g.priceFromMinor, p);
      }
      groups.set(key, g);
    }
    const penthouseBeds = units.filter((u) => u.typology.isPenthouse).map((u) => u.bedrooms);
    const breakdown = [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ order: _o, ...g }) => ({
        ...g,
        label: g.key === 'penthouse' && penthouseBeds.length ? `Penthouses (${Math.min(...penthouseBeds)}–${Math.max(...penthouseBeds)} bed)`.replace(/\((\d)–\1 bed\)/, '($1 bed)') : g.label,
      }));

    const enquiryCounts = Object.fromEntries(enquiries.map((e) => [e.status, e._count]));
    const parkingCounts = Object.fromEntries(PARKING_STATUSES.map((s) => [s, parking.find((p) => p.status === s)?._count ?? 0]));

    return {
      property: {
        name: dev.name,
        // The address line often already ends with the city; do not say it twice.
        location: dev.addressLine && dev.addressLine.includes(dev.city) ? dev.addressLine : [dev.addressLine, dev.city].filter(Boolean).join(', '),
        buildingConfig: dev.buildingConfig,
        handoverDate: dev.handoverDate,
        constructionStatus: dev.constructionStatus,
        constructionPercent: dev.constructionPercent,
        heroImage: dev.heroMedia ? this.storage.present(dev.heroMedia) : dev.mainMedia ? this.storage.present(dev.mainMedia) : null,
      },
      currency,
      stats: {
        floors: floors.length,
        residentialFloors: floors.filter((f) => f._count.units > 0).length,
        residences: units.length,
        unpublished: units.filter((u) => !u.published).length,
        byStatus,
        residents: {
          total: residents.reduce((a, r) => a + r._count, 0),
          active: residents.find((r) => r.occupancyStatus === 'ACTIVE')?._count ?? 0,
        },
        parking: { total: parking.reduce((a, p) => a + p._count, 0), byStatus: parkingCounts },
        amenities,
        enquiries: {
          total: enquiries.reduce((a, e) => a + e._count, 0),
          new: enquiryCounts.NEW ?? 0,
          thisWeek: newThisWeek,
          open: enquiries.filter((e) => !['SOLD', 'LOST', 'SPAM', 'DISQUALIFIED'].includes(e.status)).reduce((a, e) => a + e._count, 0),
          byStatus: enquiryCounts,
        },
      },
      sales: {
        totalValueMinor: totalValue,
        availableValueMinor: valueByStatus.AVAILABLE,
        soldValueMinor: sum(SOLD),
        reservedValueMinor: sum(HELD),
        averagePriceMinor: units.length ? Math.round(totalValue / units.length) : null,
        averagePricePerSqmMinor: totalArea > 0 ? Math.round(totalValue / totalArea) : null,
        percentSold: units.length ? Math.round((units.filter((u) => SOLD.includes(u.status)).length / units.length) * 100) : 0,
        valueByStatus,
      },
      breakdown,
      building,
      activity: activity
        .filter((row) => canSeeActivity(role, row.entity))
        .map(({ actor: a, ...row }) => ({ ...row, actorName: a.name })),
      featured: featured.map(({ media, ...u }) => ({
        id: u.id,
        code: u.code,
        status: u.status,
        floor: u.floor.label,
        type: u.typology.name,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        areaSqm: u.areaSqm,
        priceMinor: effectivePriceMinor(u),
        currency: u.currency,
        parkingIncluded: u.parkingIncluded,
        hasBalcony: (u.balconySqm ?? 0) > 0 || (u.terraceSqm ?? 0) > 0,
        images: media.map((m) => this.storage.present(m)),
      })),
      recentImages: recentImages.map((m) => this.storage.present(m)),
    };
  }

  /** §24 / §49 — the building, top floor first, every residence with what sales needs at a glance. */
  @Get('building')
  @RequirePermission('property.view')
  async buildingRoute() {
    return this.building(await this.dev.id());
  }

  private async building(developmentId: string) {
    const floors = await this.prisma.client.floor.findMany({
      where: { building: { developmentId } },
      orderBy: [{ sortOrder: 'desc' }, { level: 'desc' }],
      include: {
        units: {
          where: { archivedAt: null },
          orderBy: { positionIndex: 'asc' },
          select: {
            id: true,
            code: true,
            status: true,
            bedrooms: true,
            bathrooms: true,
            areaSqm: true,
            priceMinor: true,
            discountMinor: true,
            promoPriceMinor: true,
            promoEndsAt: true,
            currency: true,
            published: true,
            featured: true,
            orientation: true,
            typology: { select: { name: true, isPenthouse: true } },
            _count: { select: { enquiries: true, interests: true } },
          },
        },
      },
    });
    return floors.map((f) => ({
      id: f.id,
      level: f.level,
      label: f.label,
      displayName: f.displayName,
      published: f.published,
      units: f.units.map(({ _count, ...u }) => ({ ...u, effectivePriceMinor: effectivePriceMinor(u), enquiryCount: _count.enquiries, interestCount: _count.interests })),
      stats: {
        total: f.units.length,
        ...Object.fromEntries(UNIT_STATUSES.map((s) => [s, f.units.filter((u) => u.status === s).length])),
      },
    }));
  }

  /** §27 — one box searches everything the signed-in role may see. */
  @Get('search')
  @RequirePermission('property.view')
  async search(@Query('q') raw: string | undefined, @Req() req: AdminRequest) {
    const q = (raw ?? '').trim();
    if (!q) return { results: [] };
    const role = actorOf(req);
    const developmentId = await this.dev.id();
    const like = { contains: q, mode: 'insensitive' as const };
    const codeLike = { contains: q.replace(/\s+/g, '-'), mode: 'insensitive' as const };

    const [units, floors, amenities, galleries, media, residents, buyers, enquiries] = await Promise.all([
      this.prisma.client.unit.findMany({
        where: { developmentId, OR: [{ code: codeLike }, { code: like }, { tags: { has: q } }] },
        take: 8,
        orderBy: { code: 'asc' },
        include: { floor: { select: { label: true } }, typology: { select: { name: true } } },
      }),
      this.prisma.client.floor.findMany({ where: { building: { developmentId }, OR: [{ label: like }, { displayName: like }] }, take: 5 }),
      this.prisma.client.amenity.findMany({ where: { developmentId, name: like }, take: 5 }),
      this.prisma.client.gallery.findMany({ where: { developmentId, title: like }, take: 5 }),
      this.prisma.client.media.findMany({ where: { developmentId, OR: [{ title: like }, { caption: like }] }, take: 5 }),
      can(role, 'resident.view')
        ? this.prisma.client.resident.findMany({ where: { developmentId, OR: [{ fullName: like }, { email: like }, { phone: { contains: q } }] }, take: 5, include: { unit: { select: { code: true } } } })
        : Promise.resolve([]),
      can(role, 'buyer.view')
        ? this.prisma.client.buyer.findMany({ where: { developmentId, OR: [{ fullName: like }, { email: like }, { phone: { contains: q } }] }, take: 5 })
        : Promise.resolve([]),
      can(role, 'enquiry.view')
        ? this.prisma.client.enquiry.findMany({ where: { AND: [{ developmentId, archivedAt: null, OR: [{ name: like }, { email: like }, { phone: { contains: q.replace(/\s+/g, '') } }, { whatsapp: { contains: q.replace(/\s+/g, '') } }] }, this.crm.leadScope(actorOf(req))] }, take: 6, orderBy: { createdAt: 'desc' }, include: { stage: { select: { label: true } } } })
        : Promise.resolve([]),
    ]);
    const [deals, viewings, activities] = can(role, 'enquiry.view')
      ? await Promise.all([
          this.prisma.client.deal.findMany({ where: { AND: [{ developmentId, archivedAt: null, OR: [{ enquiry: { name: like } }, { buyer: { fullName: like } }, { unit: { code: codeLike } }] }, this.crm.dealScope(role)] }, take: 4, include: { unit: { select: { code: true } }, enquiry: { select: { id: true, name: true } } } }),
          this.prisma.client.viewing.findMany({ where: { developmentId, name: like, ...(can(role, 'enquiry.view', 'ALL') ? {} : { OR: [{ agentId: { in: this.crm.ownerIds(role) ?? [] } }, { enquiry: this.crm.leadScope(role) }] }) }, take: 4, orderBy: { createdAt: 'desc' } }),
          q.length >= 3 ? this.prisma.client.leadNote.findMany({ where: { body: like, enquiry: { developmentId, ...this.crm.leadScope(actorOf(req)) } }, take: 4, orderBy: { createdAt: 'desc' }, include: { enquiry: { select: { id: true, name: true } } } }) : Promise.resolve([]),
        ])
      : [[], [], []];

    // An exact code match goes first, so typing "A2" lands on A2.
    const exact = (code: string) => code.replace(/-/g, ' ').toLowerCase() === q.replace(/-/g, ' ').toLowerCase();
    const sortedUnits = [...units].sort((a, b) => Number(exact(b.code)) - Number(exact(a.code)));

    return {
      results: [
        ...sortedUnits.map((u) => ({ type: 'residence', id: u.id, title: `Residence ${u.code.replace(/-/g, ' ')}`, subtitle: `${u.floor.label} · ${u.typology.name} · ${u.status.toLowerCase().replace('_', ' ')}`, href: `/residences/${u.id}` })),
        ...floors.map((f) => ({ type: 'floor', id: f.id, title: f.displayName ?? f.label, subtitle: 'Floor', href: `/floors/${f.id}` })),
        ...residents.map((r) => ({ type: 'resident', id: r.id, title: r.fullName, subtitle: r.unit ? `Resident · ${r.unit.code}` : 'Resident', href: `/residents/${r.id}` })),
        ...buyers.map((b) => ({ type: 'buyer', id: b.id, title: b.fullName, subtitle: `Client · ${b.stage.toLowerCase()}`, href: `/buyers/${b.id}` })),
        ...enquiries.map((e) => ({ type: 'lead', id: e.id, title: e.name, subtitle: `Lead · ${e.stage?.label ?? e.status.toLowerCase()}`, href: `/crm/leads/${e.id}` })),
        ...deals.map((d) => ({ type: 'deal', id: d.id, title: `${d.enquiry?.name ?? 'Deal'} · ${d.unit.code}`, subtitle: `Deal · ${d.status.toLowerCase()}`, href: d.enquiry ? `/crm/leads/${d.enquiry.id}?tab=deals` : '/crm/deals' })),
        ...viewings.map((v) => ({ type: 'viewing', id: v.id, title: v.name, subtitle: `Viewing · ${v.status.toLowerCase()}${v.scheduledAt ? ` · ${v.scheduledAt.toISOString().slice(0, 10)}` : ''}`, href: `/viewings?open=${v.id}` })),
        ...activities.map((n) => ({ type: 'activity', id: n.id, title: n.body.slice(0, 70), subtitle: `${n.kind.toLowerCase()} · ${n.enquiry.name}`, href: `/crm/leads/${n.enquiry.id}` })),
        ...amenities.map((a) => ({ type: 'amenity', id: a.id, title: a.name, subtitle: 'Amenity', href: `/amenities?open=${a.id}` })),
        ...galleries.map((g) => ({ type: 'gallery', id: g.id, title: g.title, subtitle: 'Gallery', href: `/galleries/${g.id}` })),
        ...media.map((m) => ({ type: 'media', id: m.id, title: m.title ?? 'Untitled file', subtitle: `Media · ${m.category.toLowerCase().replace(/_/g, ' ')}`, href: `/media?open=${m.id}` })),
      ],
    };
  }
}
