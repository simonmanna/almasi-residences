import * as THREE from 'three';
import { Bucket, canopyGeometry, instanced, palmGeometry, rand, shrubGeometry, type V3 } from './geometry';
import type { Materials } from './materials';
import * as T from './textures';
import { FOOTPRINT, STREET_FACE_Z } from '../../../lib/building-model';

/**
 * The plot, from the site plans: 1,276 m², the building a metre off its west
 * boundary, the basement drive down its east side, planting behind, and the
 * street — a 4 m reserve, the walkway, then 11.4 m of asphalt — to the south.
 */
const PLOT = { x0: -15.6, x1: 18.8, z0: -20.2, z1: 21 } as const;
const DRIVE = { x0: 14.5, x1: 18.5 } as const;
const STREET = { walk: 25, kerb: 26.5, far: 37.9, farWalk: 39.4 } as const;
/** The way in from the street, under the canopy. */
const GATE = { x0: -6.2, x1: 4 } as const;

const inSite = (x: number, z: number) => x > PLOT.x0 - 1.5 && x < PLOT.x1 + 1.5 && z > PLOT.z0 - 2 && z < STREET.walk;
const inStreet = (z: number) => z > STREET.walk - 1.5 && z < STREET.farWalk + 2.5;

/** Everything outside the building: grounds, street, gardens, and the hills of Kigali beyond. */
export class Landscape {
  readonly near = new THREE.Group();
  readonly far = new THREE.Group();
  private cityLights!: THREE.Points;
  private windows!: THREE.MeshStandardMaterial;
  private sway: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] }[] = [];

  constructor(private mats: Materials) {
    this.near.name = 'landscape';
    this.far.name = 'hills';
  }

  build(quality: 'high' | 'lite') {
    this.ground();
    this.street();
    this.gardens(quality);
    this.cars();
    this.hills(quality);
  }

  private ground() {
    const grass = T.grassTexture();
    grass.repeat.set(90, 90);
    const g = new THREE.Mesh(
      new THREE.CircleGeometry(700, 96).rotateX(-Math.PI / 2),
      this.mats.own(new THREE.MeshStandardMaterial({ map: grass, color: '#B8C4A8', roughness: 1 }), grass),
    );
    g.position.y = -0.05;
    g.receiveShadow = true;
    this.near.add(g);

    const b = new Bucket();
    const [, , fx1] = FOOTPRINT;
    // Forecourt in pale stone, from the building to the street's walkway.
    b.box('paving', PLOT.x0, -0.04, STREET_FACE_Z - 0.5, DRIVE.x0, 0.02, STREET.walk);
    // The narrow passage down the west boundary, and the walk between the building and the drive.
    b.box('paving', PLOT.x0, -0.04, PLOT.z0, FOOTPRINT[0] + 0.5, 0.02, STREET_FACE_Z - 0.5);
    b.box('paving', fx1 - 3, -0.04, PLOT.z0 + 3, DRIVE.x0, 0.02, STREET_FACE_Z - 0.5);
    // The drive down to the basement, in darker setts.
    b.box('stone', DRIVE.x0, -0.03, PLOT.z0, DRIVE.x1, 0.03, STREET.kerb);
    // Boundary walls on three sides.
    b.box('plaster', PLOT.x0 - 0.2, 0, PLOT.z0 - 0.2, PLOT.x0, 1.6, PLOT.z1);
    b.box('plaster', PLOT.x0 - 0.2, 0, PLOT.z0 - 0.2, PLOT.x1 + 0.2, 1.6, PLOT.z0);
    b.box('plaster', PLOT.x1, 0, PLOT.z0 - 0.2, PLOT.x1 + 0.2, 1.6, PLOT.z1);
    b.build(this.near, (k) => this.mats.get(k), { uvScale: (k) => (k === 'paving' ? 0.22 : 0.35) });
  }

  private street() {
    const asphalt = T.asphaltTexture();
    asphalt.repeat.set(60, 1.5);
    const rough = T.puddleRoughness();
    rough.repeat.set(24, 1);
    const width = STREET.far - STREET.kerb;
    const mid = (STREET.kerb + STREET.far) / 2;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(900, width).rotateX(-Math.PI / 2),
      this.mats.own(new THREE.MeshStandardMaterial({ map: asphalt, roughnessMap: rough, roughness: 1, color: '#9A9A9A', envMapIntensity: 1.4 }), asphalt),
    );
    this.mats.own(new THREE.MeshBasicMaterial(), rough);
    road.position.set(0, 0.01, mid);
    road.receiveShadow = true;
    this.near.add(road);

    const b = new Bucket();
    // A 1.5 m walkway either side of the asphalt.
    b.box('paving', -450, -0.04, STREET.far, 450, 0.08, STREET.farWalk);
    b.box('paving', -450, -0.04, STREET.walk, 450, 0.06, STREET.kerb);
    for (let x = -300; x < 300; x += 7) b.box('potWhite', x, 0.011, mid - 0.08, x + 3.2, 0.02, mid + 0.08);
    b.build(this.near, (k) => this.mats.get(k), { uvScale: (k) => (k === 'paving' ? 0.3 : null) });

    // The black-and-white striped kerb from the renders.
    const kerb = new THREE.BoxGeometry(0.98, 0.18, 0.28);
    const white: { p: V3; s: number }[] = [];
    const black: { p: V3; s: number }[] = [];
    for (let i = -140; i < 140; i++) {
      for (const z of [STREET.kerb + 0.1, STREET.far - 0.1]) {
        // The kerb drops where the drive and the entrance meet the street.
        if (z < mid && ((i > DRIVE.x0 - 1 && i < DRIVE.x1) || (i > GATE.x0 && i < GATE.x1 - 1))) continue;
        (i % 2 ? white : black).push({ p: [i + 0.5, 0.09, z], s: 1 });
      }
    }
    this.near.add(instanced(kerb, this.mats.get('potWhite'), white, false));
    this.near.add(instanced(kerb, this.mats.get('black'), black, false));

    // Street lamps: slim poles, warm heads.
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 6, 8).translate(0, 3, 0);
    const arm = new THREE.BoxGeometry(1.2, 0.08, 0.12).translate(0.5, 5.95, 0);
    const lamps: { p: V3; s: number; ry: number }[] = [];
    for (let x = -120; x <= 120; x += 20) lamps.push({ p: [x, 0, STREET.far + 0.9], s: 1, ry: Math.PI / 2 });
    this.near.add(instanced(pole, this.mats.get('frame'), lamps));
    this.near.add(instanced(arm, this.mats.get('frame'), lamps));
    const head = new THREE.BoxGeometry(0.5, 0.06, 0.25).translate(0, 5.88, -1.05);
    this.near.add(instanced(head, this.mats.get('bulb'), lamps.map((l) => ({ p: l.p, s: 1 })), false));
    const glowMat = this.mats.get('glowSprite');
    for (const l of lamps) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), glowMat);
      s.position.set(l.p[0], 0.05, STREET.far - 1);
      s.renderOrder = 2;
      this.near.add(s);
    }
  }

  private gardens(quality: 'high' | 'lite') {
    rand(9001);
    // Trees: broadleaf canopies in the neighbouring gardens and along the street.
    const canopy = canopyGeometry(quality === 'high' ? 7 : 5, 3, quality === 'high' ? 3 : 2);
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0);
    const trees: { p: V3; s: V3; ry: number; color: THREE.Color; h: number }[] = [];
    let guard = 0;
    while (trees.length < (quality === 'high' ? 90 : 55) && guard++ < 4000) {
      const x = (rand() - 0.5) * 220;
      const z = (rand() - 0.5) * 200 - 10;
      if (inSite(x, z) || inStreet(z)) continue;
      const s = 2.6 + rand() * 2.6;
      const tint = 0.75 + rand() * 0.35;
      trees.push({ p: [x, 0, z], s: [s, s * (0.9 + rand() * 0.3), s], ry: rand() * 6.28, color: new THREE.Color(0.24 * tint, 0.38 * tint, 0.2 * tint), h: s * 0.9 });
    }
    // A row behind the north boundary, so the building stands against green.
    for (let x = PLOT.x0 - 2; x <= PLOT.x1 + 4; x += 7) {
      const s = 3 + rand();
      trees.push({ p: [x + rand() * 2, 0, PLOT.z0 - 4 - rand() * 2], s: [s, s, s], ry: rand() * 6, color: new THREE.Color(0.2, 0.34, 0.17), h: s * 0.9 });
    }
    const canopyMat = this.mats.get('canopy');
    this.near.add(
      instanced(
        canopy,
        canopyMat,
        trees.map((t) => ({ p: [t.p[0], t.h + t.s[1] * 0.55, t.p[2]] as V3, s: t.s, ry: t.ry, color: t.color })),
      ),
    );
    this.near.add(instanced(trunk, this.mats.get('bark'), trees.map((t) => ({ p: t.p, s: [t.s[0] * 0.4, t.h + t.s[1] * 0.3, t.s[0] * 0.4] as V3 }))));

    // Palms: either side of the entrance, by the pool, and in the planting behind the building.
    const front = STREET_FACE_Z + 2.6;
    const palms: { p: V3; s: number; ry: number }[] = [];
    for (const x of [GATE.x0 - 4.4, GATE.x0 - 1, GATE.x1 + 1.2, GATE.x1 + 6]) palms.push({ p: [x, 0, front], s: 4.4 + rand() * 1.4, ry: rand() * 6 });
    for (let x = PLOT.x0 + 2.5; x < DRIVE.x0 - 2; x += 6.5) palms.push({ p: [x + rand() * 1.5, 0, PLOT.z0 + 1.6], s: 6.5 + rand() * 3.5, ry: rand() * 6 });
    const palm = palmGeometry(5);
    const trunks = instanced(palm.trunk, this.mats.get('bark'), palms);
    const crowns = instanced(palm.crown, this.mats.get('palmLeaf'), palms);
    this.near.add(trunks, crowns);
    this.trackSway(crowns);

    // Clipped hedges along the street, broken for the entrance and the drive; flowering shrubs among them.
    const shrub = shrubGeometry(8);
    const hedges: { p: V3; s: V3; ry: number }[] = [];
    const flowers: { p: V3; s: V3; ry: number }[] = [];
    const open = (x: number) => (x > GATE.x0 && x < GATE.x1) || (x > DRIVE.x0 - 0.6 && x < DRIVE.x1 + 0.6);
    for (let x = -60; x <= 60; x += 1.3) {
      if (open(x)) continue;
      hedges.push({ p: [x, 0.1, PLOT.z1 - 0.45], s: [0.85, 0.75, 0.6], ry: rand() * 6 });
      if (rand() > 0.86) flowers.push({ p: [x + 0.3, 0.5, PLOT.z1 - 0.85], s: [0.5, 0.4, 0.45], ry: rand() * 6 });
    }
    // Planting beds in front of the building, left and right of the way in.
    for (let i = 0; i < 44; i++) {
      const left = i % 2 === 0;
      const x = left ? GATE.x0 - 0.4 - rand() * 5.2 : GATE.x1 + 0.4 + rand() * 9;
      const z = STREET_FACE_Z + 1.2 + rand() * 2.6;
      const s = 0.45 + rand() * 0.75;
      (rand() > 0.84 ? flowers : hedges).push({ p: [x, 0.05, z], s: [s, s * 0.8, s], ry: rand() * 6 });
    }
    // The planted strip behind the building.
    for (let i = 0; i < 40; i++) {
      const x = PLOT.x0 + 1 + rand() * (DRIVE.x0 - PLOT.x0 - 2);
      const s = 0.6 + rand() * 0.8;
      (rand() > 0.8 ? flowers : hedges).push({ p: [x, 0.05, PLOT.z0 + 0.8 + rand() * 2], s: [s, s * 0.8, s], ry: rand() * 6 });
    }
    // The neighbours' gardens, beyond the boundary walls.
    for (let i = 0; i < 60; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side > 0 ? PLOT.x1 + 2 + rand() * 20 : PLOT.x0 - 2 - rand() * 20;
      const s = 0.6 + rand() * 0.9;
      (rand() > 0.9 ? flowers : hedges).push({ p: [x, 0.05, PLOT.z0 + rand() * (PLOT.z1 - PLOT.z0)], s: [s, s * 0.8, s], ry: rand() * 6 });
    }
    this.near.add(instanced(shrub, this.mats.get('hedge'), hedges));
    this.near.add(instanced(shrub, this.mats.get('flower'), flowers));

    // Bollards light the forecourt beds; uplights sit under the entrance palms.
    const bollards: { p: V3; s: number }[] = [];
    for (const x of [GATE.x0 - 5, GATE.x0 - 2.2, GATE.x0 - 0.2, GATE.x1 + 0.2, GATE.x1 + 3, GATE.x1 + 6.5]) bollards.push({ p: [x, 0, STREET_FACE_Z + 3.4], s: 1 });
    const bollard = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10).translate(0, 0.35, 0);
    const cap = new THREE.CylinderGeometry(0.075, 0.075, 0.08, 10).translate(0, 0.62, 0);
    this.near.add(instanced(bollard, this.mats.get('frame'), bollards, false));
    this.near.add(instanced(cap, this.mats.get('bulb'), bollards, false));
    const glowMat = this.mats.get('glowSprite');
    for (const bl of bollards) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), glowMat);
      s.position.set(bl.p[0], 0.06, bl.p[2]);
      this.near.add(s);
    }
    for (const p of palms.slice(0, 4)) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), glowMat);
      s.position.set(p.p[0], 0.07, p.p[2]);
      this.near.add(s);
    }
    const b = new Bucket();
    // A bench by the planting, looking back at the entrance.
    b.rounded('teak', [GATE.x1 + 2.2, 0.45, PLOT.z1 - 1.5], [1.8, 0.08, 0.5], 0.02);
    b.rounded('stone', [GATE.x1 + 2.2, 0.2, PLOT.z1 - 1.5], [1.4, 0.4, 0.35], 0.04);
    // A low wall along the street, with piers at the entrance and at the drive.
    for (const [x0, x1] of [[-60, GATE.x0], [GATE.x1, DRIVE.x0 - 0.6], [DRIVE.x1 + 0.6, 60]] as const) b.box('stone', x0, 0, PLOT.z1 - 0.1, x1, 0.55, PLOT.z1 + 0.15);
    for (const x of [GATE.x0 - 0.4, GATE.x1 + 0.4, DRIVE.x0 - 1, DRIVE.x1 + 1]) b.rounded('plaster', [x, 1.2, PLOT.z1], [0.8, 2.4, 0.8], 0.06);
    b.build(this.near, (k) => this.mats.get(k), { uvScale: () => 0.4 });
  }

  private cars() {
    const b = new Bucket();
    const car = (x: number, z: number, ry: number, paint: string) => {
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
      const profile = new THREE.Shape();
      profile.moveTo(-2.45, 0.32);
      profile.lineTo(2.35, 0.32);
      profile.quadraticCurveTo(2.5, 0.35, 2.48, 0.62);
      profile.quadraticCurveTo(2.45, 0.8, 2.1, 0.86);
      profile.lineTo(0.95, 0.95);
      profile.quadraticCurveTo(0.45, 1.38, -0.2, 1.42);
      profile.lineTo(-1.2, 1.4);
      profile.quadraticCurveTo(-1.9, 1.3, -2.3, 0.98);
      profile.quadraticCurveTo(-2.52, 0.85, -2.45, 0.32);
      const body = new THREE.ExtrudeGeometry(profile, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
      body.translate(0, 0, -0.92);
      b.add(paint, body, m);
      const glass = new THREE.Shape();
      glass.moveTo(0.85, 0.97);
      glass.quadraticCurveTo(0.4, 1.33, -0.2, 1.36);
      glass.lineTo(-1.15, 1.34);
      glass.quadraticCurveTo(-1.8, 1.25, -2.15, 0.99);
      const gg = new THREE.ExtrudeGeometry(glass, { depth: 1.9, bevelEnabled: false, curveSegments: 8 });
      gg.translate(0, 0.01, -0.95);
      b.add('screen', gg, m);
      for (const [wx, wz] of [[1.55, 0.86], [1.55, -0.86], [-1.55, 0.86], [-1.55, -0.86]] as const) {
        const w = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 24).rotateX(Math.PI / 2).translate(wx, 0.36, wz);
        b.add('tyre', w, m);
        const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 16).rotateX(Math.PI / 2).translate(wx, 0.36, wz);
        b.add('steel', hub, m);
      }
      b.add('bulb', new THREE.BoxGeometry(0.06, 0.08, 1.5).translate(2.5, 0.72, 0), m);
      b.add('tail', new THREE.BoxGeometry(0.05, 0.07, 1.6).translate(-2.52, 0.8, 0), m);
    };
    // One drawn up outside the entrance, one on its way down to the basement.
    car(GATE.x1 + 3.6, STREET.walk - 1.9, 0.04, 'paintWhite');
    car((DRIVE.x0 + DRIVE.x1) / 2, 4, Math.PI / 2, 'paint');
    b.build(this.near, (k) => this.mats.get(k));
  }

  /** Rolling hills with a scatter of the city on them; lights come on at night. */
  private hills(quality: 'high' | 'lite') {
    const seg = quality === 'high' ? 200 : 120;
    const g = new THREE.RingGeometry(230, 1100, seg, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position!;
    const colors = new Float32Array(p.count * 3);
    const near = new THREE.Color('#34472F');
    const far = new THREE.Color('#5D6B5B');
    const ridge = (x: number, z: number) => {
      const a = Math.atan2(z, x);
      const r = Math.hypot(x, z);
      const k = Math.min(1, (r - 230) / 220);
      const h =
        (Math.sin(a * 3 + 1.2) * 0.5 + 0.5) * 16 +
        (Math.sin(a * 7.3 + r * 0.01) * 0.5 + 0.5) * 10 +
        (Math.sin(a * 17 + 2) * 0.5 + 0.5) * 4;
      return h * k * (1 + Math.max(0, r - 500) / 260) - 2;
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = ridge(x, z);
      p.setY(i, y);
      const c = near.clone().lerp(far, Math.min(1, (Math.hypot(x, z) - 230) / 700));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const hillMat = this.mats.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    const hills = new THREE.Mesh(g, hillMat);
    hills.receiveShadow = false;
    this.far.add(hills);

    // Distant buildings, white boxes that catch the sun; their windows glow after dark.
    rand(31337);
    const count = quality === 'high' ? 900 : 450;
    const boxes: { p: V3; s: V3; ry: number }[] = [];
    const lights: number[] = [];
    let guard = 0;
    while (boxes.length < count && guard++ < 20000) {
      const a = rand() * Math.PI * 2;
      const r = 240 + Math.pow(rand(), 0.8) * 380;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Kigali spreads over the hills to the south and west; keep the view to the north greener.
      if (z < -100 && rand() > 0.35) continue;
      const y = ridge(x, z);
      const w = 4 + rand() * 6;
      const h = 3 + rand() * (rand() > 0.95 ? 22 : 7);
      boxes.push({ p: [x, y + h / 2 - 3, z], s: [w, h, 4 + rand() * 6], ry: rand() * 3 });
      for (let k = 0; k < 3; k++) lights.push(x + (rand() - 0.5) * w, y + rand() * h, z + (rand() - 0.5) * w);
    }
    this.windows = new THREE.MeshStandardMaterial({ color: '#A7A197', roughness: 0.95, emissive: '#FFB86B', emissiveIntensity: 0 });
    this.mats.own(this.windows);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    const sprite = T.glowTexture('rgba(255,210,150,1)', 'rgba(255,180,100,0)');
    const pm = new THREE.PointsMaterial({ size: 3.2, map: sprite, color: new THREE.Color(2.2, 1.6, 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.mats.own(pm, sprite);
    this.cityLights = new THREE.Points(pg, pm);
    this.far.add(this.cityLights);
  }

  private trackSway(mesh: THREE.InstancedMesh) {
    const base: THREE.Matrix4[] = [];
    const phase: number[] = [];
    for (let i = 0; i < mesh.count; i++) {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(i, m);
      base.push(m);
      phase.push(Math.random() * 6.28);
    }
    this.sway.push({ mesh, base, phase });
  }

  /** Night 0…1 turns on the city; t drives the breeze in the palms. */
  update(t: number, night: number, reducedMotion: boolean) {
    (this.cityLights.material as THREE.PointsMaterial).opacity = Math.min(1, night * 1.2);
    this.cityLights.visible = night > 0.02;
    this.windows.emissiveIntensity = night * 0.35;
    if (reducedMotion) return;
    const r = new THREE.Matrix4();
    const m = new THREE.Matrix4();
    for (const s of this.sway) {
      for (let i = 0; i < s.base.length; i++) {
        const a = Math.sin(t * 0.9 + s.phase[i]!) * 0.025;
        r.makeRotationZ(a);
        m.multiplyMatrices(s.base[i]!, r);
        s.mesh.setMatrixAt(i, m);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
