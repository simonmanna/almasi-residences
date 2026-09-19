import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

/** Strip to the attributes every merged mesh shares, non-indexed. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((out.attributes.position!.count) * 2), 2));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  out.clearGroups();
  return out;
}

/**
 * Box-projected UVs in metres, so a plaster wall 30 m long gets the same
 * texture density as a 1 m pier. `scale` is texture repeats per metre.
 */
export function worldUV(g: THREE.BufferGeometry, scale = 0.25) {
  const p = g.attributes.position!;
  const n = g.attributes.normal!;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const nz = Math.abs(n.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x * scale, z * scale);
    else if (nx >= nz) uv.setXY(i, z * scale, y * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  uv.needsUpdate = true;
}

/** Collects geometry by material key and merges it into one mesh per key. */
export class Bucket {
  private parts = new Map<string, THREE.BufferGeometry[]>();

  add(key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const n = normalise(g);
    if (m) n.applyMatrix4(m);
    const list = this.parts.get(key) ?? [];
    list.push(n);
    this.parts.set(key, list);
  }

  box(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const g = new THREE.BoxGeometry(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), Math.max(0.01, z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(key, g);
  }

  rounded(key: string, center: V3, size: V3, radius = 0.05, rotY = 0, segments = 3) {
    const r = Math.min(radius, size[0] / 2 - 0.001, size[1] / 2 - 0.001, size[2] / 2 - 0.001);
    const g = new RoundedBoxGeometry(size[0], size[1], size[2], segments, Math.max(0.002, r));
    if (rotY) g.rotateY(rotY);
    g.translate(...center);
    this.add(key, g);
  }

  cylinder(key: string, center: V3, rTop: number, rBottom: number, h: number, seg = 20) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.translate(...center);
    this.add(key, g);
  }

  /** Merge into `group`; `material(key)` resolves each key. */
  build(
    group: THREE.Object3D,
    material: (key: string) => THREE.Material,
    opts: { uvScale?: (key: string) => number | null; shadows?: (key: string) => { cast: boolean; receive: boolean } } = {},
  ) {
    const meshes: THREE.Mesh[] = [];
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const s = opts.uvScale?.(key);
      if (s) worldUV(merged, s);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material(key));
      const sh = opts.shadows?.(key) ?? { cast: true, receive: true };
      mesh.castShadow = sh.cast;
      mesh.receiveShadow = sh.receive;
      mesh.name = key;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

export function roundedRectShape(x0: number, y0: number, x1: number, y1: number, r: number, corners = [true, true, true, true]) {
  const s = new THREE.Shape();
  const [bl, br, tr, tl] = corners;
  s.moveTo(x0 + (bl ? r : 0), y0);
  s.lineTo(x1 - (br ? r : 0), y0);
  if (br) s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - (tr ? r : 0));
  if (tr) s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + (tl ? r : 0), y1);
  if (tl) s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + (bl ? r : 0));
  if (bl) s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function rectPath(x0: number, y0: number, x1: number, y1: number, r: number) {
  const p = new THREE.Path();
  p.moveTo(x0 + r, y0);
  p.quadraticCurveTo(x0, y0, x0, y0 + r);
  p.lineTo(x0, y1 - r);
  p.quadraticCurveTo(x0, y1, x0 + r, y1);
  p.lineTo(x1 - r, y1);
  p.quadraticCurveTo(x1, y1, x1, y1 - r);
  p.lineTo(x1, y0 + r);
  p.quadraticCurveTo(x1, y0, x1 - r, y0);
  p.lineTo(x0 + r, y0);
  return p;
}

/**
 * The signature Almasi "picture frame": a rounded rectangle band in the XY
 * plane, extruded along +z from `z0` by `depth`.
 */
export function frameGeometry(x0: number, y0: number, x1: number, y1: number, thickness: number, radius: number, z0: number, depth: number) {
  const s = roundedRectShape(x0, y0, x1, y1, radius);
  s.holes.push(rectPath(x0 + thickness, y0 + thickness, x1 - thickness, y1 - thickness, Math.max(0.05, radius - thickness * 0.6)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, z0);
  return g;
}

/**
 * A horizontal slab in plan (x, z) from y0 to y1. Corners are
 * [front-left (x0,z1), front-right (x1,z1), back-right (x1,z0), back-left (x0,z0)].
 */
export function slabGeometry(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, r: number, corners = [true, true, true, true]) {
  // Shape in (x, -z) so that after rotating -90° about X the plan lands on (x, z).
  const s = roundedRectShape(x0, -z1, x1, -z0, r, corners);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

// ─── Vegetation ──────────────────────────────────────────────────────────

let seed = 7;
export function rand(reset?: number) {
  if (reset !== undefined) seed = reset;
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

/**
 * A broadleaf canopy: welded, gently displaced lobes with smooth normals and
 * spherical UVs for the leaf texture. Unit-ish size, centred on the origin.
 */
export function canopyGeometry(lobes = 6, s = 11, detail = 3) {
  rand(s);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lobes; i++) {
    const base = new THREE.IcosahedronGeometry(0.55 + rand() * 0.35, detail);
    base.deleteAttribute('normal');
    base.deleteAttribute('uv');
    const g = mergeVertices(base, 1e-4);
    const p = g.attributes.position!;
    const ph = rand() * 10;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const y = p.getY(v);
      const z = p.getZ(v);
      const k = 1 + Math.sin(x * 9 + ph) * Math.sin(y * 8 + ph) * Math.sin(z * 7) * 0.12;
      p.setXYZ(v, x * k, Math.max(-0.35, y * k * 0.82), z * k);
    }
    const a = (i / lobes) * Math.PI * 2 + rand();
    const rr = i === 0 ? 0 : 0.5 + rand() * 0.25;
    g.translate(Math.cos(a) * rr, i === 0 ? 0.35 : rand() * 0.45, Math.sin(a) * rr);
    g.computeVertexNormals();
    const uv = new Float32Array(p.count * 2);
    for (let v = 0; v < p.count; v++) {
      uv[v * 2] = (Math.atan2(p.getZ(v), p.getX(v)) / (Math.PI * 2) + 0.5) * 3;
      uv[v * 2 + 1] = p.getY(v) * 1.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

/** A palm frond: a drooping feather of leaflets, from the crown outwards along +x. */
function frondGeometry(length: number) {
  const pos: number[] = [];
  const steps = 18;
  const spine = (t: number): V3 => [t * length, Math.sin(t * Math.PI * 0.9) * length * 0.28 - t * t * length * 0.45, 0];
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const a = spine(t0);
    const b = spine(t1);
    const w = Math.sin(Math.min(1, t0 * 1.3) * Math.PI) * length * 0.2 + 0.03;
    for (const side of [-1, 1]) {
      // Each leaflet angles back and down, like the renders' fan palms.
      const tip: V3 = [a[0] - w * 0.35, a[1] - w * 0.35, side * w];
      pos.push(...a, ...b, ...tip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/** A whole palm: a gently curved trunk and a crown of fronds. Height ~1; scale per instance. */
export function palmGeometry(s = 3): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  rand(s);
  const bend = 0.12 + rand() * 0.12;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.3, 0.35, 0),
    new THREE.Vector3(bend * 0.8, 0.7, 0),
    new THREE.Vector3(bend, 1, 0),
  ]);
  const trunk = new THREE.TubeGeometry(curve, 16, 0.028, 8, false);
  const fronds: THREE.BufferGeometry[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const f = frondGeometry(0.42 + rand() * 0.12);
    f.rotateZ(0.25 - rand() * 0.5);
    f.rotateY((i / n) * Math.PI * 2 + rand() * 0.3);
    f.translate(bend, 1, 0);
    fronds.push(normalise(f));
  }
  const crown = mergeGeometries(fronds)!;
  return { trunk: normalise(trunk), crown };
}

/** A potted plant for balconies: tapered pot plus upright strap leaves (bird-of-paradise/sansevieria). */
export function pottedPlant(b: Bucket, potKey: string, leafKey: string, x: number, y: number, z: number, scale = 1, s = 1) {
  rand(s * 97 + 13);
  const h = 0.55 * scale;
  b.cylinder(potKey, [x, y + h / 2, z], 0.26 * scale, 0.19 * scale, h, 18);
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const len = (0.7 + rand() * 0.6) * scale;
    const g = new THREE.PlaneGeometry(0.16 * scale, len, 1, 4);
    const p = g.attributes.position!;
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) + len / 2) / len;
      p.setX(v, p.getX(v) * Math.sin(Math.min(1, t * 1.1 + 0.15) * Math.PI));
      p.setZ(v, t * t * 0.22 * scale);
    }
    g.translate(0, len / 2, 0);
    g.rotateX(-0.25 - rand() * 0.35);
    g.rotateY((i / leaves) * Math.PI * 2 + rand() * 0.4);
    g.translate(x, y + h * 0.9, z);
    b.add(leafKey, g);
  }
}

/** A clipped shrub or hedge lobe. */
export function shrubGeometry(s = 5) {
  rand(s);
  const base = new THREE.IcosahedronGeometry(1, 3);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const g = mergeVertices(base, 1e-4);
  const p = g.attributes.position!;
  const ph = rand() * 10;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v);
    const y = p.getY(v);
    const z = p.getZ(v);
    const k = 1 + Math.sin(x * 7 + ph) * Math.sin(y * 6) * Math.sin(z * 8 + ph) * 0.14;
    p.setXYZ(v, x * k, Math.max(-0.2, y) * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let v = 0; v < p.count; v++) {
    uv[v * 2] = (Math.atan2(p.getZ(v), p.getX(v)) / (Math.PI * 2) + 0.5) * 2;
    uv[v * 2 + 1] = p.getY(v);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Instanced placement helper. */
export function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: { p: V3; s: V3 | number; ry?: number; color?: THREE.Color }[],
  cast = true,
) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set(0, it.ry ?? 0, 0);
    q.setFromEuler(e);
    const sc = typeof it.s === 'number' ? new THREE.Vector3(it.s, it.s, it.s) : new THREE.Vector3(...it.s);
    m.compose(new THREE.Vector3(...it.p), q, sc);
    mesh.setMatrixAt(i, m);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.count = items.length;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
