import * as THREE from 'three';
import { Bucket, pottedPlant, rand, roundedRectShape } from './geometry';
import {
  armchair,
  art,
  at,
  bed,
  books,
  basin,
  clad,
  curtain,
  diningChair,
  floorLamp,
  flowers,
  globe,
  nightstand,
  olive,
  sofa,
  stool,
  wc,
  type Furnish,
} from './penthouse';

// The typical one- and two-bedroom homes, furnished as their plans draw them
// (public/media/almasi/plan-1br.jpg, plan-2br.jpg). Coordinates are the
// scenes' own (lib/digital-twin.ts): x east, z south toward the balcony.

/** A stone planter along a balcony rail, filled with clipped planting. */
function planter(b: Bucket, x0: number, z0: number, x1: number, z1: number, seed: number) {
  b.box('stone', x0, 0, z0, x1, 0.5, z1);
  rand(seed);
  const along = x1 - x0 > z1 - z0;
  const len = along ? x1 - x0 : z1 - z0;
  for (let u = 0.25; u < len - 0.1; u += 0.4) {
    const g = new THREE.IcosahedronGeometry(0.24 + rand() * 0.1, 1);
    g.scale(1, 0.8 + rand() * 0.4, 1);
    g.translate(along ? x0 + u : (x0 + x1) / 2, 0.66 + rand() * 0.08, along ? (z0 + z1) / 2 : z0 + u);
    b.add(rand() > 0.8 ? 'flower' : 'hedge', g);
  }
}

/** A run of kitchen joinery against a north wall: base units, a marble top and splash, lit uppers. */
function kitchenRun(b: Bucket, x0: number, x1: number, zb: number, H: number) {
  const zf = zb + 0.6;
  b.box('black', x0, 0, zb, x1, 0.1, zf - 0.06);
  b.box('walnut', x0, 0.1, zb, x1, 0.86, zf);
  for (const y of [0.36, 0.61]) b.box('black', x0, y - 0.003, zf, x1, y + 0.003, zf + 0.004);
  for (let x = x0; x < x1; x += 0.6) b.box('black', x - 0.003, 0.1, zf, x + 0.003, 0.86, zf + 0.004);
  b.box('marble', x0 - 0.02, 0.86, zb, x1 + 0.02, 0.9, zf + 0.03);
  b.box('marble', x0, 0.9, zb, x1, 1.5, zb + 0.02);
  b.box('led', x0 + 0.02, 1.505, zb + 0.28, x1 - 0.02, 1.515, zb + 0.32);
  b.box('walnut', x0, 1.52, zb, x1, H - 0.16, zb + 0.36);
  for (let x = x0; x < x1; x += 0.6) b.box('black', x - 0.003, 1.55, zb + 0.36, x + 0.003, H - 0.18, zb + 0.364);
  return zf;
}

/** A tall column of walnut with an oven pair, against the same wall. */
function ovenTower(b: Bucket, x0: number, x1: number, zb: number, H: number) {
  const zf = zb + 0.6;
  b.box('walnut', x0, 0, zb, x1, H - 0.16, zf);
  b.box('screen', x0 + 0.08, 0.82, zf, x1 - 0.08, 1.42, zf + 0.012);
  b.box('screen', x0 + 0.08, 1.48, zf, x1 - 0.08, 2.0, zf + 0.012);
  for (const y of [1.36, 1.94]) b.box('steel', x0 + 0.15, y, zf + 0.012, x1 - 0.15, y + 0.02, zf + 0.04);
}

/** A marble island, `w` by `d`, centred on (x, z). */
function island(b: Bucket, x: number, z: number, w: number, d: number, sink: boolean) {
  const k = at(b, x, z);
  const hw = w / 2;
  const hd = d / 2;
  k.box('black', -hw + 0.1, 0, -hd + 0.06, hw - 0.1, 0.1, hd - 0.06);
  k.box('marble', -hw, 0.0, -hd, -hw + 0.06, 0.92, hd);
  k.box('marble', hw - 0.06, 0.0, -hd, hw, 0.92, hd);
  k.box('walnut', -hw + 0.06, 0.1, -hd + 0.04, hw - 0.06, 0.92, hd - 0.04);
  k.box('marble', -hw, 0.92, -hd, hw, 0.96, hd);
  if (sink) {
    k.box('steel', -0.35, 0.955, -hd + 0.12, 0.35, 0.962, 0.08);
    k.cyl('brass', [0, 1.14, -hd + 0.08], 0.012, 0.014, 0.36, 8);
  } else {
    k.cyl('ceramic', [-hw * 0.5, 1.0, 0], 0.2, 0.13, 0.08, 28);
    for (let i = 0; i < 5; i++) k.sphere('terracotta', [-hw * 0.5 + Math.cos(i * 1.3) * 0.09, 1.06, Math.sin(i * 1.3) * 0.09], 0.045, [1, 1, 1], 10);
  }
  flowers(k, hw * 0.55, 0.96, 0, Math.round(x * 10 + 31));
}

/** Open walnut wardrobe joinery: hanging, shelves and a lit rail. `face` is the open side. */
function closet(b: Bucket, x0: number, z0: number, x1: number, z1: number, face: 'n' | 's' | 'e' | 'w', H: number) {
  const keys = ['linen', 'taupe', 'olive', 'terracotta', 'duvet', 'leather'];
  rand(Math.round(x0 * 13 + z0 * 7 + 90));
  b.box('walnut', x0, 0, z0, x1, 0.08, z1);
  b.box('walnut', x0, 2.4, z0, x1, H - 0.16, z1);
  const alongX = face === 'n' || face === 's';
  // The back panel, on the side away from the opening.
  if (face === 's') b.box('walnut', x0, 0.08, z0, x1, 2.4, z0 + 0.03);
  if (face === 'n') b.box('walnut', x0, 0.08, z1 - 0.03, x1, 2.4, z1);
  if (face === 'e') b.box('walnut', x0, 0.08, z0, x0 + 0.03, 2.4, z1);
  if (face === 'w') b.box('walnut', x1 - 0.03, 0.08, z0, x1, 2.4, z1);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (alongX) {
    b.box('brass', x0 + 0.05, 1.97, cz - 0.01, x1 - 0.05, 1.99, cz + 0.01);
    for (let x = x0 + 0.08; x < x1 - 0.1; x += 0.075) {
      const len = 0.7 + rand() * 0.3;
      b.box(keys[Math.floor(rand() * 5)]!, x, 1.96 - len, z0 + 0.1, x + 0.045, 1.95, z1 - 0.1);
    }
    b.box('walnut', x0, 2.12, z0, x1, 2.145, z1);
    b.box('led', x0 + 0.04, 2.1, cz - 0.02, x1 - 0.04, 2.108, cz + 0.02);
  } else {
    b.box('brass', cx - 0.01, 1.97, z0 + 0.05, cx + 0.01, 1.99, z1 - 0.05);
    for (let z = z0 + 0.08; z < z1 - 0.1; z += 0.075) {
      const len = 0.7 + rand() * 0.3;
      b.box(keys[Math.floor(rand() * 5)]!, x0 + 0.1, 1.96 - len, z, x1 - 0.1, 1.95, z + 0.045);
    }
    b.box('walnut', x0, 2.12, z0, x1, 2.145, z1);
    b.box('led', cx - 0.02, 2.1, z0 + 0.04, cx + 0.02, 2.108, z1 - 0.04);
  }
  for (let i = 0; i < 4; i++) {
    const u = 0.15 + i * 0.3;
    if (alongX && x0 + u + 0.22 < x1) b.rounded('leather', [x0 + u + 0.11, 0.16, cz], [0.22, 0.12, 0.3], 0.03);
    if (!alongX && z0 + u + 0.22 < z1) b.rounded('leather', [cx, 0.16, z0 + u + 0.11], [0.3, 0.12, 0.22], 0.03);
  }
}

/** A flush walnut front door with a brass pull, on the north wall's inner face. */
function frontDoor(b: Bucket, x0: number, x1: number, z: number) {
  b.box('walnut', x0, 0, z, x1, 2.25, z + 0.05);
  b.box('brass', x1 - 0.14, 0.9, z + 0.05, x1 - 0.12, 1.35, z + 0.08);
}

/** A walnut soffit over a balcony, with a row of downlights. */
function soffit(c: Bucket, H: number, x0: number, z0: number, x1: number, z1: number) {
  c.box('plaster', x0, H + 0.1, z0, x1, H + 0.45, z1);
  c.box('walnut', x0, H, z0, x1, H + 0.1, z1);
  for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.5) {
    const g = new THREE.CircleGeometry(0.05, 14);
    g.rotateX(Math.PI / 2);
    g.translate(x, H - 0.005, (z0 + z1) / 2);
    c.add('downlight', g);
  }
}

function bistro(b: Bucket, x: number, z: number) {
  b.cylinder('teak', [x, 0.72, z], 0.32, 0.32, 0.03, 28);
  b.cylinder('bronze', [x, 0.36, z], 0.03, 0.04, 0.72, 8);
  b.cylinder('bronze', [x, 0.01, z], 0.2, 0.2, 0.02, 20);
  diningChair(at(b, x - 0.6, z, Math.PI / 2), 'linen');
  diningChair(at(b, x + 0.6, z, -Math.PI / 2), 'linen');
  flowers(at(b, x, z), 0, 0.735, 0, Math.round(x * 7 + 11));
}

// ─── One bedroom ─────────────────────────────────────────────────────────

export const furnishOneBedroom: Furnish = ({ b, c, root, mats, scene, lights }) => {
  const H = scene.ceiling;
  const A = (x: number, z: number, ry = 0, y = 0) => at(b, x, z, ry, y);
  const cur = (x: number, z: number, w: number, ry: number) => curtain(b, mats, root, x, z, w, ry, H);

  // ── Living: a sofa facing the media wall on the west, glass to the balcony.
  b.rounded('rug', [-2.6, 0.014, 1.3], [3.0, 0.012, 2.6], 0.01);
  sofa(A(-1.55, 1.3, -Math.PI / 2), 2.4, 'boucle');
  const s = A(-1.55, 1.3, -Math.PI / 2);
  for (const [x, key] of [[-0.75, 'olive'], [0.75, 'taupe']] as const) s.rounded(key, [x, 0.74, -0.14], [0.44, 0.42, 0.14], 0.07);
  b.rounded('marbleDark', [-2.85, 0.2, 1.3], [0.7, 0.4, 1.0], 0.03);
  const ct = A(-2.85, 1.3);
  books(ct, 0, 0.4, -0.25);
  flowers(ct, 0, 0.4, 0.25, 3);
  b.box('walnut', -4.48, 0.25, 0.3, -4.1, 0.6, 2.3);
  b.box('led', -4.46, 0.235, 0.34, -4.12, 0.25, 2.26);
  b.box('frame', -4.48, 1.0, 0.6, -4.44, 1.9, 2.0);
  b.box('screen', -4.44, 1.02, 0.62, -4.435, 1.88, 1.98);
  books(A(-4.29, 0.6), 0, 0.6, 0);
  floorLamp(A(0, 0), -4.2, 2.75);
  pottedPlant(b, 'potDark', 'leaf', -4.2, 0, -0.45, 1.4, 21);
  art(root, mats, [0.19, 1.6, 1.3], 1.2, 0.85, -Math.PI / 2, 4);

  // ── Kitchen along the north wall, a marble island, and a round table at the west window.
  kitchenRun(b, -3.2, -0.4, -4.08, H);
  b.box('steel', -2.6, 0.895, -3.96, -2.0, 0.902, -3.6);
  b.cylinder('brass', [-2.3, 1.08, -4.0], 0.012, 0.014, 0.36, 8);
  b.box('black', -1.3, 0.9, -3.98, -0.7, 0.905, -3.52);
  ovenTower(b, -0.4, 0.3, -4.08, H);
  island(b, -1.3, -2.5, 1.8, 0.9, false);
  for (const dx of [-0.45, 0.45]) stool(A(-1.3 + dx, -1.65, Math.PI));
  for (const dx of [-0.5, 0.5]) globe(c, -1.3 + dx, 1.85, -2.5, 0.15, H);
  {
    const [tx, tz] = [-3.55, -2.3];
    b.cylinder('walnut', [tx, 0.74, tz], 0.55, 0.55, 0.04, 40);
    b.cylinder('bronze', [tx, 0.37, tz], 0.06, 0.14, 0.72, 16);
    b.cylinder('bronze', [tx, 0.01, tz], 0.3, 0.3, 0.02, 24);
    diningChair(A(tx, tz - 0.78, 0), 'olive');
    diningChair(A(tx, tz + 0.78, Math.PI), 'olive');
    diningChair(A(tx - 0.78, tz, Math.PI / 2), 'olive');
    diningChair(A(tx + 0.78, tz, -Math.PI / 2), 'olive');
    flowers(A(tx, tz), 0, 0.76, 0, 9);
    globe(c, tx, 1.75, tz, 0.2, H);
  }
  cur(-4.44, -3.35, 0.6, Math.PI / 2);
  cur(-4.44, -1.45, 0.6, Math.PI / 2);

  // ── Hall: the front door off the gallery, a picture and a plant.
  frontDoor(b, 0.65, 1.5, -4.08);
  art(root, mats, [1.84, 1.6, -3.4], 0.8, 0.6, -Math.PI / 2, 6);
  pottedPlant(b, 'potWhite', 'leaf', 0.55, 0, -3.7, 1.1, 33);

  // ── Bedroom: the bed's headboard on the east wall, wardrobes along the north.
  b.rounded('rug', [2.9, 0.014, 1.0], [2.6, 0.012, 2.8], 0.01);
  bed(A(4.48, 1.0, -Math.PI / 2), 1.6, 2.0, 'linen', true);
  nightstand(A(4.25, -0.35, -Math.PI / 2));
  nightstand(A(4.25, 2.35, -Math.PI / 2));
  art(root, mats, [4.46, 1.85, 1.0], 1.4, 0.7, -Math.PI / 2, 5);
  b.box('walnut', 1.5, 0, -1.22, 4.48, H - 0.16, -0.64);
  for (let x = 1.5; x < 4.46; x += 0.6) b.box('black', x - 0.004, 0.06, -0.64, x + 0.004, H - 0.2, -0.636);
  for (let x = 2.04; x < 4.46; x += 0.6) b.box('brass', x - 0.06, 0.95, -0.64, x - 0.04, 1.45, -0.61);
  armchair(A(0.9, 2.4, Math.PI * 0.75), 'olive', 'taupe');
  floorLamp(A(0, 0), 0.6, 1.75);
  cur(1.3, 2.84, 0.6, 0);
  cur(3.5, 2.84, 0.6, 0);

  // ── Shower room: marble, a glass shower in the corner, a floating vanity, the WC on the east wall.
  clad(b, [2.03, -4.08, 4.48, -1.38], H - 0.16, [{ side: 'w', from: -3.0, to: -2.2 }]);
  b.box('marbleDark', 3.42, 0.006, -4.08, 4.48, 0.014, -3.0);
  b.box('clearGlass', 3.41, 0.01, -4.08, 3.43, 2.1, -3.25);
  b.box('brass', 3.4, 2.08, -4.08, 3.44, 2.1, -3.25);
  b.cylinder('brass', [3.95, 2.25, -3.55], 0.13, 0.13, 0.012, 32);
  b.cylinder('brass', [3.95, (2.25 + H - 0.16) / 2, -3.55], 0.01, 0.01, H - 0.16 - 2.25, 8);
  b.box('walnut', 2.1, 0.34, -4.08, 3.3, 0.8, -3.62);
  b.box('led', 2.14, 0.32, -4.04, 3.26, 0.34, -3.66);
  b.box('marble', 2.08, 0.8, -4.08, 3.32, 0.85, -3.58);
  basin(A(2.7, -3.84), 0, 0.85, 0);
  b.cylinder('brass', [2.7, 1.0, -4.02], 0.012, 0.014, 0.3, 8);
  b.box('mirror', 2.15, 1.1, -4.065, 3.25, 2.1, -4.05);
  b.box('led', 2.15, 2.1, -4.065, 3.25, 2.12, -4.05);
  wc(A(4.46, -2.2, -Math.PI / 2));
  pottedPlant(b, 'potWhite', 'leaf', 2.4, 0, -1.7, 0.8, 43);

  // ── Balcony: planters at the rail, a table for two, an olive.
  planter(b, -4.55, 4.25, -3.25, 4.55, 401);
  planter(b, -0.95, 4.25, 1.15, 4.55, 402);
  bistro(b, 2.8, 3.9);
  olive(b, 4.15, 4.2, 0.9, 77);
  soffit(c, H, -4.72, 3.12, 4.72, 4.6);
  cur(-4.3, 2.84, 0.6, 0);
  cur(-0.6, 2.84, 0.6, 0);

  lights.push(
    { p: [-2.6, 2.4, 1.3], intensity: 5, distance: 8 },
    { p: [-1.3, 2.3, -2.5], intensity: 5, distance: 7 },
    { p: [-3.5, 2.0, -2.2], intensity: 4, distance: 6 },
    { p: [1.1, 2.4, -2.6], intensity: 2, distance: 4 },
    { p: [2.6, 2.4, 0.8], intensity: 4, distance: 7 },
    { p: [3.3, 2.3, -2.8], intensity: 3, distance: 5 },
    { p: [-1.5, 2.5, 3.8], intensity: 3, distance: 7 },
  );
};

// ─── Two bedrooms ────────────────────────────────────────────────────────

export const furnishTwoBedroom: Furnish = ({ b, c, root, mats, scene, lights }) => {
  const H = scene.ceiling;
  const A = (x: number, z: number, ry = 0, y = 0) => at(b, x, z, ry, y);
  const cur = (x: number, z: number, w: number, ry: number) => curtain(b, mats, root, x, z, w, ry, H);

  // ── Living: a deep sofa at the fluted media wall, a marble coffee table, an armchair by the glass.
  b.rounded('rug', [-1.45, 0.014, 0.6], [3.0, 0.012, 3.0], 0.01);
  b.rounded('rugDark', [-1.45, 0.017, 0.6], [2.7, 0.006, 2.7], 0.01);
  sofa(A(-0.7, 0.6, -Math.PI / 2), 2.6, 'boucle');
  const s = A(-0.7, 0.6, -Math.PI / 2);
  for (const [x, key] of [[-0.85, 'olive'], [-0.4, 'taupe'], [0.85, 'olive']] as const) s.rounded(key, [x, 0.74, -0.14], [0.44, 0.42, 0.14], 0.07);
  b.rounded('marbleDark', [-1.85, 0.2, 0.6], [0.8, 0.4, 1.0], 0.03);
  const ct = A(-1.85, 0.6);
  books(ct, 0, 0.4, -0.25);
  flowers(ct, 0, 0.4, 0.28, 3);
  b.box('walnut', -2.92, 0, -0.5, -2.86, H, 1.9);
  for (let z = -0.46; z < 1.86; z += 0.1) b.box('walnut', -2.86, 0.07, z, -2.83, H - 0.17, z + 0.055);
  b.box('walnut', -2.83, 0.28, -0.3, -2.55, 0.6, 1.5);
  b.box('led', -2.81, 0.262, -0.26, -2.57, 0.28, 1.46);
  b.box('frame', -2.83, 1.0, 0.0, -2.79, 1.9, 1.2);
  b.box('screen', -2.79, 1.02, 0.02, -2.785, 1.88, 1.18);
  armchair(A(-2.2, 2.4, Math.PI * 0.75), 'taupe');
  floorLamp(A(0, 0), -2.65, 2.85);
  pottedPlant(b, 'potDark', 'leaf', -2.6, 0, -0.85, 1.5, 21);

  // ── Dining: an oval walnut table for eight under glass globes.
  {
    const top = new THREE.ExtrudeGeometry(roundedRectShape(-0.5, -1.1, 0.5, 1.1, 0.45), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 20,
    });
    top.rotateX(-Math.PI / 2);
    top.translate(1.6, 0.72, 0.8);
    b.add('walnut', top);
    for (const dz of [-0.6, 0.6]) b.cylinder('bronze', [1.6, 0.36, 0.8 + dz], 0.14, 0.24, 0.72, 28);
    for (const dz of [-0.75, 0, 0.75]) {
      diningChair(A(0.85, 0.8 + dz, Math.PI / 2), 'olive');
      diningChair(A(2.35, 0.8 + dz, -Math.PI / 2), 'olive');
    }
    diningChair(A(1.6, -0.55, 0), 'olive');
    diningChair(A(1.6, 2.15, Math.PI), 'olive');
    flowers(A(1.6, 0.8), 0, 0.78, 0, 9);
    rand(17);
    for (let i = 0; i < 5; i++) globe(c, 1.6 + (i % 2 ? 0.18 : -0.18), 1.75 + rand() * 0.3, -0.1 + i * 0.45, 0.11 + rand() * 0.04, H);
  }

  // ── Kitchen: joinery across the north wall with the refrigerator, an island with stools.
  kitchenRun(b, -1.6, 2.0, -4.88, H);
  b.box('black', -0.6, 0.9, -4.78, 0.3, 0.905, -4.3);
  for (const [dx, dz] of [[-0.22, -0.13], [0.22, -0.13], [-0.22, 0.13], [0.22, 0.13]] as const) {
    const r = new THREE.TorusGeometry(0.08, 0.006, 6, 24);
    r.rotateX(Math.PI / 2);
    r.translate(-0.15 + dx, 0.908, -4.54 + dz);
    b.add('steel', r);
  }
  b.box('steel', -0.7, 1.52, -4.88, 0.4, 1.65, -4.5);
  b.box('steel', 2.0, 0, -4.88, 2.85, 2.1, -4.26);
  b.box('walnut', 2.0, 2.1, -4.88, 2.85, H - 0.16, -4.28);
  b.box('black', 2.42, 0.9, -4.26, 2.43, 2.08, -4.255);
  for (const x of [2.36, 2.49]) b.box('steel', x - 0.012, 1.1, -4.25, x + 0.012, 1.85, -4.22);
  island(b, 0, -2.6, 2.4, 1.0, true);
  for (const dx of [-0.8, 0, 0.8]) stool(A(dx, -1.75, Math.PI));
  for (const dx of [-0.8, 0, 0.8]) globe(c, dx, 1.9, -2.6, 0.16, H);
  frontDoor(b, -2.6, -1.8, -4.88);
  pottedPlant(b, 'potWhite', 'leaf', -2.6, 0, -3.9, 1.2, 27);

  // ── Primary bedroom: the king bed's headboard on the west wall, an armchair at the window.
  b.rounded('rug', [-5.0, 0.014, 0.4], [2.9, 0.012, 3.4], 0.01);
  bed(A(-6.38, 0.4, Math.PI / 2), 1.8, 2.1, 'taupe', true);
  nightstand(A(-6.15, -1.05, Math.PI / 2));
  nightstand(A(-6.15, 1.85, Math.PI / 2));
  art(root, mats, [-6.36, 1.9, 0.4], 1.6, 0.8, Math.PI / 2, 2);
  armchair(A(-3.7, 2.6, -Math.PI * 0.75), 'olive', 'taupe');
  pottedPlant(b, 'potDark', 'leaf', -6.1, 0, 2.75, 1.3, 45);
  cur(-5.85, 3.04, 0.6, 0);
  cur(-3.65, 3.04, 0.6, 0);

  // ── Walk-in wardrobe and ensuite behind the bedroom.
  closet(b, -6.38, -4.88, -5.95, -2.7, 'e', H);
  closet(b, -5.95, -4.88, -4.83, -4.45, 's', H);
  clad(b, [-4.67, -4.88, -3.08, -2.68], H - 0.16, [{ side: 's', from: -4.3, to: -3.5 }]);
  b.box('walnut', -4.67, 0.34, -4.4, -4.2, 0.8, -3.1);
  b.box('marble', -4.67, 0.8, -4.42, -4.15, 0.85, -3.08);
  basin(A(-4.42, -3.75), 0, 0.85, 0);
  b.box('mirror', -4.665, 1.1, -4.3, -4.65, 2.1, -3.2);
  b.box('led', -4.665, 2.1, -4.3, -4.65, 2.12, -3.2);
  b.box('marbleDark', -3.95, 0.006, -4.88, -3.08, 0.014, -3.9);
  b.box('clearGlass', -3.97, 0.01, -4.88, -3.95, 2.1, -3.9);
  b.box('clearGlass', -3.95, 0.01, -3.92, -3.5, 2.1, -3.9);
  b.cylinder('brass', [-3.5, 2.25, -4.4], 0.12, 0.12, 0.012, 32);
  b.cylinder('brass', [-3.5, (2.25 + H - 0.16) / 2, -4.4], 0.01, 0.01, H - 0.16 - 2.25, 8);
  wc(A(-4.35, -4.86, 0));

  // ── Second bedroom: headboard on the east wall.
  b.rounded('rug', [5.0, 0.014, 1.0], [2.6, 0.012, 2.8], 0.01);
  bed(A(6.38, 1.0, -Math.PI / 2), 1.6, 2.0, 'linen', true);
  nightstand(A(6.15, -0.35, -Math.PI / 2));
  nightstand(A(6.15, 2.35, -Math.PI / 2));
  art(root, mats, [6.36, 1.85, 1.0], 1.4, 0.7, -Math.PI / 2, 3);
  armchair(A(3.6, 2.6, Math.PI * 0.75), 'taupe', 'olive');
  cur(3.85, 3.04, 0.6, 0);
  cur(5.65, 3.04, 0.6, 0);

  // ── Hall, linen cupboard and the second bathroom.
  b.box('walnut', 3.08, 0, -4.88, 4.12, H - 0.16, -4.4);
  b.box('black', 3.6, 0.06, -4.4, 3.604, H - 0.2, -4.396);
  art(root, mats, [3.1, 1.6, -3.3], 0.8, 0.6, Math.PI / 2, 7);
  clad(b, [4.28, -4.88, 6.38, -1.38], H - 0.16, [{ side: 'w', from: -2.4, to: -1.6 }]);
  b.box('walnut', 6.0, 0.34, -3.4, 6.38, 0.8, -2.0);
  b.box('marble', 5.95, 0.8, -3.42, 6.38, 0.85, -1.98);
  basin(A(6.15, -2.7), 0, 0.85, 0);
  b.box('mirror', 6.365, 1.1, -3.3, 6.38, 2.1, -2.1);
  b.box('marbleDark', 5.3, 0.006, -4.88, 6.38, 0.014, -3.8);
  b.box('clearGlass', 5.28, 0.01, -4.88, 5.3, 2.1, -3.8);
  b.box('clearGlass', 5.3, 0.01, -3.82, 5.9, 2.1, -3.8);
  b.cylinder('brass', [5.85, 2.25, -4.35], 0.12, 0.12, 0.012, 32);
  b.cylinder('brass', [5.85, (2.25 + H - 0.16) / 2, -4.35], 0.01, 0.01, H - 0.16 - 2.25, 8);
  wc(A(4.75, -4.86, 0));
  pottedPlant(b, 'potWhite', 'leaf', 4.6, 0, -1.7, 0.8, 43);

  // ── Terrace: planting along the rail, a table for two, an olive at the corner.
  planter(b, -6.4, 4.55, -3.4, 4.95, 411);
  planter(b, 1.0, 4.55, 3.4, 4.95, 412);
  bistro(b, 4.6, 4.15);
  olive(b, 6.1, 4.65, 1, 79);
  soffit(c, H, -6.62, 3.32, 6.62, 5.0);
  cur(-2.4, 3.04, 0.6, 0);
  cur(2.4, 3.04, 0.6, 0);

  lights.push(
    { p: [-1.4, 2.4, 0.8], intensity: 6, distance: 9 },
    { p: [1.6, 2.1, 0.8], intensity: 5, distance: 7 },
    { p: [0.4, 2.4, -3.0], intensity: 6, distance: 8 },
    { p: [-5.0, 2.4, 0.4], intensity: 5, distance: 8 },
    { p: [4.8, 2.4, 0.8], intensity: 5, distance: 8 },
    { p: [-0.4, 2.6, 4.2], intensity: 4, distance: 9 },
    { p: [-5.6, 2.3, -3.8], intensity: 2, distance: 4 },
    { p: [-3.9, 2.3, -3.8], intensity: 3, distance: 4 },
    { p: [5.4, 2.3, -3.2], intensity: 3, distance: 5 },
    { p: [3.6, 2.4, -3.0], intensity: 2, distance: 4 },
  );
};
