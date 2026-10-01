/**
 * Where a residence sits in the 3D building maquette.
 *
 * Roadmap §40.1 draws the line: the database owns the unit (code, floor,
 * position, width, status, price, and which volume it occupies), the design
 * system owns the architecture (the volumes themselves, slabs, lighting,
 * materials). The volumes are declared here, once, so the admin can offer them
 * as choices and the website can draw them — and both agree on whether a
 * residence resolves to anything at all.
 *
 * A residence resolves in this order:
 *   1. its `modelSlot`, chosen in the admin;
 *   2. otherwise its code — the penthouse code itself, or the letter before the
 *      floor digits ("A2" → "A").
 * Anything that resolves to nothing is a visible admin warning, never a silent
 * disappearance.
 */

/** [x0, z0, x1, z1] in plan metres: x runs east, z runs south (toward the street). */
export type ModelRect = readonly [number, number, number, number];

export interface ModelSlotVolume {
  /** Which level group the volume moves with (0 unless a home spans two floors). */
  levelOffset: number;
  rect: ModelRect;
  /** A shorter room, for a floor tucked under a terrace. */
  low?: boolean;
}

export interface ModelSlot {
  key: string;
  label: string;
  volumes: readonly ModelSlotVolume[];
}

/**
 * The architect's plans are dimensioned from the column grid: u metres east of
 * grid line A, v metres north of grid line 1 (the street side). The model's
 * origin is the middle of the building, so every plan figure passes through
 * here once and the drawings stay recognisable in the code.
 */
export const MODEL_PLAN_ORIGIN = { u: 11.4, v: 14.55 } as const;

const cm = (n: number) => Math.round(n * 100) / 100;

/** A plan rectangle (u0, v0)–(u1, v1) as a model rectangle. */
export function planRect(u0: number, v0: number, u1: number, v1: number): ModelRect {
  const { u, v } = MODEL_PLAN_ORIGIN;
  return [cm(Math.min(u0, u1) - u), cm(v - Math.max(v0, v1)), cm(Math.max(u0, u1) - u), cm(v - Math.min(v0, v1))];
}

/** A residence's rooms as one or more plan rectangles; the first is the largest and carries its label. */
const slot = (key: string, label: string, ...rects: ModelRect[]): ModelSlot => ({
  key,
  label,
  volumes: rects.map((rect) => ({ levelOffset: 0, rect })),
});

// The apartments, as the plans draw them around the lift core and the atrium.
const NORTH_WEST = [planRect(-2.12, 17.5, 5.2, 24.9), planRect(-2.12, 24.9, 6.85, 29.8)] as const;
const NORTH_EAST = [planRect(6.85, 24.9, 24.6, 29.8), planRect(12.45, 23.2, 23.1, 24.9)] as const;
const EAST = planRect(13.85, 15.7, 23.2, 23.2);
const EAST_MID = planRect(13.85, 8.9, 23.2, 15.7);
const WEST = planRect(-2.55, 9.6, 6.85, 17.5);
const SOUTH_EAST = [planRect(10.35, -0.1, 22.8, 6.7), planRect(13.85, 6.7, 22.8, 8.9)] as const;
const SOUTH_WEST = [planRect(-2.55, -0.1, 10.35, 6.7), planRect(-2.55, 6.7, 6.85, 9.6)] as const;

/**
 * Levels 1–3 share one plan: two-bedroom homes on the four corners, one-bedroom
 * homes on the west and east faces between them. Each letter keeps the kind of
 * home the inventory gives it, nearest in size to the plan it stands on.
 */
const TYPICAL: readonly ModelSlot[] = [
  slot('A', 'West, one bedroom', WEST),
  slot('B', 'East, one bedroom, south of centre', EAST_MID),
  slot('C', 'East, one bedroom, north of centre', EAST),
  slot('D', 'South-east corner', ...SOUTH_EAST),
  slot('E', 'North-east corner', ...NORTH_EAST),
  slot('F', 'South-west corner', ...SOUTH_WEST),
  slot('G', 'North-west corner', ...NORTH_WEST),
];

/** The ground floor gives its street side to reception, co-working and the pool, so it holds four. */
const GROUND: readonly ModelSlot[] = [
  slot('A', 'West, one bedroom', WEST),
  slot('B', 'East, one bedroom', EAST),
  slot('C', 'North-west corner', ...NORTH_WEST),
  slot('D', 'North-east corner', ...NORTH_EAST),
];

const PENTHOUSE: readonly ModelSlot[] = [
  slot('PH-A', 'Penthouse, south-east', planRect(12.7, -0.1, 22.8, 6.7), planRect(13.85, 6.7, 23.2, 14.25)),
  slot('PH-B', 'Penthouse, north-east', planRect(13.85, 14.25, 23.2, 24.9), planRect(10.4, 24.9, 25.2, 29.8)),
  slot(
    'PH-C',
    'Penthouse, west and south',
    planRect(-2.55, 6.7, 6.85, 20.4),
    planRect(-2.55, -0.1, 12.7, 6.7),
    planRect(-2.12, 20.4, 5.2, 24.9),
    planRect(-2.12, 24.9, 10.3, 29.8),
  ),
];

/** The top residential level. */
export const MODEL_PENTHOUSE_LEVEL = 4;
/** Levels the maquette draws residences on. */
export const MODEL_RESIDENTIAL_LEVELS = [0, 1, 2, 3, 4] as const;

/** Every volume a residence on this level may occupy. */
export function modelSlotsForLevel(level: number): readonly ModelSlot[] {
  if (level === 0) return GROUND;
  if (level >= 1 && level < MODEL_PENTHOUSE_LEVEL) return TYPICAL;
  if (level === MODEL_PENTHOUSE_LEVEL) return PENTHOUSE;
  return [];
}

/** Kept for callers that list letters. */
export const MODEL_TYPICAL_LETTERS = TYPICAL.map((s) => s.key);
export const MODEL_GROUND_LETTERS = GROUND.map((s) => s.key);
export const MODEL_PENTHOUSE_CODES = PENTHOUSE.map((s) => s.key);

/** `A1` → `A`, `PH-A` → `PH-A`. Trailing digits are the floor, not the position. */
export function unitCodeLetter(code: string): string {
  return code.trim().toUpperCase().replace(/\d+$/, '');
}

/** The volume a residence occupies, or null when the maquette cannot place it. */
export function resolveModelSlot(code: string, level: number, modelSlot?: string | null): ModelSlot | null {
  const slots = modelSlotsForLevel(level);
  if (modelSlot && modelSlot.trim()) {
    return slots.find((s) => s.key === modelSlot.trim().toUpperCase()) ?? null;
  }
  const c = code.trim().toUpperCase();
  return slots.find((s) => s.key === c) ?? slots.find((s) => s.key === unitCodeLetter(c)) ?? null;
}

/**
 * Can the maquette draw this residence? `false` means the admin must say so:
 * the residence is still for sale, still listed and still has its own page —
 * it just has no volume in the 3D view until someone chooses one.
 */
export function isPlacedInModel(code: string, level: number, modelSlot?: string | null): boolean {
  return resolveModelSlot(code, level, modelSlot) !== null;
}

/** Human sentence for the admin warning, so the wording is the same everywhere. */
export const UNPLACED_IN_MODEL_NOTE =
  'This residence has no volume in the 3D building, so it is missing from that view on the website. Choose its position in the 3D model; its page, the elevation and every list still show it.';
