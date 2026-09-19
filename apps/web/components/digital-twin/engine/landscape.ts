import * as THREE from 'three';
import { Bucket, canopyGeometry, instanced, palmGeometry, rand, shrubGeometry, type V3 } from './geometry';
import type { Materials } from './materials';
import * as T from './textures';

const inSite = (x: number, z: number) => x > -26 && x < 26 && z > -30 && z < 24;

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
    // Forecourt and paths in pale stone.
    b.box('paving', -26, -0.04, 10.75, 26, 0.02, 23.5);
    b.box('paving', -26, -0.04, -30, -19, 0.02, 10.75);
    b.box('paving', 19, -0.04, -30, 26, 0.02, 10.75);
    b.box('paving', -19, -0.04, -30, 19, 0.02, -26);
    // Drive in a darker setts band.
    b.box('stone', -6, -0.03, 15.6, 6, 0.03, 23.5);
    b.build(this.near, (k) => this.mats.get(k), { uvScale: (k) => (k === 'paving' ? 0.22 : 0.35) });
  }

  private street() {
    const asphalt = T.asphaltTexture();
    asphalt.repeat.set(60, 1.5);
    const rough = T.puddleRoughness();
    rough.repeat.set(24, 1);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 8).rotateX(-Math.PI / 2),
      this.mats.own(new THREE.MeshStandardMaterial({ map: asphalt, roughnessMap: rough, roughness: 1, color: '#9A9A9A', envMapIntensity: 1.4 }), asphalt),
    );
    this.mats.own(new THREE.MeshBasicMaterial(), rough);
    road.position.set(0, 0.01, 28);
    road.receiveShadow = true;
    this.near.add(road);

    const b = new Bucket();
    b.box('paving', -450, -0.04, 32, 450, 0.08, 35);
    b.box('paving', -450, -0.04, 23.5, 450, 0.06, 24);
    for (let x = -300; x < 300; x += 7) b.box('potWhite', x, 0.011, 27.92, x + 3.2, 0.02, 28.08);
    b.build(this.near, (k) => this.mats.get(k), { uvScale: (k) => (k === 'paving' ? 0.3 : null) });

    // The black-and-white striped kerb from the renders.
    const kerb = new THREE.BoxGeometry(0.98, 0.18, 0.28);
    const white: { p: V3; s: number }[] = [];
    const black: { p: V3; s: number }[] = [];
    for (let i = -140; i < 140; i++) {
      for (const z of [24.1, 31.9]) (i % 2 ? white : black).push({ p: [i + 0.5, 0.09, z], s: 1 });
    }
    this.near.add(instanced(kerb, this.mats.get('potWhite'), white, false));
    this.near.add(instanced(kerb, this.mats.get('black'), black, false));

    // Street lamps: slim poles, warm heads.
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 6, 8).translate(0, 3, 0);
    const arm = new THREE.BoxGeometry(1.2, 0.08, 0.12).translate(0.5, 5.95, 0);
    const lamps: { p: V3; s: number; ry: number }[] = [];
    for (let x = -120; x <= 120; x += 20) lamps.push({ p: [x, 0, 33.4], s: 1, ry: Math.PI / 2 });
    this.near.add(instanced(pole, this.mats.get('frame'), lamps));
    this.near.add(instanced(arm, this.mats.get('frame'), lamps));
    const head = new THREE.BoxGeometry(0.5, 0.06, 0.25).translate(0, 5.88, -1.05);
    this.near.add(instanced(head, this.mats.get('bulb'), lamps.map((l) => ({ p: l.p, s: 1 })), false));
    const glowMat = this.mats.get('glowSprite');
    for (const l of lamps) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), glowMat);
      s.position.set(l.p[0], 0.05, 32);
      s.renderOrder = 2;
      this.near.add(s);
    }
  }

  private gardens(quality: 'high' | 'lite') {
    rand(9001);
    // Trees: broadleaf canopies scattered around the site and along the street.
    const canopy = canopyGeometry(quality === 'high' ? 7 : 5, 3, quality === 'high' ? 3 : 2);
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0);
    const trees: { p: V3; s: V3; ry: number; color: THREE.Color; h: number }[] = [];
    let guard = 0;
    while (trees.length < (quality === 'high' ? 90 : 55) && guard++ < 4000) {
      const x = (rand() - 0.5) * 220;
      const z = (rand() - 0.5) * 200 - 10;
      const garden = x > -52 && x < -20 && z > -32 && z < 30;
      if (inSite(x, z) || garden || (z > 22 && z < 36)) continue;
      const s = 2.6 + rand() * 2.6;
      const tint = 0.75 + rand() * 0.35;
      trees.push({ p: [x, 0, z], s: [s, s * (0.9 + rand() * 0.3), s], ry: rand() * 6.28, color: new THREE.Color(0.24 * tint, 0.38 * tint, 0.2 * tint), h: s * 0.9 });
    }
    // A double row framing the gardens west of the building.
    for (let z = -26; z <= 12; z += 7) {
      const s = 3 + rand();
      trees.push({ p: [-54 + rand() * 2, 0, z], s: [s, s, s], ry: rand() * 6, color: new THREE.Color(0.2, 0.34, 0.17), h: s * 0.9 });
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

    // Palms: along the forecourt, the garden walk and the pool deck.
    const palms: { p: V3; s: number; ry: number }[] = [];
    for (const x of [-22, -16, 16, 22]) palms.push({ p: [x, 0, 21.5], s: 8 + rand() * 2.5, ry: rand() * 6 });
    for (let i = 0; i < 9; i++) palms.push({ p: [-30 - rand() * 12, 0, -18 + i * 4.6 + rand() * 1.5], s: 6.5 + rand() * 4, ry: rand() * 6 });
    for (const [x, z] of [[-12.8, -24.6], [12.8, -12.4], [-12.8, -12], [22, -20], [23, -5], [22.5, 6]] as const)
      palms.push({ p: [x, x > -13 && x < 13 ? 3.4 : 0, z], s: 6 + rand() * 2.5, ry: rand() * 6 });
    const palm = palmGeometry(5);
    const trunks = instanced(palm.trunk, this.mats.get('bark'), palms);
    const crowns = instanced(palm.crown, this.mats.get('palmLeaf'), palms);
    this.near.add(trunks, crowns);
    this.trackSway(crowns);

    // Clipped hedges along the street, broken for the drive; flowering shrubs among them.
    const shrub = shrubGeometry(8);
    const hedges: { p: V3; s: V3; ry: number }[] = [];
    const flowers: { p: V3; s: V3; ry: number }[] = [];
    for (let x = -60; x <= 60; x += 1.3) {
      if (x > -7 && x < 7) continue;
      hedges.push({ p: [x, 0.1, 23], s: [0.85, 0.75, 0.6], ry: rand() * 6 });
      if (rand() > 0.72) flowers.push({ p: [x + 0.3, 0.5, 22.6], s: [0.55, 0.45, 0.5], ry: rand() * 6 });
    }
    for (let i = 0; i < 70; i++) {
      const x = -24 - rand() * 22;
      const z = -28 + rand() * 48;
      const s = 0.5 + rand() * 0.9;
      (rand() > 0.7 ? flowers : hedges).push({ p: [x, 0.05, z], s: [s, s * 0.8, s], ry: rand() * 6 });
    }
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      hedges.push({ p: [side * (20 + rand() * 4.5), 0.05, -28 + rand() * 50], s: [0.9, 0.7, 0.9], ry: rand() * 6 });
    }
    this.near.add(instanced(shrub, this.mats.get('hedge'), hedges));
    this.near.add(instanced(shrub, this.mats.get('flower'), flowers));

    // A stepping-stone walk through the western lawns, lit by bollards.
    const stone = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 18);
    const steps: { p: V3; s: V3 }[] = [];
    const bollards: { p: V3; s: number }[] = [];
    for (let i = 0; i < 44; i++) {
      const t = i / 43;
      const x = -24 - 12 * Math.sin(t * Math.PI) + (t - 0.5) * 4;
      const z = 20 - t * 46;
      steps.push({ p: [x, 0.02, z], s: [1, 1, 0.8] });
      if (i % 5 === 0) bollards.push({ p: [x + 1.1, 0, z], s: 1 });
    }
    this.near.add(instanced(stone, this.mats.get('stone'), steps, false));
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
    // Uplights under the palms of the forecourt.
    for (const p of palms.slice(0, 4)) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), glowMat);
      s.position.set(p.p[0], 0.07, p.p[2]);
      this.near.add(s);
    }
    // Benches along the walk.
    const b = new Bucket();
    for (const [x, z, r] of [[-33, 4, 0.4], [-31, -12, -0.3]] as const) {
      b.rounded('teak', [x, 0.45, z], [1.8, 0.08, 0.5], 0.02, r);
      b.rounded('stone', [x, 0.2, z], [1.4, 0.4, 0.35], 0.04, r);
    }
    // A low garden wall and gate piers along the street edge.
    b.box('stone', -60, 0, 23.7, -7, 0.55, 23.95);
    b.box('stone', 7, 0, 23.7, 60, 0.55, 23.95);
    for (const x of [-7.4, 7.4]) b.rounded('plaster', [x, 1.2, 23.8], [0.8, 2.4, 0.8], 0.06);
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
    car(-3.2, 19.2, 0.05, 'paint');
    car(3.4, 17.8, Math.PI - 0.08, 'paintWhite');
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
