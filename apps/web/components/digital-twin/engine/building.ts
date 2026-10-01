import * as THREE from 'three';
import {
  ATRIUM,
  CANOPY,
  CORE,
  FLOOR_H,
  GALLERY,
  PARTS,
  PENTHOUSE_LEVEL,
  POOL,
  ROOF_PLAN,
  SLAB,
  STREET_FACE_Z,
  WEST_WING,
  cut,
  levelBase,
  planFor,
  unitEnvelope,
  unitVolumes,
  type Balcony,
  type LevelPlan,
  type Opening,
  type Rect,
  type Screen,
  type Side,
  type Wall,
} from '../../../lib/building-model';
import { Bucket, pottedPlant, rand, slabGeometry, shrubGeometry, type V3 } from './geometry';
import type { Materials } from './materials';

const F = FLOOR_H;
/** Wall thickness, measured inward from the face the plans give. */
const T = 0.26;
/** Levels drawn above ground: ground, 1–3, penthouse, roof. */
export const BUILDING_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export const ROOF_LEVEL = 5;
export const BASEMENT_LEVEL = -1;

const UV: Record<string, number> = { plaster: 0.3, slab: 0.3, walnut: 0.55, oak: 0.5, stone: 0.35, paving: 0.25, teak: 0.5, marble: 0.35, marbleDark: 0.35, wall: 0.3, charcoal: 0.3 };
const NO_SHADOW = new Set(['glass', 'clearGlass', 'balustrade', 'card0', 'card1', 'card2', 'card3', 'downlight', 'led', 'scallop', 'sign', 'bulb', 'glowSprite', 'water', 'curtain']);

export interface UnitRef {
  id: string;
  code: string;
  floorLevel: number;
  modelSlot: string | null;
  bedrooms: number;
}

export interface UnitVisual {
  id: string;
  level: number;
  center: THREE.Vector3;
  /** Plan rectangles on the unit's own level. */
  rects: [number, number, number, number][];
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  tile: THREE.MeshBasicMaterial;
  meshes: THREE.Mesh[];
  tiles: THREE.Mesh[];
  lines: THREE.LineSegments[];
}

// ─── Facade helpers ──────────────────────────────────────────────────────

/** A box set against a facade: u along the wall, d outward from its face. */
function face(b: Bucket, key: string, side: Side, plane: number, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) {
  switch (side) {
    case 'S':
      return b.box(key, u0, y0, plane + d0, u1, y1, plane + d1);
    case 'N':
      return b.box(key, u0, y0, plane - d1, u1, y1, plane - d0);
    case 'E':
      return b.box(key, plane + d0, y0, u0, plane + d1, y1, u1);
    case 'W':
      return b.box(key, plane - d1, y0, u0, plane - d0, y1, u1);
  }
}

/** A flat panel facing out of a facade, d metres off its face. */
function facePlane(b: Bucket, key: string, side: Side, plane: number, uc: number, yc: number, w: number, h: number, d: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Matrix4();
  switch (side) {
    case 'S':
      m.makeTranslation(uc, yc, plane + d);
      break;
    case 'N':
      m.makeRotationY(Math.PI).setPosition(uc, yc, plane - d);
      break;
    case 'E':
      m.makeRotationY(Math.PI / 2).setPosition(plane + d, yc, uc);
      break;
    case 'W':
      m.makeRotationY(-Math.PI / 2).setPosition(plane - d, yc, uc);
      break;
  }
  b.add(key, g, m);
}

let cardSeed = 0;
const nextCard = () => `card${(cardSeed++ * 7 + (cardSeed >> 2)) % 4}`;

function downlight(b: Bucket, x: number, y: number, z: number) {
  const g = new THREE.CircleGeometry(0.075, 16);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  b.add('downlight', g);
}

/** Downlights set into the underside of a slab, along its length. */
function soffitLights(b: Bucket, [x0, z0, x1, z1]: Rect, y = -0.005) {
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (alongX) downlight(b, x0 + len * t, y, (z0 + z1) / 2);
    else downlight(b, (x0 + x1) / 2, y, z0 + len * t);
  }
}

/** A glass balustrade along one edge of a rectangle. */
function rail(b: Bucket, side: Side, [x0, z0, x1, z1]: Rect, y: number) {
  const t = 0.06;
  const [a, c, d, e] =
    side === 'S' ? [x0, z1 - t, x1, z1] : side === 'N' ? [x0, z0, x1, z0 + t] : side === 'E' ? [x1 - t, z0, x1, z1] : [x0, z0, x0 + t, z1];
  b.box('balustrade', a, y, c, d, y + 1.05, e);
  b.box('frame', a, y + 1.05, c, d, y + 1.09, e);
}

function balconySet(b: Bucket, x: number, z: number, y: number) {
  b.rounded('teak', [x, y + 0.36, z], [0.55, 0.06, 0.55], 0.02);
  b.cylinder('frame', [x, y + 0.18, z], 0.03, 0.03, 0.34, 8);
  for (const dx of [-0.65, 0.65]) {
    b.rounded('potWhite', [x + dx, y + 0.22, z], [0.6, 0.12, 0.6], 0.05);
    b.rounded('potWhite', [x + dx + (dx > 0 ? 0.25 : -0.25), y + 0.45, z], [0.1, 0.5, 0.6], 0.04);
  }
}

const touches = (a: number, b: number) => Math.abs(a - b) < 0.35;
const spans = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.3;

/** Does a slab hang over this wall's face? Then its downlights wash the wall. */
function covered(w: Wall, above: readonly Rect[]) {
  return above.some(([x0, z0, x1, z1]) => {
    if (w.side === 'S') return touches(z0, w.plane) && spans(x0, x1, w.from, w.to);
    if (w.side === 'N') return touches(z1, w.plane) && spans(x0, x1, w.from, w.to);
    if (w.side === 'E') return touches(x0, w.plane) && spans(z0, z1, w.from, w.to);
    return touches(x1, w.plane) && spans(z0, z1, w.from, w.to);
  });
}

/** The slabs over a level's balconies: the balconies of the floor above, or the roof's overhangs. */
function slabsAbove(level: number): readonly Rect[] {
  if (level >= PENTHOUSE_LEVEL) return ROOF_PLAN.overhangs;
  return planFor(level + 1)?.balconies.map((x) => x.rect) ?? [];
}

// ─── Walls and glazing ───────────────────────────────────────────────────

function glaze(b: Bucket, w: Wall, o: Opening, a: number, c: number, y0: number, y1: number) {
  const { side, plane } = w;
  if (o.small) {
    const s0 = y0 + 0.95;
    const s1 = Math.min(y1 - 0.4, s0 + 1.5);
    face(b, 'plaster', side, plane, a, c, y0, s0, -T, 0);
    face(b, 'plaster', side, plane, a, c, s1, y1, -T, 0);
    face(b, 'glass', side, plane, a, c, s0, s1, -0.2, -0.18);
    face(b, 'frame', side, plane, a - 0.05, c + 0.05, s0 - 0.05, s0, -0.2, 0.05);
    facePlane(b, nextCard(), side, plane, (a + c) / 2, (s0 + s1) / 2, c - a, s1 - s0, -0.9);
    return;
  }
  const r = o.recess ?? 0;
  let g0 = a;
  let g1 = c;
  if (r) {
    // An inset balcony: reveals either side, a beam over it, a balustrade on the face.
    g0 = a + 0.14;
    g1 = c - 0.14;
    face(b, 'plaster', side, plane, a, g0, y0, y1, -r, 0);
    face(b, 'plaster', side, plane, g1, c, y0, y1, -r, 0);
    face(b, 'plaster', side, plane, g0, g1, y1 - 0.3, y1, -T, 0);
    face(b, 'balustrade', side, plane, g0, g1, y0, y0 + 1.05, -0.1, -0.04);
    face(b, 'frame', side, plane, g0, g1, y0 + 1.05, y0 + 1.09, -0.11, -0.03);
  }
  face(b, o.clear ? 'clearGlass' : 'glass', side, plane, g0, g1, y0, y1, -r - 0.14, -r - 0.12);
  // Slim bronze frames: head, sill, jambs, and a mullion to every pane.
  face(b, 'frame', side, plane, g0, g1, y1 - 0.06, y1, -r - 0.16, -r - 0.08);
  face(b, 'frame', side, plane, g0, g1, y0, y0 + 0.05, -r - 0.16, -r - 0.08);
  face(b, 'frame', side, plane, g0, g0 + 0.05, y0, y1, -r - 0.16, -r - 0.08);
  face(b, 'frame', side, plane, g1 - 0.05, g1, y0, y1, -r - 0.16, -r - 0.08);
  const panes = Math.max(1, Math.round((g1 - g0) / 1.35));
  for (let i = 1; i < panes; i++) {
    const u = g0 + ((g1 - g0) * i) / panes;
    face(b, 'frame', side, plane, u - 0.025, u + 0.025, y0, y1, -r - 0.16, -r - 0.08);
  }
  if (!o.clear) facePlane(b, nextCard(), side, plane, (g0 + g1) / 2, (y0 + y1) / 2, g1 - g0 + 0.1, y1 - y0, -r - 0.95);
}

function drawWall(b: Bucket, w: Wall, level: number, lit: boolean) {
  const y0 = SLAB;
  const y1 = F;
  // The short blank cheeks of the centre bay on the street face are lined in walnut.
  const cheek = level >= 1 && !w.openings.length && w.to - w.from < 1.2 && (w.side === 'E' || w.side === 'W') && w.from > 12;
  const solid = (a: number, c: number, timber: boolean) => {
    if (c - a < 0.03) return;
    if (timber) {
      face(b, 'walnut', w.side, w.plane, a, c, y0, y1, -T, 0.02);
      for (let u = a + 0.08; u < c - 0.07; u += 0.22) face(b, 'walnut', w.side, w.plane, u, u + 0.07, y0, y1, 0.02, 0.07);
      return;
    }
    face(b, 'plaster', w.side, w.plane, a, c, y0, y1, -T, 0);
    if (lit && c - a > 0.45) facePlane(b, 'scallop', w.side, w.plane, (a + c) / 2, y1 - 1.15, Math.min(1.1, c - a), 2.3, 0.02);
  };
  let cursor = w.from;
  w.openings.forEach((o, i) => {
    const a = Math.max(cursor, o.at - o.width / 2);
    const c = Math.min(w.to, o.at + o.width / 2);
    const prev = w.openings[i - 1];
    // A pier between two windows of a home's street face, also in walnut.
    const pier = i > 0 && w.side === 'S' && level >= 1 && !o.small && !prev?.small && a - cursor < 2;
    solid(cursor, a, pier);
    glaze(b, w, o, a, c, y0, y1);
    cursor = c;
  });
  solid(cursor, w.to, cheek);
}

function drawBalcony(b: Bucket, bal: Balcony, level: number, seed: number) {
  const [x0, z0, x1, z1] = bal.rect;
  b.box('slab', x0, 0, z0, x1, 0.3, z1);
  for (const side of bal.rails) rail(b, side, bal.rect, 0.3);
  if (level >= 1) soffitLights(b, bal.rect);
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const depth = alongX ? z1 - z0 : x1 - x0;
  if (depth < 1.3 || len < 3) return;
  // Planting at either end, and a table where there is room for one.
  const at = (t: number): [number, number] => (alongX ? [x0 + len * t, (z0 + z1) / 2] : [(x0 + x1) / 2, z0 + len * t]);
  [0.55 / len, 1 - 0.55 / len].forEach((t, i) => {
    const [x, z] = at(t);
    pottedPlant(b, (seed + i) % 2 ? 'potDark' : 'potWhite', 'leaf', x, 0.3, z, 0.95, seed * 13 + i);
  });
  if (len >= 6 && depth >= 1.6) {
    const [x, z] = at(0.36);
    balconySet(b, x, z, 0.3);
  }
}

/** A screen of vertical fins standing off the wall; a deep one stands on a ledge. */
function drawScreen(b: Bucket, s: Screen) {
  const { side, plane, from, to, depth } = s;
  const d0 = depth - 0.3;
  if (depth > 1) face(b, 'slab', side, plane, from, to, 0, 0.25, 0, depth);
  for (let u = from + 0.15; u < to - 0.12; u += 0.5) face(b, 'plaster', side, plane, u, u + 0.12, 0.3, F, d0, depth);
  face(b, 'plaster', side, plane, from, to, F - 0.1, F, d0, depth);
  face(b, 'plaster', side, plane, from, to, 0.25, 0.37, d0, depth);
  // Returns back to the wall at either end.
  face(b, 'plaster', side, plane, from, from + 0.09, 0.25, F, 0, depth);
  face(b, 'plaster', side, plane, to - 0.09, to, 0.25, F, 0, depth);
}

// ─── Levels ──────────────────────────────────────────────────────────────

/** Everything a plan describes: floor plate, walls and glazing, balconies, screens. */
function drawPlan(b: Bucket, plan: LevelPlan) {
  const { level } = plan;
  // Floor plate with a crisp white edge band.
  for (const [x0, z0, x1, z1] of plan.plate) b.box('slab', x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, SLAB, z1 + 0.08);
  const above = slabsAbove(level);
  for (const w of plan.walls) drawWall(b, w, level, covered(w, above));
  plan.balconies.forEach((bal, i) => drawBalcony(b, bal, level, level * 31 + i));
  for (const s of plan.screens) drawScreen(b, s);
  for (const [x0, z0, x1, z1] of plan.dividers) b.box('plaster', x0, 0.3, z0, x1, F, z1);
  // Stair and lift core.
  b.box('plaster', CORE[0], SLAB, CORE[1], CORE[2], F, CORE[3]);
  // The gallery around the atrium.
  for (const [x0, z0, x1, z1] of cut([GALLERY], ATRIUM)) b.box('marble', x0, SLAB, z0, x1, SLAB + 0.02, z1);
  if (level >= 1) {
    const [x0, z0, x1, z1] = ATRIUM;
    const ring: Rect = [x0 - 0.06, z0 - 0.06, x1 + 0.06, z1 + 0.06];
    for (const side of ['S', 'N', 'E', 'W'] as const) rail(b, side, ring, SLAB);
  }
}

/** The rounded white band that gives the west wing's street face its rhythm. */
function signature(b: Bucket, level: number) {
  if (level === 1 || level === 3) {
    const [x0, z0, x1, z1] = WEST_WING;
    b.add('plaster', slabGeometry(x0 - 0.2, z0, x1 + 0.1, z1 + 0.3, -0.12, 0.42, 1.0, [true, true, false, false]));
    b.box('led', x0 + 0.5, -0.15, z1 - 0.2, x1 - 0.5, -0.12, z1 - 0.05);
  }
}

function residentialLevel(b: Bucket, level: number) {
  const plan = planFor(level);
  if (!plan) return;
  drawPlan(b, plan);
  signature(b, level);
  if (level === PENTHOUSE_LEVEL) {
    // Posts under the pergola along the east terrace.
    const [, z0, x1, z1] = ROOF_PLAN.pergola;
    for (let z = z0 + 0.3; z <= z1; z += (z1 - z0 - 0.6) / 4) b.box('charcoal', x1 - 0.22, 0.3, z - 0.07, x1 - 0.08, F, z + 0.07);
  }
}

function groundLevel(b: Bucket) {
  const plan = planFor(0)!;
  for (const [x0, z0, x1, z1] of plan.plate) b.box('stone', x0 - 0.15, -0.45, z0 - 0.15, x1 + 0.15, 0.04, z1 + 0.15);
  drawPlan(b, plan);
  canopy(b);
  lobby(b);
  commonRooms(b);
  poolTerrace(b);
  pool(b);
  courtyard(b);
}

/** The entrance: a curved cantilever with a walnut soffit, downlights and planting on top. */
function canopy(b: Bucket) {
  const [x0, z0, x1, z1] = CANOPY;
  const cx = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const depth = z1 - z0;
  b.add('plaster', slabGeometry(x0, z0, x1, z1, 3.05, 3.55, Math.min(half, depth) - 0.2, [true, true, false, false]));
  b.add('walnut', slabGeometry(x0 + 0.3, z0, x1 - 0.3, z1 - 0.3, 3.0, 3.05, Math.min(half, depth) - 0.5, [true, true, false, false]));
  for (const [dx, dz] of [[-2.2, 0.8], [0, 0.8], [2.2, 0.8], [-1.3, 2], [1.3, 2]] as const) downlight(b, cx + dx, 2.99, z0 + dz);
  rand(404);
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI;
    const g = shrubGeometry(i + 3);
    g.scale(0.5 + rand() * 0.25, 0.45 + rand() * 0.3, 0.5);
    g.translate(cx + Math.cos(a) * (half - 0.9), 3.58, z0 + 0.5 + Math.sin(a) * (depth - 1.3));
    b.add(i % 4 === 0 ? 'flower' : 'hedge', g);
  }
  // Walnut cheeks either side of the porch.
  const porch = PARTS.find((p) => p.label === 'Reception')!.rect;
  b.box('walnut', porch[0] - 0.05, SLAB, z0 - 0.55, porch[0] + 0.35, F, z0);
  b.box('walnut', porch[2] - 0.35, SLAB, z0 - 0.55, porch[2] + 0.05, F, z0);
  for (let x = porch[0] + 1; x < porch[2] - 0.5; x += 1.6) downlight(b, x, F - 0.005, z0 - 1);
}

/** Reception: marble, a walnut slatted wall, a sculptural chandelier. */
function lobby(b: Bucket) {
  const [x0, z0, x1, z1] = PARTS.find((p) => p.label === 'Reception')!.rect;
  const y = SLAB;
  const cx = (x0 + x1) / 2;
  b.box('marble', x0, y, z0, x1, y + 0.02, z1 - 0.2);
  // The back wall, in walnut slats, carries the name.
  b.box('walnut', x0, y, z0, x1, F, z0 + 0.2);
  for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.17) b.box('walnut', x, y, z0 + 0.2, x + 0.07, F, z0 + 0.28);
  const sign = new THREE.PlaneGeometry(3.2, 0.5);
  sign.translate(cx, 2.35, z0 + 0.31);
  b.add('sign', sign);
  b.box('marbleDark', x1 - 0.15, y, z0 + 0.2, x1, F, z1 - 0.3);
  // Reception desk: a marble monolith floating on a line of light.
  b.rounded('marble', [cx, y + 0.62, z0 + 1.7], [3.0, 0.95, 0.8], 0.06);
  b.box('led', cx - 1.45, y + 0.08, z0 + 2.08, cx + 1.45, y + 0.12, z0 + 2.12);
  b.box('brass', cx - 1.5, y + 1.1, z0 + 1.25, cx + 1.5, y + 1.13, z0 + 2.15);
  // Chandelier: a cloud of glass drops.
  rand(77);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.2;
    const x = cx + Math.cos(a) * r;
    const z = z0 + 3.5 + Math.sin(a) * r * 0.7;
    const yy = 2.25 + rand() * 0.7;
    const g = new THREE.SphereGeometry(0.06 + rand() * 0.03, 12, 8);
    g.translate(x, yy, z);
    b.add('bulb', g);
    b.box('brass', x - 0.004, yy, z - 0.004, x + 0.004, F, z + 0.004);
  }
  // Lounge: sofa, two leather chairs, a travertine table, rug and planting.
  const lz = z1 - 1.5;
  b.rounded('rug', [cx + 1.2, y + 0.03, lz - 0.9], [3.2, 0.03, 2.4], 0.02);
  b.rounded('boucle', [cx + 1.2, y + 0.23, lz], [2.4, 0.42, 0.85], 0.12);
  b.rounded('boucle', [cx + 1.2, y + 0.55, lz + 0.35], [2.4, 0.5, 0.25], 0.1);
  for (const dx of [0.1, 2.3]) {
    b.rounded('leather', [cx + dx, y + 0.25, lz - 2], [0.8, 0.45, 0.8], 0.12);
    b.rounded('leather', [cx + dx, y + 0.55, lz - 2.28], [0.8, 0.45, 0.22], 0.08);
  }
  b.cylinder('stone', [cx + 1.2, y + 0.2, lz - 1.1], 0.5, 0.5, 0.4, 32);
  pottedPlant(b, 'potDark', 'leaf', x0 + 0.7, y, z1 - 1, 1.6, 5);
  pottedPlant(b, 'potDark', 'leaf', x1 - 0.7, y, z0 + 0.9, 1.6, 6);
  for (let x = x0 + 0.9; x <= x1 - 0.5; x += 1.7) for (let z = z0 + 1.2; z <= z1 - 0.6; z += 1.8) downlight(b, x, F - 0.005, z);
  b.box('led', x0 + 0.05, F - 0.06, z0 + 0.25, x1 - 0.2, F - 0.03, z0 + 0.35);
}

/** Co-working and the residents' meeting room, seen through their glass. */
function commonRooms(b: Bucket) {
  const y = SLAB;
  const room = (label: string) => PARTS.find((p) => p.label === label)!.rect;
  {
    const [x0, z0, x1, z1] = room('Co-working');
    b.box('oak', x0 + 0.1, y, z0 + 0.1, x1 - 0.3, y + 0.02, z1 - 0.3);
    for (const z of [z0 + 2.6, z0 + 5.6]) {
      b.rounded('walnut', [(x0 + x1) / 2, y + 0.74, z], [x1 - x0 - 3.4, 0.06, 1.1], 0.02);
      for (const dx of [-1, 1]) b.box('frame', (x0 + x1) / 2 + dx * 2.2 - 0.04, y, z - 0.4, (x0 + x1) / 2 + dx * 2.2 + 0.04, y + 0.72, z + 0.4);
      for (let x = x0 + 2.3; x < x1 - 2; x += 1.25) {
        for (const dz of [-0.9, 0.9]) b.rounded('leather', [x, y + 0.3, z + dz], [0.5, 0.5, 0.5], 0.08);
        const g = new THREE.SphereGeometry(0.09, 12, 8);
        g.translate(x, 2.25, z);
        b.add('bulb', g);
      }
    }
    pottedPlant(b, 'potDark', 'leaf', x1 - 1, y, z1 - 1, 1.5, 21);
    pottedPlant(b, 'potDark', 'leaf', x0 + 0.8, y, z0 + 0.8, 1.5, 22);
  }
  {
    const [x0, z0, x1, z1] = room('Residents’ meeting room');
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.box('oak', x0 + 0.1, y, z0 + 0.1, x1 - 0.1, y + 0.02, z1 - 0.1);
    b.rounded('rugDark', [cx, y + 0.03, cz], [4.2, 0.03, 7.4], 0.02);
    b.rounded('walnut', [cx, y + 0.74, cz], [1.5, 0.07, 5.8], 0.04);
    b.box('frame', cx - 0.3, y, cz - 2.3, cx + 0.3, y + 0.7, cz + 2.3);
    for (let z = cz - 2.5; z <= cz + 2.5; z += 0.72) for (const dx of [-1.15, 1.15]) b.rounded('leather', [cx + dx, y + 0.32, z], [0.5, 0.55, 0.5], 0.09);
    for (let z = cz - 2; z <= cz + 2; z += 2) {
      const g = new THREE.SphereGeometry(0.1, 12, 8);
      g.translate(cx, 2.3, z);
      b.add('bulb', g);
    }
  }
}

/** The covered terrace between reception and the pool: loungers, three dining tables, the changing rooms. */
function poolTerrace(b: Bucket) {
  const [x0, z0, x1, z1] = PARTS.find((p) => p.label === 'Pool terrace')!.rect;
  const y = SLAB;
  b.box('teak', x0, y, z0, x1, y + 0.03, z1);
  // Changing rooms on the street corner; two columns carry the floors above the pool's edge.
  b.box('plaster', x0 + 0.1, y, z1 - 4.1, x0 + 2.8, F, z1);
  for (const z of [z1 - 8.6, z1 - 2.1]) b.box('plaster', x0 - 0.15, y - 0.3, z - 0.2, x0 + 0.15, F, z + 0.2);
  for (let i = 0; i < 5; i++) {
    const z = z0 + 1.6 + i * 1.05;
    b.rounded('potWhite', [x0 + 1.5, y + 0.25, z], [1.95, 0.16, 0.72], 0.07);
    b.rounded('linen', [x0 + 1.55, y + 0.36, z], [1.85, 0.08, 0.66], 0.04);
    b.rounded('linen', [x0 + 2.3, y + 0.52, z], [0.55, 0.08, 0.66], 0.04);
  }
  for (let i = 0; i < 3; i++) {
    const x = x1 - 2;
    const z = z1 - 1.9 - i * 2.9;
    b.rounded('walnut', [x, y + 0.74, z], [1.1, 0.06, 1.5], 0.03);
    b.cylinder('frame', [x, y + 0.37, z], 0.05, 0.2, 0.74, 12);
    for (const [dx, dz] of [[-0.85, -0.4], [-0.85, 0.4], [0.85, -0.4], [0.85, 0.4]] as const) b.rounded('boucle', [x + dx, y + 0.3, z + dz], [0.5, 0.5, 0.5], 0.1);
  }
  for (let x = x0 + 1.2; x < x1; x += 2) for (let z = z0 + 1.2; z < z1; z += 2.4) downlight(b, x, F - 0.005, z);
  pottedPlant(b, 'potDark', 'leaf', x1 - 0.7, y, z0 + 0.8, 1.6, 31);
  pottedPlant(b, 'potDark', 'leaf', x0 + 3.5, y, z1 - 0.7, 1.4, 32);
}

/** The lap pool: under the building for half its length, in the open toward the street. */
function pool(b: Bucket) {
  const [x0, z0, x1, z1] = POOL;
  const top = SLAB + 0.04;
  const c = 0.35;
  // Travertine coping, carried down to the ground.
  b.box('stone', x0 - c, -0.45, z0 - c, x1 + c, top, z0);
  b.box('stone', x0 - c, -0.45, z1, x1 + c, top, z1 + c);
  b.box('stone', x0 - c, -0.45, z0, x0, top, z1);
  b.box('stone', x1, -0.45, z0, x1 + c, top, z1);
  b.box('poolTile', x0, -0.02, z0, x1, 0, z1);
  b.box('poolTile', x0, 0, z0, x0 + 0.04, top - 0.02, z1);
  b.box('poolTile', x1 - 0.04, 0, z0, x1, top - 0.02, z1);
  b.box('poolTile', x0, 0, z0, x1, top - 0.02, z0 + 0.04);
  b.box('poolTile', x0, 0, z1 - 0.04, x1, top - 0.02, z1);
  const w = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
  w.rotateX(-Math.PI / 2);
  w.translate((x0 + x1) / 2, top - 0.1, (z0 + z1) / 2);
  b.add('water', w);
  // Underwater lights along the long walls.
  for (let z = z0 + 1.2; z < z1; z += 2.6) {
    for (const [x, ry] of [[x0 + 0.05, Math.PI / 2], [x1 - 0.05, -Math.PI / 2]] as const) {
      const g = new THREE.CircleGeometry(0.07, 16);
      g.rotateY(ry);
      g.translate(x, top - 0.25, z);
      b.add('bulb', g);
    }
  }
}

/** The foot of the atrium: a planted court under the skylight. */
function courtyard(b: Bucket) {
  const [x0, z0, x1, z1] = ATRIUM;
  const y = SLAB;
  for (const [a, c, d, e] of [[x0, z0, x1, z0 + 0.15], [x0, z1 - 0.15, x1, z1], [x0, z0, x0 + 0.15, z1], [x1 - 0.15, z0, x1, z1]] as const) b.box('stone', a, y, c, d, y + 0.35, e);
  rand(808);
  for (let i = 0; i < 16; i++) {
    const g = shrubGeometry(i + 40);
    const s = 0.45 + rand() * 0.35;
    g.scale(s, s * 0.8, s);
    g.translate(x0 + 0.7 + rand() * (x1 - x0 - 1.4), y + 0.4, z0 + 0.7 + (i / 15) * (z1 - z0 - 1.4));
    b.add(i % 5 === 0 ? 'flower' : 'hedge', g);
  }
  for (const t of [0.22, 0.78]) pottedPlant(b, 'potDark', 'leaf', (x0 + x1) / 2, y + 0.2, z0 + (z1 - z0) * t, 2.4, 60 + t * 10);
}

function roofLevel(b: Bucket) {
  const r = 0.4;
  for (const [x0, z0, x1, z1] of ROOF_PLAN.plate) b.box('slab', x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, r, z1 + 0.08);
  // The parapet follows the walls below, with a stone coping.
  for (const w of ROOF_PLAN.parapet) {
    face(b, 'plaster', w.side, w.plane, w.from, w.to, r, r + 1, -0.25, 0);
    face(b, 'slab', w.side, w.plane, w.from - 0.03, w.to + 0.03, r + 1, r + 1.06, -0.28, 0.05);
  }
  // The slab carries on over the street and north terraces of the penthouses, lit from its soffit.
  for (const o of ROOF_PLAN.overhangs) {
    b.box('slab', o[0] - 0.08, 0, o[1] - 0.08, o[2] + 0.08, 0.3, o[3] + 0.08);
    soffitLights(b, o);
  }
  // A pergola of walnut slats over the east terrace, on a charcoal edge beam.
  {
    const [x0, z0, x1, z1] = ROOF_PLAN.pergola;
    for (let z = z0 + 0.2; z < z1; z += 0.5) b.box('walnut', x0, 0.02, z, x1 - 0.05, 0.2, z + 0.12);
    b.box('charcoal', x1 - 0.25, -0.02, z0, x1 - 0.05, 0.24, z1);
  }
  // The glass skylight over the atrium: a low kerb, a lantern of glazing bars.
  {
    const [x0, z0, x1, z1] = ROOF_PLAN.skylight;
    for (const [a, c, d, e] of [[x0, z0, x1, z0 + 0.2], [x0, z1 - 0.2, x1, z1], [x0, z0, x0 + 0.2, z1], [x1 - 0.2, z0, x1, z1]] as const) b.box('plaster', a, r, c, d, r + 0.55, e);
    b.box('clearGlass', x0 + 0.1, r + 0.55, z0 + 0.1, x1 - 0.1, r + 0.58, z1 - 0.1);
    for (let i = 0; i <= 4; i++) {
      const x = x0 + 0.1 + ((x1 - x0 - 0.2) * i) / 4;
      b.box('frame', x - 0.03, r + 0.55, z0 + 0.1, x + 0.03, r + 0.62, z1 - 0.1);
    }
    for (let i = 0; i <= 7; i++) {
      const z = z0 + 0.1 + ((z1 - z0 - 0.2) * i) / 7;
      b.box('frame', x0 + 0.1, r + 0.55, z - 0.03, x1 - 0.1, r + 0.62, z + 0.03);
    }
  }
  // Stair and lift overrun.
  {
    const [x0, z0, x1, z1] = ROOF_PLAN.overrun;
    b.box('plaster', x0, r, z0, x1, r + 2.6, z1);
    b.box('slab', x0 - 0.2, r + 2.6, z0 - 0.2, x1 + 0.2, r + 2.8, z1 + 0.2);
  }
  // The name, over the centre bay of the street face: a white pylon holding a walnut-and-brass sign.
  {
    const { z, from, to } = ROOF_PLAN.sign;
    const w = to - from;
    b.rounded('plaster', [(from + to) / 2, r + 1.7, z], [w, 3.4, 0.9], 0.25);
    const sign = new THREE.PlaneGeometry(w - 0.9, (w - 0.9) / 6.4);
    sign.translate((from + to) / 2, r + 1.9, z + 0.47);
    b.add('sign', sign);
  }
  pottedPlant(b, 'potDark', 'leaf', ROOF_PLAN.overrun[2] + 1.5, r, ROOF_PLAN.overrun[3] - 0.5, 1.4, 9);
}

/** Parking under the building: a slab, the columns, the bays the plan draws, and the wellness rooms. */
function basementLevel(b: Bucket) {
  const parking = PARTS.find((p) => p.kind === 'basement')!.rect;
  const [x0, z0, x1, z1] = parking;
  b.box('stone', x0, 0, z0, x1, 0.2, z1);
  for (const [a, c, d, e] of [[x0, z0, x1, z0 + 0.25], [x0, z1 - 0.25, x1, z1], [x0, z0, x0 + 0.25, z1], [x1 - 0.25, z0, x1, z1]] as const) b.box('charcoal', a, 0.2, c, d, 1.1, e);
  b.box('plaster', CORE[0], 0.2, CORE[1], CORE[2], F, CORE[3]);
  for (const p of PARTS) {
    if (p.level !== BASEMENT_LEVEL || p.kind !== 'amenity') continue;
    const [a, c, d, e] = p.rect;
    b.box('oak', a + 0.1, 0.2, c + 0.1, d - 0.1, 0.23, e - 0.1);
    b.box('wall', a, 0.2, c, d, 1.3, c + 0.12);
    b.box('wall', a, 0.2, c, a + 0.12, 1.3, e);
    b.box('wall', d - 0.12, 0.2, c, d, 1.3, e);
  }
}

// ─── The building ────────────────────────────────────────────────────────

export class Building {
  readonly root = new THREE.Group();
  readonly site = new THREE.Group();
  readonly levels = new Map<number, THREE.Group>();
  readonly units = new Map<string, UnitVisual>();
  readonly unitRoot = new THREE.Group();
  /** Interior cards per level, hidden when a floor is opened up. */
  private cards = new Map<number, THREE.Mesh[]>();
  private cutaways = new Map<number, THREE.Group>();
  /** Solid meshes the pointer can hit, so a click on a wall does not reach a unit behind it. */
  readonly occluders: THREE.Object3D[] = [];

  constructor(private mats: Materials) {
    this.root.name = 'building';
    this.root.add(this.unitRoot);
  }

  /** `basement` also draws the parking level, for a view that can look below ground. */
  build(opts: { basement?: boolean } = {}) {
    cardSeed = 0;
    const levels: number[] = opts.basement ? [BASEMENT_LEVEL, ...BUILDING_LEVELS] : [...BUILDING_LEVELS];
    for (const level of levels) {
      const g = new THREE.Group();
      g.name = `level-${level}`;
      g.position.y = levelBase(level);
      const b = new Bucket();
      if (level === BASEMENT_LEVEL) basementLevel(b);
      else if (level === 0) groundLevel(b);
      else if (level === ROOF_LEVEL) roofLevel(b);
      else residentialLevel(b, level);
      const meshes = b.build(g, (k) => this.mats.forLevel(k, level), {
        uvScale: (k) => UV[k] ?? null,
        shadows: (k) => ({ cast: !NO_SHADOW.has(k), receive: !NO_SHADOW.has(k) }),
      });
      this.cards.set(level, meshes.filter((m) => m.name.startsWith('card')));
      for (const m of meshes) if (m.name === 'plaster' || m.name === 'slab' || m.name === 'walnut' || m.name === 'charcoal') this.occluders.push(m);
      this.levels.set(level, g);
      this.root.add(g);
    }
    this.root.add(this.site);
  }

  setCardsVisible(level: number, visible: boolean) {
    for (const m of this.cards.get(level) ?? []) m.visible = visible;
  }

  // ─── Residences ────────────────────────────────────────────────────────

  setUnits(list: UnitRef[]) {
    for (const u of this.units.values()) {
      for (const m of [...u.meshes, ...u.tiles]) m.geometry.dispose();
      for (const l of u.lines) l.geometry.dispose();
      u.fill.dispose();
      u.edge.dispose();
      u.tile.dispose();
    }
    this.units.clear();
    this.unitRoot.clear();
    for (const c of this.cutaways.values()) c.removeFromParent();
    this.cutaways.clear();

    for (const r of list) {
      const vols = unitVolumes(r.code, r.floorLevel, r.modelSlot);
      if (!vols.length) continue;
      const fill = new THREE.MeshBasicMaterial({ color: '#E8C07A', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const edge = new THREE.LineBasicMaterial({ color: '#FFE2AE', transparent: true, opacity: 0 });
      const tile = new THREE.MeshBasicMaterial({ color: '#E8C07A', transparent: true, opacity: 0, depthWrite: false });
      const visual: UnitVisual = { id: r.id, level: r.floorLevel, center: new THREE.Vector3(), rects: [], fill, edge, tile, meshes: [], tiles: [], lines: [] };
      let area = 0;
      for (const v of vols) {
        const [rx0, rz0, rx1, rz1] = v.rect;
        if (v.level === r.floorLevel) visual.rects.push([rx0, rz0, rx1, rz1]);
        // The highlight reaches past the home's own walls and balconies, so it sits on the facade.
        const [x0, z0, x1, z1] = unitEnvelope(v.level, v.rect);
        const h = v.y1 - v.y0 + 0.25;
        const geo = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
        const group = this.levelUnitGroup(v.level);
        const mesh = new THREE.Mesh(geo, fill);
        mesh.position.set((x0 + x1) / 2, v.y0 + h / 2 - 0.05, (z0 + z1) / 2);
        mesh.userData.unitId = r.id;
        mesh.renderOrder = 5;
        group.add(mesh);
        visual.meshes.push(mesh);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge);
        lines.position.copy(mesh.position);
        lines.renderOrder = 6;
        group.add(lines);
        visual.lines.push(lines);
        if (v.level === r.floorLevel) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(rx1 - rx0 - 0.3, rz1 - rz0 - 0.3), tile);
          t.rotation.x = -Math.PI / 2;
          t.position.set((rx0 + rx1) / 2, SLAB + 0.05, (rz0 + rz1) / 2);
          t.renderOrder = 4;
          t.visible = false;
          group.add(t);
          visual.tiles.push(t);
          const a = (rx1 - rx0) * (rz1 - rz0);
          if (a > area) {
            area = a;
            visual.center.set((rx0 + rx1) / 2, levelBase(r.floorLevel) + F * 0.5, (rz0 + rz1) / 2);
          }
        }
      }
      this.units.set(r.id, visual);
    }
  }

  private levelUnitGroup(level: number) {
    let g = this.unitRoot.getObjectByName(`units-${level}`) as THREE.Group | undefined;
    if (!g) {
      g = new THREE.Group();
      g.name = `units-${level}`;
      g.position.y = levelBase(level);
      this.unitRoot.add(g);
    }
    return g;
  }

  unitGroup(level: number) {
    return this.unitRoot.getObjectByName(`units-${level}`) as THREE.Group | undefined;
  }

  // ─── Floor cutaway: every residence on a level, furnished, seen from above ─

  cutaway(level: number, list: UnitRef[]) {
    let g = this.cutaways.get(level);
    if (g) return g;
    g = new THREE.Group();
    g.name = `cutaway-${level}`;
    const b = new Bucket();
    for (const r of list) {
      if (r.floorLevel !== level) continue;
      furnishHome(b, this.units.get(r.id)?.rects ?? [], r.bedrooms);
    }
    b.build(g, (k) => this.mats.get(k), { uvScale: (k) => UV[k] ?? null, shadows: () => ({ cast: true, receive: true }) });
    this.levels.get(level)?.add(g);
    this.cutaways.set(level, g);
    return g;
  }

  showCutaway(level: number | null, list: UnitRef[]) {
    for (const [l, g] of this.cutaways) g.visible = l === level;
    for (const l of BUILDING_LEVELS) this.setCardsVisible(l, l !== level);
    if (level !== null) this.cutaway(level, list).visible = true;
  }
}

const areaOf = ([x0, z0, x1, z1]: Rect) => (x1 - x0) * (z1 - z0);

/**
 * Furnishes a home across its rooms: the largest holds the living room, and
 * bedrooms take the rest. Illustrative — the approved plan for each residence
 * comes from the sales team.
 */
function furnishHome(b: Bucket, rects: readonly Rect[], bedrooms: number) {
  const [main, ...rest] = [...rects].sort((a, c) => areaOf(c) - areaOf(a));
  if (!main) return;
  furnishUnit(b, main, Math.max(0, bedrooms - rest.length));
  for (const r of rest) furnishBedroom(b, r);
}

/** A sleeping wing: floor, party walls, a bed against the long wall. */
function furnishBedroom(b: Bucket, [x0, z0, x1, z1]: Rect) {
  const y = SLAB;
  const wallH = F - SLAB - 0.55;
  b.box('oak', x0 + 0.12, y, z0 + 0.12, x1 - 0.12, y + 0.03, z1 - 0.12);
  b.box('wall', x0, y, z0, x1, y + wallH, z0 + 0.12);
  b.box('wall', x0, y, z1 - 0.12, x1, y + wallH, z1);
  b.box('wall', x0, y, z0, x0 + 0.12, y + wallH, z1);
  b.box('wall', x1 - 0.12, y, z0, x1, y + wallH, z1);
  const alongX = x1 - x0 >= z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const size = (du: number, dv: number, h: number): V3 => (alongX ? [du, h, dv] : [dv, h, du]);
  const at = (du: number, yy: number): V3 => (alongX ? [cx + du, yy, cz] : [cx, yy, cz + du]);
  b.rounded('linen', at(0, y + 0.3), size(2.1, 1.8, 0.52), 0.12);
  b.rounded('walnut', at(1.12, y + 0.56), size(0.14, 2.1, 1.07), 0.03);
  b.rounded('boucle', at(0.75, y + 0.6), size(0.35, 1.4, 0.18), 0.08);
  b.rounded('rug', at(-0.6, y + 0.04), size(2.6, 2.6, 0.02), 0.02);
}

/**
 * Lays out a furnished plan inside one residence rectangle: living, dining and
 * kitchen at one end, bedrooms and a bath at the other.
 */
function furnishUnit(b: Bucket, rect: Rect, bedrooms: number) {
  const [x0, z0, x1, z1] = rect;
  const alongX = x1 - x0 >= z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0;
  const S = alongX ? z1 - z0 : x1 - x0;
  const y = SLAB;
  const W = (u: number, v: number): [number, number] => (alongX ? [x0 + u, z0 + v] : [x0 + v, z0 + u]);
  const box = (key: string, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number) => {
    const [ax, az] = W(u0, v0);
    const [bx, bz] = W(u1, v1);
    b.box(key, Math.min(ax, bx), y + h0, Math.min(az, bz), Math.max(ax, bx), y + h1, Math.max(az, bz));
  };
  const soft = (key: string, u: number, v: number, du: number, dv: number, h0: number, h1: number, r = 0.08) => {
    const [cx, cz] = W(u, v);
    const size: V3 = alongX ? [du, h1 - h0, dv] : [dv, h1 - h0, du];
    b.rounded(key, [cx, y + (h0 + h1) / 2, cz], size, r);
  };
  const wallH = F - SLAB - 0.55;
  box('oak', 0.12, 0.12, L - 0.12, S - 0.12, 0, 0.03);
  // Party walls around the residence, cut low so the plan reads from above.
  box('wall', 0, 0, L, 0.12, 0, wallH);
  box('wall', 0, S - 0.12, L, S, 0, wallH);
  box('wall', 0, 0, 0.12, S, 0, wallH);
  box('wall', L - 0.12, 0, L, S, 0, wallH);

  const beds = Math.max(0, Math.min(3, bedrooms));
  const livingU = beds === 0 ? L : L * (beds >= 3 ? 0.45 : 0.55);
  // Living.
  const lu = livingU * 0.5;
  soft('rug', lu, S * 0.5, Math.min(3, livingU * 0.55), Math.min(2.4, S * 0.45), 0.03, 0.05, 0.02);
  soft('boucle', lu, S * 0.5 + Math.min(1.3, S * 0.25), 2.4, 0.9, 0.05, 0.75, 0.14);
  soft('stone', lu, S * 0.5 - 0.1, 1.1, 0.7, 0.05, 0.42, 0.1);
  soft('leather', lu - 1.5, S * 0.5 - 0.6, 0.8, 0.8, 0.05, 0.72, 0.14);
  // Kitchen run and dining.
  if (livingU > 5) {
    box('walnut', 0.15, 0.15, 0.75, Math.min(S - 0.3, 3.2), 0, 0.9);
    box('marble', 0.12, 0.12, 0.78, Math.min(S - 0.27, 3.23), 0.9, 0.95);
    soft('walnut', livingU * 0.82, S * 0.3, 1.8, 0.9, 0.7, 0.76, 0.03);
    for (const du of [-0.55, 0, 0.55])
      for (const dv of [-0.65, 0.65]) soft('linen', livingU * 0.82 + du, S * 0.3 + dv, 0.42, 0.42, 0.05, 0.48, 0.08);
  }
  if (beds === 0) return;
  // Private end: a partition with a doorway, then bedrooms side by side and a bath.
  box('wall', livingU, 0, livingU + 0.12, S * 0.42, 0, wallH);
  box('wall', livingU, S * 0.42 + 0.9, livingU + 0.12, S, 0, wallH);
  const privU = L - livingU;
  const rooms = beds + 1;
  const bathV = Math.min(2.4, S / rooms);
  const bedV = (S - bathV) / beds;
  for (let i = 0; i < beds; i++) {
    const v0 = bathV + i * bedV;
    box('wall', livingU, v0, L, v0 + 0.1, 0, wallH);
    const cu = livingU + privU * 0.55;
    const cv = v0 + bedV / 2;
    const bw = Math.min(i === 0 ? 2 : 1.6, bedV - 0.6);
    soft('walnut', cu + Math.min(1.1, privU * 0.3), cv, 0.14, bw + 0.3, 0.03, 1.1, 0.03);
    soft('linen', cu, cv, Math.min(2.1, privU * 0.55), bw, 0.03, 0.55, 0.12);
    soft('boucle', cu + Math.min(0.8, privU * 0.2), cv, 0.35, bw * 0.8, 0.5, 0.68, 0.08);
    soft('walnut', cu + Math.min(0.9, privU * 0.25), cv + bw / 2 + 0.35, 0.45, 0.4, 0.03, 0.55, 0.05);
  }
  // Bath: marble floor, tub and vanity.
  box('marble', livingU + 0.12, 0.12, L - 0.12, bathV, 0.03, 0.05);
  soft('ceramic', livingU + privU * 0.6, bathV * 0.5, Math.min(1.7, privU * 0.45), 0.8, 0.05, 0.58, 0.3);
  box('walnut', livingU + 0.25, 0.15, livingU + 0.85, Math.min(bathV - 0.2, 1.6), 0.3, 0.85);
}
