import * as THREE from 'three';
import type { FacadeRun, TourScene } from '../../../lib/digital-twin';
import { Bucket } from './geometry';
import type { Materials } from './materials';
import { furnishOneBedroom, furnishTwoBedroom } from './apartments';
import { furnishPenthouse, type Furnish } from './penthouse';

const UV: Record<string, number> = {
  wall: 0.3, walnut: 0.6, oak: 0.6, marble: 0.55, marbleDark: 0.5, marbleFloor: 0.32, stone: 0.4, paving: 0.35,
  teak: 0.55, ceiling: 0.3, floorWood: 0.3, plaster: 0.25,
};
const NO_SHADOW = new Set(['clearGlass', 'balustrade', 'bulb', 'led', 'downlight', 'curtain', 'lampShade', 'fire', 'ceiling', 'globe', 'water', 'smoked']);

/** Furnishing per scene id; a scene with a GLB `model` needs none. */
const FURNISH: Record<string, Furnish> = {
  penthouse: furnishPenthouse,
  'one-bedroom': furnishOneBedroom,
  'two-bedroom': furnishTwoBedroom,
};

export interface InteriorLight {
  p: [number, number, number];
  intensity: number;
  distance: number;
  color?: string;
}

/**
 * A furnished residence interior, built from a TourScene: floors, facade,
 * partitions, ceilings with lighting coves, terraces — then the scene's own
 * furnishing, or its GLB when it has one. Built in the scene's frame.
 */
export class ResidenceInterior {
  readonly root = new THREE.Group();
  /** Lifted off in the dollhouse. */
  readonly ceiling = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  private defs: InteriorLight[] = [];
  private level = 1;
  private focusKey = '';

  constructor(
    private mats: Materials,
    readonly scene: TourScene,
  ) {
    this.root.name = `residence:${scene.id}`;
  }

  private material = (k: string) => (k === 'floorWood' ? this.mats.floorWood() : this.mats.get(k));

  async build(quality: 'high' | 'lite') {
    if (this.scene.model) {
      await this.loadModel(this.scene.model);
      return;
    }
    const b = new Bucket();
    const c = new Bucket();
    this.floors(b);
    this.facade(b);
    this.partitions(b);
    this.ceilings(c);
    this.terraces(b);
    const lights: InteriorLight[] = [];
    FURNISH[this.scene.id]?.({ b, c, root: this.root, mats: this.mats, scene: this.scene, lights, quality });
    b.build(this.root, this.material, {
      uvScale: (k) => UV[k] ?? null,
      shadows: (k) => ({ cast: !NO_SHADOW.has(k), receive: !NO_SHADOW.has(k) }),
    });
    c.build(this.ceiling, this.material, { uvScale: (k) => UV[k] ?? null, shadows: (k) => ({ cast: k === 'walnut' || k === 'plaster', receive: true }) });
    this.root.add(this.ceiling);
    // A fixed pool of lamps (a changing light count would recompile every shader). On lite quality
    // the pool is smaller and follows the visitor, taking the lamps of the nearest rooms.
    this.defs = lights;
    const n = quality === 'high' ? lights.length : Math.min(7, lights.length);
    for (let i = 0; i < n; i++) {
      const p = new THREE.PointLight('#FFC98F', 0, 1, 2);
      this.root.add(p);
      this.lights.push(p);
    }
    this.focus(new THREE.Vector3());
  }

  /** Point the lamp pool at the lamps nearest `local` (the camera, in the scene frame). */
  focus(local: THREE.Vector3) {
    if (!this.defs.length) return;
    const ranked =
      this.lights.length >= this.defs.length
        ? this.defs
        : [...this.defs]
            .map((d) => ({ d, k: (d.p[0] - local.x) ** 2 + (d.p[2] - local.z) ** 2 }))
            .sort((a, b) => a.k - b.k)
            .slice(0, this.lights.length)
            .map((x) => x.d);
    const key = ranked.map((d) => this.defs.indexOf(d)).join(',');
    if (key === this.focusKey) return;
    this.focusKey = key;
    ranked.forEach((d, i) => {
      const l = this.lights[i]!;
      l.position.set(...d.p);
      l.distance = d.distance;
      l.color.set(d.color ?? '#FFC98F');
      l.userData.base = d.intensity;
    });
    this.setLights(this.level);
  }

  private async loadModel(url: string) {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
      const light = o as THREE.PointLight;
      if (light.isPointLight) {
        light.userData.base = light.intensity;
        this.lights.push(light);
      }
    });
    this.root.add(gltf.scene);
  }

  // ─── Shell ──────────────────────────────────────────────────────────────

  private floors(b: Bucket) {
    const s = this.scene;
    const [x0, z0, x1, z1] = s.enclosed;
    // Halls and thresholds in stone; each room lays its own floor a few millimetres proud.
    b.box('marbleFloor', x0, -0.02, z0, x1, 0, z1);
    for (const r of s.rooms) {
      if (r.outdoor) continue;
      const [a, c, d, e] = r.rect;
      b.box(r.floor ?? 'floorWood', a, 0, c, d, 0.006, e);
    }
    // The structural slab under everything, and a fascia around the terraces.
    const [bx0, bz0, bx1, bz1] = s.bounds;
    b.box('slab', bx0 - 0.15, -0.42, bz0, bx1, -0.02, bz1 + 0.15);
  }

  private facade(b: Bucket) {
    const H = this.scene.ceiling;
    for (const run of this.scene.facade) {
      const [ax, az] = run.from;
      const [bx, bz] = run.to;
      const alongX = az === bz;
      const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
      const box = (key: string, u0: number, y0: number, u1: number, y1: number, d0: number, d1: number) => {
        const lo = Math.min(u0, u1);
        const hi = Math.max(u0, u1);
        if (alongX) b.box(key, lo, y0, az + d0, hi, y1, az + d1);
        else b.box(key, ax + d0, y0, lo, ax + d1, y1, hi);
      };
      const u0 = alongX ? Math.min(ax, bx) : Math.min(az, bz);
      const u1 = u0 + len;
      if (run.kind === 'wall') {
        box('wall', u0, 0, u1, H, -0.12, 0.12);
        continue;
      }
      // Slim bronze frames: head, sill, mullions no more than 2.4 m apart.
      box('frame', u0, H - 0.1, u1, H, -0.06, 0.06);
      box('frame', u0, 0, u1, 0.03, -0.06, 0.06);
      if (run.kind === 'glass') {
        box('clearGlass', u0, 0.03, u1, H - 0.1, -0.01, 0.01);
        const n = Math.max(1, Math.ceil(len / 2.4));
        for (let i = 0; i <= n; i++) {
          const u = u0 + (len * i) / n;
          box('frame', u - 0.03, 0, u + 0.03, H, -0.06, 0.06);
        }
      } else {
        // An open slider, parked behind the fixed pane beside it.
        box('frame', u0 - 0.03, 0, u0 + 0.03, H, -0.06, 0.06);
        box('frame', u1 - 0.03, 0, u1 + 0.03, H, -0.06, 0.06);
        const inward = this.inwardSign(run);
        const w = Math.min(len * 0.5, 1.8);
        box('clearGlass', u1, 0.03, u1 + w, H - 0.1, inward * 0.1 - 0.01, inward * 0.1 + 0.01);
        box('frame', u1 + w - 0.025, 0.03, u1 + w + 0.025, H - 0.1, inward * 0.1 - 0.03, inward * 0.1 + 0.03);
      }
    }
  }

  /** +1 when the enclosed interior lies on the run's positive side. */
  private inwardSign(run: FacadeRun) {
    const [x0, z0, x1, z1] = this.scene.enclosed;
    const [ax, az] = run.from;
    if (run.from[1] === run.to[1]) return az > (z0 + z1) / 2 ? -1 : 1;
    return ax > (x0 + x1) / 2 ? -1 : 1;
  }

  private partitions(b: Bucket) {
    const H = this.scene.ceiling;
    for (const [x0, z0, x1, z1] of this.scene.partitions) {
      b.box('wall', x0, 0, z0, x1, H, z1);
      // Walnut shadow-gap skirting both sides.
      const alongX = x1 - x0 > z1 - z0;
      if (alongX) b.box('walnut', x0, 0, z0 - 0.012, x1, 0.07, z1 + 0.012);
      else b.box('walnut', x0 - 0.012, 0, z0, x1 + 0.012, 0.07, z1);
    }
    for (const [x0, z0, x1, z1] of this.scene.doors) {
      const alongX = x1 - x0 > z1 - z0;
      const head = 2.45;
      b.box('wall', x0, head, z0, x1, H, z1);
      // Walnut-lined reveals: two jambs and a soffit.
      if (alongX) {
        b.box('walnut', x0, 0, z0 - 0.01, x0 + 0.03, head, z1 + 0.01);
        b.box('walnut', x1 - 0.03, 0, z0 - 0.01, x1, head, z1 + 0.01);
      } else {
        b.box('walnut', x0 - 0.01, 0, z0, x1 + 0.01, head, z0 + 0.03);
        b.box('walnut', x0 - 0.01, 0, z1 - 0.03, x1 + 0.01, head, z1);
      }
      b.box('walnut', x0 - 0.01, head - 0.03, z0 - 0.01, x1 + 0.01, head, z1 + 0.01);
    }
  }

  /** A plaster ceiling, a lit cove around every room and a grid of downlights. */
  private ceilings(c: Bucket) {
    const s = this.scene;
    const H = s.ceiling;
    const [x0, z0, x1, z1] = s.enclosed;
    c.box('ceiling', x0 - 0.12, H, z0 - 0.12, x1 + 0.12, H + 0.1, z1 + 0.12);
    c.box('plaster', x0 - 0.2, H + 0.1, z0 - 0.2, x1 + 0.2, H + 0.45, z1 + 0.2);
    for (const r of s.rooms) {
      if (r.outdoor) continue;
      const [a, b, d, e] = r.rect;
      const w = 0.32;
      // The dropped band sits on the walls; the LED line washes the ceiling above it.
      for (const [p, q, rr, t] of [
        [a, b, d, b + w],
        [a, e - w, d, e],
        [a, b + w, a + w, e - w],
        [d - w, b + w, d, e - w],
      ] as const) {
        c.box('ceiling', p, H - 0.16, q, rr, H, t);
      }
      c.box('led', a + w, H - 0.165, b + w - 0.02, d - w, H - 0.15, b + w);
      c.box('led', a + w, H - 0.165, e - w, d - w, H - 0.15, e - w + 0.02);
      c.box('led', a + w - 0.02, H - 0.165, b + w, a + w, H - 0.15, e - w);
      c.box('led', d - w, H - 0.165, b + w, d - w + 0.02, H - 0.15, e - w);
      const nx = Math.max(1, Math.round((d - a - 1.4) / 1.7));
      const nz = Math.max(1, Math.round((e - b - 1.4) / 1.7));
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const x = a + 0.7 + ((d - a - 1.4) * (i + 0.5)) / nx;
          const z = b + 0.7 + ((e - b - 1.4) * (j + 0.5)) / nz;
          const g = new THREE.CircleGeometry(0.045, 14);
          g.rotateX(Math.PI / 2);
          g.translate(x, H - 0.005, z);
          c.add('downlight', g);
          const ring = new THREE.RingGeometry(0.045, 0.06, 16);
          ring.rotateX(Math.PI / 2);
          ring.translate(x, H - 0.004, z);
          c.add('frame', ring);
        }
    }
  }

  private terraces(b: Bucket) {
    const s = this.scene;
    for (const r of s.rooms) {
      if (!r.outdoor) continue;
      const [a, c, d, e] = r.rect;
      b.box(r.floor ?? 'paving', a, -0.02, c, d, 0.004, e);
    }
    // Glass balustrades on every terrace edge that is not the building face.
    const [bx0, bz0, bx1, bz1] = s.bounds;
    const [ex0, ez0, ex1, ez1] = s.enclosed;
    const edges: { fixed: number; alongX: boolean; lo: number; hi: number; cover: [number, number] | null }[] = [
      { fixed: bz1, alongX: true, lo: bx0, hi: bx1, cover: ez1 === bz1 ? [ex0, ex1] : null },
      { fixed: bz0, alongX: true, lo: bx0, hi: bx1, cover: ez0 === bz0 ? [ex0, ex1] : null },
      { fixed: bx0, alongX: false, lo: bz0, hi: bz1, cover: ex0 === bx0 ? [ez0, ez1] : null },
      { fixed: bx1, alongX: false, lo: bz0, hi: bz1, cover: ex1 === bx1 ? [ez0, ez1] : null },
    ];
    for (const e of edges) {
      const spans: [number, number][] = e.cover
        ? ([[e.lo, e.cover[0]], [e.cover[1], e.hi]] as [number, number][]).filter(([p, q]) => q - p > 0.05)
        : [[e.lo, e.hi]];
      for (const [p, q] of spans) this.balustrade(b, e.alongX, e.fixed, p, q);
    }
  }

  private balustrade(b: Bucket, alongX: boolean, fixed: number, lo: number, hi: number) {
    const put = (key: string, y0: number, y1: number, t: number) =>
      alongX ? b.box(key, lo, y0, fixed - t, hi, y1, fixed + t) : b.box(key, fixed - t, y0, lo, fixed + t, y1, hi);
    put('balustrade', 0, 1.08, 0.012);
    put('frame', 1.06, 1.1, 0.03);
    put('frame', -0.02, 0.05, 0.03);
  }

  /** Frees the interior's geometry; materials belong to the shared library. */
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }

  setLights(level: number) {
    this.level = level;
    for (const l of this.lights) l.intensity = ((l.userData.base as number | undefined) ?? 0) * level;
  }
}

