/**
 * §4.6 — idempotent seed. Run it twice, get the same database.
 *
 * Two rules it enforces rather than assumes, because both are cheap here and
 * expensive at launch:
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
  type Orientation,
  type TimeState,
  type UnitStatus,
} from '../generated/client/client.js';
import { prisma } from '../src/index.js';
import {
  amenities,
  building,
  development,
  DEV_SLUG,
  faqs,
  floorUnitCodes,
  floorUnitTypology,
  landmarks,
  mediaSets,
  milestones,
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

  // ── Development ────────────────────────────────────────────────────────
  // Almasi Residences — real project data replaces the old seed-dev fixture.
  const dev = await prisma.development.upsert({
    where: { slug: DEV_SLUG },
    create: { ...development, totalUnits, status: 'SELLING' },
    update: { ...development, totalUnits, status: 'SELLING' },
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

  // ── Typologies ─────────────────────────────────────────────────────────
  const typologyByslug = new Map<string, string>();
  for (const t of typologies) {
    const row = await prisma.typology.upsert({
      where: { developmentId_slug: { developmentId: dev.id, slug: t.slug } },
      create: {
        developmentId: dev.id,
        slug: t.slug,
        name: t.name,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
        areaSqmMin: t.areaSqmMin,
        areaSqmMax: t.areaSqmMax,
        descriptionMd: t.descriptionMd,
      },
      update: { name: t.name, areaSqmMin: t.areaSqmMin, areaSqmMax: t.areaSqmMax },
    });
    typologyByslug.set(t.slug, row.id);
  }

  // ── Building, floors, units ────────────────────────────────────────────
  const existingBuilding = await prisma.building.findFirst({
    where: { developmentId: dev.id, name: building.name },
  });
  const bld = existingBuilding
    ? await prisma.building.update({ where: { id: existingBuilding.id }, data: building })
    : await prisma.building.create({ data: { ...building, developmentId: dev.id } });

  // Floor −1 is the basement (parking, storage, plant rooms). No sellable units.
  // Floor 0 is the ground floor (lobby, restaurant, co-working). Sanity: the
  // brief describes a B+G+4 building, which in level terms is −1 through 4.
  const FLOOR_HEIGHT_M = 3.2;
  // floorCount counts ground + 4, so the storeys above the basement are 0 … floorCount − 1.
  const LEVELS = [-1, ...Array.from({ length: building.floorCount }, (_, i) => i)]; // [-1, 0, 1, 2, 3, 4]
  for (const level of LEVELS) {
    const label =
      level === -1
        ? 'Basement'
        : level === 0
          ? building.groundLabel
          : level === building.floorCount - 1
            ? 'Penthouse'
            : `Floor ${level}`;
    await prisma.floor.upsert({
      where: { buildingId_level: { buildingId: bld.id, level } },
      create: { buildingId: bld.id, level, label, heightM: (level + 1) * FLOOR_HEIGHT_M },
      update: { label, heightM: (level + 1) * FLOOR_HEIGHT_M },
    });
  }
  const floors = await prisma.floor.findMany({ where: { buildingId: bld.id }, orderBy: { level: 'asc' } });

  // Units are defined explicitly by the brief's apartment schedule — not generated.
  // floorUnitCodes and floorUnitTypology in seed-data.ts enumerate all 28.
  const planned = floors.flatMap((floor) => {
    const codes = floorUnitCodes[floor.level];
    if (!codes) return [];
    return codes.map((code, positionIndex) => {
      const typologySlug = floorUnitTypology[code]!;
      const areaSqm = unitAreas[code]!;
      const orientation = unitOrientations[code]!;
      // Height premium: 1.5% per floor above ground. Deterministic.
      const premium = 1 + Math.max(0, floor.level) * 0.015;
      const base = typologies.find((x) => x.slug === typologySlug)!.basePriceMinor;
      const priceMinor = unitPrices[code] ?? Math.round((base * premium) / 1000) * 1000;
      return {
        level: floor.level,
        code,
        typologySlug,
        positionIndex,
        orientation,
        areaSqm,
        priceMinor,
        widthRatio: typologies.find((x) => x.slug === typologySlug)!.widthRatio,
      };
    });
  });

  if (planned.length !== 28) {
    throw new Error(`Planned ${planned.length} units, expected 28`);
  }

  // Status assignment: sold from the bottom up (that is how buildings sell),
  // available concentrated higher. Deterministic — the same unit gets the same
  // status on every seed run. Ground floor mostly sold/reserved, penthouses
  // available.
  const statusOrder: UnitStatus[] = [
    ...Array<UnitStatus>(statusDistribution.SOLD).fill('SOLD'),
    ...Array<UnitStatus>(statusDistribution.BOOKED).fill('BOOKED'),
    ...Array<UnitStatus>(statusDistribution.RESERVED).fill('RESERVED'),
    ...Array<UnitStatus>(statusDistribution.AVAILABLE).fill('AVAILABLE'),
    ...Array<UnitStatus>(statusDistribution.NOT_RELEASED).fill('NOT_RELEASED'),
  ];
  // Sort by floor ascending (basement excluded, ground first) so lower floors
  // sell first.
  const byHeight = [...planned].sort(
    (a, b) => a.level - b.level || a.positionIndex - b.positionIndex,
  );

  for (const [i, p] of byHeight.entries()) {
    const floor = floors.find((f) => f.level === p.level)!;
    const status = statusOrder[i]!;
    const data = {
      typologyId: typologyByslug.get(p.typologySlug)!,
      status,
      priceMinor: p.priceMinor,
      currency: development.currency,
      areaSqm: p.areaSqm,
      balconySqm: Math.round(p.areaSqm * 0.12 * 10) / 10,
      orientation: p.orientation,
      viewTags: viewTagsByOrientation[p.orientation],
      positionIndex: p.positionIndex,
      widthRatio: p.widthRatio,
      meshName: `unit_${p.code.replace('-', '_')}`,
    };
    await prisma.unit.upsert({
      where: { floorId_code: { floorId: floor.id, code: p.code } },
      create: { floorId: floor.id, code: p.code, ...data },
      update: data,
    });
  }

  // ── Commercial ─────────────────────────────────────────────────────────
  await prisma.paymentMilestone.deleteMany({ where: { developmentId: dev.id } });
  await prisma.paymentMilestone.createMany({
    data: milestones.map((m) => ({ ...m, developmentId: dev.id })),
  });

  await prisma.amenity.deleteMany({ where: { developmentId: dev.id } });
  await prisma.amenity.createMany({
    data: amenities.map((a, i) => ({ ...a, developmentId: dev.id, sortOrder: i })),
  });

  await prisma.faq.deleteMany({ where: { developmentId: dev.id } });
  await prisma.faq.createMany({
    data: faqs.map((f, i) => ({ ...f, developmentId: dev.id, sortOrder: i })),
  });

  // ── Landmarks, with PostGIS distances (§4.5 — never computed in JS) ─────
  await prisma.landmark.deleteMany({ where: { developmentId: dev.id } });
  await prisma.landmark.createMany({
    data: landmarks.map((l) => ({ ...l, developmentId: dev.id })),
  });
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

  // ── Media sets and assets ──────────────────────────────────────────────
  for (const set of mediaSets) {
    const row = await prisma.mediaSet.upsert({
      where: { developmentId_key: { developmentId: dev.id, key: set.key } },
      create: { ...set, developmentId: dev.id },
      update: { label: set.label, kind: set.kind, cameraNote: set.cameraNote },
    });

    // §4.6 asks for four sets × four states = sixteen placeholder assets, so
    // every set gets all four here. requiredStates() below stays the minimum
    // the real renders must meet (§4.3), which is a lower bar for interiors.
    for (const state of TIME_STATES) {
      const key = writePlaceholder(set.key, set.label, state);
      await prisma.mediaAsset.upsert({
        where: {
          mediaSetId_timeState_role: { mediaSetId: row.id, timeState: state, role: 'PRIMARY' },
        },
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

  // §4.3 — verify completeness rather than trusting the loop above.
  for (const set of await prisma.mediaSet.findMany({
    where: { developmentId: dev.id },
    include: { assets: true },
  })) {
    const have = new Set(set.assets.map((a) => a.timeState));
    const missing = requiredStates(set.kind).filter((s) => !have.has(s));
    if (missing.length > 0) {
      throw new Error(
        `Media set "${set.key}" (${set.kind}) is missing time states: ${missing.join(', ')} (§4.3)`,
      );
    }
  }

  // ── Tours: two tours, five scenes each, hotspots forming a connected graph ─
  for (const typoSlug of ['two-bed-corner', 'penthouse-three']) {
    const typologyId = typologyByslug.get(typoSlug)!;
    const tour = await prisma.tour.upsert({
      where: { developmentId_slug: { developmentId: dev.id, slug: typoSlug } },
      create: {
        developmentId: dev.id,
        typologyId,
        slug: typoSlug,
        name: `${typologies.find((t) => t.slug === typoSlug)!.name} tour`,
      },
      update: { typologyId },
    });

    const sceneIds: string[] = [];
    for (const [i, s] of tourScenes.entries()) {
      const scene = await prisma.scene.upsert({
        where: { tourId_key: { tourId: tour.id, key: s.key } },
        create: {
          tourId: tour.id,
          key: s.key,
          label: s.label,
          sortOrder: i,
          yawDeg: s.yawDeg,
          planX: s.planX,
          planY: s.planY,
        },
        update: { label: s.label, sortOrder: i, yawDeg: s.yawDeg },
      });
      sceneIds.push(scene.id);

      // Panorama placeholders: DAY and NIGHT, per §4.3's interior minimum.
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

    // Connected graph: each scene links forward and back, so no scene is a
    // dead end and a keyboard user can reach every node (§6.5).
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

  // ── Enquiries: 25 across all statuses (§4.6) ────────────────────────────
  const units = await prisma.unit.findMany({ where: { floor: { buildingId: bld.id } }, take: 28 });
  const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'SPAM'] as const;
  const pick = rng(4242);
  const RETENTION_MONTHS = 24; // §5.9

  await prisma.enquiryUnit.deleteMany({});
  await prisma.enquiry.deleteMany({});
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

  // ── Admin users ────────────────────────────────────────────────────────
  // §5.9 — TOTP is mandatory in production; the seed accounts have no secret
  // enrolled, and AuthService refuses a TOTP-less login when NODE_ENV is
  // production. They exist so Phase 1 is usable locally, not to ship — so a
  // production seed skips them; apps/api/scripts/create-admin.mjs makes real ones.
  if (process.env.NODE_ENV !== 'production') {
    const { hash } = await import('@node-rs/argon2');
    const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'phase-one-local-only';
    const passwordHash = await hash(seedPassword);
    for (const [email, name, role] of [
      ['owner@example.invalid', 'Seed owner', 'OWNER'],
      ['sales@example.invalid', 'Seed sales agent', 'SALES'],
    ] as const) {
      await prisma.adminUser.upsert({
        where: { email },
        create: { email, name, role, passwordHash },
        update: { name, role, passwordHash },
      });
    }
  }

  const counts = await prisma.unit.groupBy({ by: ['status'], _count: true });
  console.log('› units by status:', Object.fromEntries(counts.map((c) => [c.status, c._count])));
  console.log(`› seeded ${development.name} (${DEV_SLUG})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
