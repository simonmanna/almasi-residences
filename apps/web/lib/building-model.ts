/**
 * The building, as the architect's plans draw it (real-estate-design/ALMASI
 * RESIDENCES update.pdf): basement, ground, three typical floors, the penthouse
 * floor and the roof, around a lift core and an atrium under a glass skylight.
 *
 * This file is the one description both 3D views draw from — the 3D Design page
 * and the building on the homepage — so they can never show different designs.
 *
 * Figures are entered as the plans give them: u metres east of grid line A,
 * v metres north of grid line 1 (the street side). They are stored on the
 * model's grid: x runs east, z runs south toward the street, y is up, and the
 * origin is the middle of the building.
 *
 * The plans hold no elevations or sections, so storey height and the facade's
 * finishes are not in them; FLOOR_H and the materials are the model's own.
 */

import { MODEL_PLAN_ORIGIN, planRect, resolveModelSlot, type ModelRect } from '@avida/types';

/** [x0, z0, x1, z1] in plan. */
export type Rect = ModelRect;

export const FLOOR_H = 3.4;
export const SLAB = 0.35;
/** Levels as the building stacks them: basement, ground, 1–3, penthouse, roof. */
export const LEVELS = [-1, 0, 1, 2, 3, 4, 5] as const;
export const ROOF = 5;
export const PENTHOUSE_LEVEL = 4;

export const levelBase = (level: number) => level * FLOOR_H;

const P = planRect;
const cm = (n: number) => Math.round(n * 100) / 100;
const px = (u: number) => cm(u - MODEL_PLAN_ORIGIN.u);
const pz = (v: number) => cm(MODEL_PLAN_ORIGIN.v - v);

/** The outline of the upper floors, balconies included: about 28 m by 33.5 m. */
export const FOOTPRINT: Rect = P(-2.55, -2.2, 25.4, 31.3);
/** Lifts and the stair, on every floor. */
export const CORE: Rect = P(5.2, 20.4, 12.45, 24.9);
/** The void through every floor, under the roof's glass skylight. */
export const ATRIUM: Rect = P(8.35, 8.2, 12.2, 18.5);
/** The gallery around the void that every front door opens onto. */
export const GALLERY: Rect = P(6.85, 6.7, 13.75, 20.4);
/** The lap pool along the west boundary: half under the building, half in the open. */
export const POOL: Rect = P(-3.5, -4.5, -0.45, 8.1);
/** The curved entrance canopy over the street door. */
export const CANOPY: Rect = P(6.5, -5.3, 14.1, -2.1);
/** The street face at ground level, which sits forward of the floors above. */
export const STREET_FACE_Z = pz(-2.1);
/** The two wings of balconies on the street face, either side of the centre bay: wall line to balcony edge. */
export const WEST_WING: Rect = P(-2.55, -2.2, 6.75, -0.1);
export const EAST_WING: Rect = P(13.55, -2.2, 22.8, -0.1);

// ─── Facades ─────────────────────────────────────────────────────────────

export type Side = 'S' | 'N' | 'E' | 'W';

export interface Opening {
  /** Centre along the wall: x on a south or north wall, z on an east or west one. */
  at: number;
  width: number;
  /** A high bathroom window rather than floor-to-ceiling glass. */
  small?: boolean;
  /** Clear glass onto a common room, so the room reads from outside. */
  clear?: boolean;
  /** Depth of an inset balcony behind the opening. */
  recess?: number;
}

export interface Wall {
  /** The way the wall faces. */
  side: Side;
  /** The outer face: z of a south or north wall, x of an east or west one. */
  plane: number;
  from: number;
  to: number;
  openings: readonly Opening[];
}

export interface Balcony {
  rect: Rect;
  /** The edges that carry a glass balustrade. */
  rails: readonly Side[];
}

/** A screen of vertical fins standing off a facade. */
export interface Screen {
  side: Side;
  plane: number;
  from: number;
  to: number;
  /** How far the fins stand off the wall; a deep screen carries a ledge. */
  depth: number;
}

export interface LevelPlan {
  level: number;
  /** The floor plate, as rectangles that meet without overlapping. */
  plate: readonly Rect[];
  walls: readonly Wall[];
  balconies: readonly Balcony[];
  screens: readonly Screen[];
  /** Party walls between neighbouring balconies. */
  dividers: readonly Rect[];
}

type OpeningSpec = readonly [at: number, width: number, kind?: 'small' | 'clear' | number];

/** A wall in plan figures: `plane` is v for a south or north wall, u for an east or west one. */
function wall(side: Side, plane: number, a: number, b: number, ...openings: OpeningSpec[]): Wall {
  const along = side === 'S' || side === 'N';
  const pos = along ? px : pz;
  const ends = [pos(a), pos(b)].sort((m, n) => m - n) as [number, number];
  return {
    side,
    plane: along ? pz(plane) : px(plane),
    from: ends[0],
    to: ends[1],
    openings: openings
      .map(([at, width, kind]): Opening => ({
        at: pos(at),
        width,
        ...(kind === 'small' ? { small: true } : {}),
        ...(kind === 'clear' ? { clear: true } : {}),
        ...(typeof kind === 'number' ? { recess: kind } : {}),
      }))
      .sort((m, n) => m.at - n.at),
  };
}

function screen(side: Side, plane: number, a: number, b: number, depth: number): Screen {
  const along = side === 'S' || side === 'N';
  const pos = along ? px : pz;
  const ends = [pos(a), pos(b)].sort((m, n) => m - n) as [number, number];
  return { side, plane: along ? pz(plane) : px(plane), from: ends[0], to: ends[1], depth };
}

/** `rects` with `hole` cut out of them. */
export function cut(rects: readonly Rect[], hole: Rect): Rect[] {
  const [hx0, hz0, hx1, hz1] = hole;
  const out: Rect[] = [];
  for (const r of rects) {
    const [x0, z0, x1, z1] = r;
    if (hx0 >= x1 || hx1 <= x0 || hz0 >= z1 || hz1 <= z0) {
      out.push(r);
      continue;
    }
    const a = Math.max(z0, hz0);
    const b = Math.min(z1, hz1);
    if (hz0 > z0) out.push([x0, z0, x1, hz0]);
    if (hz1 < z1) out.push([x0, hz1, x1, z1]);
    if (hx0 > x0) out.push([x0, a, hx0, b]);
    if (hx1 < x1) out.push([hx1, a, x1, b]);
  }
  return out;
}

// The north face is the same from the ground to the third floor: balconies
// between a bay of the north-east living room that steps forward.
const NORTH: readonly Wall[] = [
  wall('N', 29.8, -2.12, 6.85, [-1.15, 1.7], [0.89, 1.1], [3.88, 4.36]),
  wall('N', 29.8, 6.85, 14.27, [9.26, 2.9], [13.28, 1.44]),
  wall('W', 14.27, 29.8, 31.3, [30.6, 0.88]),
  wall('N', 31.3, 14.27, 18.5, [16.3, 3.79]),
  wall('E', 18.5, 29.8, 31.3, [30.55, 1.0]),
  wall('N', 29.8, 18.5, 24.6, [19.55, 2.04], [21.91, 1.83]),
];
const NORTH_BALCONIES: readonly Balcony[] = [
  { rect: P(-2.12, 29.8, 6.6, 31.3), rails: ['N', 'W', 'E'] },
  { rect: P(7.6, 29.8, 14.27, 31.3), rails: ['N', 'W'] },
  { rect: P(18.5, 29.8, 25.4, 31.3), rails: ['N', 'E'] },
  { rect: P(24.6, 24.9, 25.4, 29.8), rails: ['E', 'S'] },
];

// The north-west home's own west wall, with its inset balcony.
const WEST_NORTH: readonly Wall[] = [
  wall('W', -2.12, 17.5, 29.8, [18.2, 0.8, 'small'], [21.1, 2.8, 1.47], [23.6, 0.8, 'small']),
  wall('N', 17.5, -2.55, -2.12),
];

const UPPER_PLATE: readonly Rect[] = cut(
  [
    P(6.75, -1.0, 13.55, -0.1),
    P(-2.55, -0.1, 22.8, 8.9),
    P(-2.55, 8.9, 23.2, 17.5),
    P(-2.12, 17.5, 23.2, 24.9),
    P(-2.12, 24.9, 24.6, 29.8),
    P(14.27, 29.8, 18.5, 31.3),
  ],
  ATRIUM,
);

/** First to third floor: seven homes, balconies on the street, east and north faces. */
function typical(level: number): LevelPlan {
  return {
    level,
    plate: UPPER_PLATE,
    walls: [
      // Street face: two wings of living rooms and a centre bay of bedrooms that steps forward.
      wall('S', -0.1, -2.55, 6.75, [-1.28, 1.35], [0.85, 1.3], [3.78, 4.02]),
      wall('W', 6.75, -1.0, -0.1),
      wall('S', -1.0, 6.75, 13.55, [8.5, 2.8], [11.8, 2.8]),
      wall('E', 13.55, -1.0, -0.1),
      wall('S', -0.1, 13.55, 22.8, [16.34, 4.0], [19.34, 1.4], [21.52, 1.35]),
      // East face.
      wall('E', 22.8, -0.1, 8.9, [4.96, 0.8, 'small'], [7.9, 1.2]),
      wall('S', 8.9, 22.8, 23.2),
      wall('E', 23.2, 8.9, 24.9, [10.88, 2.65], [13.68, 2.54], [16.92, 2.34], [20.72, 3.42], [23.9, 0.8, 'small']),
      wall('S', 24.9, 23.2, 24.6),
      wall('E', 24.6, 24.9, 29.8, [27.3, 2.0]),
      ...NORTH,
      // West face: close to the boundary, so its balconies are set into the wall.
      ...WEST_NORTH,
      wall('W', -2.55, -0.1, 17.5, [5.43, 0.8, 'small'], [8.2, 2.4, 1.2], [11.2, 2.58, 2.14], [14.14, 2.3]),
    ],
    balconies: [
      { rect: P(-2.55, -2.2, 6.75, -0.1), rails: ['S', 'W'] },
      { rect: P(6.75, -2.2, 13.55, -1.0), rails: ['S'] },
      { rect: P(13.55, -2.2, 22.8, -0.1), rails: ['S', 'E'] },
      { rect: P(23.2, 9.5, 24.6, 15.5), rails: ['E', 'N', 'S'] },
      { rect: P(23.2, 15.9, 24.6, 22.5), rails: ['E', 'N', 'S'] },
      ...NORTH_BALCONIES,
    ],
    // The plans draw fin screens on the west face of the first floor and by the south-east kitchens above it.
    screens: level === 1 ? [screen('W', -2.55, 6.8, 17.2, 0.75)] : [screen('E', 22.8, 6.3, 8.8, 1.6)],
    dividers: [P(10.05, -2.2, 10.25, -1.0)],
  };
}

/** Ground: four homes to the north; reception, co-working, the meeting room and the pool terrace to the street. */
const GROUND: LevelPlan = {
  level: 0,
  plate: [
    P(-0.3, -2.1, 22.8, 9.6),
    P(-2.55, 9.6, 22.8, 15.5),
    P(-2.55, 15.5, 23.2, 17.5),
    P(-2.12, 17.5, 23.2, 24.9),
    P(-2.12, 24.9, 24.6, 29.8),
    P(14.27, 29.8, 18.5, 31.3),
  ],
  walls: [
    // Reception sits back from the street under the canopy; co-working runs to the street face.
    wall('S', -0.1, 6.85, 13.75, [10.3, 5.33, 'clear']),
    wall('W', 6.85, -2.1, 6.5, [3.14, 3.9, 'clear']),
    wall('W', 13.85, -2.1, -0.1),
    wall('S', -2.1, 13.85, 22.8, [15.95, 3.38, 'clear'], [19.9, 3.6, 'clear']),
    wall('E', 22.8, -2.1, 15.5, [2.2, 5.0, 'clear'], [9.4, 3.0, 'clear'], [14.01, 2.88, 'clear']),
    wall('S', 15.5, 22.8, 23.2),
    wall('E', 23.2, 15.5, 24.9, [16.92, 2.34], [20.72, 3.42], [23.9, 0.8, 'small']),
    wall('S', 24.9, 23.2, 24.6),
    wall('E', 24.6, 24.9, 29.8, [27.3, 2.0]),
    ...NORTH,
    ...WEST_NORTH,
    wall('W', -2.55, 9.6, 17.5, [11.2, 2.58, 2.14], [14.14, 2.3]),
    // The west home's wall onto the pool terrace.
    wall('S', 9.6, -2.55, 6.85),
  ],
  balconies: [
    { rect: P(22.8, 6.6, 24.4, 15.5), rails: ['E', 'N', 'S'] },
    { rect: P(23.2, 15.9, 24.6, 22.5), rails: ['E', 'N', 'S'] },
    ...NORTH_BALCONIES,
  ],
  screens: [],
  dividers: [],
};

/** Fourth floor: three penthouses, terraces to the street and along the whole east face. */
const PENTHOUSES: LevelPlan = {
  level: PENTHOUSE_LEVEL,
  plate: cut(
    [
      P(6.75, -1.0, 10.15, -0.1),
      P(-2.55, -0.1, 22.8, 6.5),
      P(-2.55, 6.5, 23.2, 17.5),
      P(-2.12, 17.5, 23.2, 24.9),
      P(-2.12, 24.9, 25.2, 29.8),
      P(4.0, 29.8, 10.2, 31.3),
      P(18.7, 29.8, 23.3, 31.3),
    ],
    ATRIUM,
  ),
  walls: [
    wall('S', -0.1, -2.55, 6.75, [-1.25, 1.4], [0.9, 1.2], [4.29, 3.2]),
    wall('W', 6.75, -1.0, -0.1),
    wall('S', -1.0, 6.75, 10.15, [8.5, 2.8]),
    wall('E', 10.15, -1.0, -0.1),
    wall('S', -0.1, 10.15, 22.8, [11.5, 2.2], [16.31, 4.12], [19.34, 1.4], [21.42, 1.35]),
    wall('E', 22.8, -0.1, 6.5),
    wall('S', 6.5, 22.8, 23.2),
    wall(
      'E', 23.2, 6.5, 24.9,
      [8.26, 3.3], [11.16, 2.1], [13.26, 1.7], [15.88, 3.15], [20.3, 2.6], [23.25, 2.3],
    ),
    wall('S', 24.9, 23.2, 25.2),
    wall('E', 25.2, 24.9, 29.8, [27.3, 2.4]),
    // North: two living rooms step forward as glazed bays.
    wall('N', 29.8, -2.12, 4.0, [2.17, 3.45]),
    wall('W', 4.0, 29.8, 31.3),
    wall('N', 31.3, 4.0, 10.2, [7.09, 4.5]),
    wall('E', 10.2, 29.8, 31.3),
    wall('N', 29.8, 10.2, 18.7, [16.03, 3.47]),
    wall('W', 18.7, 29.8, 31.3),
    wall('N', 31.3, 18.7, 23.3, [20.93, 4.0]),
    wall('E', 23.3, 29.8, 31.3),
    wall('N', 29.8, 23.3, 25.2, [24.29, 1.5]),
    wall('W', -2.12, 17.5, 29.8, [18.2, 0.8, 'small'], [20.35, 1.85, 'small'], [23.6, 2.8, 1.9]),
    wall('N', 17.5, -2.55, -2.12),
    wall('W', -2.55, -0.1, 17.5, [5.04, 0.8, 'small'], [9.28, 3.33, 1.2], [14.96, 3.33, 1.2]),
  ],
  balconies: [
    { rect: P(-2.55, -2.2, 6.75, -0.1), rails: ['S', 'W'] },
    { rect: P(6.75, -2.2, 10.15, -1.0), rails: ['S'] },
    { rect: P(10.15, -2.2, 22.8, -0.1), rails: ['S', 'E'] },
    { rect: P(23.2, 6.5, 25.4, 24.9), rails: ['E', 'S'] },
    { rect: P(-2.12, 29.8, 4.0, 31.3), rails: ['N', 'W'] },
    { rect: P(10.2, 29.8, 18.7, 31.3), rails: ['N'] },
    { rect: P(23.3, 29.8, 25.4, 31.3), rails: ['N', 'E'] },
  ],
  screens: [screen('W', -2.55, 7.1, 17.3, 0.75)],
  dividers: [P(12.6, -2.2, 12.8, -0.1)],
};

const PLANS = new Map<number, LevelPlan>([
  [0, GROUND],
  [1, typical(1)],
  [2, typical(2)],
  [3, typical(3)],
  [PENTHOUSE_LEVEL, PENTHOUSES],
]);

/** The plan of a residential level, or undefined for the basement and the roof. */
export const planFor = (level: number) => PLANS.get(level);

/** The roof: a slab behind a parapet, the stair overrun, the skylight, a pergola and the name. */
export const ROOF_PLAN = {
  /** The parapet follows the walls of the floor below. */
  plate: PENTHOUSES.plate,
  parapet: PENTHOUSES.walls,
  skylight: P(8.15, 8.0, 12.4, 18.9),
  overrun: P(5.1, 21.3, 12.5, 25.1),
  /** The slab carries on past the parapet to shade the terraces on the street and north faces. */
  overhangs: [P(-2.55, -2.2, 22.8, -0.1), P(-2.12, 29.8, 23.3, 31.3)],
  /** Slats over the east terrace of the penthouse floor. */
  pergola: P(23.2, 6.5, 25.4, 24.5),
  /** The name stands over the centre bay of the street face. */
  sign: { z: pz(-1.6), from: px(6.9), to: px(13.0) },
} as const;

// ─── Residences ──────────────────────────────────────────────────────────

export interface UnitVolume {
  /** The level group the volume moves with. */
  level: number;
  rect: Rect;
  y0: number;
  y1: number;
}

const ROOM_TOP = FLOOR_H - 0.12;

/**
 * The volumes for a residence, or none when the model cannot place it. The
 * volumes are declared in @avida/types so the admin offers exactly these as
 * choices and warns about exactly the residences this function cannot draw.
 */
export function unitVolumes(code: string, level: number, modelSlot?: string | null): UnitVolume[] {
  const slot = resolveModelSlot(code, level, modelSlot);
  if (!slot) return [];
  return slot.volumes.map((v) => ({
    level: level + v.levelOffset,
    rect: v.rect,
    y0: SLAB,
    y1: v.low ? FLOOR_H - 0.3 : ROOM_TOP,
  }));
}

/** Where a residence's label sits: the middle of its largest volume, just above its ceiling. */
export function unitAnchor(code: string, level: number, modelSlot?: string | null): { x: number; z: number; y: number } | null {
  const vols = unitVolumes(code, level, modelSlot).filter((v) => v.level === level);
  const v = vols[0];
  if (!v) return null;
  const [x0, z0, x1, z1] = v.rect;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: v.y1 + 0.6 };
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.5;

/**
 * A residence's rooms pushed out past its own walls and balconies, so a
 * highlight drawn on the building sits on the facade rather than behind it.
 */
export function unitEnvelope(level: number, rect: Rect): Rect {
  const plan = planFor(level);
  if (!plan) return rect;
  let [x0, z0, x1, z1] = rect;
  const near = (a: number, b: number) => Math.abs(a - b) < 1.3;
  for (const w of plan.walls) {
    const along = w.side === 'S' || w.side === 'N';
    if (!overlaps(w.from, w.to, along ? rect[0] : rect[1], along ? rect[2] : rect[3])) continue;
    if (w.side === 'S' && near(w.plane, rect[3])) z1 = Math.max(z1, w.plane + 0.3);
    if (w.side === 'N' && near(w.plane, rect[1])) z0 = Math.min(z0, w.plane - 0.3);
    if (w.side === 'E' && near(w.plane, rect[2])) x1 = Math.max(x1, w.plane + 0.3);
    if (w.side === 'W' && near(w.plane, rect[0])) x0 = Math.min(x0, w.plane - 0.3);
  }
  for (const { rect: b } of plan.balconies) {
    if (overlaps(b[0], b[2], rect[0], rect[2])) {
      if (near(b[1], rect[3])) z1 = Math.max(z1, b[3] + 0.12);
      if (near(b[3], rect[1])) z0 = Math.min(z0, b[1] - 0.12);
    }
    if (overlaps(b[1], b[3], rect[1], rect[3])) {
      if (near(b[0], rect[2])) x1 = Math.max(x1, b[2] + 0.12);
      if (near(b[2], rect[0])) x0 = Math.min(x0, b[0] - 0.12);
    }
  }
  return [cm(x0), cm(z0), cm(x1), cm(z1)];
}

// ─── Common rooms ────────────────────────────────────────────────────────

export type PartKind = 'core' | 'amenity' | 'water' | 'basement';

export interface Part {
  level: number;
  kind: PartKind;
  rect: Rect;
  /** Heights relative to the level's base. */
  y0: number;
  y1: number;
  label?: string;
}

const parts: Part[] = [];
const add = (level: number, kind: PartKind, rect: Rect, y0: number, y1: number, label?: string) =>
  parts.push({ level, kind, rect, y0, y1, label });

for (const level of [-1, 0, 1, 2, 3, 4]) add(level, 'core', CORE, level < 0 ? 0.2 : SLAB, FLOOR_H);

// Basement: parking under the building, with the wellness rooms along its street side.
add(-1, 'basement', P(-1.4, -5.0, 22.8, 31.3), 0.2, FLOOR_H - 0.2, 'Basement parking');
add(-1, 'amenity', P(0.3, -5.0, 6.2, 6.3), 0.2, ROOM_TOP, 'Staff and services');
add(-1, 'amenity', P(6.4, -5.0, 12.4, 6.3), 0.2, ROOM_TOP, 'Sauna and massage');
add(-1, 'amenity', P(12.6, -5.0, 20.6, 6.3), 0.2, ROOM_TOP, 'Gym');

// Ground: the rooms every resident shares.
add(0, 'amenity', P(6.85, -0.1, 13.75, 6.5), SLAB, ROOM_TOP, 'Reception');
add(0, 'amenity', P(13.85, -2.1, 22.8, 6.5), SLAB, ROOM_TOP, 'Co-working');
add(0, 'amenity', P(13.85, 6.7, 22.6, 15.5), SLAB, ROOM_TOP, 'Residents’ meeting room');
add(0, 'amenity', P(-0.3, -2.1, 6.85, 9.6), SLAB, ROOM_TOP, 'Pool terrace');
add(0, 'water', POOL, SLAB - 0.1, SLAB - 0.04, 'Swimming pool');

export const PARTS: readonly Part[] = parts;

/** The bays the basement plan draws: five on the west, six on the east, three by the wellness rooms. */
const BAYS: readonly { x: number; z: number; turned: boolean }[] = [
  ...[26.2, 22.9, 20.3, 17.0, 14.4].map((v) => ({ x: px(0.4), z: pz(v), turned: true })),
  ...[26.2, 22.9, 20.3, 17.0, 14.4, 9.7].map((v) => ({ x: px(18.6), z: pz(v), turned: true })),
  ...[7.8, 10.05, 12.4].map((u) => ({ x: px(u), z: pz(9.2), turned: false })),
];
export const PARKING_BAYS = BAYS.length;

/** Basement bays, as many as are asked for and the plan holds; `turned` bays park across the building. */
export function parkingBays(count: number): { x: number; z: number; turned: boolean }[] {
  return BAYS.slice(0, Math.max(0, Math.min(BAYS.length, count)));
}

/** Deterministic planting around the site — model trees, not a landscape survey. */
export const TREES: readonly { x: number; z: number; r: number }[] = (() => {
  let seed = 20260911;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: { x: number; z: number; r: number }[] = [];
  while (out.length < 46) {
    const x = (rnd() - 0.5) * 120;
    const z = (rnd() - 0.5) * 110 - 6;
    const clearOfBuilding = x < -21 || x > 23 || z < -23 || z > 22;
    const clearOfStreet = z < 24 || z > 42;
    if (clearOfBuilding && clearOfStreet) out.push({ x, z, r: 1.6 + rnd() * 1.8 });
  }
  return out;
})();
