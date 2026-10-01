'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useTheme } from '../layout/useTheme';
import { Building, type UnitRef } from '../digital-twin/engine/building';
import { Materials } from '../digital-twin/engine/materials';
import {
  FLOOR_H,
  LEVELS,
  STREET_FACE_Z,
  TREES,
  levelBase,
  parkingBays,
  unitAnchor,
  unitEnvelope,
  unitVolumes,
  type Rect,
  type UnitVolume,
} from '../../lib/building-model';
import type { PublicStatus, Residence } from '../../lib/residences';

export type ViewCommandKind = 'zoom-in' | 'zoom-out' | 'reset' | 'left' | 'right' | 'up' | 'down';
export interface ViewCommand {
  kind: ViewCommandKind;
  nonce: number;
}

export interface Building3DProps {
  residences: Residence[];
  focusLevel: number | null;
  hoveredId: string | null;
  selectedId: string | null;
  /** When set, residences outside it are dimmed (the explorer's filters). */
  matchIds: ReadonlySet<string> | null;
  onHover: (id: string | null) => void;
  onSelect: (residence: Residence) => void;
  command: ViewCommand | null;
  labelRefs: MutableRefObject<Map<string, HTMLElement>>;
  /** False while off-screen: the render loop stops entirely. */
  active: boolean;
  quality: 'high' | 'low';
  reducedMotion: boolean;
  onInteract?: () => void;
}

// ─── Per-level motion, shared by every mesh on that level ─────────────────

interface LevelFx {
  y: number;
  opacity: number;
}
type FxMap = Record<number, LevelFx>;
const FxContext = createContext<MutableRefObject<FxMap> | null>(null);

function useFx() {
  const fx = useContext(FxContext);
  if (!fx) throw new Error('Building3D: FxContext missing');
  return fx;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A selected floor opens up; the floors above lift away and fade; the building below stays standing. */
function targetFx(level: number, focus: number | null): LevelFx {
  if (focus === null || level <= focus) return { y: 0, opacity: 1 };
  return { y: 14 + (level - focus) * 3.5, opacity: 0 };
}

function FxDriver({ focus, reducedMotion }: { focus: number | null; reducedMotion: boolean }) {
  const fx = useFx();
  const start = useRef<number | null>(null);

  useFrame((state, dt) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    for (const level of LEVELS) {
      const target = targetFx(level, focus);
      // Once, on first sight: the building assembles from the basement up.
      const p = reducedMotion ? 1 : easeOut(clamp01((t - 0.2 - (level + 1) * 0.14) / 1.1));
      const cur = (fx.current[level] ??= { y: -8, opacity: 0 });
      const ty = target.y - (1 - p) * 8;
      const to = target.opacity * p;
      const follow = p < 1 ? 1 : k;
      cur.y += (ty - cur.y) * follow;
      cur.opacity += (to - cur.opacity) * follow;
    }
  }, -1);

  return null;
}

function LevelGroup({ level, children }: { level: number; children: React.ReactNode }) {
  const fx = useFx();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const f = fx.current[level];
    g.position.y = levelBase(level) + (f?.y ?? 0);
    g.visible = (f?.opacity ?? 1) > 0.01;
  });
  return <group ref={ref}>{children}</group>;
}

// ─── Geometry helpers ────────────────────────────────────────────────────

function box(rect: Rect, y0: number, y1: number, inset = 0) {
  const [x0, z0, x1, z1] = rect;
  return {
    position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as [number, number, number],
    size: [Math.max(0.02, x1 - x0 - inset * 2), Math.max(0.02, y1 - y0), Math.max(0.02, z1 - z0 - inset * 2)] as [
      number,
      number,
      number,
    ],
  };
}

function setOpacity(m: THREE.Material, value: number) {
  const transparent = value < 0.999;
  if (m.transparent !== transparent) {
    m.transparent = transparent;
    m.needsUpdate = true;
  }
  m.opacity = value;
  m.depthWrite = value > 0.55;
}

// ─── Structure ───────────────────────────────────────────────────────────

/** Dusk, as on the 3D Design page: homes lit from within, lamps and the pool on. */
const GLOW = { interior: 0.85, lamp: 1, pool: 0.8, sign: 1, garden: 1 } as const;

/**
 * The building itself: the same procedural model the 3D Design page draws, so
 * both views show one design. Each level keeps its own materials, which is
 * what lets a floor lift away and fade on its own.
 */
function Architecture({ residences, focusLevel }: { residences: Residence[]; focusLevel: number | null }) {
  const fx = useFx();
  const { gl, scene } = useThree();
  const model = useMemo(() => {
    const mats = new Materials(gl.capabilities.getMaxAnisotropy());
    const building = new Building(mats);
    building.build({ basement: true });
    mats.setGlow(GLOW);
    return { mats, building };
  }, [gl]);

  // Reflections for the glass and the metals, from a neutral studio rather than a sky this view does not draw.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.32;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(
    () => () => {
      model.building.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      model.mats.dispose();
    },
    [model],
  );

  // An opened floor shows its homes furnished, as on the 3D Design page.
  const units = useMemo(
    () => residences.map((r): UnitRef => ({ id: r.id, code: r.code, floorLevel: r.floorLevel, modelSlot: r.modelSlot, bedrooms: r.bedrooms })),
    [residences],
  );
  const placed = useMemo(() => units.map((u) => `${u.id}:${u.floorLevel}:${u.modelSlot ?? ''}`).join('|'), [units]);
  useEffect(() => {
    model.building.setUnits(units);
    // This view draws its own status overlays; the engine's highlights stay out of it.
    model.building.unitRoot.visible = false;
    // `placed` changes only when a home moves in the model, not on every status poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, placed]);
  useEffect(() => {
    model.building.showCutaway(focusLevel !== null && focusLevel >= 0 ? focusLevel : null, units);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, focusLevel, placed]);

  useFrame((state) => {
    for (const level of LEVELS) {
      const f = fx.current[level];
      const g = model.building.levels.get(level);
      if (!g) continue;
      g.position.y = levelBase(level) + (f?.y ?? 0);
      g.visible = (f?.opacity ?? 1) > 0.01;
      model.mats.setLevelOpacity(level, f?.opacity ?? 1);
    }
    model.mats.tick(state.clock.elapsedTime);
  });

  return <primitive object={model.building.root} />;
}

function ParkingCars({ count }: { count: number }) {
  const bays = useMemo(() => parkingBays(count), [count]);
  const fx = useFx();
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2B2C2E', roughness: 0.5, metalness: 0.4, transparent: true }),
    [],
  );
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    bays.forEach((bay, i) => {
      m.makeRotationY(bay.turned ? Math.PI / 2 : 0).setPosition(bay.x, 0.95, bay.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [bays]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => setOpacity(mat, fx.current[-1]?.opacity ?? 1));
  return (
    <instancedMesh ref={ref} key={bays.length} args={[undefined, undefined, bays.length]} material={mat}>
      <boxGeometry args={[1.8, 1.3, 4.3]} />
    </instancedMesh>
  );
}

// ─── Residences ──────────────────────────────────────────────────────────

/**
 * Status reads as light, laid over the real facade: an available home glows as
 * if lived in, reserved and booked ones are striped, sold ones are veiled dark.
 * The side panel repeats every status in words.
 */
const STATUS_STYLE: Record<PublicStatus, { color: string; opacity: number; striped?: boolean }> = {
  available: { color: '#FFC983', opacity: 0.3 },
  reserved: { color: '#FFFFFF', opacity: 0.5, striped: true },
  booked: { color: '#D9C39A', opacity: 0.5, striped: true },
  sold: { color: '#1F1E1B', opacity: 0.66 },
  unavailable: { color: '#151412', opacity: 0.74 },
};

let stripes: THREE.CanvasTexture | null = null;
function stripeTexture(): THREE.CanvasTexture {
  if (stripes) return stripes;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#A8977C';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#6B5A42';
  g.lineWidth = 7;
  for (let i = -64; i < 128; i += 18) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 64, 0);
    g.stroke();
  }
  stripes = new THREE.CanvasTexture(c);
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  stripes.repeat.set(3, 1.5);
  stripes.colorSpace = THREE.SRGBColorSpace;
  stripes.anisotropy = 4;
  return stripes;
}

interface UnitLook {
  mesh: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  /** 0…1, how strongly the pointer or the selection lights the home. */
  hot: number;
}

function useUnitLooks(residences: Residence[]) {
  const looks = useRef(new Map<string, { status: PublicStatus; look: UnitLook }>());
  const map = looks.current;
  for (const r of residences) {
    const prev = map.get(r.id);
    if (prev && prev.status === r.publicStatus) continue;
    prev?.look.mesh.dispose();
    const s = STATUS_STYLE[r.publicStatus];
    map.set(r.id, {
      status: r.publicStatus,
      look: {
        mesh: new THREE.MeshBasicMaterial({
          color: s.color,
          map: s.striped ? stripeTexture() : null,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
        edge: prev?.look.edge ?? new THREE.LineBasicMaterial({ color: '#F6E6CC', transparent: true, opacity: 0 }),
        hot: 0,
      },
    });
  }
  useEffect(
    () => () => {
      for (const { look } of map.values()) {
        look.mesh.dispose();
        look.edge.dispose();
      }
    },
    [map],
  );
  return map;
}

function UnitVolumeMesh({
  residence,
  volume,
  look,
  opened,
  interactive,
  onHover,
  onSelect,
}: {
  residence: Residence;
  volume: UnitVolume;
  look: UnitLook;
  /** Its floor is open: the home shows as a tint on its own floor, over the furniture. */
  opened: boolean;
  interactive: () => boolean;
  onHover: (id: string | null) => void;
  onSelect: (r: Residence) => void;
}) {
  // The overlay reaches past the home's own walls and balconies, so it sits on the facade.
  const b = useMemo(() => box(unitEnvelope(volume.level, volume.rect), volume.y0 - 0.1, volume.y1 + 0.2), [volume]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...b.size)), [b]);
  useEffect(() => () => edges.dispose(), [edges]);

  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive()) return; // a faded floor lets the pointer through to the one in focus
    e.stopPropagation();
    onHover(residence.id);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    onHover(null);
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive() || e.delta > 6) return; // a drag that ends on a unit is not a click
    e.stopPropagation();
    onSelect(residence);
  };

  if (opened) {
    const [x0, z0, x1, z1] = volume.rect;
    return (
      <mesh
        material={look.mesh}
        renderOrder={5}
        rotation-x={-Math.PI / 2}
        position={[(x0 + x1) / 2, volume.y0 + 0.06, (z0 + z1) / 2]}
        onPointerOver={over}
        onPointerOut={out}
        onClick={click}
      >
        <planeGeometry args={[x1 - x0 - 0.3, z1 - z0 - 0.3]} />
      </mesh>
    );
  }
  return (
    <group position={b.position}>
      <mesh material={look.mesh} renderOrder={5} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={b.size} />
      </mesh>
      <lineSegments geometry={edges} material={look.edge} renderOrder={6} />
    </group>
  );
}

function UnitAnimator({
  residences,
  looks,
  hoveredId,
  selectedId,
  matchIds,
  focusLevel,
}: {
  residences: Residence[];
  looks: Map<string, { status: PublicStatus; look: UnitLook }>;
  focusLevel: number | null;
  hoveredId: string | null;
  selectedId: string | null;
  matchIds: ReadonlySet<string> | null;
}) {
  const fx = useFx();
  const white = useMemo(() => new THREE.Color('#FFE9C8'), []);
  const base = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    // Highlights fade in and out rather than switching.
    const k = 1 - Math.exp(-dt * 8);
    for (const r of residences) {
      const entry = looks.get(r.id);
      if (!entry) continue;
      const { look } = entry;
      const s = STATUS_STYLE[r.publicStatus];
      look.hot += ((r.id === selectedId ? 1 : r.id === hoveredId ? 0.6 : 0) - look.hot) * k;
      const level = fx.current[r.floorLevel]?.opacity ?? 1;
      const dim = matchIds && !matchIds.has(r.id) ? 0.2 : 1;
      look.mesh.color.copy(base.set(s.color)).lerp(white, look.hot * 0.55);
      // On an opened floor the tint lies over the furniture, so it is lighter.
      const veil = focusLevel === r.floorLevel ? 0.55 : 1;
      look.mesh.opacity = Math.min(0.9, s.opacity * veil + look.hot * 0.22) * level * dim;
      look.edge.opacity = Math.min(1, look.hot * 1.4) * level;
    }
  });
  return null;
}

// ─── Site ────────────────────────────────────────────────────────────────

function Site({ focusLevel }: { focusLevel: number | null }) {
  const ground = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1C1D1A', roughness: 1, transparent: true }),
    [],
  );
  const foliage = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    TREES.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 1.6 + t.r, t.z), q, new THREE.Vector3(t.r, t.r * 1.1, t.r));
      foliage.current?.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, 0.9, t.z), q, new THREE.Vector3(1, 1, 1));
      trunks.current?.setMatrixAt(i, m);
    });
    if (foliage.current) foliage.current.instanceMatrix.needsUpdate = true;
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
  }, []);
  useEffect(() => () => ground.dispose(), [ground]);

  // Looking at the basement means looking through the ground.
  useFrame((_, dt) => {
    const target = focusLevel === -1 ? 0.12 : 1;
    setOpacity(ground, ground.opacity + (target - ground.opacity) * (1 - Math.exp(-dt * 5)));
  });

  // The street: 11.4 m of asphalt beyond the 4 m reserve, as on the site plan.
  const road = STREET_FACE_Z + 15.5;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5} receiveShadow material={ground}>
        <circleGeometry args={[160, 72]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[1.5, -0.48, 1]} receiveShadow>
        <planeGeometry args={[36, 44]} />
        <meshStandardMaterial color="#2C2B27" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.47, road]} receiveShadow>
        <planeGeometry args={[320, 11.4]} />
        <meshStandardMaterial color="#111210" roughness={0.8} />
      </mesh>
      {Array.from({ length: 40 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-117 + i * 6, -0.46, road]}>
          <planeGeometry args={[2.4, 0.16]} />
          <meshBasicMaterial color="#6F6C64" />
        </mesh>
      ))}
      <instancedMesh ref={foliage} args={[undefined, undefined, TREES.length]} castShadow>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#34402F" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, TREES.length]}>
        <cylinderGeometry args={[0.14, 0.18, 1.8, 6]} />
        <meshStandardMaterial color="#3B2F25" roughness={1} />
      </instancedMesh>
    </group>
  );
}

// ─── Camera ──────────────────────────────────────────────────────────────

const HOME = { theta: -0.55, phi: 1.12, radius: 92, y: 8.5 };
const clampPhi = (v: number) => Math.min(1.36, Math.max(0.34, v));
const clampRadius = (v: number) => Math.min(160, Math.max(38, v));

/**
 * Orbit without trapping the page: a horizontal drag turns the building, a
 * vertical drag tilts it with a mouse but scrolls the page on a phone
 * (touch-action: pan-y), a pinch or trackpad pinch zooms, and a plain wheel is
 * left to the page. Arrow keys and the zoom buttons arrive as commands.
 */
function CameraRig({
  focusLevel,
  command,
  reducedMotion,
  onInteract,
}: {
  focusLevel: number | null;
  command: ViewCommand | null;
  reducedMotion: boolean;
  onInteract?: () => void;
}) {
  const { camera, gl } = useThree();
  // The first sight: the camera settles in from further out and lower as the building assembles.
  const cur = useRef({ ...HOME, theta: HOME.theta - 0.5, radius: HOME.radius * 1.45, phi: 1.3, target: new THREE.Vector3(0, HOME.y, 0) });
  const goal = useRef({ ...HOME, target: new THREE.Vector3(0, HOME.y, 0) });
  const last = useRef(0);
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;

  const touch = () => {
    last.current = performance.now();
    interactRef.current?.();
  };

  useEffect(() => {
    const g = goal.current;
    if (focusLevel === null) {
      g.phi = HOME.phi;
      g.radius = HOME.radius;
      g.target.set(0, HOME.y, 0);
    } else {
      g.phi = 0.72;
      g.radius = focusLevel === -1 ? 88 : 78;
      g.target.set(0, levelBase(focusLevel) + FLOOR_H * 0.4, 0);
    }
  }, [focusLevel]);

  useEffect(() => {
    if (!command) return;
    const g = goal.current;
    switch (command.kind) {
      case 'zoom-in':
        g.radius = clampRadius(g.radius * 0.8);
        break;
      case 'zoom-out':
        g.radius = clampRadius(g.radius * 1.25);
        break;
      case 'left':
        g.theta += 0.35;
        break;
      case 'right':
        g.theta -= 0.35;
        break;
      case 'up':
        g.phi = clampPhi(g.phi - 0.14);
        break;
      case 'down':
        g.phi = clampPhi(g.phi + 0.14);
        break;
      case 'reset':
        g.theta = HOME.theta;
        g.phi = focusLevel === null ? HOME.phi : 0.72;
        g.radius = focusLevel === null ? HOME.radius : 78;
        break;
    }
    touch();
    // `touch` is stable in effect; the command's nonce is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      touch();
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = goal.current;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) g.radius = clampRadius(g.radius * (pinch / d));
        pinch = d;
        touch();
        return;
      }
      if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) return;
      g.theta -= dx * 0.0055;
      if (e.pointerType !== 'touch') g.phi = clampPhi(g.phi - dy * 0.0042);
      touch();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // a plain wheel scrolls the page
      e.preventDefault();
      goal.current.radius = clampRadius(goal.current.radius * (1 + e.deltaY * 0.01));
      touch();
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame((_, dt) => {
    const c = cur.current;
    const g = goal.current;
    if (!reducedMotion && focusLevel === null && performance.now() - last.current > 6000) {
      g.theta -= dt * 0.045; // idle: the maquette turns slowly on its stand
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    c.theta += (g.theta - c.theta) * k;
    c.phi += (g.phi - c.phi) * k;
    c.radius += (g.radius - c.radius) * k;
    c.target.lerp(g.target, k);
    const s = Math.sin(c.phi);
    camera.position.set(
      c.target.x + c.radius * s * Math.sin(c.theta),
      c.target.y + c.radius * Math.cos(c.phi),
      c.target.z + c.radius * s * Math.cos(c.theta),
    );
    camera.lookAt(c.target);
  });

  return null;
}

// ─── Labels ──────────────────────────────────────────────────────────────

/** Moves the DOM labels (owned by the explorer) to their residences each frame, without re-rendering React. */
function LabelProjector({
  residences,
  focusLevel,
  hoveredId,
  labelRefs,
}: {
  residences: Residence[];
  focusLevel: number | null;
  hoveredId: string | null;
  labelRefs: MutableRefObject<Map<string, HTMLElement>>;
}) {
  const fx = useFx();
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const anchors = useMemo(
    () => residences.map((r) => ({ r, a: unitAnchor(r.code, r.floorLevel, r.modelSlot) })),
    [residences],
  );

  useFrame(() => {
    for (const { r, a } of anchors) {
      const el = labelRefs.current.get(r.id);
      if (!el || !a) continue;
      const show = (focusLevel !== null && r.floorLevel === focusLevel) || r.id === hoveredId;
      const f = fx.current[r.floorLevel];
      if (!show || (f?.opacity ?? 1) < 0.5) {
        if (el.dataset.visible !== 'false') el.dataset.visible = 'false';
        continue;
      }
      v.set(a.x, levelBase(r.floorLevel) + (f?.y ?? 0) + a.y, a.z).project(camera);
      if (v.z > 1) {
        el.dataset.visible = 'false';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.dataset.visible = 'true';
    }
  });

  return null;
}

// ─── Scene ───────────────────────────────────────────────────────────────

function Scene(props: Building3DProps) {
  const fx = useRef<FxMap>({});
  const shadows = props.quality === 'high';
  const { gl } = useThree();
  const looks = useUnitLooks(props.residences);
  // The exposure the engine's materials are tuned for at dusk.
  useEffect(() => {
    gl.toneMappingExposure = 0.74;
  }, [gl]);
  const focusRef = useRef(props.focusLevel);
  focusRef.current = props.focusLevel;

  const byLevel = useMemo(() => {
    const out = new Map<number, { r: Residence; v: UnitVolume }[]>();
    for (const r of props.residences) {
      for (const v of unitVolumes(r.code, r.floorLevel, r.modelSlot)) {
        const list = out.get(v.level) ?? [];
        list.push({ r, v });
        out.set(v.level, list);
      }
    }
    return out;
  }, [props.residences]);

  // A residence answers the pointer only when its floor is in focus, or when none is.
  const interactiveFor = (level: number) => () => {
    const f = focusRef.current;
    return f === null || f === level;
  };

  return (
    <FxContext.Provider value={fx}>
      <FxDriver focus={props.focusLevel} reducedMotion={props.reducedMotion} />
      <CameraRig
        focusLevel={props.focusLevel}
        command={props.command}
        reducedMotion={props.reducedMotion}
        onInteract={props.onInteract}
      />

      <hemisphereLight args={['#FFD9B8', '#2A221C', 0.5]} />
      <directionalLight
        position={[-46, 40, 62]}
        intensity={2.6}
        color="#FFC08A"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[46, 30, -42]} intensity={0.5} color="#9DB4FF" />

      <Site focusLevel={props.focusLevel} />
      <Architecture residences={props.residences} focusLevel={props.focusLevel} />

      {LEVELS.map((level) => (
        <LevelGroup key={level} level={level}>
          {(byLevel.get(level) ?? []).map(({ r, v }, i) => {
            const entry = looks.get(r.id);
            if (!entry) return null;
            return (
              <UnitVolumeMesh
                key={`${r.id}-${i}`}
                residence={r}
                volume={v}
                look={entry.look}
                opened={props.focusLevel === r.floorLevel}
                interactive={interactiveFor(r.floorLevel)}
                onHover={props.onHover}
                onSelect={props.onSelect}
              />
            );
          })}
          {level === -1 && <ParkingCars count={props.residences.length} />}
        </LevelGroup>
      ))}

      <UnitAnimator
        residences={props.residences}
        looks={looks}
        focusLevel={props.focusLevel}
        hoveredId={props.hoveredId}
        selectedId={props.selectedId}
        matchIds={props.matchIds}
      />
      <LabelProjector
        residences={props.residences}
        focusLevel={props.focusLevel}
        hoveredId={props.hoveredId}
        labelRefs={props.labelRefs}
      />
    </FxContext.Provider>
  );
}

/** The distance fades into the section's own ground, whichever theme paints it. */
function ThemeFog() {
  const theme = useTheme();
  const { scene, gl, invalidate } = useThree();
  useEffect(() => {
    const surface = getComputedStyle(gl.domElement).getPropertyValue('--surface').trim();
    if (surface && scene.fog instanceof THREE.Fog) scene.fog.color.set(surface);
    invalidate();
  }, [theme, scene, gl, invalidate]);
  return null;
}

/** Loaded on demand (next/dynamic, no SSR) the first time the explorer nears the viewport. */
export default function Building3D(props: Building3DProps) {
  return (
    <Canvas
      frameloop={props.active ? 'always' : 'never'}
      dpr={props.quality === 'high' ? [1, 2] : [1, 1.5]}
      // three r18x removed PCFSoftShadowMap (R3F's 'soft'); PCF filtering is its replacement.
      shadows={props.quality === 'high' ? 'percentage' : false}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 1, far: 700, position: [-60, 60, 110] }}
      onCreated={({ scene }) => {
        scene.fog = new THREE.Fog('#151613', 150, 360);
      }}
      onPointerMissed={() => props.onHover(null)}
      style={{ touchAction: 'pan-y' }}
      aria-hidden="true"
    >
      <ThemeFog />
      <Scene {...props} />
    </Canvas>
  );
}
