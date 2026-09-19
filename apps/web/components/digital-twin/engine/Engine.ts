import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FLOOR_H, FOOTPRINT, SLAB, levelBase } from '../../../lib/building-model';
import {
  CINEMATIC,
  EXTERIOR_HOTSPOTS,
  canWalk,
  placeById,
  roomAt,
  roomById,
  routeBetween,
  type Environment,
  type InteriorMode,
  type Place,
  type RoomId,
  type Shot,
  type TourScene,
} from '../../../lib/digital-twin';
import { Atmosphere } from './atmosphere';
import { BUILDING_LEVELS, Building, type UnitRef } from './building';
import { Landscape } from './landscape';
import { Materials } from './materials';
import { ResidenceInterior } from './residence';

export type Quality = 'high' | 'lite';
export type UnitStatus = 'available' | 'reserved' | 'booked' | 'sold' | 'unavailable';
export interface EngineUnit extends UnitRef {
  status: UnitStatus;
}

export interface EngineCallbacks {
  progress: (percent: number, step: string) => void;
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
  pose: (p: { x: number; z: number; yaw: number; room: RoomId | null }) => void;
  caption: (text: string | null) => void;
  fade: (on: boolean) => void;
  quality: (q: Quality) => void;
  interacted: () => void;
}

type Ctl =
  | { kind: 'orbit'; target: THREE.Vector3; theta: number; phi: number; radius: number; minR: number; maxR: number; minPhi: number; maxPhi: number; auto: number }
  | { kind: 'look'; pos: THREE.Vector3; yaw: number; pitch: number };

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  path: THREE.CatmullRomCurve3 | null;
  t: number;
  duration: number;
  arc: number;
  then: Ctl;
  done?: () => void;
}

const EYE = 1.6;
const STATUS_COLOR: Record<UnitStatus, string> = {
  available: '#8FD3A8',
  reserved: '#E8B660',
  booked: '#E8B660',
  sold: '#A29C92',
  unavailable: '#6E6A64',
};
const GOLD = new THREE.Color('#F0C987');

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const v3 = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);

export class TwinEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private clamp!: ShaderPass;
  private ao: GTAOPass | null = null;
  private mats: Materials;
  private atmosphere: Atmosphere;
  private building: Building;
  private landscape: Landscape;
  private residence: ResidenceInterior;
  private tour: TourScene;
  /** The residence frame's origin in the world: its level's finished floor, at the scene's plan offset. */
  private origin: THREE.Vector3;
  private timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private ctl: Ctl;
  private flight: Flight | null = null;
  private lookAt = new THREE.Vector3();
  private units: EngineUnit[] = [];
  private hovered: string | null = null;
  private selected: string | null = null;
  private focus: number | null = null;
  private availability = false;
  private levelFx = new Map<number, { y: number; o: number }>();
  private interior = false;
  /** Between the approach flight and the fade indoors: labels stay hidden. */
  private entering = false;
  private mode: InteriorMode = 'tour';
  private room: RoomId;
  private lights = true;
  private env: Environment = 'sunset';
  private place: Place = 'exterior';
  private labels = new Map<string, HTMLElement>();
  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0, id: -1 };
  private touches = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private hoverNdc: THREE.Vector2 | null = null;
  private raycaster = new THREE.Raycaster();
  private lastInteract = 0;
  private cine: { i: number; t: number } | null = null;
  private frameTimes: number[] = [];
  private warmup = 30;
  private quality: Quality;
  private reducedMotion: boolean;
  private poseClock = 0;
  private occlusionClock = 0;
  private occluded = new Set<string>();
  private resizeObserver: ResizeObserver;
  private fov = 38;
  /** Warm washes on the street face and the lobby, lit from dusk. */
  private washes: THREE.Light[] = [];

  constructor(
    private host: HTMLElement,
    private cb: EngineCallbacks,
    opts: { quality: Quality; reducedMotion: boolean; scene: TourScene },
  ) {
    this.tour = opts.scene;
    this.room = opts.scene.startRoom;
    this.origin = new THREE.Vector3(opts.scene.offset[0], levelBase(opts.scene.level) + SLAB, opts.scene.offset[1]);
    this.quality = opts.quality;
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 1.75 : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of Almasi Residence');
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 9000);
    this.scene.fog = new THREE.FogExp2('#C79A80', 0.0024);
    this.mats = new Materials(this.renderer.capabilities.getMaxAnisotropy());
    this.atmosphere = new Atmosphere(this.renderer, this.quality === 'high' ? 4096 : 1536);
    this.building = new Building(this.mats);
    this.landscape = new Landscape(this.mats);
    this.residence = new ResidenceInterior(this.mats, this.tour);
    this.camera.position.set(-150, 95, 190);
    this.lookAt.set(0, 8, 0);
    this.camera.lookAt(this.lookAt);
    this.ctl = this.orbitFrom(this.camera.position, this.lookAt);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  // ─── Loading ───────────────────────────────────────────────────────────

  async load() {
    const step = async (p: number, label: string, fn: () => void | Promise<void>) => {
      this.cb.progress(p, label);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      if (this.disposed) throw new Error('disposed');
      await fn();
    };
    await step(6, 'Preparing materials', () => this.atmosphere.set('sunset', true));
    await step(18, 'Loading architecture', () => this.building.build());
    await step(42, 'Planting the gardens', () => this.landscape.build(this.quality));
    await step(64, 'Furnishing the penthouse', async () => {
      await this.residence.build(this.quality);
      this.roofDeck();
    });
    await step(80, 'Preparing light', () => {
      this.scene.add(this.atmosphere.group, this.landscape.near, this.landscape.far, this.building.root, this.residence.root);
      for (const [x, z] of [[-12, 30], [0, 34], [12, 30]] as const) {
        const s = new THREE.SpotLight('#FFC58A', 0, 70, 0.55, 0.9, 1.4);
        s.position.set(x, 1, z);
        s.target.position.set(x * 0.6, 11, 10.75);
        s.userData.base = 110;
        this.building.root.add(s, s.target);
        this.washes.push(s);
      }
      for (const [x, z] of [[0.1, 5.4], [2, 8.4]] as const) {
        const l = new THREE.PointLight('#FFC98F', 0, 9, 2);
        l.position.set(x, 2.6, z);
        l.userData.base = 9;
        this.building.levels.get(0)!.add(l);
        this.washes.push(l);
      }
      this.residence.root.position.copy(this.origin);
      this.residence.root.visible = false;
      this.setupComposer();
      this.resize();
      this.applyGlow();
    });
    await step(92, 'Compiling shaders', () => {
      this.residence.root.visible = true;
      this.renderer.compile(this.scene, this.camera);
      this.residence.root.visible = false;
    });
    this.bindInput();
    this.cb.progress(100, 'Welcome');
    this.loop();
    // The reveal: a long, slow descent onto the building at golden hour.
    this.fly(placeById('exterior').shot, this.reducedMotion ? 0.01 : 5.5, 'orbit', { arc: 0 });
  }

  private setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
      this.composer.addPass(this.ao);
    }
    // A lamp's highlight on polished stone can overflow the half-float buffer; one Inf pixel then
    // blooms into a white-out. Clamp (and scrub NaN) before bloom sees it.
    this.clamp = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, ceiling: { value: 48 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform sampler2D tDiffuse; uniform float ceiling; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0); gl_FragColor = vec4(min(c.rgb, vec3(ceiling)), c.a); }',
      });
    this.composer.addPass(this.clamp);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.6, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // Portrait phones need a wider lens to hold the whole building.
    this.fov = w / h < 0.8 ? 52 : w / h < 1.2 ? 44 : 38;
    if (!this.interior) this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────

  setUnits(units: EngineUnit[]) {
    const same =
      units.length === this.units.length &&
      units.every((u, i) => u.id === this.units[i]?.id && u.modelSlot === this.units[i]?.modelSlot && u.floorLevel === this.units[i]?.floorLevel);
    this.units = units;
    if (!same) {
      this.building.setUnits(units);
      if (this.focus !== null) this.building.showCutaway(this.focus, units);
    }
  }

  setEnvironment(env: Environment) {
    this.env = env;
    this.atmosphere.set(env);
  }

  setLights(on: boolean) {
    this.lights = on;
  }

  setFinish(f: 'oak' | 'walnut') {
    this.mats.setFinish(f);
  }

  setAvailability(on: boolean) {
    this.availability = on;
  }

  hover(id: string | null) {
    this.hovered = id;
  }

  bindLabel(key: string, el: HTMLElement | null) {
    if (el) this.labels.set(key, el);
    else this.labels.delete(key);
  }

  /** Opens a floor like the homepage maquette: floors above lift away, this one opens up furnished. */
  focusFloor(level: number | null, fly = true) {
    this.stopCinematic();
    if (this.interior) this.leaveInterior();
    this.focus = level;
    this.building.showCutaway(level, this.units);
    if (!fly) return;
    if (level === null) {
      this.fly(placeById('exterior').shot, 2.4, 'orbit');
      return;
    }
    const y = levelBase(level) + 1;
    this.flyOrbit(new THREE.Vector3(0, y, -2), -0.55, 0.62, level === 0 ? 62 : 58, 2.4, 0.02);
  }

  select(id: string | null) {
    this.stopCinematic();
    this.selected = id;
    if (!id) return;
    const u = this.units.find((x) => x.id === id);
    const vis = this.building.units.get(id);
    if (!u || !vis) return;
    if (this.interior) this.leaveInterior();
    if (this.focus !== u.floorLevel) {
      this.focus = u.floorLevel;
      this.building.showCutaway(u.floorLevel, this.units);
    }
    const c = vis.center.clone();
    let n = new THREE.Vector3(c.x, 0, c.z * 1.6);
    if (n.lengthSq() < 4) n.set(0, 0, 1);
    n.normalize();
    const theta = Math.atan2(n.x, n.z);
    this.flyOrbit(c, theta, 0.86, 36, 2.4, this.reducedMotion ? 0 : 0.06);
  }

  goTo(place: Exclude<Place, 'residence'>) {
    this.stopCinematic();
    if (this.interior) this.leaveInterior();
    this.place = place;
    this.focus = null;
    this.selected = null;
    this.building.showCutaway(null, this.units);
    const look = place === 'arrival' || place === 'reception';
    this.fly(placeById(place).shot, place === 'exterior' ? 2.6 : 3.2, look ? 'look' : 'orbit');
  }

  /**
   * Into the residence: approach the facade, fade, arrive on the terrace, then
   * glide through the open slider into the room, as if walking in.
   */
  enterResidence(room: RoomId = this.tour.startRoom) {
    this.stopCinematic();
    const go = () => {
      this.cb.fade(true);
      window.setTimeout(() => {
        if (this.disposed) return;
        this.entering = false;
        this.showInterior(true);
        const e = this.tour.entry;
        const pos = v3(e.position).add(this.origin);
        const target = v3(e.target).add(this.origin);
        this.camera.position.copy(pos);
        this.lookAt.copy(target);
        this.camera.lookAt(target);
        this.ctl = this.lookFrom(pos, target);
        this.flight = null;
        this.room = e.room;
        if (this.mode === 'dollhouse') this.mode = 'tour';
        this.residence.ceiling.visible = true;
        this.cb.fade(false);
        window.setTimeout(() => {
          if (!this.disposed && this.interior) this.goToRoom(room, this.reducedMotion ? 0.01 : 4.2);
        }, this.reducedMotion ? 0 : 450);
      }, this.reducedMotion ? 50 : 520);
    };
    if (this.interior) {
      this.goToRoom(room);
      return;
    }
    this.entering = true;
    const vis = this.selected ? this.building.units.get(this.selected) : null;
    const c = vis?.center ?? this.origin.clone().add(new THREE.Vector3(-3, 1.6, 7));
    const out = new THREE.Vector3(c.x, 0, c.z).normalize();
    if (!Number.isFinite(out.x)) out.set(0, 0, 1);
    this.fly({ position: c.clone().addScaledVector(out, 9).toArray() as Shot['position'], target: c.toArray() as Shot['target'] }, this.reducedMotion ? 0.01 : 1.3, 'look', { arc: 0, done: go });
  }

  exitResidence() {
    if (!this.interior) return;
    this.cb.fade(true);
    window.setTimeout(() => {
      if (this.disposed) return;
      this.leaveInterior();
      const vis = this.selected ? this.building.units.get(this.selected) : null;
      if (vis) this.select(this.selected);
      else this.goTo('exterior');
      this.cb.fade(false);
    }, this.reducedMotion ? 50 : 480);
  }

  goToRoom(id: RoomId, duration?: number) {
    if (!this.interior) {
      this.enterResidence(id);
      return;
    }
    if (this.mode === 'dollhouse') {
      this.mode = 'tour';
      this.residence.ceiling.visible = true;
    }
    const o = this.origin;
    const from = this.camera.position.clone().sub(o);
    const wasDoll = from.y > 4;
    const fromRoom = roomAt(this.tour, from.x, from.z) ?? this.room;
    const r = roomById(this.tour, id);
    const pts: THREE.Vector3[] = [from.clone().setY(EYE)];
    for (const [x, z] of routeBetween(this.tour, fromRoom, id)) pts.push(new THREE.Vector3(x, EYE, z));
    pts.push(v3(r.position));
    const path = pts.map((p) => p.add(o));
    const len = path.reduce((s, p, i) => (i ? s + p.distanceTo(path[i - 1]!) : 0), 0);
    this.room = id;
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.lookAt.clone(),
      toPos: v3(r.position).add(o),
      toTarget: v3(r.target).add(o),
      path: wasDoll || path.length < 3 ? null : new THREE.CatmullRomCurve3(path, false, 'centripetal'),
      t: 0,
      duration: this.reducedMotion ? 0.01 : duration ?? clamp(len / 2.6, 1.2, 4.2),
      arc: 0,
      then: this.lookFrom(v3(r.position).add(o), v3(r.target).add(o)),
    };
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  setMode(mode: InteriorMode, fly = true) {
    const wasDoll = this.mode === 'dollhouse';
    this.mode = mode;
    if (!this.interior) return;
    if (mode === 'dollhouse') this.residence.ceiling.visible = false;
    else if (!wasDoll || !fly) this.residence.ceiling.visible = true;
    this.camera.fov = mode === 'dollhouse' ? this.fov : 62;
    this.camera.updateProjectionMatrix();
    if (mode === 'dollhouse') {
      const [x0, z0, x1, z1] = this.tour.bounds;
      const target = this.origin.clone().add(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2));
      const span = Math.max(x1 - x0, z1 - z0);
      this.flyOrbit(target, -0.5, 0.7, span * 1.35, fly ? 2 : 0.01, this.reducedMotion ? 0 : 0.04, { minR: span * 0.5, maxR: span * 2.6, maxPhi: 1.2 });
    } else if (this.ctl.kind !== 'look' || fly) {
      const r = roomById(this.tour, this.room);
      this.fly({ position: r.position, target: r.target }, fly ? 1.8 : 0.01, 'look', {
        offset: this.origin,
        arc: 0,
        done: () => {
          this.residence.ceiling.visible = true;
        },
      });
    }
  }

  startCinematic() {
    if (this.interior) this.leaveInterior();
    this.focus = null;
    this.selected = null;
    this.building.showCutaway(null, this.units);
    this.cine = { i: -1, t: 0 };
    this.nextShot();
  }

  stopCinematic() {
    if (!this.cine) return;
    this.cine = null;
    this.cb.caption(null);
  }

  zoom(f: number) {
    if (this.ctl.kind === 'orbit') this.ctl.radius = clamp(this.ctl.radius * f, this.ctl.minR, this.ctl.maxR);
    else {
      this.camera.fov = clamp(this.camera.fov * f, 30, 75);
      this.camera.updateProjectionMatrix();
    }
    this.touch();
  }

  /** Virtual joystick: x strafes, y walks. */
  move(x: number, y: number) {
    this.stick.set(x, y);
    if (x || y) this.touch();
  }

  // ─── Camera ────────────────────────────────────────────────────────────

  private orbitFrom(pos: THREE.Vector3, target: THREE.Vector3, extra: Partial<Extract<Ctl, { kind: 'orbit' }>> = {}): Ctl {
    const d = pos.clone().sub(target);
    const r = d.length();
    return {
      kind: 'orbit',
      target: target.clone(),
      theta: Math.atan2(d.x, d.z),
      phi: Math.acos(clamp(d.y / r, -1, 1)),
      radius: r,
      minR: 7,
      maxR: 240,
      minPhi: 0.12,
      maxPhi: 1.5,
      auto: 0,
      ...extra,
    };
  }

  private lookFrom(pos: THREE.Vector3, target: THREE.Vector3): Ctl {
    const d = target.clone().sub(pos).normalize();
    return { kind: 'look', pos: pos.clone(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(clamp(d.y, -1, 1)) };
  }

  private fly(
    shot: Shot,
    duration: number,
    kind: 'orbit' | 'look',
    opts: { arc?: number; done?: () => void; offset?: THREE.Vector3; auto?: number } = {},
  ) {
    const toPos = v3(shot.position);
    const toTarget = v3(shot.target);
    if (opts.offset) {
      toPos.add(opts.offset);
      toTarget.add(opts.offset);
    }
    const then = kind === 'orbit' ? this.orbitFrom(toPos, toTarget, { auto: opts.auto ?? 0 }) : this.lookFrom(toPos, toTarget);
    const dist = this.camera.position.distanceTo(toPos);
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.lookAt.clone(),
      toPos,
      toTarget,
      path: null,
      t: 0,
      duration: this.reducedMotion ? 0.01 : duration,
      arc: opts.arc ?? Math.min(18, dist * 0.18),
      then,
      done: opts.done,
    };
  }

  private flyOrbit(
    target: THREE.Vector3,
    theta: number,
    phi: number,
    radius: number,
    duration: number,
    auto: number,
    limits: { minR?: number; maxR?: number; maxPhi?: number } = {},
  ) {
    const s = Math.sin(phi);
    const pos = new THREE.Vector3(target.x + radius * s * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * s * Math.cos(theta));
    const then = this.orbitFrom(pos, target, { auto, ...limits });
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.lookAt.clone(),
      toPos: pos,
      toTarget: target.clone(),
      path: null,
      t: 0,
      duration: this.reducedMotion ? 0.01 : duration,
      arc: Math.min(10, this.camera.position.distanceTo(pos) * 0.12),
      then,
    };
  }

  private nextShot() {
    if (!this.cine) return;
    this.cine.i = (this.cine.i + 1) % CINEMATIC.length;
    this.cine.t = 0;
    const s = CINEMATIC[this.cine.i]!;
    this.cb.caption(s.caption);
    const look = s.position[1] < 2.5 && Math.hypot(s.position[0], s.position[2]) < 35;
    this.fly(s, 3.4, look ? 'look' : 'orbit', { auto: look ? 0 : 0.05, arc: 0 });
  }

  private touch() {
    this.lastInteract = performance.now();
  }

  private updateCamera(dt: number) {
    const f = this.flight;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = ease(f.t);
      const pos = f.path ? f.path.getPointAt(k) : f.fromPos.clone().lerp(f.toPos, k);
      pos.y += Math.sin(k * Math.PI) * f.arc;
      let target: THREE.Vector3;
      if (f.path) {
        const ahead = f.path.getPointAt(Math.min(1, k + 0.08));
        const along = ahead.sub(pos).setY(0);
        const look = along.lengthSq() > 1e-4 ? pos.clone().add(along.normalize().multiplyScalar(3)) : f.toTarget.clone();
        look.y = pos.y - 0.1;
        target = look.lerp(f.toTarget, THREE.MathUtils.smoothstep(k, 0.55, 1));
      } else {
        target = f.fromTarget.clone().lerp(f.toTarget, k);
      }
      this.camera.position.copy(pos);
      this.lookAt.copy(target);
      this.camera.lookAt(target);
      if (f.t >= 1) {
        this.flight = null;
        this.ctl = f.then;
        f.done?.();
      }
      return;
    }
    const c = this.ctl;
    const idle = performance.now() - this.lastInteract > 5000;
    if (c.kind === 'orbit') {
      if (c.auto && idle) c.theta += dt * c.auto;
      else if (!this.interior && this.focus === null && !this.selected && idle && !this.reducedMotion && this.place === 'exterior') c.theta += dt * 0.035;
      c.phi = clamp(c.phi, c.minPhi, c.maxPhi);
      const s = Math.sin(c.phi);
      const goal = new THREE.Vector3(c.target.x + c.radius * s * Math.sin(c.theta), c.target.y + c.radius * Math.cos(c.phi), c.target.z + c.radius * s * Math.cos(c.theta));
      if (!this.interior) goal.y = Math.max(goal.y, 0.9);
      const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
      this.camera.position.lerp(goal, k);
      this.lookAt.lerp(c.target, k);
      this.camera.lookAt(this.lookAt);
    } else {
      // Walking: WASD, arrows, or the on-screen stick.
      const fwd = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) + this.stick.y;
      const side = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0) + this.stick.x;
      const turn = (this.keys.has('arrowleft') ? 1 : 0) - (this.keys.has('arrowright') ? 1 : 0);
      c.yaw += turn * dt * 1.6;
      if ((fwd || side) && this.interior) {
        const speed = 1.9 * dt;
        const dir = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        const step = dir.multiplyScalar(fwd * speed).addScaledVector(right, side * speed);
        const local = c.pos.clone().sub(this.origin);
        if (canWalk(this.tour, local.x + step.x, local.z)) c.pos.x += step.x;
        if (canWalk(this.tour, c.pos.x - this.origin.x, local.z + step.z)) c.pos.z += step.z;
        this.touch();
      }
      c.pitch = clamp(c.pitch, -0.9, 0.7);
      const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
      this.camera.position.lerp(c.pos, k);
      const look = c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)));
      this.lookAt.lerp(look.sub(c.pos).add(this.camera.position), 1);
      this.camera.lookAt(this.lookAt);
    }
  }

  // ─── Interior ──────────────────────────────────────────────────────────

  /** A plain roof over the rest of the floor plate, so the terrace never looks down into open rooms. */
  private roofDeck() {
    const [x0, z0, x1, z1] = FOOTPRINT;
    const g = new THREE.BoxGeometry(x1 - x0 + 3.2, SLAB, z1 - z0 + 2);
    g.translate((x0 + x1) / 2 - this.origin.x, -SLAB / 2 - 0.04, (z0 + z1) / 2 + 1 - this.origin.z);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) * 0.35, uv.getY(i) * (z1 - z0) * 0.35);
    const m = new THREE.Mesh(g, this.mats.get('paving'));
    m.receiveShadow = true;
    this.residence.root.add(m);
  }

  private showInterior(on: boolean) {
    this.interior = on;
    this.residence.root.visible = on;
    this.building.unitRoot.visible = !on;
    const [x0, z0, x1, z1] = this.tour.bounds;
    const center = on ? this.origin.clone().add(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2)) : new THREE.Vector3();
    this.atmosphere.aimShadow(on ? 'interior' : 'exterior', center, on ? Math.max(x1 - x0, z1 - z0) * 0.72 : undefined);
    this.atmosphere.reaim();
    this.camera.fov = on ? 62 : this.fov;
    this.camera.near = on ? 0.05 : 0.1;
    this.camera.updateProjectionMatrix();
    if (!on) this.residence.ceiling.visible = true;
    this.place = on ? 'residence' : this.place;
  }

  private leaveInterior() {
    if (!this.interior) return;
    this.showInterior(false);
    this.place = 'exterior';
    this.ctl = this.orbitFrom(this.camera.position.clone().add(new THREE.Vector3(0, 20, 40)), new THREE.Vector3(0, 8, 0));
  }

  // ─── Input ─────────────────────────────────────────────────────────────

  private bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onDown = (e: PointerEvent) => {
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    this.pointer = { down: true, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
    this.interrupt();
  };

  /** Any hands-on input takes over from the cinematic reel or a running glide. */
  private interrupt() {
    this.touch();
    this.cb.interacted();
    if (this.cine) this.stopCinematic();
    if (this.flight && this.flight.duration > 1 && this.flight.t > 0.15 && !this.flight.done) {
      this.ctl = this.flight.then;
      if (this.ctl.kind === 'orbit') {
        const d = this.camera.position.clone().sub(this.ctl.target);
        this.ctl.theta = Math.atan2(d.x, d.z);
        this.ctl.phi = Math.acos(clamp(d.y / d.length(), -1, 1));
        this.ctl.radius = d.length();
      } else {
        this.ctl.pos.copy(this.camera.position);
      }
      this.flight = null;
    }
  }

  private onMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!this.pointer.down) {
      if (e.target === this.renderer.domElement) {
        this.hoverNdc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      }
      return;
    }
    const prev = this.touches.get(e.pointerId);
    if (prev) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch) this.zoom(this.pinch / d);
      this.pinch = d;
      this.pointer.moved = 99;
      return;
    }
    if (e.pointerId !== this.pointer.id) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (this.flight) return;
    const c = this.ctl;
    if (c.kind === 'orbit') {
      c.theta -= dx * 0.005;
      c.phi = clamp(c.phi - dy * 0.004, c.minPhi, c.maxPhi);
    } else {
      c.yaw += dx * 0.0042;
      c.pitch = clamp(c.pitch + dy * 0.0036, -0.9, 0.7);
    }
    this.touch();
  };

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = 0;
    if (!this.pointer.down || e.pointerId !== this.pointer.id) return;
    this.pointer.down = false;
    const click = this.pointer.moved < 6 && performance.now() - this.pointer.t < 600 && e.target === this.renderer.domElement;
    if (click) this.click(e);
  };

  private onLeave = () => {
    this.hoverNdc = null;
    if (this.hovered && !this.pointer.down) this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.interrupt();
    this.zoom(1 + clamp(e.deltaY, -120, 120) * 0.0012);
  };

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (this.ctl.kind === 'orbit' && !this.flight) {
        if (k === 'arrowleft' || k === 'a') this.ctl.theta += 0.2;
        if (k === 'arrowright' || k === 'd') this.ctl.theta -= 0.2;
        if (k === 'arrowup' || k === 'w') this.ctl.phi = clamp(this.ctl.phi - 0.1, this.ctl.minPhi, this.ctl.maxPhi);
        if (k === 'arrowdown' || k === 's') this.ctl.phi = clamp(this.ctl.phi + 0.1, this.ctl.minPhi, this.ctl.maxPhi);
      } else this.keys.add(k);
      if (document.activeElement === this.renderer.domElement) e.preventDefault();
      this.interrupt();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => {
    this.keys.clear();
    this.stick.set(0, 0);
  };

  private ndc(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private click(e: PointerEvent) {
    const ndc = this.ndc(e);
    if (this.interior) {
      if (this.mode === 'dollhouse') {
        // Pick a room from above.
        const p = this.floorPoint(ndc);
        const room = p ? roomAt(this.tour, p.x, p.z) : null;
        if (room) this.goToRoom(room);
        return;
      }
      // Click-to-move, as in a Matterport tour.
      const p = this.floorPoint(ndc);
      if (p && canWalk(this.tour, p.x, p.z) && this.ctl.kind === 'look') {
        const c = this.ctl;
        const to = new THREE.Vector3(p.x, EYE, p.z).add(this.origin);
        const look = to.clone().add(new THREE.Vector3(Math.sin(c.yaw), Math.sin(c.pitch), Math.cos(c.yaw)));
        this.fly({ position: to.toArray() as Shot['position'], target: look.toArray() as Shot['target'] }, 0.9, 'look', { arc: 0 });
        const room = roomAt(this.tour, p.x, p.z);
        if (room) this.room = room;
      }
      return;
    }
    const id = this.pickUnit(ndc);
    this.cb.select(id);
  }

  /** A point on the residence floor, in the residence's frame. */
  private floorPoint(ndc: THREE.Vector2) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.origin.y);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    // Walls stop the pick: the first solid thing along the ray must be at or past the floor.
    const hits = this.raycaster.intersectObject(this.residence.root, true).filter((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && h.object.parent?.visible !== false);
    const first = hits.find((h) => {
      const m = (h.object as THREE.Mesh).material as THREE.Material;
      return !m.transparent;
    });
    if (first && first.distance < this.raycaster.ray.origin.distanceTo(hit) - 0.05 && first.point.y - this.origin.y > 0.3) return null;
    return hit.sub(this.origin);
  }

  private pickUnit(ndc: THREE.Vector2): string | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const v of this.building.units.values()) {
      const fx = this.levelFx.get(v.level);
      if ((fx?.o ?? 1) < 0.5) continue;
      if (this.focus !== null && v.level !== this.focus) continue;
      targets.push(...v.meshes);
    }
    if (this.focus === null) {
      for (const o of this.building.occluders) if (o.parent?.visible) targets.push(o);
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return (hit?.object.userData.unitId as string | undefined) ?? null;
  }

  private setHover(id: string | null) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.cb.hover(id);
  }

  // ─── Frame ─────────────────────────────────────────────────────────────

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const t = this.timer.getElapsed();
    this.watchPerformance(dt);

    if (this.cine) {
      this.cine.t += dt;
      if (this.cine.t > CINEMATIC[this.cine.i]!.seconds) this.nextShot();
    }
    this.updateCamera(dt);
    this.updateLevels(dt);
    this.updateUnits(dt);
    this.atmosphere.update(dt, this.scene, this.interior);
    this.atmosphere.time(t);
    this.applyGlow();
    this.mats.tick(t);
    this.landscape.update(t, this.atmosphere.current.night, this.reducedMotion);
    // Indoors the low sun sits in the glazing; only lamps and the sun disc itself should bloom.
    this.bloom.strength = this.atmosphere.current.bloom * (this.interior ? 0.6 : 1);
    this.bloom.threshold = this.interior ? 5 : 2.2;
    // The sunset sky through the glass is far brighter than any lamp; cap it so it glows, not glares.
    this.clamp.uniforms.ceiling!.value = this.interior ? 7 : 48;
    if (this.hoverNdc && !this.interior && !this.flight) {
      this.setHover(this.pickUnit(this.hoverNdc));
      this.hoverNdc = null;
    }
    this.composer.render(dt);
    this.projectLabels();
    this.poseClock += dt;
    if (this.interior && this.poseClock > 0.12) {
      this.poseClock = 0;
      const p = this.camera.position.clone().sub(this.origin);
      this.residence.focus(this.mode === 'dollhouse' ? this.lookAt.clone().sub(this.origin) : p);
      const d = this.lookAt.clone().sub(this.camera.position);
      if (this.mode === 'walk') this.room = roomAt(this.tour, p.x, p.z) ?? this.room;
      this.cb.pose({ x: p.x, z: p.z, yaw: Math.atan2(d.x, d.z), room: this.room });
    }
  };

  private applyGlow() {
    const p = this.atmosphere.current;
    const inside = this.interior;
    const lamp = inside ? (this.lights ? Math.max(0.7, p.lamp) : 0) : p.lamp;
    this.mats.setGlow({
      interior: inside ? p.interior * 0.2 : p.interior,
      lamp,
      pool: p.pool,
      sign: 0.35 + p.lamp * 0.65,
      garden: p.lamp,
    });
    this.residence.setLights(this.lights ? 0.35 + p.lamp * 0.9 : 0);
    for (const w of this.washes) w.intensity = (w.userData.base as number) * (inside ? 0 : Math.max(0.12, p.lamp));
  }

  private updateLevels(dt: number) {
    if (this.interior) {
      // Inside, the floors below stay as the building under the terrace; this floor and above give way to the residence.
      for (const level of BUILDING_LEVELS) {
        const g = this.building.levels.get(level);
        if (g) {
          g.position.y = levelBase(level);
          g.visible = level < this.tour.level;
        }
        this.mats.setLevelOpacity(level, 1);
      }
      return;
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5);
    for (const level of BUILDING_LEVELS) {
      const target =
        this.focus === null || level <= this.focus ? { y: 0, o: 1 } : { y: 14 + (level - this.focus) * 3.5, o: 0 };
      const cur = this.levelFx.get(level) ?? { y: 0, o: 1 };
      cur.y += (target.y - cur.y) * k;
      cur.o += (target.o - cur.o) * k;
      if (Math.abs(cur.o - target.o) < 0.002) cur.o = target.o;
      this.levelFx.set(level, cur);
      const g = this.building.levels.get(level);
      if (g) {
        g.position.y = levelBase(level) + cur.y;
        g.visible = cur.o > 0.01;
      }
      const ug = this.building.unitGroup(level);
      if (ug) {
        ug.position.y = levelBase(level) + cur.y;
        ug.visible = cur.o > 0.3;
      }
      this.mats.setLevelOpacity(level, cur.o);
    }
  }

  private updateUnits(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    const status = new Map(this.units.map((u) => [u.id, u.status]));
    for (const v of this.building.units.values()) {
      const s = status.get(v.id) ?? 'unavailable';
      const hot = v.id === this.selected || v.id === this.hovered;
      const onFocus = this.focus !== null && v.level === this.focus;
      let fill = 0;
      let tile = 0;
      let edge = 0;
      if (this.focus === null) {
        if (hot) fill = v.id === this.selected ? 0.5 : 0.42;
        else if (this.availability) fill = 0.34;
        edge = hot ? 1 : this.availability ? 0.35 : 0;
      } else if (onFocus) {
        tile = hot ? 0.55 : 0.26;
        edge = hot ? 1 : 0.18;
      }
      const color = hot ? GOLD : new THREE.Color(STATUS_COLOR[s]);
      v.fill.color.lerp(color, k);
      v.tile.color.lerp(color, k);
      v.fill.opacity += (fill - v.fill.opacity) * k;
      v.tile.opacity += (tile - v.tile.opacity) * k;
      v.edge.opacity += (edge - v.edge.opacity) * k;
      for (const t of v.tiles) t.visible = v.tile.opacity > 0.01;
    }
  }

  private anchor(key: string): THREE.Vector3 | null {
    if (this.entering) return null;
    const [kind, id] = key.split(':') as [string, string];
    if (kind === 'unit' || kind === 'hover') {
      const uid = kind === 'hover' ? this.hovered : id;
      if (!uid || this.interior) return null;
      const v = this.building.units.get(uid);
      if (!v) return null;
      const fx = this.levelFx.get(v.level);
      if ((fx?.o ?? 1) < 0.5) return null;
      if (kind === 'unit' && uid !== this.selected && !(this.focus !== null && v.level === this.focus)) return null;
      if (kind === 'hover' && (uid === this.selected || this.focus !== null)) return null;
      return v.center.clone().setY(v.center.y + (fx?.y ?? 0) + FLOOR_H * 0.5 + 0.9);
    }
    if (kind === 'place') {
      if (this.interior || this.focus !== null || this.cine || this.place !== 'exterior') return null;
      const h = EXTERIOR_HOTSPOTS.find((x) => x.id === id);
      return h ? v3(h.position) : null;
    }
    if (kind === 'room') {
      if (!this.interior || this.flight) return null;
      if (this.mode !== 'dollhouse' && id === this.room) return null;
      const r = this.tour.rooms.find((x) => x.id === id);
      if (!r) return null;
      const [x0, z0, x1, z1] = r.rect;
      return new THREE.Vector3((x0 + x1) / 2, this.mode === 'dollhouse' ? 0.4 : 1.0, (z0 + z1) / 2).add(this.origin);
    }
    return null;
  }

  private projectLabels() {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    this.occlusionClock++;
    const checkOcclusion = this.interior && this.mode !== 'dollhouse' && this.occlusionClock % 12 === 0;
    for (const [key, el] of this.labels) {
      const a = this.anchor(key);
      if (!a) {
        if (el.dataset.visible !== 'false') el.dataset.visible = 'false';
        continue;
      }
      if (checkOcclusion && key.startsWith('room:')) {
        const dir = a.clone().sub(this.camera.position);
        const dist = dir.length();
        this.raycaster.set(this.camera.position, dir.normalize());
        this.raycaster.far = dist;
        const hit = this.raycaster
          .intersectObject(this.residence.root, true)
          .find((x) => (x.object as THREE.Mesh).isMesh && !((x.object as THREE.Mesh).material as THREE.Material).transparent && x.object.parent?.visible !== false);
        this.raycaster.far = Infinity;
        if (hit && hit.distance < dist - 0.4) this.occluded.add(key);
        else this.occluded.delete(key);
      }
      const p = a.project(this.camera);
      const off = p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1;
      if (off) {
        el.dataset.visible = 'false';
        continue;
      }
      el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
      el.dataset.visible = 'true';
      el.dataset.occluded = this.occluded.has(key) ? 'true' : 'false';
    }
  }

  /**
   * Steps down gracefully on slower devices instead of stuttering: first the
   * ambient occlusion, then resolution, then shadow detail, then bloom.
   */
  private watchPerformance(dt: number) {
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 40) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.frameTimes = [];
    if (median < 1 / 30) return;
    const ratio = this.renderer.getPixelRatio();
    if (this.ao) {
      this.ao.enabled = false;
      this.ao = null;
      this.quality = 'lite';
      this.cb.quality('lite');
    } else if (ratio > 0.86) {
      this.renderer.setPixelRatio(Math.max(0.85, ratio - 0.25));
      this.resize();
    } else if (this.atmosphere.sun.shadow.mapSize.x > 1024) {
      this.atmosphere.sun.shadow.mapSize.set(1024, 1024);
      this.atmosphere.sun.shadow.map?.dispose();
      this.atmosphere.sun.shadow.map = null;
    } else if (this.bloom.enabled) {
      this.bloom.enabled = false;
    }
    this.warmup = 10;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.mats.dispose();
    this.atmosphere.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
