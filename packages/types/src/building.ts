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
  /** Which level group the volume moves with (a duplex's upper floor rides with the roof). */
  levelOffset: number;
  rect: ModelRect;
  /** A shorter room: the duplex's upper floor under the roof terrace. */
  low?: boolean;
}

export interface ModelSlot {
  key: string;
  label: string;
  volumes: readonly ModelSlotVolume[];
}

const one = (key: string, label: string, rect: ModelRect): ModelSlot => ({ key, label, volumes: [{ levelOffset: 0, rect }] });

/** Levels 1–3 share one plan: three 1-beds on the south face, 2-beds in the wings and to the north. */
const TYPICAL: readonly ModelSlot[] = [
  one('C', 'South-west corner', [-13, 1.75, -4.1, 10.75]),
  one('A', 'South, centre', [-4.1, 1.75, 4.3, 10.75]),
  one('B', 'South-east corner', [4.3, 1.75, 13, 10.75]),
  one('D', 'East wing', [13, -10.75, 19, 10.75]),
  one('E', 'North-east', [1.5, -10.75, 13, -1.75]),
  one('F', 'West wing', [-19, -10.75, -13, 10.75]),
  one('G', 'North-west', [-13, -10.75, -1.5, -1.75]),
];

/** The ground floor gives its south face to reception and co-working, so it holds fewer. */
const GROUND: readonly ModelSlot[] = [
  one('A', 'South-east', [4.3, 1.75, 13, 10.75]),
  one('B', 'East, garden side', [13, 0, 19, 10.75]),
  one('C', 'West wing', [-19, -10.75, -13, 10.75]),
  one('D', 'North-west', [-13, -10.75, -1.5, -1.75]),
];

const PENTHOUSE: readonly ModelSlot[] = [
  one('PH-A', 'Penthouse, east', [6, -4, 19, 9.25]),
  one('PH-B', 'Penthouse, south', [-13, -1.75, 6, 9.25]),
  {
    key: 'PH-C',
    label: 'Penthouse duplex, north, with roof terrace',
    volumes: [
      { levelOffset: 0, rect: [-19, -10.75, -1.5, -1.75] },
      { levelOffset: 0, rect: [1.5, -10.75, 19, -4] },
      { levelOffset: 1, rect: [-19, -10.75, -6, -1.75], low: true },
    ],
  },
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
