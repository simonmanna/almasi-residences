import * as THREE from 'three';
import { FLOOR_H, SLAB, levelBase, unitVolumes } from '../../../lib/building-model';
import { Bucket, frameGeometry, pottedPlant, rand, slabGeometry, shrubGeometry, type V3 } from './geometry';
import type { Materials } from './materials';

const F = FLOOR_H;
const X0 = -19;
const X1 = 19;
const Z0 = -10.75;
const Z1 = 10.75;
/** Levels drawn: ground, 1–3, penthouse, roof. */
export const BUILDING_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export const ROOF_LEVEL = 5;

type Side = 'S' | 'N' | 'E' | 'W';
type Style = 'glass' | 'lobby' | 'solid' | 'window' | 'walnut' | 'fins';

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

/** Where a point on a facade lands in the world: u along the face, d outward from it. */
function sideBox(b: Bucket, key: string, side: Side, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) {
  switch (side) {
    case 'S':
      return b.box(key, u0, y0, Z1 + d0, u1, y1, Z1 + d1);
    case 'N':
      return b.box(key, u0, y0, Z0 - d1, u1, y1, Z0 - d0);
    case 'E':
      return b.box(key, X1 + d0, y0, u0, X1 + d1, y1, u1);
    case 'W':
      return b.box(key, X0 - d1, y0, u0, X0 - d0, y1, u1);
  }
}

function sidePlane(b: Bucket, key: string, side: Side, uc: number, yc: number, w: number, h: number, d: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Matrix4();
  switch (side) {
    case 'S':
      m.makeTranslation(uc, yc, Z1 + d);
      break;
    case 'N':
      m.makeRotationY(Math.PI).setPosition(uc, yc, Z0 - d);
      break;
    case 'E':
      m.makeRotationY(Math.PI / 2).setPosition(X1 + d, yc, uc);
      break;
    case 'W':
      m.makeRotationY(-Math.PI / 2).setPosition(X0 - d, yc, uc);
      break;
  }
  b.add(key, g, m);
}

const SIDES: { side: Side; bounds: number[]; style: (level: number, a: number, b: number, i: number) => Style }[] = [
  {
    side: 'S',
    bounds: [-19, -16.3, -13.4, -10.3, -7.2, -4.1, -1.4, 1.4, 4.3, 7.3, 10.3, 13.4, 16.3, 19],
    style: (level, a, b) => {
      const corner = a < -16 || b > 16;
      if (level === 0) return a >= -4.1 && b <= 4.3 ? 'lobby' : corner ? 'solid' : 'glass';
      if (corner) return level === 4 ? 'glass' : 'walnut';
      if (level >= 3 && a === -4.1) return 'fins';
      return 'glass';
    },
  },
  {
    side: 'N',
    bounds: [-19, -15.8, -12.6, -9.4, -6.2, -3, -1.5, 1.5, 3, 6.2, 9.4, 12.6, 15.8, 19],
    style: (_l, a, b, i) => (a >= -3 && b <= 3 ? 'solid' : i % 3 === 1 ? 'window' : 'glass'),
  },
  {
    side: 'E',
    bounds: [-10.75, -7.2, -3.6, 0, 3.6, 7.2, 10.75],
    style: (level, _a, _b, i) => (i === 0 && level > 0 ? 'walnut' : i === 3 && level > 0 ? 'window' : 'glass'),
  },
  {
    side: 'W',
    bounds: [-10.75, -7.2, -3.6, 0, 3.6, 7.2, 10.75],
    style: (level, _a, _b, i) => (i === 5 && level > 0 ? 'walnut' : i === 2 && level > 0 ? 'window' : 'glass'),
  },
];

let cardSeed = 0;
const nextCard = () => `card${(cardSeed++ * 7 + (cardSeed >> 2)) % 4}`;

function bay(b: Bucket, side: Side, style: Style, a: number, c: number, top: number) {
  const y0 = SLAB;
  const y1 = top;
  const w = c - a - 0.42;
  const mid = (a + c) / 2;
  const h = y1 - y0;
  if (style === 'solid') {
    sideBox(b, 'plaster', side, a, c, y0, y1, -0.3, 0);
    return;
  }
  if (style === 'walnut') {
    sideBox(b, 'walnut', side, a, c, y0, y1, -0.3, 0.02);
    for (let u = a + 0.3; u < c - 0.2; u += 0.22) sideBox(b, 'walnut', side, u, u + 0.07, y0, y1, 0.02, 0.07);
    return;
  }
  if (style === 'window') {
    const ww = Math.min(1.2, w * 0.45);
    sideBox(b, 'plaster', side, a, mid - ww / 2, y0, y1, -0.3, 0);
    sideBox(b, 'plaster', side, mid + ww / 2, c, y0, y1, -0.3, 0);
    sideBox(b, 'plaster', side, mid - ww / 2, mid + ww / 2, y0, y0 + 0.5, -0.3, 0);
    sideBox(b, 'plaster', side, mid - ww / 2, mid + ww / 2, y1 - 0.35, y1, -0.3, 0);
    sideBox(b, 'glass', side, mid - ww / 2, mid + ww / 2, y0 + 0.5, y1 - 0.35, -0.2, -0.18);
    sideBox(b, 'frame', side, mid - ww / 2 - 0.05, mid + ww / 2 + 0.05, y0 + 0.45, y0 + 0.5, -0.2, 0.05);
    sidePlane(b, nextCard(), side, mid, (y0 + 0.5 + y1 - 0.35) / 2, ww, y1 - 0.35 - y0 - 0.5, -0.9);
    return;
  }
  const clear = style === 'lobby';
  sideBox(b, clear ? 'clearGlass' : 'glass', side, a + 0.2, c - 0.2, y0, y1, -0.14, -0.12);
  // Slim bronze frames: head, sill, and a central mullion on wide bays.
  sideBox(b, 'frame', side, a + 0.2, c - 0.2, y1 - 0.06, y1, -0.16, -0.08);
  sideBox(b, 'frame', side, a + 0.2, c - 0.2, y0, y0 + 0.05, -0.16, -0.08);
  if (w > 2) sideBox(b, 'frame', side, mid - 0.025, mid + 0.025, y0, y1, -0.16, -0.08);
  if (!clear) sidePlane(b, nextCard(), side, mid, (y0 + y1) / 2, w + 0.1, h, -0.95);
  if (style === 'fins') for (let u = a + 0.3; u < c - 0.2; u += 0.32) sideBox(b, 'plaster', side, u, u + 0.08, y0, y1, 0, 0.42);
}

function facade(b: Bucket, level: number) {
  for (const s of SIDES) {
    const bounds = s.bounds;
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i]!;
      const c = bounds[i + 1]!;
      const style = s.style(level, a, c, i);
      bay(b, s.side, style, a, c, F);
      // Piers between bays, proud of the glass.
      const pier = style === 'solid' || style === 'walnut' ? null : a;
      if (pier !== null) sideBox(b, 'plaster', s.side, a - 0.21, a + 0.21, SLAB, F, -0.3, 0.12);
    }
    sideBox(b, 'plaster', s.side, bounds.at(-1)! - 0.21, bounds.at(-1)! + 0.21, SLAB, F, -0.3, 0.12);
  }
}

function downlight(b: Bucket, x: number, y: number, z: number) {
  const g = new THREE.CircleGeometry(0.075, 16);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  b.add('downlight', g);
}

/** A downlight's scallop washing a pier or wall below it. */
function scallop(b: Bucket, side: Side, u: number, top: number, d: number) {
  sidePlane(b, 'scallop', side, u, top - 1.15, 1.1, 2.3, d);
}

function balustrade(b: Bucket, x0: number, z0: number, x1: number, z1: number, y: number) {
  b.box('balustrade', x0, y, z0, x1, y + 1.05, z1);
  const alongX = x1 - x0 > z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (alongX) b.box('frame', x0, y + 1.05, cz - 0.03, x1, y + 1.09, cz + 0.03);
  else b.box('frame', cx - 0.03, y + 1.05, z0, cx + 0.03, y + 1.09, z1);
}

function balconySet(b: Bucket, x: number, z: number, y: number) {
  b.rounded('teak', [x, y + 0.36, z], [0.55, 0.06, 0.55], 0.02);
  b.cylinder('frame', [x, y + 0.18, z], 0.03, 0.03, 0.34, 8);
  for (const dx of [-0.65, 0.65]) {
    b.rounded('potWhite', [x + dx, y + 0.22, z], [0.6, 0.12, 0.6], 0.05);
    b.rounded('potWhite', [x + dx + (dx > 0 ? 0.25 : -0.25), y + 0.45, z], [0.1, 0.5, 0.6], 0.04);
  }
}

// ─── Levels ──────────────────────────────────────────────────────────────

function residentialLevel(b: Bucket, level: number) {
  facade(b, level);
  // Floor plate with a crisp white edge band.
  b.box('slab', X0 - 0.12, 0, Z0 - 0.12, X1 + 0.12, SLAB, Z1 + 0.12);
  // Stair and lift core.
  b.box('plaster', -1.5, SLAB, -10.75, 1.5, F, -1.75);

  const south = level >= 1 && level <= 3;
  if (south) {
    b.box('slab', -13.4, 0, Z1, 13.4, 0.3, 12.9);
    balustrade(b, -13.4, 12.84, 13.4, 12.9, 0.3);
    for (const [x0, x1] of [[20.9, 19], [-20.9, -19]] as const) {
      b.box('slab', Math.min(x0, x1), 0, -9, Math.max(x0, x1), 0.3, 9);
      balustrade(b, x0 > 0 ? 20.84 : -20.9, -9, x0 > 0 ? 20.9 : -20.84, 9, 0.3);
      for (let z = -7; z <= 7; z += 4.6) pottedPlant(b, 'potWhite', 'leaf', x0 > 0 ? 20.4 : -20.4, 0.3, z, 0.9, level * 31 + z);
    }
    // Balcony dividers: white piers from slab to slab.
    for (const x of [-13.4, -4.1, 4.3, 13.4]) b.box('plaster', x - 0.22, 0.3, Z1, x + 0.22, F, 12.95);
  }
  if (level === 4) {
    b.box('slab', X0, 0, Z1, X1, 0.3, 12.9);
    balustrade(b, X0, 12.84, X1, 12.9, 0.3);
    for (const x of [-13.4, 4.3]) b.box('plaster', x - 0.22, 0.3, Z1, x + 0.22, F, 12.95);
  }
  // Signature frames: charcoal on the east block (levels 2 and 4), white rounded slabs west (levels 1 and 3).
  if (level === 2 || level === 4) {
    b.add('charcoal', frameGeometry(4.0, -0.2, 13.75, F + 0.15, 0.38, 0.75, Z1, 2.5));
    b.box('led', 4.6, F - 0.27, 12.95, 13.15, F - 0.24, 13.15);
    b.box('walnut', 13.75, 0.3, Z1, 14.35, F, 13.1);
  }
  if (level === 1 || level === 3) {
    b.add('plaster', slabGeometry(-13.8, Z1, -4.0, 13.3, -0.12, 0.42, 1.1, [true, true, false, false]));
    b.box('led', -13.2, -0.15, 13.05, -4.4, -0.12, 13.2);
    b.box('walnut', -14.4, 0.3, Z1, -13.8, F, 13.2);
  }
  // Planting and furniture on the south terraces.
  if (south || level === 4) {
    const xs = level === 4 ? [-17, -9.5, -2.6, 2.8, 9.5, 17] : [-11.8, -6.2, -2.7, 2.9, 6.2, 11.8];
    xs.forEach((x, i) => pottedPlant(b, i % 2 ? 'potDark' : 'potWhite', 'leaf', x, 0.3, 12.3, 1, level * 11 + i));
    for (const x of level === 4 ? [-13, 0, 13] : [-8.7, 8.7]) balconySet(b, x, 11.9, 0.3);
  }
}

function groundLevel(b: Bucket) {
  facade(b, 0);
  b.box('slab', X0 - 0.12, 0, Z0 - 0.12, X1 + 0.12, SLAB, Z1 + 0.12);
  b.box('stone', X0 - 0.2, -0.4, Z0 - 0.2, X1 + 0.2, 0.05, Z1 + 0.2);
  b.box('plaster', -1.5, SLAB, -10.75, 1.5, F, -1.75);
  // Walnut portal around the entrance.
  b.box('walnut', -4.5, SLAB, Z1 - 0.1, -3.75, F, Z1 + 0.35);
  b.box('walnut', 3.95, SLAB, Z1 - 0.1, 4.7, F, Z1 + 0.35);
  // Porte-cochère: a rounded cantilever with a walnut soffit, downlights and planting on top.
  b.add('plaster', slabGeometry(-5.8, Z1, 5.8, 15.6, 3.05, 3.6, 2.3, [true, true, false, false]));
  b.add('walnut', slabGeometry(-5.5, Z1, 5.5, 15.3, 3.0, 3.05, 2.1, [true, true, false, false]));
  for (const [x, z] of [[-3.6, 12], [0, 12], [3.6, 12], [-2.4, 14.2], [2.4, 14.2], [0, 14.6]] as const) downlight(b, x, 2.99, z);
  rand(404);
  for (let i = 0; i < 16; i++) {
    const a = (i / 15) * Math.PI;
    const x = Math.cos(a) * 4.4;
    const z = 12.6 + Math.sin(a) * 2.2;
    const g = shrubGeometry(i + 3);
    g.scale(0.55 + rand() * 0.25, 0.5 + rand() * 0.3, 0.55);
    g.translate(x, 3.62, z);
    b.add(i % 4 === 0 ? 'flower' : 'hedge', g);
  }
  lobby(b);
}

/** Reception: marble, a walnut slatted wall, a sculptural chandelier. Plan x −4.1…4.3, z 1.75…10.75. */
function lobby(b: Bucket) {
  const y = SLAB;
  b.box('marble', -4.1, y, 1.75, 4.3, y + 0.02, 10.6);
  b.box('ceiling', -4.1, 3.18, 1.75, 4.3, 3.22, 10.6);
  b.box('walnut', -4.1, y, 1.75, 4.3, 3.18, 1.95);
  for (let x = -3.9; x < 4.1; x += 0.17) b.box('walnut', x, y, 1.95, x + 0.07, 3.18, 2.03);
  const sign = new THREE.PlaneGeometry(3.6, 0.56);
  sign.translate(0.1, 2.35, 2.06);
  b.add('sign', sign);
  // Side walls in marble; lift doors in brass on the west.
  b.box('marble', -4.1, y, 1.95, -3.95, 3.18, 10.4);
  b.box('marbleDark', 4.15, y, 1.95, 4.3, 3.18, 10.4);
  for (const z of [4.2, 6.2]) {
    b.box('brass', -3.95, y + 0.02, z, -3.9, 2.45, z + 1.3);
    b.box('frame', -3.95, y + 0.02, z + 0.64, -3.88, 2.45, z + 0.66);
  }
  // Reception desk: a marble monolith floating on a line of light.
  b.rounded('marble', [0.1, y + 0.62, 3.8], [3.4, 0.95, 0.8], 0.06);
  b.box('led', -1.55, y + 0.08, 4.18, 1.75, y + 0.12, 4.22);
  b.box('brass', -1.6, y + 1.1, 3.35, 1.8, y + 1.13, 4.25);
  // Chandelier: a cloud of glass drops.
  rand(77);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.3;
    const x = 0.1 + Math.cos(a) * r;
    const z = 5.6 + Math.sin(a) * r * 0.7;
    const yy = 2.25 + rand() * 0.7;
    const g = new THREE.SphereGeometry(0.06 + rand() * 0.03, 12, 8);
    g.translate(x, yy, z);
    b.add('bulb', g);
    b.box('brass', x - 0.004, yy, z - 0.004, x + 0.004, 3.18, z + 0.004);
  }
  // Lounge: sofa, two leather chairs, travertine table, rug and planting.
  b.rounded('rug', [1.9, y + 0.03, 7.9], [3.6, 0.03, 2.6], 0.02);
  b.rounded('boucle', [1.9, y + 0.23, 9.3], [2.6, 0.42, 0.85], 0.12);
  b.rounded('boucle', [1.9, y + 0.55, 9.65], [2.6, 0.5, 0.25], 0.1);
  for (const x of [0.6, 3.2]) {
    b.rounded('leather', [x, y + 0.25, 7.0], [0.8, 0.45, 0.8], 0.12);
    b.rounded('leather', [x, y + 0.55, 6.72], [0.8, 0.45, 0.22], 0.08);
  }
  b.cylinder('stone', [1.9, y + 0.2, 8.0], 0.55, 0.55, 0.4, 32);
  pottedPlant(b, 'potDark', 'leaf', -3.4, y, 9.9, 1.6, 5);
  pottedPlant(b, 'potDark', 'leaf', 3.7, y, 2.6, 1.6, 6);
  for (let x = -3.2; x <= 3.4; x += 1.6) for (let z = 3; z <= 10; z += 2.2) downlight(b, x, 3.17, z);
  b.box('led', -4.05, 3.14, 2.0, 4.25, 3.17, 2.1);
}

function roofLevel(b: Bucket) {
  const r = 0.5;
  b.box('slab', X0 - 0.3, 0, Z0 - 0.3, X1 + 0.3, r, 13.1);
  // Parapet.
  b.box('plaster', X0 - 0.3, r, Z0 - 0.3, X1 + 0.3, r + 1, Z0 - 0.05);
  b.box('plaster', X0 - 0.3, r, 12.85, X1 + 0.3, r + 1, 13.1);
  b.box('plaster', X0 - 0.3, r, Z0 - 0.3, X0 - 0.05, r + 1, 13.1);
  b.box('plaster', X1 + 0.05, r, Z0 - 0.3, X1 + 0.3, r + 1, 13.1);
  // Soffit lights along the overhang above the penthouse terraces.
  for (let x = -18; x <= 18; x += 1.8) downlight(b, x, -0.005, 11.3);
  // The name, as on the renders: a white pylon holding a walnut-and-brass sign.
  b.rounded('plaster', [-3.5, r + 1.9, 10.55], [9.4, 3.8, 0.9], 0.25);
  const sign = new THREE.PlaneGeometry(8.2, 1.28);
  sign.translate(-3.5, r + 2.1, 11.02);
  b.add('sign', sign);
  // Penthouse C's upper floor: a glass pavilion with a floating roof.
  const [px0, pz0, px1, pz1] = [-19, -10.75, -6, -1.75];
  b.box('glass', px0 + 0.2, r, pz0 + 0.2, px1 - 0.2, r + 2.9, pz0 + 0.22);
  b.box('glass', px0 + 0.2, r, pz1 - 0.22, px1 - 0.2, r + 2.9, pz1 - 0.2);
  b.box('glass', px1 - 0.22, r, pz0 + 0.2, px1 - 0.2, r + 2.9, pz1 - 0.2);
  b.box('plaster', px0, r, pz0, px0 + 0.3, r + 2.9, pz1);
  for (let x = px0 + 1.2; x < px1; x += 2.6) {
    const g = new THREE.PlaneGeometry(2.4, 2.8);
    g.translate(x + 0.2, r + 1.45, pz1 - 1.1);
    b.add(nextCard(), g);
  }
  b.add('slab', slabGeometry(px0 - 0.4, pz0 - 0.4, px1 + 0.8, pz1 + 0.9, r + 2.9, r + 3.25, 0.4));
  b.box('led', px0 + 0.4, r + 2.86, pz1 + 0.6, px1 + 0.4, r + 2.89, pz1 + 0.75);
  // Roof pool, deck and loungers.
  b.box('teak', -2.2, r, -10.5, 12.2, r + 0.06, -2.2);
  b.box('poolTile', -1, r + 0.02, -9.5, 11, r + 0.07, -5.5);
  const w = new THREE.PlaneGeometry(12, 4);
  w.rotateX(-Math.PI / 2);
  w.translate(5, r + 0.1, -7.5);
  b.add('water', w);
  for (let x = 0; x < 10; x += 2.4) {
    b.rounded('potWhite', [x + 0.4, r + 0.22, -3.6], [0.7, 0.18, 1.9], 0.08);
    b.rounded('potWhite', [x + 0.4, r + 0.45, -4.35], [0.7, 0.35, 0.45], 0.08);
  }
  // Pergola over the east terrace.
  for (let x = 8; x <= 18; x += 1.25) b.box('walnut', x, r + 2.55, -1.2, x + 0.18, r + 2.75, 6.5);
  for (const [x, z] of [[8, -1.2], [18, -1.2], [8, 6.3], [18, 6.3]] as const) b.box('charcoal', x, r, z, x + 0.2, r + 2.55, z + 0.2);
  // Lift overrun.
  b.box('plaster', -1.5, r, -10.75, 1.5, r + 2.2, -6.5);
  pottedPlant(b, 'potDark', 'leaf', 14, r, 4.8, 1.4, 9);
  pottedPlant(b, 'potDark', 'leaf', -4.5, r, -3, 1.4, 10);
}

// ─── Soffit lights and scallops ──────────────────────────────────────────

function soffits(b: Bucket, level: number) {
  // Lights set into the underside of this level's balcony slabs light the level below.
  if (level >= 1 && level <= 4) {
    const span = level === 4 ? [-18.5, 18.5] : [-13, 13];
    for (let x = span[0]!; x <= span[1]!; x += 1.55) downlight(b, x, -0.005, 11.25);
    if (level <= 3)
      for (let z = -8.4; z <= 8.4; z += 1.7) {
        downlight(b, 19.5, -0.005, z);
        downlight(b, -19.5, -0.005, z);
      }
  }
  // Scallops on the piers of this level, from the lights above.
  if (level <= 4) {
    const hasAbove = level <= 3 || level === 4;
    if (!hasAbove) return;
    const xs = level === 3 ? [-13.4, -10.3, -7.2, -4.1, -1.4, 1.4, 4.3, 7.3, 10.3, 13.4] : level === 4 ? [-16.3, -13.4, -10.3, -7.2, -4.1, -1.4, 1.4, 4.3, 7.3, 10.3, 13.4, 16.3] : [-13.4, -10.3, -7.2, -4.1, -1.4, 1.4, 4.3, 7.3, 10.3, 13.4];
    for (const x of xs) scallop(b, 'S', x, F, 0.14);
  }
}

// ─── Podium, pool deck ───────────────────────────────────────────────────

/** The garden deck north of the building: a podium over parking, a 15 m pool, gym pavilion, loungers. */
function podium(b: Bucket) {
  const top = F;
  // The podium, hollowed for the pool basin.
  b.box('stone', -14, 0, -26, 14, top - 1.3, -10.75);
  b.box('stone', -14, top - 1.3, -26, 14, top, -22.5);
  b.box('stone', -14, top - 1.3, -17.5, 14, top, -10.75);
  b.box('stone', -14, top - 1.3, -22.5, -9, top, -17.5);
  b.box('stone', 6, top - 1.3, -22.5, 14, top, -17.5);
  // Teak deck, cut around the pool.
  b.box('teak', -14, top, -26, 14, top + 0.05, -22.9);
  b.box('teak', -14, top, -17.1, 14, top + 0.05, -10.75);
  b.box('teak', -14, top, -22.9, -9.4, top + 0.05, -17.1);
  b.box('teak', 6.4, top, -22.9, 14, top + 0.05, -17.1);
  // Pool basin, coping and water.
  // Coping: a travertine frame, the water set just below it.
  b.box('stone', -9.4, top, -22.9, 6.4, top + 0.12, -22.5);
  b.box('stone', -9.4, top, -17.5, 6.4, top + 0.12, -17.1);
  b.box('stone', -9.4, top, -22.5, -9, top + 0.12, -17.5);
  b.box('stone', 6, top, -22.5, 6.4, top + 0.12, -17.5);
  b.box('poolTile', -9, top - 1.2, -22.5, 6, top - 1.18, -17.5);
  b.box('poolTile', -9, top - 1.2, -22.5, -8.9, top + 0.1, -17.5);
  b.box('poolTile', 5.9, top - 1.2, -22.5, 6, top + 0.1, -17.5);
  b.box('poolTile', -9, top - 1.2, -22.5, 6, top + 0.1, -22.4);
  b.box('poolTile', -9, top - 1.2, -17.6, 6, top + 0.1, -17.5);
  const w = new THREE.PlaneGeometry(15, 5, 1, 1);
  w.rotateX(-Math.PI / 2);
  w.translate(-1.5, top - 0.06, -20);
  b.add('water', w);
  // Underwater lights along the long walls.
  for (let x = -7.5; x <= 4.5; x += 3) {
    for (const z of [-22.38, -17.62]) {
      const g = new THREE.CircleGeometry(0.07, 16);
      g.rotateY(z < -20 ? 0 : Math.PI);
      g.translate(x, top - 0.45, z);
      b.add('bulb', g);
    }
  }
  // Loungers and parasols along the north edge.
  for (let i = 0; i < 6; i++) {
    const x = -8 + i * 2.4;
    b.rounded('potWhite', [x, top + 0.25, -24.2], [0.72, 0.16, 1.95], 0.07);
    b.rounded('linen', [x, top + 0.36, -24.15], [0.66, 0.08, 1.85], 0.04);
    b.rounded('linen', [x, top + 0.55, -24.95], [0.66, 0.08, 0.6], 0.04, 0);
    if (i % 2 === 0) {
      b.cylinder('frame', [x + 1.2, top + 1.3, -24.4], 0.03, 0.03, 2.6, 8);
      const g = new THREE.ConeGeometry(1.5, 0.45, 24, 1, true);
      g.translate(x + 1.2, top + 2.55, -24.4);
      b.add('linen', g);
    }
  }
  // Gym pavilion.
  b.box('glass', 7, top, -25, 13.5, top + 3, -24.98);
  b.box('glass', 7, top, -15.02, 13.5, top + 3, -15);
  b.box('glass', 7, top, -25, 7.02, top + 3, -15);
  b.box('slab', 6.7, top + 3, -25.3, 13.8, top + 3.3, -14.7);
  for (let z = -24; z < -15.5; z += 2.2) {
    const g = new THREE.PlaneGeometry(2.1, 2.9);
    g.rotateY(-Math.PI / 2);
    g.translate(8.2, top + 1.5, z + 1);
    b.add(nextCard(), g);
  }
  b.box('led', 6.9, top + 2.96, -25.1, 13.6, top + 2.99, -24.9);
  balustrade(b, -14, -26, 14, -25.94, top);
  balustrade(b, -14, -26, -13.94, -10.75, top);
  balustrade(b, 13.94, -26, 14, -10.75, top);
  // Deck planting.
  for (const [x, z] of [[-12.5, -24.5], [-12.8, -19], [5.5, -13], [-6, -13], [0, -13]] as const)
    pottedPlant(b, 'potDark', 'leaf', x, top, z, 1.5, x * 3 + z);
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

  build() {
    cardSeed = 0;
    for (const level of BUILDING_LEVELS) {
      const g = new THREE.Group();
      g.name = `level-${level}`;
      g.position.y = levelBase(level);
      const b = new Bucket();
      if (level === 0) groundLevel(b);
      else if (level === ROOF_LEVEL) roofLevel(b);
      else residentialLevel(b, level);
      soffits(b, level);
      const meshes = b.build(g, (k) => this.mats.forLevel(k, level), {
        uvScale: (k) => UV[k] ?? null,
        shadows: (k) => ({ cast: !NO_SHADOW.has(k), receive: !NO_SHADOW.has(k) }),
      });
      this.cards.set(level, meshes.filter((m) => m.name.startsWith('card')));
      for (const m of meshes) if (m.name === 'plaster' || m.name === 'slab' || m.name === 'walnut') this.occluders.push(m);
      this.levels.set(level, g);
      this.root.add(g);
    }
    const b = new Bucket();
    podium(b);
    b.build(this.site, (k) => this.mats.get(k), {
      uvScale: (k) => UV[k] ?? null,
      shadows: (k) => ({ cast: !NO_SHADOW.has(k), receive: !NO_SHADOW.has(k) }),
    });
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
        let [x0, z0, x1, z1] = v.rect;
        if (v.level === r.floorLevel) visual.rects.push([x0, z0, x1, z1]);
        const onS = Math.abs(z1 - Z1) < 0.01;
        const balcony = v.level >= 1 && v.level <= 4;
        if (onS) z1 = balcony && x0 >= -13.5 && x1 <= 13.5 ? 12.95 : v.level === 4 ? 12.95 : z1 + 0.4;
        if (Math.abs(z0 - Z0) < 0.01) z0 -= 0.4;
        if (Math.abs(x1 - X1) < 0.01) x1 += v.level >= 1 && v.level <= 3 ? 1.95 : 0.4;
        if (Math.abs(x0 - X0) < 0.01) x0 -= v.level >= 1 && v.level <= 3 ? 1.95 : 0.4;
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
          const [rx0, rz0, rx1, rz1] = v.rect;
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
      const vis = this.units.get(r.id);
      for (const rect of vis?.rects ?? []) furnishUnit(b, rect, r.bedrooms);
    }
    if (level === 0) {
      // The ground floor's shared spaces read as furnished too.
      furnishUnit(b, [-13, 1.75, -4.1, 10.75], 0);
      furnishUnit(b, [1.5, -10.75, 13, -1.75], 0);
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

/**
 * Lays out a furnished plan inside one residence rectangle: living, dining and
 * kitchen at one end, bedrooms and a bath at the other. Illustrative — the
 * approved plan for each residence comes from the sales team.
 */
function furnishUnit(b: Bucket, rect: [number, number, number, number], bedrooms: number) {
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
