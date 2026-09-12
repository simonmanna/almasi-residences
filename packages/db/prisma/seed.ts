/**
 * §4.6 — idempotent seed. Run it twice, get the same database.
 *
 * D-33 — the admin is the source of truth. The seed writes the FIRST state of
 * each record and never overwrites one that exists: prices, statuses,
 * amenities, FAQs and page copy edited in the admin survive a re-seed. Only
 * reference data the admin does not manage (landmarks, the time-state media
 * sets, tours) is reconciled on every run.
 *
 * Rules it enforces rather than assumes:
 *   1. Payment milestones sum to exactly 100% (§5.6 rule 5).
 *   2. Every EXTERIOR/AERIAL media set has all four time states, every
 *      INTERIOR set has at least DAY and NIGHT (§4.3). Incomplete sets throw.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPercentagesSumTo100 } from '@avida/types';
import {
  Prisma,
  type MediaSetKind,
  type TimeState,
  type UnitStatus,
} from '../generated/client/client.js';
import { prisma } from '../src/index.js';
import { contentDefaults } from './content-defaults.js';
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
  tourScenes,
  typologies,
  unitAreas,
  unitOrientations,
  unitPrices,
  viewTagsByOrientation,
} from './seed-data.js';

/**
 * Phase 0 placeholders live in the web app's public dir — see DECISIONS D-07.
 * Resolved from the package root (pnpm sets cwd there) rather than
 * `import.meta.url`, which this package cannot use — see DECISIONS D-03.
 */
const PLACEHOLDER_DIR = resolve(process.cwd(), '../../apps/web/public/seed-media');

const TIME_STATES: TimeState[] = ['DAWN', 'DAY', 'DUSK', 'NIGHT'];

/** §2.3 surface colours, so a placeholder still shows the time system working. */
const PLACEHOLDER_COLOURS: Record<TimeState, { bg: string; ink: string }> = {
  DAWN: { bg: '#DCD8D2', ink: '#2B2A2C' },
  DAY: { bg: '#E4E3DD', ink: '#232B24' },
  DUSK: { bg: '#2E3038', ink: '#E9E5DC' },
  NIGHT: { bg: '#171B26', ink: '#DFDCD4' },
};

/**
 * §4.6 — "solid-colour generated PNGs with the label baked in, so missing art
 * is obvious". SVG rather than PNG: no image dependency in the db package, and
 * it is unmistakably not a render.
 */
function writePlaceholder(setKey: string, label: string, state: TimeState): string {
  const { bg, ink } = PLACEHOLDER_COLOURS[state];
  const key = `seed-media/${setKey}-${state.toLowerCase()}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="Placeholder for ${label}, ${state.toLowerCase()}">
  <rect width="1600" height="900" fill="${bg}"/>
  <g fill="none" stroke="${ink}" stroke-opacity="0.28" stroke-width="2">
    <path d="M0 450h1600M800 0v900"/>
    <rect x="60" y="60" width="1480" height="780"/>
  </g>
  <g fill="${ink}" font-family="ui-sans-serif, system-ui, sans-serif">
    <text x="100" y="420" font-size="64">${label}</text>
    <text x="100" y="500" font-size="40" fill-opacity="0.7">${state.toLowerCase()}</text>
    <text x="100" y="800" font-size="26" fill-opacity="0.6">Placeholder — no render supplied yet. TODO(content)</text>
  </g>
</svg>`;
  mkdirSync(PLACEHOLDER_DIR, { recursive: true });
  writeFileSync(resolve(PLACEHOLDER_DIR, `${setKey}-${state.toLowerCase()}.svg`), svg, 'utf8');
  return key;
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
      description: 'Almasi Residences: 28 premium apartments in Kimihurura, Kigali. One-, two- and three-bedroom homes with pool, gym, restaurant and basement parking. Handover Q2 2028.',
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
  const statusOrder: UnitStatus[] = (['SOLD', 'ON_HOLD', 'RESERVED', 'AVAILABLE', 'OCCUPIED', 'UNAVAILABLE'] as UnitStatus[]).flatMap(
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
            fresh.status === 'SOLD' || fresh.status === 'OCCUPIED'
              ? 'SOLD'
              : fresh.status === 'RESERVED' || fresh.status === 'ON_HOLD'
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
  await prisma.landmark.deleteMany({ where: { developmentId: dev.id } });
  await prisma.landmark.createMany({ data: landmarks.map((l) => ({ ...l, developmentId: dev.id })) });
  await prisma.$executeRaw`
    UPDATE "Landmark" l
    SET "distanceM" = ROUND(
      ST_Distance(
        ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${development.longitude}::double precision,
                                ${development.latitude}::double precision), 4326)::geography
      )
    )::int
    WHERE l."developmentId" = ${dev.id}
  `;
  // Travel time is a modelled estimate (§13) — 28 km/h urban average, 4.5 km/h walking.
  await prisma.$executeRaw`
    UPDATE "Landmark"
    SET "driveMinutes" = GREATEST(1, ROUND(("distanceM" / 1000.0) / 28.0 * 60)::int),
        "walkMinutes"  = CASE WHEN "distanceM" <= 3000
                              THEN GREATEST(1, ROUND(("distanceM" / 1000.0) / 4.5 * 60)::int)
                              ELSE NULL END
    WHERE "developmentId" = ${dev.id}
  `;

  // ── Media sets and assets (time-state system) ──────────────────────────
  for (const set of mediaSets) {
    const row = await prisma.mediaSet.upsert({
      where: { developmentId_key: { developmentId: dev.id, key: set.key } },
      create: { ...set, developmentId: dev.id },
      update: { label: set.label, kind: set.kind, cameraNote: set.cameraNote },
    });
    for (const state of TIME_STATES) {
      const key = writePlaceholder(set.key, set.label, state);
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

  // ── Tours: two tours, five scenes each, hotspots forming a connected graph ─
  for (const typoSlug of ['two-bed-corner', 'penthouse-three']) {
    const typologyId = typologyBySlug.get(typoSlug)!.id;
    const tour = await prisma.tour.upsert({
      where: { developmentId_slug: { developmentId: dev.id, slug: typoSlug } },
      create: { developmentId: dev.id, typologyId, slug: typoSlug, name: `${typologies.find((t) => t.slug === typoSlug)!.name} tour` },
      update: { typologyId },
    });
    const sceneIds: string[] = [];
    for (const [i, s] of tourScenes.entries()) {
      const scene = await prisma.scene.upsert({
        where: { tourId_key: { tourId: tour.id, key: s.key } },
        create: { tourId: tour.id, key: s.key, label: s.label, sortOrder: i, yawDeg: s.yawDeg, planX: s.planX, planY: s.planY },
        update: { label: s.label, sortOrder: i, yawDeg: s.yawDeg },
      });
      sceneIds.push(scene.id);
      for (const state of ['DAY', 'NIGHT'] as TimeState[]) {
        await prisma.panoramaAsset.upsert({
          where: { sceneId_timeState: { sceneId: scene.id, timeState: state } },
          create: {
            sceneId: scene.id,
            timeState: state,
            previewKey: `seed-media/pano-${typoSlug}-${s.key}-${state.toLowerCase()}-preview.svg`,
            originalKey: `seed-media/pano-${typoSlug}-${s.key}-${state.toLowerCase()}.svg`,
            tiles: { placeholder: true, levels: [] } as Prisma.InputJsonValue,
            width: 8192,
            height: 4096,
          },
          update: {},
        });
      }
    }
    await prisma.tour.update({ where: { id: tour.id }, data: { startSceneId: sceneIds[0] } });
    // Connected graph: each scene links forward and back, so no scene is a dead end (§6.5).
    await prisma.hotspot.deleteMany({ where: { sceneId: { in: sceneIds } } });
    for (const [i, sceneId] of sceneIds.entries()) {
      const links = [sceneIds[i + 1], sceneIds[i - 1]].filter(Boolean) as string[];
      for (const [j, targetSceneId] of links.entries()) {
        await prisma.hotspot.create({
          data: {
            sceneId,
            kind: 'NAVIGATE',
            yawDeg: j === 0 ? 30 : 210,
            pitchDeg: -12,
            label: tourScenes[sceneIds.indexOf(targetSceneId)]!.label,
            targetSceneId,
          },
        });
      }
    }
  }

  // ── Buyers, for the residences already sold or held ────────────────────
  const soldOrHeld = await prisma.unit.findMany({
    where: { developmentId: dev.id, status: { in: ['SOLD', 'RESERVED', 'ON_HOLD'] }, buyerId: null },
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
  if ((await prisma.enquiry.count()) === 0) {
    const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'RESERVED', 'CONVERTED', 'LOST', 'SPAM'] as const;
    const pick = rng(4242);
    const RETENTION_MONTHS = 24; // §5.9
    for (let i = 0; i < 25; i++) {
      const createdAt = new Date(Date.UTC(2026, 2 + (i % 6), 1 + (i % 27), 9, 30));
      const purgeAfter = new Date(createdAt);
      purgeAfter.setMonth(purgeAfter.getMonth() + RETENTION_MONTHS);
      const unit = units[Math.floor(pick() * units.length)]!;
      await prisma.enquiry.create({
        data: {
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
