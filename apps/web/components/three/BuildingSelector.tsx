'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STATUS_FILL, type UnitStatus } from '@avida/types';
import { useTimeState } from '../../lib/time-state/TimeStateProvider';

/**
 * §8.4 F14 — the 3D building selector.
 *
 * The model is the architect's, decimated to ≤80k triangles with each sellable
 * unit exported as a separately named mesh matching `Unit.meshName`. That
 * naming convention has to be agreed with the modeller up front (risk R1);
 * until a model exists, this renders the same inventory as extruded blocks so
 * the interaction, the selection sync and the fallback path are all real and
 * testable.
 *
 * §8.4 — selection state is shared with the SVG elevation stack: selecting a
 * unit in either updates both.
 */

export interface SelectorUnit {
  id: string;
  code: string;
  status: UnitStatus;
  meshName: string | null;
  positionIndex: number;
  widthRatio: number;
  floorLevel: number;
}

const FLOOR_HEIGHT = 0.42;
const UNIT_DEPTH = 1.1;

function statusColour(status: UnitStatus, accent: string, muted: string, line: string): string {
  // §2.3 — colour comes from the token cascade, read once from the document,
  // never computed per component from the time state.
  if (status === 'AVAILABLE') return accent;
  if (status === 'SOLD' || status === 'BOOKED') return muted;
  return line;
}

function Blocks({
  units,
  selectedUnitId,
  onSelect,
}: {
  units: SelectorUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
}) {
  const { state } = useTimeState();
  const [tokens, setTokens] = useState({ accent: '#8C6A45', muted: '#5E665C', line: '#C2C1B8' });

  // Re-read the tokens whenever the time state changes: §8.4 swaps baked
  // lightmaps per state rather than moving real lights, and this is the same
  // idea one step earlier — the palette follows the document, not the renderer.
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    setTokens({
      accent: css.getPropertyValue('--accent').trim() || '#8C6A45',
      muted: css.getPropertyValue('--ink-muted').trim() || '#5E665C',
      line: css.getPropertyValue('--line').trim() || '#C2C1B8',
    });
  }, [state]);

  const perFloor = Math.max(...units.map((u) => u.positionIndex)) + 1;

  return (
    <group>
      {units.map((unit) => {
        const width = unit.widthRatio * 0.8;
        const x = (unit.positionIndex - (perFloor - 1) / 2) * 0.95;
        const y = unit.floorLevel * FLOOR_HEIGHT;
        const selected = unit.id === selectedUnitId;
        const fill = STATUS_FILL[unit.status];

        return (
          <mesh
            key={unit.id}
            position={[x, y, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(unit.id);
            }}
            // §6.5 — the 3D view is a convenience; the SVG elevation stack is
            // the accessible primary. This mesh is not keyboard-reachable, and
            // that is why the stack must always be present.
            userData={{ unitCode: unit.code }}
          >
            <boxGeometry args={[width, FLOOR_HEIGHT * 0.86, UNIT_DEPTH]} />
            <meshStandardMaterial
              color={statusColour(unit.status, tokens.accent, tokens.muted, tokens.line)}
              transparent
              opacity={fill === 'outline' ? 0.35 : fill === 'faint' ? 0.2 : 0.92}
              emissive={selected ? tokens.accent : '#000000'}
              emissiveIntensity={selected ? 0.5 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function SlowOrbit({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const angle = useRef(0.6);

  useFrame((_, delta) => {
    if (!enabled) return;
    angle.current += delta * 0.08;
    const radius = 9;
    camera.position.set(Math.sin(angle.current) * radius, 3.4, Math.cos(angle.current) * radius);
    camera.lookAt(0, 2, 0);
  });

  return null;
}

export function BuildingSelector({
  units,
  selectedUnitId,
  onSelect,
  autoOrbit = false,
}: {
  units: SelectorUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  autoOrbit?: boolean;
}) {
  return (
    <div className="building-selector">
      <Canvas
        camera={{ position: [6, 3.4, 7], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#00000000']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[6, 10, 6]} intensity={1.1} />
        <Suspense fallback={null}>
          <Blocks units={units} selectedUnitId={selectedUnitId} onSelect={onSelect} />
        </Suspense>
        <SlowOrbit enabled={autoOrbit} />
      </Canvas>
      <p className="note">
        Massing model. TODO(content) — replaced by the architect&rsquo;s decimated glTF when it
        arrives (§7.8 item 1).
      </p>
    </div>
  );
}
