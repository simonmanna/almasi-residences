/**
 * The massing model behind the 3D building — a sales-gallery maquette, not the
 * architect's model.
 *
 * Plan rectangles are metres on a local grid: x runs east, z runs south
 * (toward KG 15 Ave and the default camera), y is up. Each residence is placed
 * by the orientation the inventory gives it (A south, B south-east, D east,
 * F west …) and sized roughly in proportion to its area. When the architect's
 * decimated glTF arrives, meshes named `unit_<code>` (Unit.meshName) slot into
 * the same selection code and this file retires.
 */

/** [x0, z0, x1, z1] in plan. */
export type Rect = readonly [number, number, number, number];

export const FLOOR_H = 3.4;
export const SLAB = 0.35;
/** Levels as the building stacks them: basement, ground, 1–3, penthouse, roof. */
export const LEVELS = [-1, 0, 1, 2, 3, 4, 5] as const;
export const ROOF = 5;
export const FOOTPRINT: Rect = [-19, -10.75, 19, 10.75];

export const levelBase = (level: number) => level * FLOOR_H;

export type PartKind =
  | 'slab'
  | 'stone'
  | 'core'
  | 'glass'
  | 'walnut'
  | 'water'
  | 'amenity'
  | 'basement';

export interface Part {
  level: number;
  kind: PartKind;
  rect: Rect;
  /** Heights relative to the level's base. */
  y0: number;
  y1: number;
  label?: string;
}

export interface UnitVolume {
  /** The level group the volume moves with (PH C's upper floor rides with the roof). */
  level: number;
  rect: Rect;
  y0: number;
  y1: number;
}

const ROOM_TOP = FLOOR_H - 0.12;

// ─── Residences ──────────────────────────────────────────────────────────

/** Floors 1–3 share one plan: three 1-beds on the south face, 2-beds in the wings and to the north. */
const TYPICAL: Record<string, Rect> = {
  C: [-13, 1.75, -4.1, 10.75],
  A: [-4.1, 1.75, 4.3, 10.75],
  B: [4.3, 1.75, 13, 10.75],
  D: [13, -10.75, 19, 10.75],
  E: [1.5, -10.75, 13, -1.75],
  F: [-19, -10.75, -13, 10.75],
  G: [-13, -10.75, -1.5, -1.75],
};

/** The ground floor gives its south face to reception and co-working. */
const GROUND: Record<string, Rect> = {
  A: [4.3, 1.75, 13, 10.75],
  B: [13, 0, 19, 10.75],
  C: [-19, -10.75, -13, 10.75],
  D: [-13, -10.75, -1.5, -1.75],
};

const PENTHOUSE: Record<string, UnitVolume[]> = {
  'PH-A': [{ level: 4, rect: [6, -4, 19, 9.25], y0: SLAB, y1: ROOM_TOP }],
  'PH-B': [{ level: 4, rect: [-13, -1.75, 6, 9.25], y0: SLAB, y1: ROOM_TOP }],
  'PH-C': [
    { level: 4, rect: [-19, -10.75, -1.5, -1.75], y0: SLAB, y1: ROOM_TOP },
    { level: 4, rect: [1.5, -10.75, 19, -4], y0: SLAB, y1: ROOM_TOP },
    // The duplex's upper floor, opening onto the private roof terrace.
    { level: ROOF, rect: [-19, -10.75, -6, -1.75], y0: SLAB, y1: FLOOR_H - 0.3 },
  ],
};

export function unitVolumes(code: string, level: number): UnitVolume[] {
  if (PENTHOUSE[code]) return PENTHOUSE[code]!;
  const letter = code.replace(/\d+$/, '');
  const rect = level === 0 ? GROUND[letter] : TYPICAL[letter];
  return rect ? [{ level, rect, y0: SLAB, y1: ROOM_TOP }] : [];
}

/** Where a residence's label sits: the middle of its largest volume, just above its ceiling. */
export function unitAnchor(code: string, level: number): { x: number; z: number; y: number } | null {
  const vols = unitVolumes(code, level).filter((v) => v.level === level);
  const v = vols[0];
  if (!v) return null;
  const [x0, z0, x1, z1] = v.rect;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: v.y1 + 0.6 };
}

// ─── Structure and common spaces ─────────────────────────────────────────

const parts: Part[] = [];
const add = (level: number, kind: PartKind, rect: Rect, y0: number, y1: number, label?: string) =>
  parts.push({ level, kind, rect, y0, y1, label });

// Basement: parking for every residence, under the building and the amenity deck.
add(-1, 'basement', [-19, -26, 19, 10.75], 0.2, FLOOR_H - 0.2, 'Basement parking');

for (const level of [0, 1, 2, 3, 4]) {
  add(level, 'slab', FOOTPRINT, 0, SLAB);
  add(level, 'core', [-1.5, -10.75, 1.5, -1.75], SLAB, FLOOR_H);
}

// Ground: reception and co-working on the street face, the restaurant to the garden.
add(0, 'amenity', [-4.1, 1.75, 4.3, 10.75], SLAB, ROOM_TOP, 'Reception');
add(0, 'amenity', [-13, 1.75, -4.1, 10.75], SLAB, ROOM_TOP, 'Co-working');
add(0, 'amenity', [1.5, -10.75, 13, -1.75], SLAB, ROOM_TOP, 'Restaurant');
add(0, 'amenity', [13, -10.75, 19, 0], SLAB, ROOM_TOP, 'Restaurant');
// The porte-cochère: a walnut canopy on two stone columns.
add(0, 'walnut', [-7, 10.75, 7, 19.5], 3.0, 3.36);
add(0, 'stone', [-6.6, 18.7, -5.9, 19.3], 0, 3.0);
add(0, 'stone', [5.9, 18.7, 6.6, 19.3], 0, 3.0);

// Residential floors: deep balconies with glass balustrades, stone piers, walnut fins.
for (const level of [1, 2, 3]) {
  add(level, 'slab', [-13, 10.75, 13, 12.75], 0, SLAB);
  add(level, 'slab', [19, -9, 20.6, 9], 0, SLAB);
  add(level, 'slab', [-20.6, -9, -19, 9], 0, SLAB);
  add(level, 'glass', [-13, 12.6, 13, 12.75], SLAB, SLAB + 1.1);
  add(level, 'glass', [20.45, -9, 20.6, 9], SLAB, SLAB + 1.1);
  add(level, 'glass', [-20.6, -9, -20.45, 9], SLAB, SLAB + 1.1);
}
for (const level of [1, 2, 3, 4]) {
  add(level, 'stone', [-4.45, 10.75, -3.95, 12.95], SLAB, FLOOR_H);
  add(level, 'stone', [4.05, 10.75, 4.55, 12.95], SLAB, FLOOR_H);
  add(level, 'walnut', [-13.45, 12.4, -12.95, 13.3], SLAB, FLOOR_H);
  add(level, 'walnut', [12.95, 12.4, 13.45, 13.3], SLAB, FLOOR_H);
}

// The amenity deck off level 1: a fifteen-metre pool and the wellness pavilion.
add(1, 'slab', [-14, -26, 14, -10.75], -0.6, 0);
add(1, 'water', [-9, -22.5, 6, -17.5], 0, 0.06, 'Pool');
add(1, 'amenity', [7, -25, 13.5, -15], 0, 3.0, 'Gym, sauna and massage');
add(1, 'glass', [-14, -26, 14, -25.85], 0, 1.1);
add(1, 'glass', [-14, -26, -13.85, -10.75], 0, 1.1);
add(1, 'glass', [13.85, -26, 14, -10.75], 0, 1.1);
for (const [x, z] of [[-12, -24], [12, -24], [-12, -13], [12, -13]] as const) {
  add(1, 'stone', [x - 0.35, z - 0.35, x + 0.35, z + 0.35], -FLOOR_H, -0.6);
}

// Penthouse level: terraces wrap the south and west faces.
add(4, 'slab', [-19, 10.75, 19, 12.75], 0, SLAB);
add(4, 'glass', [-19, 12.6, 19, 12.75], SLAB, SLAB + 1.1);
add(4, 'glass', [-19.15, -1.75, -19, 12.75], SLAB, SLAB + 1.1);

// Roof: the private terrace and pool of PH C, and the stair overrun.
add(ROOF, 'slab', [-13, -10.75, 19, 9.85], 0, SLAB);
add(ROOF, 'slab', [-19, -10.75, -13, -1.75], 0, SLAB);
add(ROOF, 'water', [-1, -9.5, 11, -5.5], SLAB, SLAB + 0.08, 'Roof pool');
add(ROOF, 'core', [-1.5, -10.75, 1.5, -6.5], SLAB, 2.7);
add(ROOF, 'glass', [-13, 9.7, 19, 9.85], SLAB, SLAB + 1.1);
for (let x = 8; x <= 18; x += 1.25) add(ROOF, 'walnut', [x, -1.2, x + 0.18, 6.5], 2.75, 2.95);

export const PARTS: readonly Part[] = parts;

/** One bay per residence, in two rows under the building. */
export const PARKING_BAYS: readonly { x: number; z: number }[] = Array.from({ length: 28 }, (_, i) => ({
  x: -16.25 + (i % 14) * 2.5,
  z: i < 14 ? -15 : 3.5,
}));

/** Deterministic planting around the site — maquette trees, not a landscape survey. */
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
    const clearOfBuilding = x < -25 || x > 25 || z < -31 || z > 14;
    const clearOfStreet = z < 21 || z > 34;
    const clearOfDrive = !(x > -9 && x < 9 && z > 10);
    if (clearOfBuilding && clearOfStreet && clearOfDrive) out.push({ x, z, r: 1.6 + rnd() * 1.8 });
  }
  return out;
})();
