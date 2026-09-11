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
import {
  FLOOR_H,
  LEVELS,
  PARKING_BAYS,
  PARTS,
  TREES,
  levelBase,
  unitAnchor,
  unitVolumes,
  type PartKind,
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

/** A selected floor stays; floors above lift away and fade; floors below recede. */
function targetFx(level: number, focus: number | null): LevelFx {
  if (focus === null) return { y: 0, opacity: 1 };
  if (level > focus) return { y: 12 + (level - focus) * 3, opacity: 0.05 };
  if (level < focus) return { y: 0, opacity: level < 0 ? 0.14 : 0.26 };
  return { y: 0, opacity: 1 };
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

const KIND_STYLE: Record<
  PartKind,
  { color: string; roughness: number; metalness?: number; opacity?: number; emissive?: string; glow?: number }
> = {
  slab: { color: '#E6E0D5', roughness: 0.86 },
  stone: { color: '#D3C9B8', roughness: 0.9 },
  core: { color: '#A39B8D', roughness: 0.92 },
  glass: { color: '#A9C1C5', roughness: 0.08, metalness: 0.2, opacity: 0.24 },
  walnut: { color: '#5B3E2A', roughness: 0.7 },
  water: { color: '#4FB6C2', roughness: 0.15, emissive: '#1C7C88', glow: 0.75 },
  amenity: { color: '#E7D3B5', roughness: 0.7, emissive: '#B98246', glow: 0.5 },
  basement: { color: '#6A675F', roughness: 0.95, opacity: 0.5 },
};

function LevelParts({ level, shadows }: { level: number; shadows: boolean }) {
  const fx = useFx();
  const mats = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(KIND_STYLE) as PartKind[]).map((kind) => {
          const s = KIND_STYLE[kind];
          return [
            kind,
            new THREE.MeshStandardMaterial({
              color: s.color,
              roughness: s.roughness,
              metalness: s.metalness ?? 0,
              emissive: s.emissive ?? '#000000',
              emissiveIntensity: s.glow ?? 0,
              transparent: (s.opacity ?? 1) < 1,
              opacity: s.opacity ?? 1,
            }),
          ];
        }),
      ) as Record<PartKind, THREE.MeshStandardMaterial>,
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame(() => {
    const o = fx.current[level]?.opacity ?? 1;
    for (const kind of Object.keys(mats) as PartKind[]) setOpacity(mats[kind], (KIND_STYLE[kind].opacity ?? 1) * o);
  });

  const parts = useMemo(() => PARTS.filter((p) => p.level === level), [level]);
  return (
    <>
      {parts.map((p, i) => {
        const b = box(p.rect, p.y0, p.y1);
        const solid = p.kind !== 'glass' && p.kind !== 'water' && p.kind !== 'basement';
        return (
          <mesh key={i} position={b.position} material={mats[p.kind]} castShadow={shadows && solid} receiveShadow={shadows}>
            <boxGeometry args={b.size} />
          </mesh>
        );
      })}
    </>
  );
}

function ParkingCars() {
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
    PARKING_BAYS.forEach((bay, i) => {
      m.makeTranslation(bay.x, 0.95, bay.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => setOpacity(mat, fx.current[-1]?.opacity ?? 1));
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PARKING_BAYS.length]} material={mat}>
      <boxGeometry args={[1.8, 1.3, 4.3]} />
    </instancedMesh>
  );
}

// ─── Residences ──────────────────────────────────────────────────────────

/**
 * Status reads as light: available homes glow as if lived in, reserved ones
 * are striped, sold ones are dark. The side panel repeats every status in words.
 */
const STATUS_STYLE: Record<PublicStatus, { color: string; emissive: string; glow: number; opacity: number }> = {
  available: { color: '#F1D9B5', emissive: '#D69A57', glow: 0.62, opacity: 1 },
  reserved: { color: '#FFFFFF', emissive: '#6E5638', glow: 0.16, opacity: 1 },
  sold: { color: '#5D5A53', emissive: '#000000', glow: 0, opacity: 1 },
  unavailable: { color: '#3E3C37', emissive: '#000000', glow: 0, opacity: 0.7 },
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
  mesh: THREE.MeshStandardMaterial;
  edge: THREE.LineBasicMaterial;
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
        mesh: new THREE.MeshStandardMaterial({
          color: s.color,
          emissive: s.emissive,
          emissiveIntensity: s.glow,
          roughness: 0.6,
          map: r.publicStatus === 'reserved' ? stripeTexture() : null,
          transparent: s.opacity < 1,
          opacity: s.opacity,
        }),
        edge: prev?.look.edge ?? new THREE.LineBasicMaterial({ color: '#F6E6CC', transparent: true, opacity: 0 }),
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
  shadows,
  interactive,
  onHover,
  onSelect,
}: {
  residence: Residence;
  volume: UnitVolume;
  look: UnitLook;
  shadows: boolean;
  interactive: () => boolean;
  onHover: (id: string | null) => void;
  onSelect: (r: Residence) => void;
}) {
  const b = useMemo(() => box(volume.rect, volume.y0, volume.y1, 0.1), [volume]);
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

  return (
    <group position={b.position}>
      <mesh
        material={look.mesh}
        castShadow={shadows}
        receiveShadow={shadows}
        onPointerOver={over}
        onPointerOut={out}
        onClick={click}
      >
        <boxGeometry args={b.size} />
      </mesh>
      <lineSegments geometry={edges} material={look.edge} />
    </group>
  );
}

function UnitAnimator({
  residences,
  looks,
  hoveredId,
  selectedId,
  matchIds,
}: {
  residences: Residence[];
  looks: Map<string, { status: PublicStatus; look: UnitLook }>;
  hoveredId: string | null;
  selectedId: string | null;
  matchIds: ReadonlySet<string> | null;
}) {
  const fx = useFx();
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 10);
    for (const r of residences) {
      const entry = looks.get(r.id);
      if (!entry) continue;
      const { mesh, edge } = entry.look;
      const s = STATUS_STYLE[r.publicStatus];
      const hot = r.id === selectedId ? 0.75 : r.id === hoveredId ? 0.45 : 0;
      mesh.emissiveIntensity += (s.glow + hot - mesh.emissiveIntensity) * k;
      const level = fx.current[r.floorLevel]?.opacity ?? 1;
      const dim = matchIds && !matchIds.has(r.id) ? 0.2 : 1;
      setOpacity(mesh, s.opacity * level * dim);
      edge.opacity += ((hot > 0 ? 0.95 : 0) * level - edge.opacity) * k;
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

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow material={ground}>
        <circleGeometry args={[160, 72]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, -8]} receiveShadow>
        <planeGeometry args={[62, 54]} />
        <meshStandardMaterial color="#23271F" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 18.1]} receiveShadow>
        <planeGeometry args={[13, 10.8]} />
        <meshStandardMaterial color="#2C2B27" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 27.5]} receiveShadow>
        <planeGeometry args={[320, 8]} />
        <meshStandardMaterial color="#111210" roughness={0.8} />
      </mesh>
      {Array.from({ length: 40 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-117 + i * 6, 0.012, 27.5]}>
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

const HOME = { theta: -0.62, phi: 1.08, radius: 96, y: 7 };
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
  const cur = useRef({ ...HOME, radius: HOME.radius * 1.35, phi: 1.28, target: new THREE.Vector3(0, HOME.y, -3) });
  const goal = useRef({ ...HOME, target: new THREE.Vector3(0, HOME.y, -3) });
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
      g.target.set(0, HOME.y, -3);
    } else {
      g.phi = 0.72;
      g.radius = focusLevel === -1 ? 88 : 74;
      g.target.set(0, levelBase(focusLevel) + FLOOR_H * 0.4, focusLevel === -1 ? -8 : -1);
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
        g.radius = focusLevel === null ? HOME.radius : 74;
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
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
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
    () => residences.map((r) => ({ r, a: unitAnchor(r.code, r.floorLevel) })),
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
  const looks = useUnitLooks(props.residences);
  const focusRef = useRef(props.focusLevel);
  focusRef.current = props.focusLevel;

  const byLevel = useMemo(() => {
    const out = new Map<number, { r: Residence; v: UnitVolume }[]>();
    for (const r of props.residences) {
      for (const v of unitVolumes(r.code, r.floorLevel)) {
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

      <hemisphereLight args={['#FFF1DC', '#1B1A17', 0.8]} />
      <directionalLight
        position={[-42, 62, 54]}
        intensity={2.2}
        color="#FFD9AD"
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

      {LEVELS.map((level) => (
        <LevelGroup key={level} level={level}>
          <LevelParts level={level} shadows={shadows} />
          {(byLevel.get(level) ?? []).map(({ r, v }, i) => {
            const entry = looks.get(r.id);
            if (!entry) return null;
            return (
              <UnitVolumeMesh
                key={`${r.id}-${i}`}
                residence={r}
                volume={v}
                look={entry.look}
                shadows={shadows}
                interactive={interactiveFor(r.floorLevel)}
                onHover={props.onHover}
                onSelect={props.onSelect}
              />
            );
          })}
          {level === -1 && <ParkingCars />}
        </LevelGroup>
      ))}

      <UnitAnimator
        residences={props.residences}
        looks={looks}
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
      <Scene {...props} />
    </Canvas>
  );
}
