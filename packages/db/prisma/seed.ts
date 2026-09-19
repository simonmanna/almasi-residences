/**
 * §4.6 — idempotent seed. Run it twice, get the same database.
 *
 * D-33 — the admin is the source of truth. The seed writes the FIRST state of
 * each record and never overwrites one that exists: prices, statuses,
 * amenities, FAQs, landmarks and page copy edited in the admin survive a
 * re-seed. Only reference data the admin does not manage (the time-state
 * media sets, tours) is reconciled on every run.
 *
 * Rules it enforces rather than assumes:
 *   1. Payment milestones sum to exactly 100% (§5.6 rule 5).
 *   2. Every EXTERIOR/AERIAL media set has all four time states, every
 *      INTERIOR set has at least DAY and NIGHT (§4.3). Incomplete sets throw.
 */
import { assertPercentagesSumTo100 } from '@avida/types';
import {
  Prisma,
  type MediaSetKind,
  type TimeState,
  type UnitStatus,
} from '../generated/client/client.js';
import { prisma } from '../src/index.js';
import { contentDefaults } from './content-defaults.js';
import { planGeometry, siteFilm, siteSpecifications, siteTours } from './site-seed.js';
import {
  amenities,
  building,
  defaultPaymentPlan,
  development,
  DEV_SLUG,
  faqs,
  featuredCodes,
  features,
  featuresFor,
  floorDetails,
  floorUnitCodes,
  floorUnitTypology,
  galleries,
  landmarks,
  LEGACY_DEV_SLUGS,
  mediaSets,
  milestones,
  roomsFor,
  seedAdmins,
  statusDistribution,
  typologies,
  unitAreas,
  unitOrientations,
  unitPrices,
  viewTagsByOrientation,
} from './seed-data.js';


const TIME_STATES: TimeState[] = ['DAWN', 'DAY', 'DUSK', 'NIGHT'];

/** §2.3 surface colours, so a placeholder still shows the time system working. */
const PLACEHOLDER_COLOURS: Record<TimeState, { bg: string; ink: string }> = {
  DAWN: { bg: '#DCD8D2', ink: '#2B2A2C' },
  DAY: { bg: '#E4E3DD', ink: '#232B24' },
  DUSK: { bg: '#2E3038', ink: '#E9E5DC' },
  NIGHT: { bg: '#171B26', ink: '#DFDCD4' },
};

/**
 * The time-state media sets are reference data with no file behind them yet: a
 * key the render pipeline fills later. Nothing is written into the web app
 * (roadmap item 30 retired apps/web/public/seed-media).
 */
function placeholderKey(setKey: string, state: TimeState): string {
  return `placeholder/${setKey}-${state.toLowerCase()}`;
}

/** §4.3 — a set missing a required time state is a launch bug. Fail at seed. */
function requiredStates(kind: MediaSetKind): TimeState[] {
  if (kind === 'EXTERIOR' || kind === 'AERIAL') return TIME_STATES;
  if (kind === 'INTERIOR') return ['DAY', 'NIGHT'];
  return ['DAY'];
}

/**
 * Deterministic pseudo-random, so two seed runs produce identical data and the
 * fixtures are stable across machines. Mulberry32.
 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Removes the Phase 0 placeholder development (D-15) and everything under it. */
async function removeLegacyDevelopments() {
  for (const slug of LEGACY_DEV_SLUGS) {
    const legacy = await prisma.development.findUnique({ where: { slug }, select: { id: true } });
    if (!legacy) continue;
    // Units first: a floor refuses to go while residences stand on it (D-34).
    await prisma.unit.deleteMany({ where: { developmentId: legacy.id } });
    await prisma.development.delete({ where: { id: legacy.id } });
    console.log(`› removed placeholder development "${slug}"`);
  }
}

async function main() {
  console.log('› seeding');

  assertPercentagesSumTo100(
    milestones.map((m) => ({
      id: String(m.sortOrder),
      sortOrder: m.sortOrder,
      label: m.label,
      percent: m.percent,
      triggerType: m.triggerType,
    })),
  );

  const totalUnits = Object.values(statusDistribution).reduce((a, b) => a + b, 0);
  if (totalUnits !== 28) {
    throw new Error(`Almasi has 28 units, status distribution sums to ${totalUnits}`);
  }

  await removeLegacyDevelopments();

  // ── Development ────────────────────────────────────────────────────────
  // Created once; afterwards Property overview in the admin owns every field.
  const dev = await prisma.development.upsert({
    where: { slug: DEV_SLUG },
    create: { ...development, status: 'SELLING' },
    update: {},
  });
  // Fill the fields the admin platform added, where an older row lacks them.
  await prisma.development.update({
    where: { id: dev.id },
    data: {
      buildingConfig: dev.buildingConfig ?? development.buildingConfig,
      officeAddress: dev.officeAddress ?? development.officeAddress,
      contactPhone: dev.contactPhone ?? (process.env.NEXT_PUBLIC_SALES_PHONE || null),
      contactEmail: dev.contactEmail ?? (process.env.NEXT_PUBLIC_SALES_EMAIL || null),
      whatsappNumber: dev.whatsappNumber ?? (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null),
    },
  });

  await prisma.seoMeta.upsert({
    where: { developmentId: dev.id },
    create: {
      developmentId: dev.id,
      title: `${development.name} — Premium apartments in Kimihurura, Kigali`,
      description: 'Almasi Residences: {total} residences in Kimihurura, Kigali. One-, two- and three-bedroom homes and penthouses with a pool, gym, restaurant and basement parking. Handover {handover}.',
      keywords: ['Kigali apartments', 'Kimihurura', 'off-plan', 'Rwanda real estate', 'Almasi Residences', 'premium apartments Kigali'],
    },
    update: {},
  });

  // ── Residence types ────────────────────────────────────────────────────
  const typologyBySlug = new Map<string, { id: string; bedrooms: number; bathrooms: number; isPenthouse: boolean }>();
  for (const [i, t] of typologies.entries()) {
    const existing = await prisma.typology.findUnique({
      where: { developmentId_slug: { developmentId: dev.id, slug: t.slug } },
    });
    const row = existing
      ? await prisma.typology.update({
          where: { id: existing.id },
          // Only the columns the platform added; the admin owns the rest.
          data: existing.sortOrder === 0 && i > 0 ? { isPenthouse: t.isPenthouse, sortOrder: i } : {},
        })
      : await prisma.typology.create({
          data: {
            developmentId: dev.id,
            slug: t.slug,
            name: t.name,
            bedrooms: t.bedrooms,
            bathrooms: t.bathrooms,
            areaSqmMin: t.areaSqmMin,
            areaSqmMax: t.areaSqmMax,
            descriptionMd: t.descriptionMd,
            isPenthouse: t.isPenthouse,
            sortOrder: i,
          },
        });
    typologyBySlug.set(t.slug, row);
  }

  // The homepage card line per type, once, where the admin has not written one.
  const TYPE_SUMMARY = {
    one: 'An open living and dining room, a bedroom behind a full-height door, and a balcony of its own.',
    two: 'Two bedrooms and two bathrooms, the main suite with a walk-in wardrobe, the living room onto the balcony.',
    three: 'Three bedrooms for a family, with room to entertain and a balcony onto the hills.',
    penthouse: 'The top floor, from wrap-around glass to a duplex with its own roof terrace and pool.',
  } as const;
  for (const t of await prisma.typology.findMany({ where: { developmentId: dev.id, summary: null } })) {
    const kind = t.isPenthouse ? 'penthouse' : t.bedrooms <= 1 ? 'one' : t.bedrooms === 2 ? 'two' : 'three';
    await prisma.typology.update({ where: { id: t.id }, data: { summary: TYPE_SUMMARY[kind] } });
  }

  // ── Payment plan ───────────────────────────────────────────────────────
  let plan = await prisma.paymentPlan.findFirst({ where: { developmentId: dev.id, isDefault: true } });
  if (!plan) {
    plan = await prisma.paymentPlan.create({
      data: { developmentId: dev.id, isDefault: true, ...defaultPaymentPlan },
    });
  } else if (!plan.description) {
    plan = await prisma.paymentPlan.update({
      where: { id: plan.id },
      data: {
        description: defaultPaymentPlan.description,
        depositPercent: plan.depositPercent ?? defaultPaymentPlan.depositPercent,
        installmentCount: plan.installmentCount ?? defaultPaymentPlan.installmentCount,
      },
    });
  }
  if ((await prisma.paymentMilestone.count({ where: { paymentPlanId: plan.id } })) === 0) {
    await prisma.paymentMilestone.createMany({
      data: milestones.map((m) => ({ ...m, developmentId: dev.id, paymentPlanId: plan.id })),
    });
  }

  // ── Building, floors, residences ───────────────────────────────────────
  const existingBuilding = await prisma.building.findFirst({ where: { developmentId: dev.id } });
  const bld = existingBuilding ?? (await prisma.building.create({ data: { ...building, developmentId: dev.id } }));

  // Floor −1 is the basement (parking, storage, plant rooms). No sellable units.
  // Floor 0 is the ground floor (lobby, restaurant, co-working). The brief
  // describes a B+G+4 building, which in level terms is −1 through 4.
  const FLOOR_HEIGHT_M = 3.2;
  const LEVELS = [-1, ...Array.from({ length: building.floorCount }, (_, i) => i)];
  for (const level of LEVELS) {
    const label =
      level === -1 ? 'Basement' : level === 0 ? building.groundLabel : level === building.floorCount - 1 ? 'Penthouse' : `Floor ${level}`;
    const details = floorDetails[level];
    const existing = await prisma.floor.findUnique({ where: { buildingId_level: { buildingId: bld.id, level } } });
    if (!existing) {
      await prisma.floor.create({
        data: {
          buildingId: bld.id,
          level,
          label,
          heightM: (level + 1) * FLOOR_HEIGHT_M,
          displayName: details?.displayName ?? null,
          description: details?.description ?? null,
          sortOrder: level,
        },
      });
    } else if (existing.description === null && details) {
      await prisma.floor.update({
        where: { id: existing.id },
        data: { description: details.description, displayName: existing.displayName ?? details.displayName ?? null, sortOrder: level },
      });
    }
  }
  const floors = await prisma.floor.findMany({ where: { buildingId: bld.id }, orderBy: { level: 'asc' } });

  // Units are defined explicitly by the brief's apartment schedule — not generated.
  const planned = floors.flatMap((floor) => {
    const codes = floorUnitCodes[floor.level];
    if (!codes) return [];
    return codes.map((code, positionIndex) => {
      const typologySlug = floorUnitTypology[code]!;
      const typo = typologies.find((x) => x.slug === typologySlug)!;
      // Height premium: 1.5% per floor above ground. Deterministic.
      const premium = 1 + Math.max(0, floor.level) * 0.015;
      const priceMinor = unitPrices[code] ?? Math.round((typo.basePriceMinor * premium) / 1000) * 1000;
      return {
        level: floor.level,
        code,
        typologySlug,
        positionIndex,
        orientation: unitOrientations[code]!,
        areaSqm: unitAreas[code]!,
        priceMinor,
        widthRatio: typo.widthRatio,
      };
    });
  });
  if (planned.length !== 28) throw new Error(`Planned ${planned.length} units, expected 28`);

  // Status assignment: sold from the bottom up (that is how buildings sell).
  const statusOrder: UnitStatus[] = (['SOLD', 'BOOKED', 'RESERVED', 'AVAILABLE', 'UNAVAILABLE'] as UnitStatus[]).flatMap(
    (s) => Array<UnitStatus>(statusDistribution[s]).fill(s),
  );
  const byHeight = [...planned].sort((a, b) => a.level - b.level || a.positionIndex - b.positionIndex);

  let createdUnits = 0;
  for (const [i, p] of byHeight.entries()) {
    const floor = floors.find((f) => f.level === p.level)!;
    const typo = typologyBySlug.get(p.typologySlug)!;
    const existing = await prisma.unit.findUnique({ where: { developmentId_code: { developmentId: dev.id, code: p.code } } });
    if (existing) continue; // the admin owns it now
    const balconySqm = Math.round(p.areaSqm * 0.12 * 10) / 10;
    await prisma.unit.create({
      data: {
        developmentId: dev.id,
        floorId: floor.id,
        typologyId: typo.id,
        code: p.code,
        status: statusOrder[i]!,
        priceMinor: p.priceMinor,
        currency: development.currency,
        bedrooms: typo.bedrooms,
        bathrooms: typo.bathrooms,
        areaSqm: p.areaSqm,
        interiorSqm: Math.round((p.areaSqm - balconySqm) * 10) / 10,
        balconySqm: typo.isPenthouse ? null : balconySqm,
        terraceSqm: typo.isPenthouse ? balconySqm : null,
        parkingIncluded: typo.isPenthouse ? 2 : 1,
        hasStorage: true,
        orientation: p.orientation,
        viewTags: viewTagsByOrientation[p.orientation],
        positionIndex: p.positionIndex,
        widthRatio: p.widthRatio,
        meshName: `unit_${p.code.replace('-', '_')}`,
        paymentPlanId: plan.id,
        featured: featuredCodes.includes(p.code),
      },
    });
    createdUnits++;
  }

  // Residences from before the platform: fill what the migration could not know.
  const units = await prisma.unit.findMany({
    where: { developmentId: dev.id },
    include: { typology: true, _count: { select: { rooms: true, features: true } } },
  });
  for (const u of units) {
    if (u.paymentPlanId === null && u.interiorSqm === null) {
      const penthouse = u.typology.isPenthouse;
      const outdoor = u.balconySqm ?? Math.round(u.areaSqm * 0.12 * 10) / 10;
      await prisma.unit.update({
        where: { id: u.id },
        data: {
          paymentPlanId: plan.id,
          interiorSqm: Math.round((u.areaSqm - outdoor) * 10) / 10,
          balconySqm: penthouse ? null : outdoor,
          terraceSqm: penthouse ? outdoor : null,
          parkingIncluded: penthouse ? 2 : 1,
          hasStorage: true,
          featured: featuredCodes.includes(u.code),
        },
      });
    }
  }

  // ── Features ───────────────────────────────────────────────────────────
  for (const [i, f] of features.entries()) {
    await prisma.feature.upsert({
      where: { developmentId_name: { developmentId: dev.id, name: f.name } },
      create: { ...f, developmentId: dev.id, sortOrder: i },
      update: {},
    });
  }
  const featureIds = new Map(
    (await prisma.feature.findMany({ where: { developmentId: dev.id } })).map((f) => [f.name, f.id]),
  );

  // ── Rooms & residence features, for residences that have none yet ─────
  for (const u of units) {
    if (u._count.rooms === 0) {
      const interior = u.interiorSqm ?? u.areaSqm * 0.88;
      const outdoor = (u.balconySqm ?? 0) + (u.terraceSqm ?? 0) || u.areaSqm * 0.12;
      await prisma.room.createMany({
        data: roomsFor(u.bedrooms, u.bathrooms, u.typology.isPenthouse).map((r, i) => ({
          unitId: u.id,
          name: r.name,
          type: r.type,
          areaSqm: r.share === 0 ? Math.round(outdoor * 10) / 10 : Math.round(interior * r.share * 10) / 10,
          sortOrder: i,
        })),
      });
    }
    if (u._count.features === 0) {
      await prisma.unitFeature.createMany({
        data: featuresFor(u.typology.slug)
          .map((name) => featureIds.get(name))
          .filter((id): id is string => Boolean(id))
          .map((featureId) => ({ unitId: u.id, featureId })),
        skipDuplicates: true,
      });
    }
  }

  // ── Room plan geometry, for residences whose rooms have no position yet ─
  // Assigned by room type and order; the admin edits each rectangle afterwards.
  for (const u of await prisma.unit.findMany({
    where: { developmentId: dev.id, rooms: { every: { planX: null } } },
    include: { typology: true, rooms: { orderBy: { sortOrder: 'asc' } } },
  })) {
    const kind = u.typology.isPenthouse ? 'penthouse' : u.bedrooms <= 1 ? 'one' : u.bedrooms === 2 ? 'two' : 'three';
    const pool = [...planGeometry[kind]];
    for (const room of u.rooms) {
      const outside = room.type === 'BALCONY' || room.type === 'TERRACE';
      const at = pool.findIndex((r) => r.type === room.type || (outside && (r.type === 'BALCONY' || r.type === 'TERRACE')));
      if (at === -1) continue;
      const r = pool.splice(at, 1)[0]!;
      await prisma.room.update({ where: { id: room.id }, data: { planX: r.x, planY: r.y, planW: r.w, planH: r.h, planOpen: Boolean(r.open) } });
    }
  }

  // ── Specification ──────────────────────────────────────────────────────
  if ((await prisma.specification.count({ where: { developmentId: dev.id } })) === 0) {
    await prisma.specification.createMany({
      data: siteSpecifications.map((x, i) => ({ ...x, developmentId: dev.id, sortOrder: i })),
    });
  }

  // ── Amenities ──────────────────────────────────────────────────────────
  // Pre-platform amenities had no slug. If that is all there is, replace them
  // with the brief's ten; once any amenity has a slug the admin owns the list.
  const withSlug = await prisma.amenity.count({ where: { developmentId: dev.id, slug: { not: null } } });
  if (withSlug === 0) {
    await prisma.amenity.deleteMany({ where: { developmentId: dev.id } });
    await prisma.amenity.createMany({
      data: amenities.map((a, i) => ({
        ...a,
        specifications: (a.specifications ?? []) as Prisma.InputJsonValue,
        developmentId: dev.id,
        sortOrder: i,
      })),
    });
  }

  if ((await prisma.faq.count({ where: { developmentId: dev.id } })) === 0) {
    await prisma.faq.createMany({ data: faqs.map((f, i) => ({ ...f, developmentId: dev.id, sortOrder: i })) });
  }

  // ── Parking: one bay per included space, plus visitor bays ─────────────
  if ((await prisma.parkingSpace.count({ where: { developmentId: dev.id } })) === 0) {
    const sorted = [...units].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
    let n = 0;
    const bays: Prisma.ParkingSpaceCreateManyInput[] = [];
    for (const u of sorted) {
      const fresh = await prisma.unit.findUniqueOrThrow({ where: { id: u.id }, select: { status: true, parkingIncluded: true } });
      for (let k = 0; k < Math.max(1, fresh.parkingIncluded); k++) {
        n++;
        bays.push({
          developmentId: dev.id,
          code: `P-${String(n).padStart(2, '0')}`,
          level: 'Basement',
          type: n % 10 === 0 ? 'EV' : 'STANDARD',
          sizeSqm: 12.5,
          unitId: u.id,
          status:
            fresh.status === 'SOLD'
              ? 'SOLD'
              : fresh.status === 'RESERVED' || fresh.status === 'BOOKED'
                ? 'RESERVED'
                : 'ASSIGNED',
        });
      }
    }
    for (let v = 1; v <= 6; v++) {
      bays.push({
        developmentId: dev.id,
        code: `V-${String(v).padStart(2, '0')}`,
        level: 'Ground',
        type: v === 1 ? 'ACCESSIBLE' : 'VISITOR',
        sizeSqm: v === 1 ? 18 : 12.5,
        status: 'AVAILABLE',
      });
    }
    await prisma.parkingSpace.createMany({ data: bays });
  }

  // ── Galleries (images are added by `pnpm media:import`) ─────────────────
  for (const [i, g] of galleries.entries()) {
    await prisma.gallery.upsert({
      where: { developmentId_slug: { developmentId: dev.id, slug: g.slug } },
      create: { ...g, developmentId: dev.id, sortOrder: i },
      update: {},
    });
  }

  // ── Website content: fill any key that is missing, never overwrite ─────
  for (const [key, page] of Object.entries(contentDefaults)) {
    const existing = await prisma.contentPage.findUnique({
      where: { developmentId_key: { developmentId: dev.id, key } },
    });
    const current = (existing?.content ?? {}) as Record<string, unknown>;
    const merged = { ...page.content, ...current };
    if (!existing) {
      await prisma.contentPage.create({
        data: { developmentId: dev.id, key, title: page.title, content: merged as Prisma.InputJsonValue },
      });
    } else if (Object.keys(merged).length !== Object.keys(current).length) {
      await prisma.contentPage.update({ where: { id: existing.id }, data: { content: merged as Prisma.InputJsonValue } });
    }
  }

  // ── Landmarks, with PostGIS distances (§4.5 — never computed in JS) ─────
  // Written once; after that they are edited under Website → Location.
  if ((await prisma.landmark.count({ where: { developmentId: dev.id } })) === 0) {
    await prisma.landmark.createMany({ data: landmarks.map((l) => ({ ...l, developmentId: dev.id })) });
  }
  await prisma.$executeRaw`
    UPDATE "Landmark" l
    SET "distanceM" = ROUND(
      ST_Distance(
        ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${development.longitude}::double precision,
                                ${development.latitude}::double precision), 4326)::geography
      )
    )::int
    WHERE l."developmentId" = ${dev.id} AND NOT l."manualDistance"
  `;
  // Travel time is a modelled estimate (§13) — 28 km/h urban average, 4.5 km/h walking.
  await prisma.$executeRaw`
    UPDATE "Landmark"
    SET "driveMinutes" = GREATEST(1, ROUND(("distanceM" / 1000.0) / 28.0 * 60)::int),
        "walkMinutes"  = CASE WHEN "distanceM" <= 3000
                              THEN GREATEST(1, ROUND(("distanceM" / 1000.0) / 4.5 * 60)::int)
                              ELSE NULL END
    WHERE "developmentId" = ${dev.id} AND NOT "manualDistance"
  `;

  // ── Media sets and assets (time-state system) ──────────────────────────
  for (const set of mediaSets) {
    const row = await prisma.mediaSet.upsert({
      where: { developmentId_key: { developmentId: dev.id, key: set.key } },
      create: { ...set, developmentId: dev.id },
      update: { label: set.label, kind: set.kind, cameraNote: set.cameraNote },
    });
    for (const state of TIME_STATES) {
      const key = placeholderKey(set.key, state);
      await prisma.mediaAsset.upsert({
        where: { mediaSetId_timeState_role: { mediaSetId: row.id, timeState: state, role: 'PRIMARY' } },
        create: {
          mediaSetId: row.id,
          timeState: state,
          role: 'PRIMARY',
          originalKey: key,
          width: 1600,
          height: 900,
          variants: { placeholder: true, svg: key } as Prisma.InputJsonValue,
          thumbhash: '',
          dominantHex: PLACEHOLDER_COLOURS[state].bg,
          altText: `${set.label}, ${state.toLowerCase()}. Placeholder image.`,
        },
        update: { originalKey: key, dominantHex: PLACEHOLDER_COLOURS[state].bg },
      });
    }
  }
  for (const set of await prisma.mediaSet.findMany({ where: { developmentId: dev.id }, include: { assets: true } })) {
    const have = new Set(set.assets.map((a) => a.timeState));
    const missing = requiredStates(set.kind).filter((s) => !have.has(s));
    if (missing.length > 0) {
      throw new Error(`Media set "${set.key}" (${set.kind}) is missing time states: ${missing.join(', ')} (§4.3)`);
    }
  }

  // ── Walkthroughs and the film: words only, media attached by the importer ─
  // The phase-0 panorama tours were placeholder SVGs no page ever read.
  await prisma.tour.deleteMany({ where: { developmentId: dev.id, slug: { in: ['two-bed-corner', 'penthouse-three'] } } });
  for (const [i, t] of siteTours.entries()) {
    const tour = await prisma.tour.upsert({
      where: { developmentId_slug: { developmentId: dev.id, slug: t.slug } },
      create: { developmentId: dev.id, slug: t.slug, name: t.name, description: t.description, sortOrder: i },
      update: {},
    });
    if ((await prisma.scene.count({ where: { tourId: tour.id } })) === 0) {
      for (const [j, st] of t.stations.entries()) {
        await prisma.scene.create({
          data: { tourId: tour.id, key: st.key, label: st.title, place: st.place, body: st.body, sortOrder: j, ...(st.level ? { level: st.level } : {}) },
        });
      }
    }
  }
  const film = await prisma.videoAsset.findFirst({ where: { developmentId: dev.id } });
  if (!film) {
    await prisma.videoAsset.create({
      data: {
        developmentId: dev.id,
        key: siteFilm.key,
        label: siteFilm.label,
        description: siteFilm.description,
        kind: 'WALKTHROUGH',
        posterKey: '',
        durationSec: siteFilm.durationSec,
        width: 1920,
        height: 1080,
        chapters: { create: siteFilm.chapters.map((c, i) => ({ ...c, sortOrder: i })) },
      },
    });
  }

  // ── Buyers, for the residences already sold or held ────────────────────
  const soldOrHeld = await prisma.unit.findMany({
    where: { developmentId: dev.id, status: { in: ['SOLD', 'RESERVED', 'BOOKED'] }, buyerId: null },
    orderBy: { code: 'asc' },
  });
  if ((await prisma.buyer.count({ where: { developmentId: dev.id } })) === 0) {
    for (const [i, u] of soldOrHeld.entries()) {
      const stage = u.status === 'SOLD' ? 'BUYER' : 'RESERVATION';
      const buyer = await prisma.buyer.create({
        data: {
          developmentId: dev.id,
          fullName: `Seed buyer ${i + 1}`,
          email: `seed-buyer-${i + 1}@example.invalid`,
          phone: `+25078${String(2000000 + i).slice(0, 7)}`,
          countryIso: i % 3 === 0 ? 'KE' : 'RW',
          stage,
          source: i % 2 === 0 ? 'Website enquiry' : 'Referral',
          notes: 'Placeholder buyer created by the seed. TODO(content)',
          interests: { create: [{ unitId: u.id }] },
        },
      });
      await prisma.unit.update({ where: { id: u.id }, data: { buyerId: buyer.id } });
    }
  }

  // ── Enquiries: 25 across all statuses (§4.6), only into an empty inbox ──
  if ((await prisma.enquiry.count({ where: { developmentId: dev.id } })) === 0) {
    const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'SOLD', 'LOST', 'SPAM'] as const;
    const pick = rng(4242);
    const RETENTION_MONTHS = 24; // §5.9
    for (let i = 0; i < 25; i++) {
      const createdAt = new Date(Date.UTC(2026, 2 + (i % 6), 1 + (i % 27), 9, 30));
      const purgeAfter = new Date(createdAt);
      purgeAfter.setMonth(purgeAfter.getMonth() + RETENTION_MONTHS);
      const unit = units[Math.floor(pick() * units.length)]!;
      await prisma.enquiry.create({
        data: {
          developmentId: dev.id,
          name: `Seed enquirer ${i + 1}`,
          email: `seed-enquirer-${i + 1}@example.invalid`,
          phone: `+25078${String(1000000 + i).slice(0, 7)}`,
          countryIso: 'RW',
          message: i % 3 === 0 ? 'Placeholder enquiry message. TODO(content)' : null,
          intent: i % 4 === 0 ? 'VIEWING' : 'INFORMATION',
          source: ['unit-panel', 'footer', 'floating-cta'][i % 3]!,
          utmSource: i % 2 === 0 ? 'google' : 'direct',
          utmMedium: i % 2 === 0 ? 'cpc' : null,
          landingPath: '/',
          status: statuses[i % statuses.length]!,
          createdAt,
          purgeAfter,
          units: { create: [{ unitId: unit.id }] },
        },
      });
    }
  }

  // ── Admin users ────────────────────────────────────────────────────────
  // §5.9 — TOTP is mandatory in production; the seed accounts have no secret
  // enrolled, and AuthService refuses a TOTP-less login when NODE_ENV is
  // production. They exist so the platform is usable locally, not to ship — so
  // a production seed skips them; apps/api/scripts/create-admin.mjs makes real ones.
  if (process.env.NODE_ENV !== 'production') {
    const { hash } = await import('@node-rs/argon2');
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'phase-one-local-only';
    const passwordHash = await hash(seedPassword);
    for (const [email, name, role] of seedAdmins) {
      await prisma.adminUser.upsert({
        where: { email },
        create: { email, name, role, passwordHash },
        update: { passwordHash },
      });
    }
  }

  const counts = await prisma.unit.groupBy({ by: ['status'], where: { developmentId: dev.id }, _count: true });
  console.log(`› residences created this run: ${createdUnits}`);
  console.log('› residences by status:', Object.fromEntries(counts.map((c) => [c.status, c._count])));
  console.log(`› seeded ${development.name} (${DEV_SLUG})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
