import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Prisma, type UnitStatus as DbUnitStatus } from '@avida/db';
import {
  can,
  computeSchedule,
  effectivePriceMinor,
  isSaleReversal,
  pricePerSqmMinor,
  STATUS_LABEL,
  type UnitStatus,
} from '@avida/types';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { boolOrUndefined, csvList, money, numberOrUndefined, pageOf, paged, rethrowPrisma } from '../../common/http.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { assertCan, defined, requireNonNull, toDate, type Actor } from './actor.js';
import type {
  BulkResidenceDto,
  CreateResidenceDto,
  DuplicateResidenceDto,
  ResidencePricingDto,
  UpdateResidenceDto,
} from './dto.js';

export interface ResidenceQuery {
  q?: string;
  floorId?: string;
  typologyId?: string;
  status?: string;
  bedrooms?: string;
  minPrice?: string;
  maxPrice?: string;
  minSize?: string;
  maxSize?: string;
  published?: string;
  archived?: string;
  featured?: string;
  tag?: string;
  sort?: string;
  dir?: string;
  page?: string;
  pageSize?: string;
}

const PRICING_KEYS = [
  'priceMinor',
  'currency',
  'discountMinor',
  'promoPriceMinor',
  'promoEndsAt',
  'reservationFeeMinor',
  'depositPercent',
  'paymentPlanId',
] as const;

/** Parking follows the residence it belongs to (§20). */
function bayStatusFor(status: UnitStatus): 'SOLD' | 'RESERVED' | 'ASSIGNED' | null {
  if (status === 'SOLD' || status === 'OCCUPIED') return 'SOLD';
  if (status === 'RESERVED' || status === 'ON_HOLD') return 'RESERVED';
  if (status === 'AVAILABLE') return 'ASSIGNED';
  return null;
}

const listInclude = {
  floor: { select: { id: true, level: true, label: true, displayName: true } },
  typology: { select: { id: true, name: true, slug: true, isPenthouse: true } },
  media: { where: { isCover: true, kind: 'IMAGE' }, take: 1 },
  buyer: { select: { id: true, fullName: true, stage: true } },
  _count: { select: { enquiries: true, interests: true, residents: true } },
} satisfies Prisma.UnitInclude;

type ListRow = Prisma.UnitGetPayload<{ include: typeof listInclude }>;

/**
 * §6 / §7 / §9 / §10 — the residence record and every rule around it. The
 * controller only routes; each rule the brief names lives here, so a bulk
 * action and a single edit cannot enforce different things.
 */
@Injectable()
export class ResidencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  where(q: ResidenceQuery, developmentId: string): Prisma.UnitWhereInput {
    const statuses = csvList(q.status) as DbUnitStatus[];
    const bedrooms = csvList(q.bedrooms).map(Number).filter(Number.isFinite);
    const minPrice = numberOrUndefined(q.minPrice);
    const maxPrice = numberOrUndefined(q.maxPrice);
    const minSize = numberOrUndefined(q.minSize);
    const maxSize = numberOrUndefined(q.maxSize);
    const archived = boolOrUndefined(q.archived);
    const term = q.q?.trim();
    return {
      developmentId,
      archivedAt: archived ? { not: null } : null,
      ...(q.floorId ? { floorId: q.floorId } : {}),
      ...(q.typologyId ? { typologyId: q.typologyId } : {}),
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(bedrooms.length ? { bedrooms: { in: bedrooms } } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { priceMinor: { ...(minPrice !== undefined ? { gte: Math.round(minPrice * 100) } : {}), ...(maxPrice !== undefined ? { lte: Math.round(maxPrice * 100) } : {}) } }
        : {}),
      ...(minSize !== undefined || maxSize !== undefined
        ? { areaSqm: { ...(minSize !== undefined ? { gte: minSize } : {}), ...(maxSize !== undefined ? { lte: maxSize } : {}) } }
        : {}),
      ...(boolOrUndefined(q.published) !== undefined ? { published: boolOrUndefined(q.published) } : {}),
      ...(boolOrUndefined(q.featured) !== undefined ? { featured: boolOrUndefined(q.featured) } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(term
        ? {
            OR: [
              { code: { contains: term.replace(/\s+/g, '-'), mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
              { typology: { name: { contains: term, mode: 'insensitive' } } },
              { floor: { label: { contains: term, mode: 'insensitive' } } },
              { tags: { has: term } },
            ],
          }
        : {}),
    };
  }

  private orderBy(sort?: string, dir?: string): Prisma.UnitOrderByWithRelationInput[] {
    const d: Prisma.SortOrder = dir === 'desc' ? 'desc' : 'asc';
    switch (sort) {
      case 'code':
        return [{ code: d }];
      case 'price':
        return [{ priceMinor: d }, { code: 'asc' }];
      case 'size':
        return [{ areaSqm: d }, { code: 'asc' }];
      case 'status':
        return [{ status: d }, { code: 'asc' }];
      case 'bedrooms':
        return [{ bedrooms: d }, { code: 'asc' }];
      case 'updated':
        return [{ updatedAt: dir === 'asc' ? 'asc' : 'desc' }];
      default:
        return [{ floor: { level: d } }, { positionIndex: 'asc' }];
    }
  }

  row(u: ListRow, actor: Actor) {
    const { media, buyer, _count, notes: _notes, ...rest } = u;
    return {
      ...rest,
      effectivePriceMinor: effectivePriceMinor(u),
      pricePerSqmMinor: pricePerSqmMinor(u.priceMinor, u.areaSqm),
      cover: media[0] ? this.storage.present(media[0]) : null,
      buyer: can(actor.role, 'buyer.view') ? buyer : buyer ? { id: buyer.id, fullName: 'Assigned', stage: buyer.stage } : null,
      enquiryCount: _count.enquiries,
      interestCount: _count.interests,
      residentCount: _count.residents,
    };
  }

  async list(q: ResidenceQuery, actor: Actor) {
    const developmentId = await this.dev.id();
    const where = this.where(q, developmentId);
    const page = pageOf(q.page, q.pageSize, 500);
    const [rows, total] = await Promise.all([
      this.prisma.client.unit.findMany({ where, include: listInclude, orderBy: this.orderBy(q.sort, q.dir), skip: page.skip, take: page.take }),
      this.prisma.client.unit.count({ where }),
    ]);
    return paged(
      rows.map((u) => this.row(u, actor)),
      total,
      page,
    );
  }

  async get(id: string, actor: Actor) {
    const developmentId = await this.dev.id();
    const unit = await this.prisma.client.unit.findFirst({
      where: { id, developmentId },
      include: {
        floor: { select: { id: true, level: true, label: true, displayName: true } },
        typology: true,
        paymentPlan: { include: { milestones: { orderBy: { sortOrder: 'asc' } } } },
        features: { include: { feature: true } },
        rooms: { orderBy: { sortOrder: 'asc' }, include: { media: { orderBy: { sortOrder: 'asc' } } } },
        media: { where: { roomId: null }, orderBy: [{ collection: 'asc' }, { isCover: 'desc' }, { sortOrder: 'asc' }] },
        priceHistory: { orderBy: { createdAt: 'desc' }, take: 50 },
        statusLog: { orderBy: { createdAt: 'desc' }, take: 50 },
        parkingSpaces: { orderBy: { code: 'asc' } },
        buyer: true,
        residents: { where: { archivedAt: null } },
        interests: { include: { buyer: { select: { id: true, fullName: true, stage: true } } } },
        enquiries: {
          include: { enquiry: { select: { id: true, name: true, email: true, status: true, intent: true, createdAt: true } } },
          orderBy: { enquiry: { createdAt: 'desc' } },
        },
      },
    });
    if (!unit) throw new NotFoundException('No such residence');

    const [activity, defaultPlan, dev] = await Promise.all([
      this.prisma.client.adminAuditLog.findMany({
        where: { entity: 'residence', entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { actor: { select: { name: true } } },
      }),
      this.prisma.client.paymentPlan.findFirst({
        where: { developmentId, isDefault: true },
        include: { milestones: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.client.development.findUniqueOrThrow({ where: { id: developmentId }, select: { handoverDate: true } }),
    ]);

    const actorIds = [...new Set([...unit.priceHistory.map((p) => p.actor), ...unit.statusLog.map((s) => s.actor)])];
    const names = new Map(
      (await this.prisma.client.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    const who = (id: string) => names.get(id) ?? (id === 'system' ? 'System' : 'Former user');

    const plan = unit.paymentPlan ?? defaultPlan;
    const price = effectivePriceMinor(unit);
    let schedule = null;
    if (plan && plan.milestones.length) {
      try {
        schedule = computeSchedule(
          { priceMinor: price, currency: unit.currency },
          plan.milestones.map((m) => ({ id: m.id, sortOrder: m.sortOrder, label: m.label, percent: m.percent, triggerType: m.triggerType, triggerDate: m.triggerDate, triggerNote: m.triggerNote })),
          dev.handoverDate,
          new Date(),
        );
      } catch {
        schedule = null; // a plan that does not sum to 100 is shown as such on the plan page
      }
    }

    const canBuyers = can(actor.role, 'buyer.view');
    const canResidents = can(actor.role, 'resident.view');
    const canEnquiries = can(actor.role, 'enquiry.view');

    return {
      ...unit,
      notes: unit.notes,
      effectivePriceMinor: price,
      pricePerSqmMinor: pricePerSqmMinor(unit.priceMinor, unit.areaSqm),
      features: unit.features.map((f) => ({ ...f.feature, note: f.note })),
      rooms: unit.rooms.map((r) => ({ ...r, media: r.media.map((m) => this.storage.present(m)) })),
      media: unit.media.map((m) => this.storage.present(m)),
      paymentPlan: plan,
      paymentPlanIsDefault: !unit.paymentPlanId,
      schedule,
      priceHistory: unit.priceHistory.map((p) => ({ ...p, actorName: who(p.actor) })),
      statusLog: unit.statusLog.map((s) => ({ ...s, actorName: who(s.actor) })),
      activity: activity.map(({ actor: a, ...row }) => ({ ...row, actorName: a.name })),
      // §32 — people's details only for roles allowed to see them.
      buyer: canBuyers ? unit.buyer : unit.buyer ? { id: unit.buyer.id, restricted: true } : null,
      residents: canResidents ? unit.residents : unit.residents.map((r) => ({ id: r.id, restricted: true })),
      interests: canBuyers ? unit.interests.map((i) => i.buyer) : [],
      enquiries: canEnquiries ? unit.enquiries.map((e) => e.enquiry) : [],
      enquiryCount: unit.enquiries.length,
    };
  }

  // ─── Create & edit ─────────────────────────────────────────────────────

  async create(dto: CreateResidenceDto, actor: Actor, req?: FastifyRequest) {
    const developmentId = await this.dev.id();
    const code = dto.code.trim();
    await this.assertCodeFree(developmentId, code);
    const floor = await this.ownedFloor(dto.floorId, developmentId);
    const typology = await this.ownedTypology(dto.typologyId, developmentId);
    const planId = dto.paymentPlanId ? (await this.ownedPlan(dto.paymentPlanId, developmentId)).id : null;
    if (dto.featureIds?.length) await this.assertFeatures(dto.featureIds, developmentId);
    if (dto.status && dto.status !== 'AVAILABLE') assertCan(actor, 'residence.status');
    this.assertPricingSane({ priceMinor: dto.priceMinor, discountMinor: dto.discountMinor, promoPriceMinor: dto.promoPriceMinor });

    const max = await this.prisma.client.unit.aggregate({ where: { floorId: floor.id }, _max: { positionIndex: true } });
    const unit = await this.prisma.client.unit
      .create({
        data: {
          developmentId,
          floorId: floor.id,
          typologyId: typology.id,
          code,
          status: (dto.status ?? 'AVAILABLE') as DbUnitStatus,
          priceMinor: dto.priceMinor,
          currency: dto.currency ?? (await this.dev.get()).currency,
          discountMinor: dto.discountMinor ?? null,
          promoPriceMinor: dto.promoPriceMinor ?? null,
          promoEndsAt: toDate(dto.promoEndsAt) ?? null,
          reservationFeeMinor: dto.reservationFeeMinor ?? null,
          depositPercent: dto.depositPercent ?? null,
          paymentPlanId: planId,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          areaSqm: dto.areaSqm,
          interiorSqm: dto.interiorSqm ?? null,
          exteriorSqm: dto.exteriorSqm ?? null,
          balconySqm: dto.balconySqm ?? null,
          terraceSqm: dto.terraceSqm ?? null,
          parkingIncluded: dto.parkingIncluded ?? 0,
          hasStorage: dto.hasStorage ?? false,
          storageNote: dto.storageNote ?? null,
          orientation: dto.orientation as Prisma.UnitCreateInput['orientation'],
          viewTags: dto.viewTags ?? [],
          availabilityDate: toDate(dto.availabilityDate) ?? null,
          shortDescription: dto.shortDescription ?? null,
          description: dto.description ?? null,
          published: dto.published ?? false,
          featured: dto.featured ?? false,
          tags: dto.tags ?? [],
          notes: dto.notes ?? null,
          positionIndex: (max._max.positionIndex ?? -1) + 1,
          widthRatio: Math.min(2.6, Math.max(0.6, Math.round((dto.areaSqm / 100) * 100) / 100)),
          meshName: `unit_${code.replace(/[^A-Za-z0-9]/g, '_')}`,
          features: dto.featureIds?.length ? { create: dto.featureIds.map((featureId) => ({ featureId })) } : undefined,
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: `Residence code ${code} is already in use.` }));

    await this.audit.record({
      actorId: actor.id,
      action: 'residence.create',
      entity: 'residence',
      entityId: unit.id,
      target: unit.code,
      summary: `Created residence ${unit.code} on ${floor.label} at ${money(unit.priceMinor, unit.currency)}`,
      after: { code: unit.code, floor: floor.label, type: typology.name, priceMinor: unit.priceMinor, status: unit.status, published: unit.published },
      req,
    });
    await this.sync.changed('inventory');
    return unit;
  }

  async update(id: string, dto: UpdateResidenceDto, actor: Actor, req?: FastifyRequest) {
    requireNonNull(dto, ['code', 'floorId', 'typologyId', 'bedrooms', 'bathrooms', 'areaSqm', 'parkingIncluded', 'hasStorage', 'orientation', 'viewTags', 'published', 'featured', 'tags', 'priceMinor', 'currency']);
    const developmentId = await this.dev.id();
    const before = await this.owned(id, developmentId);
    if (before.archivedAt) throw new ConflictException(`${before.code} is archived. Restore it before editing.`);

    const pricing = PRICING_KEYS.filter((k) => dto[k] !== undefined);
    if (pricing.length) assertCan(actor, 'residence.price');
    if (dto.buyerId !== undefined) assertCan(actor, 'buyer.edit');

    const data: Prisma.UnitUncheckedUpdateInput = {};
    if (dto.code !== undefined && dto.code.trim() !== before.code) {
      await this.assertCodeFree(developmentId, dto.code.trim(), id);
      data.code = dto.code.trim();
    }
    if (dto.floorId !== undefined && dto.floorId !== before.floorId) {
      const floor = await this.ownedFloor(dto.floorId, developmentId);
      const max = await this.prisma.client.unit.aggregate({ where: { floorId: floor.id }, _max: { positionIndex: true } });
      data.floorId = floor.id;
      data.positionIndex = (max._max.positionIndex ?? -1) + 1;
    }
    if (dto.typologyId !== undefined && dto.typologyId !== before.typologyId) {
      data.typologyId = (await this.ownedTypology(dto.typologyId, developmentId)).id;
    }
    if (dto.paymentPlanId) await this.ownedPlan(dto.paymentPlanId, developmentId);
    if (dto.buyerId) await this.ownedBuyer(dto.buyerId, developmentId);
    if (dto.featureIds) await this.assertFeatures(dto.featureIds, developmentId);

    const next = {
      priceMinor: dto.priceMinor ?? before.priceMinor,
      discountMinor: dto.discountMinor === undefined ? before.discountMinor : dto.discountMinor,
      promoPriceMinor: dto.promoPriceMinor === undefined ? before.promoPriceMinor : dto.promoPriceMinor,
    };
    this.assertPricingSane(next);

    Object.assign(
      data,
      defined({
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        areaSqm: dto.areaSqm,
        interiorSqm: dto.interiorSqm,
        exteriorSqm: dto.exteriorSqm,
        balconySqm: dto.balconySqm,
        terraceSqm: dto.terraceSqm,
        parkingIncluded: dto.parkingIncluded,
        hasStorage: dto.hasStorage,
        storageNote: dto.storageNote,
        orientation: dto.orientation as Prisma.UnitUncheckedUpdateInput['orientation'],
        viewTags: dto.viewTags,
        availabilityDate: toDate(dto.availabilityDate),
        shortDescription: dto.shortDescription,
        description: dto.description,
        published: dto.published,
        featured: dto.featured,
        tags: dto.tags,
        notes: dto.notes,
        buyerId: dto.buyerId,
        priceMinor: dto.priceMinor,
        currency: dto.currency,
        discountMinor: dto.discountMinor,
        promoPriceMinor: dto.promoPriceMinor,
        promoEndsAt: toDate(dto.promoEndsAt),
        reservationFeeMinor: dto.reservationFeeMinor,
        depositPercent: dto.depositPercent,
        paymentPlanId: dto.paymentPlanId,
      }),
    );

    const after = await this.prisma.client
      .$transaction(async (tx) => {
        const u = await tx.unit.update({ where: { id }, data });
        if (dto.featureIds) {
          await tx.unitFeature.deleteMany({ where: { unitId: id } });
          if (dto.featureIds.length) await tx.unitFeature.createMany({ data: dto.featureIds.map((featureId) => ({ unitId: id, featureId })) });
        }
        if (dto.priceMinor !== undefined && dto.priceMinor !== before.priceMinor) {
          await tx.priceHistory.create({ data: { unitId: id, fromMinor: before.priceMinor, toMinor: dto.priceMinor, currency: u.currency, actor: actor.id } });
        }
        return u;
      })
      .catch((e) => rethrowPrisma(e, { unique: `Residence code ${dto.code} is already in use.` }));

    const changes = diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (dto.featureIds) changes.keys.push('features');
    if (changes.keys.length) {
      const priceChanged = changes.keys.includes('priceMinor');
      await this.audit.record({
        actorId: actor.id,
        action: priceChanged ? 'residence.price' : 'residence.update',
        entity: 'residence',
        entityId: id,
        target: after.code,
        summary: priceChanged
          ? `${after.code} price ${money(before.priceMinor, before.currency)} → ${money(after.priceMinor, after.currency)}`
          : `Updated ${after.code}: ${changes.keys.join(', ')}`,
        before: changes.before,
        after: changes.after,
        req,
      });
      await this.sync.changed('inventory');
    }
    return after;
  }

  /** §10 — the pricing screen's save. */
  async changePrice(id: string, dto: ResidencePricingDto, actor: Actor, req?: FastifyRequest) {
    const { reason, ...fields } = dto;
    const before = await this.owned(id, await this.dev.id());
    const result = await this.update(id, fields, actor, req);
    if (reason && dto.priceMinor !== undefined && dto.priceMinor !== before.priceMinor) {
      const latest = await this.prisma.client.priceHistory.findFirst({ where: { unitId: id }, orderBy: { createdAt: 'desc' } });
      if (latest) await this.prisma.client.priceHistory.update({ where: { id: latest.id }, data: { reason } });
    }
    return result;
  }

  // ─── Status ────────────────────────────────────────────────────────────

  /**
   * §9 — store the new status, who changed it, when, and from what; audit it;
   * move the residence's parking with it; then tell the public site. Undoing
   * a sale needs its own permission (D-34).
   */
  async changeStatus(ids: string[], status: UnitStatus, note: string | undefined, actor: Actor, req?: FastifyRequest) {
    const developmentId = await this.dev.id();
    const units = await this.prisma.client.unit.findMany({ where: { id: { in: ids }, developmentId } });
    if (units.length !== ids.length) throw new NotFoundException('Some residences were not found.');

    const archived = units.find((u) => u.archivedAt);
    if (archived) throw new ConflictException(`${archived.code} is archived. Restore it before changing its status.`);
    if (!can(actor.role, 'residence.reverse-sale')) {
      const reversal = units.find((u) => isSaleReversal(u.status, status));
      if (reversal) {
        throw new ForbiddenException(
          `${reversal.code} is ${STATUS_LABEL[reversal.status].toLowerCase()}. Only a super admin can make a sold residence ${STATUS_LABEL[status].toLowerCase()} again.`,
        );
      }
    }

    const changed = units.filter((u) => u.status !== status);
    const bay = bayStatusFor(status);
    await this.prisma.client.$transaction([
      ...changed.map((u) => this.prisma.client.unit.update({ where: { id: u.id }, data: { status: status as DbUnitStatus } })),
      this.prisma.client.unitStatusLog.createMany({
        data: changed.map((u) => ({ unitId: u.id, from: u.status, to: status as DbUnitStatus, actor: actor.id, note: note ?? null })),
      }),
      ...(bay
        ? [
            this.prisma.client.parkingSpace.updateMany({
              where: { unitId: { in: changed.map((u) => u.id) }, status: { not: 'UNAVAILABLE' } },
              data: { status: bay },
            }),
          ]
        : []),
    ]);

    for (const u of changed) {
      await this.audit.record({
        actorId: actor.id,
        action: 'residence.status',
        entity: 'residence',
        entityId: u.id,
        target: u.code,
        summary: `${u.code} status ${STATUS_LABEL[u.status]} → ${STATUS_LABEL[status]}${note ? ` — ${note}` : ''}`,
        before: { status: u.status },
        after: { status },
        req,
      });
    }
    if (changed.length) await this.sync.changed('inventory');
    return { changed: changed.length, unchanged: units.length - changed.length };
  }

  // ─── Bulk ──────────────────────────────────────────────────────────────

  async bulk(dto: BulkResidenceDto, actor: Actor, req?: FastifyRequest) {
    const developmentId = await this.dev.id();
    const units = await this.prisma.client.unit.findMany({ where: { id: { in: dto.ids }, developmentId } });
    if (units.length !== dto.ids.length) throw new NotFoundException('Some residences were not found.');
    const codes = units.map((u) => u.code).join(', ');
    const ids = units.map((u) => u.id);

    switch (dto.action) {
      case 'status': {
        assertCan(actor, 'residence.status');
        if (!dto.status) throw new BadRequestException('Choose a status.');
        return this.changeStatus(ids, dto.status as UnitStatus, dto.note, actor, req);
      }
      case 'price': {
        assertCan(actor, 'residence.price');
        if (dto.value === undefined || !dto.priceMode) throw new BadRequestException('Choose how to change the price and by how much.');
        const nextPrice = (p: number) => {
          const v = dto.value!;
          const raw = dto.priceMode === 'set' ? v * 100 : dto.priceMode === 'percent' ? p * (1 + v / 100) : p + v * 100;
          return Math.round(raw / 100) * 100; // whole major units
        };
        const plan = units.map((u) => ({ u, to: nextPrice(u.priceMinor) }));
        const bad = plan.find((p) => p.to <= 0);
        if (bad) throw new BadRequestException(`That would make ${bad.u.code} free or negative.`);
        await this.prisma.client.$transaction([
          ...plan.map(({ u, to }) => this.prisma.client.unit.update({ where: { id: u.id }, data: { priceMinor: to } })),
          this.prisma.client.priceHistory.createMany({
            data: plan.filter((p) => p.to !== p.u.priceMinor).map(({ u, to }) => ({ unitId: u.id, fromMinor: u.priceMinor, toMinor: to, currency: u.currency, actor: actor.id, reason: dto.note ?? 'Bulk price change' })),
          }),
        ]);
        for (const { u, to } of plan) {
          if (to === u.priceMinor) continue;
          await this.audit.record({ actorId: actor.id, action: 'residence.price', entity: 'residence', entityId: u.id, target: u.code, summary: `${u.code} price ${money(u.priceMinor, u.currency)} → ${money(to, u.currency)} (bulk)`, before: { priceMinor: u.priceMinor }, after: { priceMinor: to }, req });
        }
        break;
      }
      case 'publish':
      case 'unpublish':
        assertCan(actor, 'residence.edit');
        await this.prisma.client.unit.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { published: dto.action === 'publish' } });
        break;
      case 'feature':
      case 'unfeature':
        assertCan(actor, 'residence.edit');
        await this.prisma.client.unit.updateMany({ where: { id: { in: ids } }, data: { featured: dto.action === 'feature' } });
        break;
      case 'archive':
        assertCan(actor, 'residence.delete');
        await this.prisma.client.unit.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date(), published: false, featured: false } });
        break;
      case 'restore':
        assertCan(actor, 'residence.delete');
        await this.prisma.client.unit.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } });
        break;
      case 'floor': {
        assertCan(actor, 'residence.edit');
        if (!dto.floorId) throw new BadRequestException('Choose a floor.');
        const floor = await this.ownedFloor(dto.floorId, developmentId);
        const max = await this.prisma.client.unit.aggregate({ where: { floorId: floor.id }, _max: { positionIndex: true } });
        let next = (max._max.positionIndex ?? -1) + 1;
        await this.prisma.client
          .$transaction(units.filter((u) => u.floorId !== floor.id).map((u) => this.prisma.client.unit.update({ where: { id: u.id }, data: { floorId: floor.id, positionIndex: next++ } })))
          .catch((e) => rethrowPrisma(e, { unique: `${floor.label} already has a residence with one of those codes.` }));
        break;
      }
      case 'tag':
      case 'untag': {
        assertCan(actor, 'residence.edit');
        const tag = dto.tag?.trim();
        if (!tag) throw new BadRequestException('Enter a tag.');
        await this.prisma.client.$transaction(
          units.map((u) =>
            this.prisma.client.unit.update({
              where: { id: u.id },
              data: { tags: dto.action === 'tag' ? [...new Set([...u.tags, tag])] : u.tags.filter((t) => t !== tag) },
            }),
          ),
        );
        break;
      }
    }

    if (dto.action !== 'price') {
      await this.audit.record({
        actorId: actor.id,
        action: `residence.bulk-${dto.action}`,
        entity: 'residence',
        target: codes,
        summary: `${dto.action[0]!.toUpperCase()}${dto.action.slice(1)} ${units.length} residences: ${codes}${dto.tag ? ` (${dto.tag})` : ''}`,
        rowCount: units.length,
        req,
      });
    }
    await this.sync.changed('inventory');
    return { changed: units.length };
  }

  // ─── Duplicate, archive, delete ────────────────────────────────────────

  async duplicate(id: string, dto: DuplicateResidenceDto, actor: Actor, req?: FastifyRequest) {
    const developmentId = await this.dev.id();
    const src = await this.prisma.client.unit.findFirst({
      where: { id, developmentId },
      include: { features: true, rooms: true },
    });
    if (!src) throw new NotFoundException('No such residence');
    const code = dto.code.trim();
    await this.assertCodeFree(developmentId, code);
    const floor = await this.ownedFloor(dto.floorId ?? src.floorId, developmentId);
    const max = await this.prisma.client.unit.aggregate({ where: { floorId: floor.id }, _max: { positionIndex: true } });

    const {
      id: _id, code: _code, floorId: _floorId, createdAt: _c, updatedAt: _u, features, rooms, archivedAt: _a, buyerId: _b,
      notes: _n, status: _s, published: _p, featured: _f, positionIndex: _pi, meshName: _m, ...copy
    } = src;
    const unit = await this.prisma.client.unit
      .create({
        data: {
          ...copy,
          viewTags: copy.viewTags,
          tags: copy.tags,
          code,
          floorId: floor.id,
          status: 'AVAILABLE',
          published: false,
          featured: false,
          positionIndex: (max._max.positionIndex ?? -1) + 1,
          meshName: `unit_${code.replace(/[^A-Za-z0-9]/g, '_')}`,
          features: { create: features.map((f) => ({ featureId: f.featureId, note: f.note })) },
          rooms: {
            create: rooms.map(({ id: _rid, unitId: _uid, ...r }) => ({ ...r, features: r.features })),
          },
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: `Residence code ${code} is already in use.` }));
    await this.audit.record({ actorId: actor.id, action: 'residence.duplicate', entity: 'residence', entityId: unit.id, target: unit.code, summary: `Duplicated ${src.code} as ${unit.code} (unpublished)`, req });
    return unit;
  }

  async archive(id: string, actor: Actor, req?: FastifyRequest) {
    const before = await this.owned(id, await this.dev.id());
    const unit = await this.prisma.client.unit.update({ where: { id }, data: { archivedAt: new Date(), published: false, featured: false } });
    await this.audit.record({ actorId: actor.id, action: 'residence.archive', entity: 'residence', entityId: id, target: unit.code, summary: `Archived ${unit.code} — hidden from the website`, before: { published: before.published }, req });
    await this.sync.changed('inventory');
    return unit;
  }

  async restore(id: string, actor: Actor, req?: FastifyRequest) {
    await this.owned(id, await this.dev.id());
    const unit = await this.prisma.client.unit.update({ where: { id }, data: { archivedAt: null } });
    await this.audit.record({ actorId: actor.id, action: 'residence.restore', entity: 'residence', entityId: id, target: unit.code, summary: `Restored ${unit.code} (unpublished until you publish it)`, req });
    await this.sync.changed('inventory');
    return unit;
  }

  /**
   * §42 — archive is the normal way out. Permanent deletion is for a record
   * created by mistake: archived first, never sold, and with no enquiries,
   * buyer or resident attached, so no history is lost.
   */
  async remove(id: string, actor: Actor, req?: FastifyRequest) {
    const developmentId = await this.dev.id();
    const unit = await this.prisma.client.unit.findFirst({
      where: { id, developmentId },
      include: { _count: { select: { enquiries: true, residents: true, residencies: true } }, statusLog: { where: { to: { in: ['SOLD', 'OCCUPIED'] } }, take: 1 } },
    });
    if (!unit) throw new NotFoundException('No such residence');
    if (!unit.archivedAt) throw new ConflictException(`Archive ${unit.code} first. Archiving hides it from the website and keeps its history.`);
    if (unit.statusLog.length || unit.status === 'SOLD' || unit.status === 'OCCUPIED') throw new ConflictException(`${unit.code} has a sale on record. Keep it archived.`);
    if (unit._count.enquiries || unit.buyerId || unit._count.residents || unit._count.residencies) {
      throw new ConflictException(`${unit.code} has enquiries, a buyer or residents on record. Keep it archived.`);
    }
    await this.prisma.client.$transaction([
      this.prisma.client.media.updateMany({ where: { unitId: id }, data: { unitId: null, roomId: null, isCover: false } }),
      this.prisma.client.parkingSpace.updateMany({ where: { unitId: id }, data: { unitId: null } }),
      this.prisma.client.unit.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actor.id, action: 'residence.delete', entity: 'residence', entityId: id, target: unit.code, summary: `Permanently deleted ${unit.code}`, before: { code: unit.code, priceMinor: unit.priceMinor }, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  async exportCsv(q: ResidenceQuery, actor: Actor, req?: FastifyRequest): Promise<string> {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.unit.findMany({
      where: this.where(q, developmentId),
      include: { floor: true, typology: true },
      orderBy: this.orderBy(q.sort, q.dir),
      take: 5000,
    });
    await this.audit.record({ actorId: actor.id, action: 'residence.export', entity: 'residence', summary: `Exported ${rows.length} residences`, rowCount: rows.length, req });
    const header = ['code', 'floor', 'type', 'bedrooms', 'bathrooms', 'size_sqm', 'price', 'price_now', 'price_per_sqm', 'currency', 'status', 'published', 'featured', 'tags'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((u) =>
      [
        u.code,
        u.floor.label,
        u.typology.name,
        u.bedrooms,
        u.bathrooms,
        u.areaSqm,
        u.priceMinor / 100,
        effectivePriceMinor(u) / 100,
        (pricePerSqmMinor(u.priceMinor, u.areaSqm) ?? 0) / 100,
        u.currency,
        u.status,
        u.published ? 'yes' : 'no',
        u.featured ? 'yes' : 'no',
        u.tags.join(' '),
      ]
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  // ─── Guards ────────────────────────────────────────────────────────────

  async owned(id: string, developmentId: string) {
    const unit = await this.prisma.client.unit.findFirst({ where: { id, developmentId } });
    if (!unit) throw new NotFoundException('No such residence');
    return unit;
  }

  /** §31 — a unit code is unique within the property, whatever its case. */
  private async assertCodeFree(developmentId: string, code: string, exceptId?: string) {
    const clash = await this.prisma.client.unit.findFirst({
      where: { developmentId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { code: true, archivedAt: true },
    });
    if (clash) throw new ConflictException(`Residence code ${clash.code} is already in use${clash.archivedAt ? ' by an archived residence' : ''}.`);
  }

  private async ownedFloor(id: string, developmentId: string) {
    const floor = await this.prisma.client.floor.findFirst({ where: { id, building: { developmentId } } });
    if (!floor) throw new BadRequestException('That floor does not belong to this property.');
    return floor;
  }

  private async ownedTypology(id: string, developmentId: string) {
    const t = await this.prisma.client.typology.findFirst({ where: { id, developmentId } });
    if (!t) throw new BadRequestException('That residence type does not belong to this property.');
    return t;
  }

  private async ownedPlan(id: string, developmentId: string) {
    const p = await this.prisma.client.paymentPlan.findFirst({ where: { id, developmentId } });
    if (!p) throw new BadRequestException('That payment plan does not belong to this property.');
    return p;
  }

  private async ownedBuyer(id: string, developmentId: string) {
    const b = await this.prisma.client.buyer.findFirst({ where: { id, developmentId } });
    if (!b) throw new BadRequestException('That buyer does not belong to this property.');
    return b;
  }

  private async assertFeatures(ids: string[], developmentId: string) {
    const n = await this.prisma.client.feature.count({ where: { id: { in: ids }, developmentId } });
    if (n !== new Set(ids).size) throw new BadRequestException('Some features do not belong to this property.');
  }

  /** §10 — a discount or promotion can only lower the price, never below zero. */
  private assertPricingSane(p: { priceMinor: number; discountMinor?: number | null; promoPriceMinor?: number | null }) {
    if (p.discountMinor != null && p.discountMinor >= p.priceMinor) throw new BadRequestException('The discount must be less than the price.');
    if (p.promoPriceMinor != null && p.promoPriceMinor >= p.priceMinor) throw new BadRequestException('The promotional price must be below the list price.');
  }
}
