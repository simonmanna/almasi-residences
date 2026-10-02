import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TourScene } from '../../../lib/digital-twin';
import { Bucket, pottedPlant, rand, roundedRectShape, type V3 } from './geometry';
import type { Materials } from './materials';
import type { InteriorLight } from './residence';
import { artTexture } from './textures';

export interface FurnishContext {
  /** Floor-standing things. */
  b: Bucket;
  /** Things hung from the ceiling; lifted off with it in the dollhouse. */
  c: Bucket;
  root: THREE.Group;
  mats: Materials;
  scene: TourScene;
  lights: InteriorLight[];
  quality: 'high' | 'lite';
}
export type Furnish = (ctx: FurnishContext) => void;

// ─── A tiny local-frame kit: every piece is modelled facing +z, then placed ─

export function at(b: Bucket, x: number, z: number, ry = 0, y = 0) {
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const put = (key: string, g: THREE.BufferGeometry) => b.add(key, g, m);
  return {
    add: put,
    box(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
      const g = new THREE.BoxGeometry(Math.max(0.004, x1 - x0), Math.max(0.004, y1 - y0), Math.max(0.004, z1 - z0));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      put(key, g);
    },
    rounded(key: string, c: V3, s: V3, r = 0.05) {
      const rr = Math.max(0.002, Math.min(r, s[0] / 2 - 0.001, s[1] / 2 - 0.001, s[2] / 2 - 0.001));
      const g = new RoundedBoxGeometry(s[0], s[1], s[2], 3, rr);
      g.translate(...c);
      put(key, g);
    },
    cyl(key: string, c: V3, rt: number, rb: number, h: number, seg = 20) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg);
      g.translate(...c);
      put(key, g);
    },
    sphere(key: string, c: V3, r: number, s: V3 = [1, 1, 1], seg = 20) {
      const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7));
      g.scale(...s);
      g.translate(...c);
      put(key, g);
    },
  };
}
export type Kit = ReturnType<typeof at>;

export function legs(k: Kit, key: string, w: number, d: number, h: number, r = 0.018) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(key, [sx * w, h / 2, sz * d], r * 0.7, r, h, 8);
}

export function armchair(k: Kit, fabric: string, accent = 'olive') {
  k.rounded(fabric, [0, 0.24, 0], [0.82, 0.18, 0.8], 0.07);
  k.rounded(fabric, [0, 0.38, 0.05], [0.64, 0.12, 0.66], 0.06);
  k.rounded(fabric, [0, 0.56, -0.33], [0.82, 0.5, 0.16], 0.08);
  for (const s of [-1, 1]) k.rounded(fabric, [s * 0.36, 0.44, -0.02], [0.12, 0.3, 0.74], 0.06);
  k.rounded(accent, [0, 0.58, -0.2], [0.42, 0.3, 0.12], 0.06);
  legs(k, 'walnut', 0.33, 0.31, 0.15);
}

export function diningChair(k: Kit, fabric: string) {
  k.rounded(fabric, [0, 0.46, 0.02], [0.5, 0.09, 0.48], 0.04);
  k.rounded(fabric, [0, 0.77, -0.21], [0.5, 0.52, 0.08], 0.04);
  for (const s of [-1, 1]) k.rounded(fabric, [s * 0.22, 0.6, -0.12], [0.06, 0.22, 0.22], 0.03);
  legs(k, 'walnut', 0.2, 0.19, 0.42, 0.016);
}

export function stool(k: Kit) {
  k.rounded('olive', [0, 0.76, 0], [0.44, 0.08, 0.4], 0.04);
  k.rounded('olive', [0, 0.92, -0.17], [0.42, 0.22, 0.06], 0.03);
  legs(k, 'bronze', 0.17, 0.15, 0.72, 0.012);
  const ring = new THREE.TorusGeometry(0.19, 0.008, 6, 24);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.3, 0);
  k.add('bronze', ring);
}

export function sofa(k: Kit, L: number, fabric: string, arms = true) {
  k.box('black', -L / 2 + 0.06, 0, -0.43, L / 2 - 0.06, 0.08, 0.43);
  k.rounded(fabric, [0, 0.24, 0], [L, 0.3, 0.98], 0.06);
  const n = Math.max(1, Math.round(L / 0.95));
  const w = (arms ? L - 0.4 : L) / n;
  for (let i = 0; i < n; i++) {
    const x = -(w * n) / 2 + w * (i + 0.5);
    k.rounded(fabric, [x, 0.46, 0.07], [w - 0.02, 0.15, 0.8], 0.06);
    k.rounded(fabric, [x, 0.74, -0.22], [w - 0.05, 0.44, 0.17], 0.07);
  }
  k.rounded(fabric, [0, 0.62, -0.38], [L, 0.46, 0.22], 0.07);
  if (arms) for (const s of [-1, 1]) k.rounded(fabric, [s * (L / 2 - 0.1), 0.5, 0], [0.2, 0.36, 0.98], 0.07);
}

/** Headboard against the wall at local z = 0; the bed runs toward +z. */
export function bed(k: Kit, W: number, len: number, headboard = 'taupe', bench = true) {
  const panels = Math.round((W + 0.5) / 0.22);
  const pw = (W + 0.5) / panels;
  for (let i = 0; i < panels; i++) k.rounded(headboard, [-(W + 0.5) / 2 + pw * (i + 0.5), 0.72, 0.07], [pw - 0.012, 1.28, 0.12], 0.04);
  k.box('black', -W / 2 + 0.08, 0, 0.25, W / 2 - 0.08, 0.1, len - 0.1);
  k.rounded(headboard, [0, 0.25, len / 2 + 0.1], [W, 0.28, len], 0.05);
  k.rounded('duvet', [0, 0.49, len / 2 + 0.12], [W - 0.04, 0.22, len - 0.06], 0.09);
  k.rounded('duvet', [0, 0.61, len * 0.62 + 0.1], [W + 0.03, 0.04, len * 0.76], 0.02);
  k.rounded('olive', [0, 0.645, len * 0.8], [W + 0.07, 0.035, len * 0.26], 0.015);
  const pillows = W > 1.9 ? [-0.5, 0.5] : [-0.42, 0.42];
  for (const x of pillows) {
    k.rounded('duvet', [x, 0.72, 0.28], [W / 2 - 0.12, 0.3, 0.16], 0.08);
    k.rounded('duvet', [x, 0.68, 0.46], [W / 2 - 0.16, 0.24, 0.15], 0.07);
  }
  k.rounded('olive', [-0.2, 0.68, 0.6], [0.42, 0.26, 0.12], 0.06);
  k.rounded('taupe', [0.22, 0.68, 0.62], [0.42, 0.26, 0.12], 0.06);
  if (bench) {
    k.rounded('taupe', [0, 0.36, len + 0.36], [W * 0.78, 0.14, 0.44], 0.05);
    k.rounded('taupe', [0, 0.25, len + 0.36], [W * 0.78 - 0.06, 0.1, 0.4], 0.03);
    legs(k, 'bronze', W * 0.36, 0.17, 0.22, 0.014);
  }
}

export function nightstand(k: Kit, lamp = true) {
  k.rounded('walnut', [0, 0.32, 0], [0.56, 0.48, 0.42], 0.015);
  k.box('black', -0.26, 0.31, 0.209, 0.26, 0.316, 0.212);
  k.box('brass', -0.08, 0.43, 0.21, 0.08, 0.44, 0.225);
  k.box('brass', -0.08, 0.21, 0.21, 0.08, 0.22, 0.225);
  legs(k, 'walnut', 0.24, 0.17, 0.08, 0.014);
  if (!lamp) return;
  k.sphere('bronze', [0.05, 0.7, -0.05], 0.12, [1, 1.25, 1]);
  k.cyl('brass', [0.05, 0.9, -0.05], 0.012, 0.012, 0.16, 6);
  k.cyl('lampShade', [0.05, 1.02, -0.05], 0.14, 0.18, 0.24, 24);
}

export function tableLamp(k: Kit, x: number, y: number, z: number) {
  k.sphere('ceramic', [x, y + 0.14, z], 0.11, [1, 1.3, 1]);
  k.cyl('brass', [x, y + 0.34, z], 0.01, 0.01, 0.14, 6);
  k.cyl('lampShade', [x, y + 0.46, z], 0.12, 0.16, 0.22, 24);
}

export function floorLamp(k: Kit, x: number, z: number) {
  k.cyl('marbleDark', [x, 0.015, z], 0.17, 0.17, 0.03, 24);
  k.cyl('bronze', [x, 0.75, z], 0.012, 0.012, 1.45, 8);
  k.cyl('lampShade', [x, 1.58, z], 0.2, 0.24, 0.32, 24);
}

/** A glass globe on a bronze rod down from the ceiling (ceiling bucket). */
export function globe(c: Bucket, x: number, y: number, z: number, r: number, H: number) {
  c.cylinder('bronze', [x, (y + r + H) / 2, z], 0.005, 0.005, H - y - r, 6);
  const g = new THREE.SphereGeometry(r, 24, 16);
  g.translate(x, y, z);
  c.add('globe', g);
  const bulb = new THREE.SphereGeometry(r * 0.22, 10, 8);
  bulb.translate(x, y, z);
  c.add('bulb', bulb);
  c.cylinder('bronze', [x, y + r + 0.02, z], 0.035, 0.035, 0.04, 12);
}

export function olive(b: Bucket, x: number, z: number, s = 1, seed = 55) {
  b.cylinder('potDark', [x, 0.3 * s, z], 0.34 * s, 0.26 * s, 0.6 * s, 24);
  b.cylinder('bark', [x, 1.05 * s, z], 0.035 * s, 0.06 * s, 1.1 * s, 8);
  rand(seed);
  for (let i = 0; i < 11; i++) {
    const g = new THREE.IcosahedronGeometry((0.26 + rand() * 0.12) * s, 1);
    g.scale(1, 0.72, 1);
    g.translate(x + (rand() - 0.5) * 0.8 * s, (1.65 + rand() * 0.55) * s, z + (rand() - 0.5) * 0.8 * s);
    b.add('leaf', g);
  }
}

export function books(k: Kit, x: number, y: number, z: number) {
  const keys = ['terracotta', 'linen', 'olive', 'taupe'];
  let h = y;
  for (let i = 0; i < 3; i++) {
    k.rounded(keys[i % keys.length]!, [x + (i % 2) * 0.02, h + 0.02, z], [0.32 - i * 0.03, 0.04, 0.24 - i * 0.02], 0.004);
    h += 0.042;
  }
}

export function flowers(k: Kit, x: number, y: number, z: number, seed: number) {
  k.cyl('ceramic', [x, y + 0.13, z], 0.09, 0.07, 0.26, 20);
  rand(seed);
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.14;
    k.sphere(i % 3 ? 'duvet' : 'leaf', [x + Math.cos(a) * r, y + 0.36 + rand() * 0.14, z + Math.sin(a) * r], 0.045 + rand() * 0.02, [1, 0.8, 1], 10);
  }
}

export function curtain(b: Bucket, mats: Materials, root: THREE.Group, x: number, z: number, w: number, ry: number, H: number) {
  const g = new THREE.PlaneGeometry(w, H - 0.14, 28, 1);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI * 10) * 0.045);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mats.get('curtain'));
  m.position.set(x, (H - 0.14) / 2 + 0.02, z);
  m.rotation.y = ry;
  root.add(m);
  // A slim bronze track above.
  const alongX = Math.abs(Math.sin(ry)) < 0.5;
  if (alongX) b.box('bronze', x - w / 2 - 0.1, H - 0.2, z - 0.015, x + w / 2 + 0.1, H - 0.17, z + 0.015);
  else b.box('bronze', x - 0.015, H - 0.2, z - w / 2 - 0.1, x + 0.015, H - 0.17, z + w / 2 + 0.1);
}

export function art(root: THREE.Group, mats: Materials, p: V3, w: number, h: number, ry: number, seed: number) {
  const t = artTexture(seed);
  const m = mats.own(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }), t);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.045), mats.get('bronze'));
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  canvas.position.z = 0.024;
  frame.add(canvas);
  frame.position.set(...p);
  frame.rotation.y = ry;
  frame.castShadow = true;
  root.add(frame);
}

/** Marble-clad walls around a bathroom, leaving door gaps along the given side. */
export function clad(b: Bucket, [x0, z0, x1, z1]: readonly [number, number, number, number], H: number, gaps: { side: 'n' | 's' | 'e' | 'w'; from: number; to: number }[] = []) {
  const t = 0.018;
  const run = (side: 'n' | 's' | 'e' | 'w', lo: number, hi: number) => {
    const g = gaps.filter((q) => q.side === side).sort((a, c) => a.from - c.from);
    let cur = lo;
    const spans: [number, number][] = [];
    for (const q of g) {
      if (q.from > cur) spans.push([cur, q.from]);
      cur = Math.max(cur, q.to);
    }
    if (cur < hi) spans.push([cur, hi]);
    for (const [p, q] of spans) {
      if (side === 'n') b.box('marble', p, 0.006, z0, q, H, z0 + t);
      if (side === 's') b.box('marble', p, 0.006, z1 - t, q, H, z1);
      if (side === 'w') b.box('marble', x0, 0.006, p, x0 + t, H, q);
      if (side === 'e') b.box('marble', x1 - t, 0.006, p, x1, H, q);
    }
  };
  run('n', x0, x1);
  run('s', x0, x1);
  run('w', z0, z1);
  run('e', z0, z1);
}

export function tub(b: Bucket, x: number, z: number) {
  const g = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0.0),
      new THREE.Vector2(0.6, 0.0),
      new THREE.Vector2(0.78, 0.2),
      new THREE.Vector2(0.86, 0.56),
      new THREE.Vector2(0.8, 0.6),
      new THREE.Vector2(0.72, 0.3),
      new THREE.Vector2(0.001, 0.14),
    ],
    48,
  );
  g.scale(1.05, 1, 0.5);
  g.translate(x, 0.006, z);
  b.add('ceramic', g);
}

export function basin(k: Kit, x: number, y: number, z: number) {
  k.sphere('ceramic', [x, y + 0.06, z], 0.2, [1, 0.38, 0.72], 28);
}

export function wc(k: Kit) {
  k.rounded('ceramic', [0, 0.4, 0.26], [0.38, 0.3, 0.52], 0.12);
  k.box('ceramic', -0.2, 0.5, 0.0, 0.2, 0.9, 0.04);
  k.box('brass', -0.12, 1.0, 0.0, 0.12, 1.14, 0.012);
}

/** A walnut ceiling panel with a hidden LED reveal round its edge; optional fine slats. */
export function coffer(c: Bucket, H: number, x0: number, z0: number, x1: number, z1: number, slats: boolean) {
  c.box('walnut', x0, H - 0.035, z0, x1, H - 0.004, z1);
  const t = 0.035;
  c.box('led', x0 - t, H - 0.012, z0 - t, x1 + t, H - 0.006, z0);
  c.box('led', x0 - t, H - 0.012, z1, x1 + t, H - 0.006, z1 + t);
  c.box('led', x0 - t, H - 0.012, z0, x0, H - 0.006, z1);
  c.box('led', x1, H - 0.012, z0, x1 + t, H - 0.006, z1);
  if (!slats) return;
  for (let x = x0 + 0.04; x < x1 - 0.06; x += 0.12) c.box('walnut', x, H - 0.06, z0 + 0.03, x + 0.06, H - 0.035, z1 - 0.03);
}

// ─── The penthouse ─────────────────────────────────────────────────────────

export const furnishPenthouse: Furnish = ({ b, c, root, mats, scene, lights }) => {
  const H = scene.ceiling;
  const A = (x: number, z: number, ry = 0, y = 0) => at(b, x, z, ry, y);

  // ── Living: an L of boucle facing the media wall, glass to the west and south.
  b.rounded('rug', [-5.4, 0.014, 3.45], [5.2, 0.012, 4.0], 0.01);
  b.rounded('rugDark', [-5.4, 0.017, 3.45], [4.9, 0.006, 3.7], 0.01);
  sofa(A(-7.45, 3.55, Math.PI / 2), 3.3, 'boucle');
  sofa(A(-5.95, 5.28, Math.PI), 1.95, 'boucle', false);
  const s1 = A(-7.45, 3.55, Math.PI / 2);
  for (const [x, key] of [[-1.15, 'olive'], [-0.65, 'taupe'], [0.7, 'olive'], [1.15, 'taupe']] as const)
    s1.rounded(key, [x, 0.74, -0.14], [0.44, 0.42, 0.14], 0.07);
  A(-5.95, 5.28, Math.PI).rounded('olive', [0.2, 0.6, 0.1], [0.9, 0.04, 0.7], 0.02);
  b.rounded('marbleDark', [-5.4, 0.2, 3.4], [1.3, 0.4, 1.1], 0.03);
  const ct = A(-5.4, 3.4);
  books(ct, -0.3, 0.4, -0.2);
  ct.cyl('bronze', [0.3, 0.44, 0.15], 0.17, 0.1, 0.08, 28);
  flowers(ct, 0.25, 0.4, -0.28, 3);
  armchair(A(-5.8, 1.65, 0.12), 'taupe');
  armchair(A(-4.5, 1.65, -0.12), 'taupe');
  b.cylinder('marbleDark', [-3.72, 0.25, 1.62], 0.24, 0.24, 0.5, 32);
  {
    const g = new THREE.SphereGeometry(0.13, 24, 16);
    g.translate(-3.72, 0.64, 1.62);
    b.add('globe', g);
    const bulb = new THREE.SphereGeometry(0.05, 10, 8);
    bulb.translate(-3.72, 0.64, 1.62);
    b.add('bulb', bulb);
  }
  floorLamp(A(0, 0), -8.45, 1.75);
  floorLamp(A(0, 0), -8.45, 5.45);
  // Media wall: fluted walnut, a stone panel, a floating console and the screen.
  b.box('walnut', -1.2, 0, 1.0, -1.08, H, 5.9);
  for (let z = 1.04; z < 5.86; z += 0.1) b.box('walnut', -1.235, 0.07, z, -1.2, H - 0.17, z + 0.055);
  b.box('marble', -1.27, 0.66, 2.35, -1.235, 2.7, 4.95);
  b.box('led', -1.275, 2.7, 2.35, -1.24, 2.715, 4.95);
  b.box('frame', -1.33, 1.08, 2.8, -1.275, 2.2, 4.7);
  b.box('screen', -1.336, 1.1, 2.82, -1.33, 2.18, 4.68);
  b.box('walnut', -1.62, 0.28, 2.12, -1.27, 0.6, 5.28);
  b.box('led', -1.6, 0.262, 2.16, -1.3, 0.28, 5.24);
  const con = A(-1.45, 3.7);
  con.cyl('ceramic', [0, 0.78, 1.2], 0.08, 0.1, 0.36, 20);
  con.sphere('bronze', [0, 0.72, -1.1], 0.11, [1, 1, 1]);
  books(con, 0, 0.6, 0.6);
  pottedPlant(b, 'potDark', 'leaf', -9.45, 0, 1.0, 1.7, 21);
  pottedPlant(b, 'potWhite', 'leaf', -9.45, 0, 5.5, 1.35, 23);
  olive(b, -1.75, 5.62, 1, 61);
  // A walnut coffer over the seating, lit at its edge, like the renders.
  coffer(c, H, -9.0, 1.6, -2.2, 5.2, true);

  // ── Dining: an oval walnut table for ten under a cloud of glass globes.
  {
    const top = new THREE.ExtrudeGeometry(roundedRectShape(-1.75, -0.64, 1.75, 0.64, 0.63), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
    top.rotateX(-Math.PI / 2);
    top.translate(-5.5, 0.72, -1.35);
    b.add('walnut', top);
    for (const dx of [-0.95, 0.95]) b.cylinder('bronze', [-5.5 + dx, 0.36, -1.35], 0.16, 0.3, 0.72, 32);
    for (const dx of [-1.3, -0.43, 0.43, 1.3]) {
      diningChair(A(-5.5 + dx, -2.2, 0), 'taupe');
      diningChair(A(-5.5 + dx, -0.5, Math.PI), 'taupe');
    }
    diningChair(A(-7.42, -1.35, Math.PI / 2), 'taupe');
    diningChair(A(-3.58, -1.35, -Math.PI / 2), 'taupe');
    const t = A(-5.5, -1.35);
    flowers(t, 0, 0.78, 0, 9);
    for (const dx of [-1.3, -0.43, 0.43, 1.3])
      for (const dz of [-0.4, 0.4]) {
        t.cyl('ceramic', [dx, 0.785, dz], 0.13, 0.12, 0.012, 28);
        t.cyl('clearGlass', [dx + 0.16, 0.84, dz * 0.7], 0.035, 0.03, 0.12, 12);
      }
    rand(17);
    for (let i = 0; i < 9; i++) globe(c, -6.9 + (i * 2.8) / 8, 1.95 + rand() * 0.35, -1.35 + (i % 2 ? 0.22 : -0.22), 0.11 + rand() * 0.04, H);
    coffer(c, H, -8.3, -2.8, -2.7, 0.1, false);
    art(root, mats, [-1.11, 1.75, -2.35], 1.5, 1.05, -Math.PI / 2, 1);
  }

  // ── Kitchen: walnut joinery on the north wall, a Calacatta waterfall island.
  {
    const zb = -8.88;
    const zf = -8.26;
    // Tall pantry and a French-door refrigerator.
    b.box('walnut', -9.9, 0, zb, -8.5, H - 0.16, zf);
    for (const x of [-9.2]) b.box('black', x - 0.004, 0.12, zf, x + 0.004, H - 0.2, zf + 0.004);
    b.box('brass', -9.25, 1.0, zf, -9.23, 1.5, zf + 0.03);
    b.box('brass', -9.17, 1.0, zf, -9.15, 1.5, zf + 0.03);
    b.box('steel', -8.5, 0, zb, -7.4, 2.1, zf + 0.02);
    b.box('walnut', -8.5, 2.1, zb, -7.4, H - 0.16, zf);
    b.box('black', -7.954, 0.9, zf + 0.02, -7.946, 2.08, zf + 0.024);
    b.box('black', -8.5, 0.86, zf + 0.02, -7.4, 0.868, zf + 0.024);
    for (const x of [-8.02, -7.88]) b.box('steel', x - 0.012, 1.1, zf + 0.03, x + 0.012, 1.85, zf + 0.06);
    b.box('screen', -8.35, 1.3, zf + 0.02, -8.12, 1.6, zf + 0.026);
    // Base run, marble top and splash, lit uppers.
    b.box('black', -7.4, 0, zb, -3.3, 0.1, zf - 0.06);
    b.box('walnut', -7.4, 0.1, zb, -3.3, 0.86, zf);
    for (const y of [0.36, 0.61]) b.box('black', -7.4, y - 0.003, zf, -3.3, y + 0.003, zf + 0.004);
    for (let x = -7.4; x < -3.3; x += 0.68) b.box('black', x - 0.003, 0.1, zf, x + 0.003, 0.86, zf + 0.004);
    b.box('marble', -7.42, 0.86, zb, -3.28, 0.9, zf + 0.03);
    b.box('marble', -7.4, 0.9, zb, -3.3, 1.55, zb + 0.02);
    b.box('led', -7.38, 1.555, zb + 0.28, -3.32, 1.565, zb + 0.32);
    b.box('walnut', -7.4, 1.57, zb, -3.3, H - 0.16, zb + 0.36);
    for (let x = -7.4; x < -3.3; x += 0.68) b.box('black', x - 0.003, 1.6, zb + 0.36, x + 0.003, H - 0.18, zb + 0.364);
    // Cooktop and a slim integrated hood.
    b.box('black', -5.9, 0.9, zb + 0.1, -5.0, 0.905, zf - 0.02);
    for (const [dx, dz] of [[-0.22, -0.13], [0.22, -0.13], [-0.22, 0.13], [0.22, 0.13]] as const) {
      const r = new THREE.TorusGeometry(0.08, 0.006, 6, 24);
      r.rotateX(Math.PI / 2);
      r.translate(-5.45 + dx, 0.908, (zb + zf) / 2 + dz);
      b.add('steel', r);
    }
    b.box('steel', -6.0, 1.57, zb, -4.9, 1.7, zb + 0.4);
    // Oven tower and a lit wine column.
    b.box('walnut', -3.3, 0, zb, -2.3, H - 0.16, zf);
    b.box('screen', -3.2, 0.82, zf, -2.4, 1.42, zf + 0.012);
    b.box('screen', -3.2, 1.48, zf, -2.4, 2.02, zf + 0.012);
    for (const y of [1.36, 1.96]) b.box('steel', -3.1, y, zf + 0.012, -2.5, y + 0.02, zf + 0.04);
    b.box('walnut', -2.3, 0, zb, -1.14, H - 0.16, zb + 0.06);
    b.box('walnut', -2.3, 0, zb, -2.24, H - 0.16, zf);
    b.box('walnut', -1.2, 0, zb, -1.14, H - 0.16, zf);
    b.box('led', -2.24, 0.05, zb + 0.061, -1.2, H - 0.2, zb + 0.07);
    for (let y = 0.25; y < 2.6; y += 0.36) {
      b.box('smoked', -2.24, y - 0.01, zb + 0.07, -1.2, y, zf - 0.02);
      for (let i = 0; i < 5; i++) b.cylinder('bottle', [-2.12 + i * 0.2, y + 0.16, (zb + zf) / 2], 0.034, 0.036, 0.3, 10);
    }
    b.box('smoked', -2.24, 0.02, zf - 0.02, -1.2, H - 0.18, zf - 0.01);
    // The island.
    const is = A(-5.5, -5.4);
    is.box('black', -1.95, 0, -0.5, 1.95, 0.1, 0.5);
    is.box('marble', -2.1, 0.0, -0.6, -2.04, 0.92, 0.6);
    is.box('marble', 2.04, 0.0, -0.6, 2.1, 0.92, 0.6);
    is.box('walnut', -2.04, 0.1, -0.56, 2.04, 0.92, 0.56);
    is.box('marble', -2.04, 0.1, 0.56, 2.04, 0.92, 0.6);
    is.box('marble', -2.1, 0.92, -0.6, 2.1, 0.96, 0.6);
    is.box('steel', -0.4, 0.955, -0.32, 0.4, 0.962, 0.02);
    is.cyl('brass', [0, 1.14, -0.44], 0.012, 0.014, 0.36, 8);
    {
      const arc = new THREE.TorusGeometry(0.12, 0.011, 8, 20, Math.PI);
      arc.translate(0, 1.32, -0.32);
      arc.rotateY(Math.PI / 2);
      is.add('brass', arc);
    }
    is.cyl('ceramic', [-1.2, 1.0, 0], 0.2, 0.13, 0.08, 28);
    for (let i = 0; i < 5; i++) is.sphere('terracotta', [-1.2 + Math.cos(i * 1.3) * 0.09, 1.06, Math.sin(i * 1.3) * 0.09], 0.045, [1, 1, 1], 10);
    flowers(is, 1.3, 0.96, -0.1, 5);
    for (const dx of [-1.35, -0.45, 0.45, 1.35]) stool(A(-5.5 + dx, -4.45, Math.PI));
    for (const dx of [-1.2, 0, 1.2]) globe(c, -5.5 + dx, 2.05, -5.4, 0.18, H);
    pottedPlant(b, 'potDark', 'leaf', -9.45, 0, -3.9, 1.6, 27);
  }

  // ── Hall: a gallery corridor with picture lights.
  art(root, mats, [3.65, 1.6, -1.095], 1.4, 1.0, 0, 2);
  art(root, mats, [2.0, 1.6, 0.295], 1.9, 1.05, Math.PI, 3);
  b.box('brass', 3.1, 2.22, -1.12, 4.2, 2.25, -1.06);
  b.box('brass', 1.25, 2.27, 0.26, 2.75, 2.3, 0.32);
  pottedPlant(b, 'potWhite', 'leaf', 11.55, 0, -0.4, 1.3, 33);

  // ── Primary suite: an upholstered wall, a king bed facing the view, lounge chairs by the east glass.
  b.box('walnut', 5.3, 0, 0.48, 10.7, H - 0.16, 0.53);
  for (let x = 5.32; x < 10.66; x += 0.12) b.box('walnut', x, 0.07, 0.53, x + 0.06, H - 0.17, 0.56);
  b.box('led', 5.3, H - 0.18, 0.53, 10.7, H - 0.165, 0.6);
  bed(A(8, 0.56, 0), 2.05, 2.15);
  nightstand(A(6.5, 0.8, 0));
  nightstand(A(9.5, 0.8, 0));
  art(root, mats, [8, 2.1, 0.6], 2.2, 0.85, 0, 0);
  b.rounded('rug', [8, 0.014, 2.3], [4.3, 0.012, 3.5], 0.01);
  armchair(A(11.1, 3.7, 0), 'taupe');
  armchair(A(11.1, 5.1, Math.PI), 'taupe');
  b.cylinder('walnut', [11.1, 0.27, 4.4], 0.22, 0.2, 0.54, 28);
  flowers(A(11.1, 4.4), 0, 0.54, 0, 12);
  b.box('walnut', 3.58, 0, 1.9, 3.64, H - 0.16, 5.95);
  for (let z = 1.92; z < 5.9; z += 0.12) b.box('walnut', 3.64, 0.07, z, 3.67, H - 0.17, z + 0.06);
  b.box('walnut', 3.67, 0.26, 2.2, 4.03, 0.6, 5.0);
  b.box('led', 3.7, 0.245, 2.24, 4.0, 0.26, 4.96);
  b.box('frame', 3.67, 1.02, 2.8, 3.72, 2.02, 4.6);
  b.box('screen', 3.72, 1.04, 2.82, 3.726, 2.0, 4.58);
  pottedPlant(b, 'potDark', 'leaf', 11.5, 0, 1.0, 1.5, 35);
  {
    // A brass ring chandelier over the bed.
    const ring = new THREE.TorusGeometry(0.48, 0.014, 8, 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(8, 2.5, 1.9);
    c.add('brass', ring);
    const ring2 = new THREE.TorusGeometry(0.34, 0.01, 8, 40);
    ring2.rotateX(Math.PI / 2);
    ring2.translate(8, 2.38, 1.9);
    c.add('brass', ring2);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = i % 2 ? 0.34 : 0.48;
      const bulb = new THREE.SphereGeometry(0.028, 10, 8);
      bulb.translate(8 + Math.cos(a) * r, (i % 2 ? 2.38 : 2.5) + 0.04, 1.9 + Math.sin(a) * r);
      c.add('bulb', bulb);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      c.cylinder('brass', [8 + Math.cos(a) * 0.48, (2.5 + H) / 2, 1.9 + Math.sin(a) * 0.48], 0.004, 0.004, H - 2.5, 6);
    }
  }

  // ── Dressing room: smoked-glass wardrobes, lit shelves, a leather-topped run.
  {
    const wardrobe = (x0: number, z0: number, x1: number, z1: number, face: 'z' | 'x') => {
      // An open walnut carcass behind smoked glass: shelves, a rail, clothes, shoes and bags.
      const keys = ['linen', 'taupe', 'olive', 'terracotta', 'duvet', 'leather', 'rugDark'];
      rand(Math.round(x0 * 10 + z0 * 7 + 50));
      b.box('walnut', x0, 0, z0, x1, 0.08, z1);
      b.box('walnut', x0, 2.72, z0, x1, H - 0.16, z1);
      if (face === 'z') {
        b.box('walnut', x0, 0.08, z0, x1, 2.72, z0 + 0.03);
        for (const x of [x0, x1 - 0.03]) b.box('walnut', x, 0.08, z0, x + 0.03, 2.72, z1);
        for (const y of [0.34, 2.12]) b.box('walnut', x0, y, z0 + 0.03, x1, y + 0.025, z1 - 0.02);
        b.cylinder('brass', [(x0 + x1) / 2, 1.98, (z0 + z1) / 2], 0.012, 0.012, 0.01, 6);
        b.box('brass', x0 + 0.05, 1.97, (z0 + z1) / 2 - 0.01, x1 - 0.05, 1.99, (z0 + z1) / 2 + 0.01);
        for (let x = x0 + 0.08; x < x1 - 0.1; x += 0.075) {
          const len = 0.75 + rand() * 0.28;
          b.box(keys[Math.floor(rand() * 5)]!, x, 1.96 - len, z0 + 0.1, x + 0.045, 1.95, z1 - 0.1);
        }
        for (let x = x0 + 0.1; x < x1 - 0.25; x += 0.3) b.rounded('leather', [x + 0.1, 0.44, (z0 + z1) / 2 + 0.04], [0.22, 0.12, 0.3], 0.03);
        for (let x = x0 + 0.15; x < x1 - 0.4; x += 0.55) b.rounded(keys[Math.floor(rand() * keys.length)]!, [x + 0.15, 2.29, (z0 + z1) / 2], [0.34, 0.3, 0.2], 0.04);
        for (const y of [0.36, 2.14, 2.68]) b.box('led', x0 + 0.04, y - 0.012, z1 - 0.06, x1 - 0.04, y - 0.004, z1 - 0.03);
        b.box('smoked', x0, 0.08, z1 + 0.002, x1, 2.72, z1 + 0.012);
        for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 6) b.box('bronze', x - 0.012, 0.08, z1, x + 0.012, 2.72, z1 + 0.02);
      } else {
        b.box('walnut', x0, 0.08, z0, x0 + 0.03, 2.72, z1);
        for (const z of [z0, z1 - 0.03]) b.box('walnut', x0, 0.08, z, x1, 2.72, z + 0.03);
        for (const y of [0.34, 0.9, 1.46, 2.02]) b.box('walnut', x0 + 0.03, y, z0, x1 - 0.02, y + 0.025, z1);
        for (const y of [0.37, 0.93, 1.49, 2.05])
          for (let z = z0 + 0.12; z < z1 - 0.2; z += 0.26) b.rounded(keys[Math.floor(rand() * keys.length)]!, [(x0 + x1) / 2, y + 0.07, z + 0.1], [0.3, 0.12 + rand() * 0.06, 0.2], 0.02);
        for (const y of [0.9, 1.46, 2.02]) b.box('led', x1 - 0.06, y - 0.012, z0 + 0.04, x1 - 0.03, y - 0.004, z1 - 0.04);
        b.box('smoked', x1 + 0.002, 0.08, z0, x1 + 0.012, 2.72, z1);
        for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 3) b.box('bronze', x1, 0.08, z - 0.012, x1 + 0.02, 2.72, z + 0.012);
      }
    };
    wardrobe(-0.92, 0.48, 3.42, 1.02, 'z');
    wardrobe(-0.92, 1.02, -0.42, 2.32, 'x');
    for (const [x0, x1] of [[-0.42, 1.15], [2.15, 3.42]] as const) {
      b.box('walnut', x0, 0.08, 1.9, x1, 0.92, 2.32);
      b.box('marbleDark', x0 - 0.01, 0.92, 1.88, x1 + 0.01, 0.95, 2.32);
    }
    const run = A(0.35, 2.1);
    run.rounded('leather', [0, 1.05, 0], [0.34, 0.2, 0.14], 0.03);
    run.rounded('taupe', [0.45, 1.02, 0.02], [0.26, 0.14, 0.12], 0.03);
    flowers(A(2.8, 2.1), 0, 0.95, 0, 21);
  }

  // ── Primary bathroom: marble all round, stone tub at the window, twin basins.
  {
    clad(b, [-0.92, 2.48, 3.42, 5.88], H - 0.16, [{ side: 'n', from: 1.2, to: 2.1 }, { side: 's', from: -0.4, to: 3.2 }]);
    b.box('walnut', -0.9, 0.34, 2.95, -0.36, 0.8, 5.3);
    b.box('led', -0.88, 0.32, 3.0, -0.4, 0.34, 5.25);
    b.box('marble', -0.92, 0.8, 2.9, -0.33, 0.86, 5.35);
    const v = A(-0.62, 0);
    for (const z of [3.55, 4.7]) {
      basin(v, 0, 0.86, z);
      v.cyl('brass', [-0.22, 1.02, z], 0.012, 0.014, 0.32, 8);
      v.box('brass', -0.22, 1.16, z - 0.012, -0.07, 1.18, z + 0.012);
    }
    b.box('led', -0.9, 1.06, 2.97, -0.895, 2.29, 5.28);
    b.box('mirror', -0.895, 1.1, 3.0, -0.88, 2.25, 5.25);
    b.box('clearGlass', 2.29, 0.01, 2.5, 2.31, 2.2, 3.6);
    b.box('brass', 2.28, 2.18, 2.5, 2.32, 2.2, 3.6);
    b.box('marbleDark', 2.32, 0.006, 2.5, 3.4, 0.014, 3.9);
    b.cylinder('brass', [2.9, 2.35, 3.05], 0.15, 0.15, 0.012, 32);
    b.cylinder('brass', [2.9, (2.35 + H - 0.16) / 2, 3.05], 0.01, 0.01, H - 0.16 - 2.35, 8);
    b.box('led', 3.38, 1.1, 2.9, 3.4, 1.4, 3.4);
    tub(b, 1.35, 5.15);
    b.cylinder('brass', [2.55, 0.5, 5.15], 0.018, 0.02, 1.0, 10);
    b.box('brass', 2.42, 0.98, 5.14, 2.56, 1.0, 5.17);
    b.cylinder('walnut', [0.05, 0.25, 5.55], 0.16, 0.12, 0.5, 24);
    {
      const g = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16);
      g.translate(0.05, 0.54, 5.55);
      b.add('globe', g);
    }
    wc(A(3.4, 5.6, -Math.PI / 2));
    b.rounded('olive', [0.15, 0.012, 3.9], [0.55, 0.012, 1.3], 0.01);
    pottedPlant(b, 'potWhite', 'leaf', -0.55, 0, 5.55, 0.95, 41);
  }

  // ── Second bedroom (east): headboard on the west wall, light from north and east.
  bed(A(7.62, -5.5, Math.PI / 2), 1.8, 2.05, 'linen', true);
  nightstand(A(7.9, -6.75, Math.PI / 2));
  nightstand(A(7.9, -4.25, Math.PI / 2));
  art(root, mats, [7.61, 1.95, -5.5], 1.6, 0.9, Math.PI / 2, 2);
  b.rounded('rug', [8.9, 0.014, -5.5], [2.9, 0.012, 3.4], 0.01);
  armchair(A(11.1, -8.15, -Math.PI / 4), 'olive', 'taupe');
  floorLamp(A(0, 0), 11.6, -7.3);
  pottedPlant(b, 'potDark', 'leaf', 11.5, 0, -1.75, 1.3, 45);

  // ── Third bedroom (north): headboard on the east wall, a desk at the window.
  bed(A(4.38, -5.6, -Math.PI / 2), 1.6, 2.0, 'olive', false);
  nightstand(A(4.15, -6.85, -Math.PI / 2));
  nightstand(A(4.15, -4.35, -Math.PI / 2));
  art(root, mats, [4.4, 1.95, -5.6], 1.4, 0.85, -Math.PI / 2, 3);
  b.rounded('rug', [3.1, 0.014, -5.6], [2.6, 0.012, 3.0], 0.01);
  {
    const d = A(1.1, -8.6);
    d.box('walnut', -1.0, 0.72, -0.28, 1.0, 0.76, 0.28);
    for (const s of [-1, 1]) d.box('walnut', s * 0.97 - 0.03, 0, -0.26, s * 0.97 + 0.03, 0.72, 0.26);
    d.box('screen', -0.2, 0.765, -0.1, 0.2, 0.775, 0.16);
    d.box('screen', -0.2, 0.775, -0.12, 0.2, 1.02, -0.1);
    tableLamp(d, 0.7, 0.76, -0.1);
    books(d, -0.65, 0.76, 0);
    diningChair(A(1.1, -7.95, Math.PI), 'taupe');
  }
  pottedPlant(b, 'potWhite', 'leaf', -0.5, 0, -8.45, 1.2, 47);

  // ── Guest bathroom.
  {
    clad(b, [4.58, -4.92, 7.42, -1.28], H - 0.16, [{ side: 's', from: 5.4, to: 6.3 }]);
    b.box('clearGlass', 5.0, 0.01, -3.72, 6.2, 2.2, -3.7);
    b.box('brass', 5.0, 2.18, -3.73, 6.2, 2.2, -3.69);
    b.box('marbleDark', 4.6, 0.006, -4.9, 6.2, 0.014, -3.72);
    b.cylinder('brass', [5.4, 2.35, -4.3], 0.13, 0.13, 0.012, 32);
    b.cylinder('brass', [5.4, (2.35 + H - 0.16) / 2, -4.3], 0.01, 0.01, H - 0.16 - 2.35, 8);
    b.box('walnut', 6.96, 0.34, -4.25, 7.4, 0.8, -2.45);
    b.box('marble', 6.9, 0.8, -4.3, 7.42, 0.85, -2.4);
    const v = A(7.15, -3.35);
    basin(v, 0, 0.85, 0);
    v.cyl('brass', [0.2, 1.0, 0], 0.012, 0.014, 0.3, 8);
    b.box('led', 7.395, 1.07, -4.08, 7.4, 2.13, -2.62);
    b.box('mirror', 7.38, 1.1, -4.05, 7.395, 2.1, -2.65);
    wc(A(4.6, -2.95, Math.PI / 2));
    // A lit niche in the shower, towels on a brass ladder, a plant by the door.
    b.box('marbleDark', 5.2, 1.1, -4.9, 6.0, 1.12, -4.72);
    b.box('led', 5.2, 1.5, -4.9, 6.0, 1.51, -4.74);
    for (const [x, key] of [[5.35, 'ceramic'], [5.55, 'bottle'], [5.75, 'olive']] as const) b.cylinder(key, [x, 1.2, -4.8], 0.035, 0.035, 0.16, 12);
    for (const y of [0.6, 1.0, 1.4]) b.box('brass', 6.3, y, -1.33, 7.2, y + 0.018, -1.31);
    for (const x of [6.35, 7.15]) b.box('brass', x - 0.01, 0.2, -1.33, x + 0.01, 1.6, -1.31);
    b.box('olive', 6.45, 0.62, -1.36, 6.85, 0.98, -1.3);
    b.box('linen', 6.55, 1.02, -1.36, 7.05, 1.36, -1.3);
    pottedPlant(b, 'potWhite', 'leaf', 7.1, 0, -1.65, 0.8, 43);
  }

  // ── Terrace canopy: a walnut soffit with downlights over the glazing line.
  c.box('plaster', -11.4, H + 0.1, 6.12, 12.2, H + 0.45, 7.4);
  c.box('walnut', -11.4, H, 6.12, 12.2, H + 0.1, 7.4);
  c.box('plaster', -11.4, H + 0.1, -9.2, -10.12, H + 0.45, 6.12);
  c.box('walnut', -11.4, H, -9.2, -10.12, H + 0.1, 6.12);
  c.box('led', -11.42, H + 0.1, 7.38, 12.2, H + 0.13, 7.42);
  for (let x = -10.4; x < 12; x += 1.6) {
    const g = new THREE.CircleGeometry(0.05, 14);
    g.rotateX(Math.PI / 2);
    g.translate(x, H - 0.005, 6.8);
    c.add('downlight', g);
  }
  for (let z = -8.4; z < 6; z += 1.6) {
    const g = new THREE.CircleGeometry(0.05, 14);
    g.rotateX(Math.PI / 2);
    g.translate(-10.75, H - 0.005, z);
    c.add('downlight', g);
  }

  // ── Pool terrace: a raised infinity pool at the parapet, loungers, an outdoor lounge.
  {
    const [x0, z0, x1, z1] = [-9, 7.7, -2, 9.75];
    b.box('stone', x0 - 0.15, 0, z0 - 0.15, x1 + 0.15, 0.5, z0);
    b.box('stone', x0 - 0.15, 0, z0, x0, 0.5, z1);
    b.box('stone', x1, 0, z0, x1 + 0.15, 0.5, z1);
    b.box('poolTile', x0, 0, z1, x1, 0.44, z1 + 0.12);
    b.box('poolTile', x0, 0.02, z0, x1, 0.03, z1);
    b.box('water', x0, 0.42, z0, x1, 0.46, z1);
    for (let x = x0 + 0.8; x < x1; x += 1.4) b.box('led', x - 0.05, 0.26, z0 + 0.005, x + 0.05, 0.3, z0 + 0.02);
    for (const x of [0.85, 2.75]) {
      const l = A(x, 8.25);
      l.box('teak', -0.35, 0.14, -1.0, 0.35, 0.22, 1.0);
      legs(l, 'teak', 0.3, 0.9, 0.14, 0.03);
      l.rounded('linen', [0, 0.28, 0.25], [0.66, 0.1, 1.45], 0.04);
      const back = new RoundedBoxGeometry(0.66, 0.1, 0.72, 3, 0.04);
      back.rotateX(-0.85);
      back.translate(0, 0.48, -0.66);
      l.add('linen', back);
      l.rounded('olive', [0, 0.56, -0.5], [0.4, 0.22, 0.12], 0.05);
    }
    b.cylinder('teak', [1.8, 0.2, 8.95], 0.2, 0.18, 0.4, 24);
    sofa(A(8.6, 7.7, 0), 3.0, 'linen');
    A(8.6, 7.7).rounded('olive', [-0.9, 0.74, -0.14], [0.44, 0.4, 0.14], 0.07);
    A(8.6, 7.7).rounded('terracotta', [0.95, 0.74, -0.14], [0.44, 0.4, 0.14], 0.07);
    b.cylinder('stone', [8.6, 0.19, 8.95], 0.45, 0.42, 0.38, 36);
    armchair(A(6.55, 9.0, Math.PI / 2), 'linen');
    armchair(A(10.7, 9.0, -Math.PI / 2), 'linen');
    // Planters along the parapet.
    for (const [px0, pz0, px1, pz1] of [[-14, 9.25, -9.2, 9.95], [3.8, 9.25, 5.9, 9.95], [-13.95, -8.95, -13.3, -0.2], [-13.95, 3.5, -13.3, 9.25]] as const) {
      b.box('stone', px0, 0, pz0, px1, 0.55, pz1);
      rand(Math.round(px0 * 13 + pz0 * 7 + 400));
      const along = px1 - px0 > pz1 - pz0;
      const len = along ? px1 - px0 : pz1 - pz0;
      for (let u = 0.3; u < len - 0.15; u += 0.45) {
        const g = new THREE.IcosahedronGeometry(0.3 + rand() * 0.12, 1);
        g.scale(1, 0.8 + rand() * 0.4, 1);
        const cx = along ? px0 + u : (px0 + px1) / 2;
        const cz = along ? (pz0 + pz1) / 2 : pz0 + u;
        g.translate(cx, 0.72 + rand() * 0.1, cz);
        b.add(rand() > 0.85 ? 'flower' : 'hedge', g);
      }
    }
    olive(b, -13.6, 9.55, 1.2, 71);
    olive(b, 5.3, 9.6, 1.1, 73);
    olive(b, -13.6, -8.6, 1.15, 75);
  }

  // ── Sunset terrace: dinner for eight facing west, and a fire-table lounge.
  {
    const t = A(-12, -6.2);
    t.box('teak', -0.55, 0.72, -1.45, 0.55, 0.77, 1.45);
    for (const s of [-1, 1]) t.box('bronze', -0.45, 0, s * 1.1 - 0.04, 0.45, 0.72, s * 1.1 + 0.04);
    for (const z of [-0.95, 0, 0.95]) {
      diningChair(A(-12.95, -6.2 + z, Math.PI / 2), 'linen');
      diningChair(A(-11.05, -6.2 + z, -Math.PI / 2), 'linen');
      for (const x of [-0.3, 0.3]) t.cyl('ceramic', [x, 0.78, z], 0.13, 0.12, 0.012, 28);
    }
    diningChair(A(-12, -7.85, 0), 'linen');
    diningChair(A(-12, -4.55, Math.PI), 'linen');
    flowers(t, 0, 0.77, 0.5, 29);
    for (const z of [-0.6, 0.9]) {
      const g = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16);
      g.translate(-12, 0.86, -6.2 + z);
      b.add('globe', g);
    }
    b.box('stone', -12.8, 0, 1.4, -11.6, 0.4, 2.0);
    b.box('fire', -12.6, 0.4, 1.62, -11.8, 0.43, 1.78);
    sofa(A(-12.2, 0.55, 0), 2.0, 'linen');
    armchair(A(-13.2, 1.9, Math.PI / 2), 'linen');
    armchair(A(-11.2, 1.9, -Math.PI / 2), 'linen');
  }

  // ── Sheer curtains, gathered at the ends of the glazing.
  const cur = (x: number, z: number, w: number, ry: number) => curtain(b, mats, root, x, z, w, ry, H);
  cur(-9.82, 5.45, 0.9, Math.PI / 2);
  cur(-9.82, -8.4, 0.9, Math.PI / 2);
  cur(-9.4, 5.84, 0.9, 0);
  cur(3.95, 5.84, 0.7, 0);
  cur(11.55, 5.84, 0.7, 0);
  cur(11.84, 1.95, 0.7, Math.PI / 2);
  cur(11.84, -6.6, 0.7, Math.PI / 2);
  cur(8.85, -8.84, 0.7, 0);
  cur(0.25, -8.84, 0.7, 0);
  cur(3.15, -8.84, 0.7, 0);

  // ── Lamplight. Keyed lights survive on lite quality.
  lights.push(
    { p: [-5.4, 2.6, 3.4], intensity: 7, distance: 10 },
    { p: [-2.8, 2.6, 4.8], intensity: 3, distance: 6 },
    { p: [-5.5, 2.0, -1.35], intensity: 5, distance: 7 },
    { p: [-5.5, 2.4, -6.2], intensity: 6, distance: 9 },
    { p: [5, 2.6, -0.4], intensity: 2.5, distance: 6 },
    { p: [8, 2.5, 2.4], intensity: 5, distance: 8 },
    { p: [1.2, 2.4, 1.4], intensity: 2.5, distance: 4 },
    { p: [1.3, 2.5, 4.3], intensity: 3.5, distance: 5 },
    { p: [9.8, 2.5, -5], intensity: 4, distance: 7 },
    { p: [1.9, 2.5, -5.2], intensity: 4, distance: 7 },
    { p: [6, 2.5, -3.2], intensity: 2.5, distance: 4 },
    { p: [-4, 2.7, 7.2], intensity: 4, distance: 9 },
    { p: [-5.5, 0.9, 8.7], intensity: 3, distance: 6, color: '#7FDDEB' },
    { p: [-11.6, 2.6, -3], intensity: 3, distance: 8 },
  );
};
