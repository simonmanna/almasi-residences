'use client';

import { useEffect, useRef, useState } from 'react';
import { toTimeStateKey } from '@avida/types';
import { useTimeState } from '../../lib/time-state/TimeStateProvider';
import { mediaSrc } from '../../lib/media';

/**
 * §8.2 — the 360° tour. Photo Sphere Viewer, driven by the node graph the API
 * returns, so a scene added in the admin appears with no deploy.
 *
 * The feature that makes it part of the site rather than bolted on: the
 * panorama follows the global time state, and switching from day to night
 * swaps the texture **without resetting the camera** — the visitor keeps
 * looking at whatever they were looking at (§9 Phase 3 acceptance).
 */

export interface TourScene {
  id: string;
  key: string;
  label: string;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  planX: number | null;
  planY: number | null;
  panoramas: Record<string, { previewKey: string; originalKey: string }>;
  hotspots: {
    id: string;
    kind: string;
    yawDeg: number;
    pitchDeg: number;
    label: string | null;
    targetSceneId: string | null;
    targetScene: { id: string; key: string; label: string } | null;
  }[];
}

export interface TourData {
  id: string;
  name: string;
  startSceneId: string | null;
  scenes: TourScene[];
}

interface PsvViewer {
  setPanorama: (panorama: string, options?: Record<string, unknown>) => Promise<unknown>;
  getPosition: () => { yaw: number; pitch: number };
  addEventListener: (type: string, handler: () => void) => void;
  destroy: () => void;
}

export function TourViewer({
  tour,
  initialSceneKey,
  onSceneChange,
  onYawChange,
}: {
  tour: TourData;
  initialSceneKey?: string;
  onSceneChange?: (scene: TourScene) => void;
  onYawChange?: (yawDeg: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PsvViewer | null>(null);
  const { state } = useTimeState();
  const [sceneKey, setSceneKey] = useState(
    initialSceneKey ??
      tour.scenes.find((s) => s.id === tour.startSceneId)?.key ??
      tour.scenes[0]?.key ??
      '',
  );
  const [failed, setFailed] = useState(false);

  const scene = tour.scenes.find((s) => s.key === sceneKey) ?? tour.scenes[0];

  function panoramaFor(s: TourScene | undefined): string | null {
    if (!s) return null;
    const exact = s.panoramas[toTimeStateKey(state)] ?? s.panoramas.DAY;
    return exact ? mediaSrc(exact.originalKey) : null;
  }

  // Create the viewer once. Scene and time changes swap the texture on the
  // existing instance rather than tearing it down — that is what preserves the
  // camera direction.
  useEffect(() => {
    const host = hostRef.current;
    const first = tour.scenes.find((s) => s.key === sceneKey) ?? tour.scenes[0];
    const src = panoramaFor(first);
    if (!host || !src) return;

    let disposed = false;
    void (async () => {
      try {
        const { Viewer } = await import('@photo-sphere-viewer/core');
        if (disposed) return;
        const viewer = new Viewer({
          container: host,
          panorama: src,
          defaultYaw: ((first?.yawDeg ?? 0) * Math.PI) / 180,
          defaultPitch: ((first?.pitchDeg ?? 0) * Math.PI) / 180,
          navbar: ['zoom', 'fullscreen'],
          loadingTxt: 'Loading the view',
        }) as unknown as PsvViewer;

        viewer.addEventListener('position-updated', () => {
          onYawChange?.((viewer.getPosition().yaw * 180) / Math.PI);
        });
        viewerRef.current = viewer;
      } catch {
        // §8.1 — the tour degrades to a flat gallery; it does not error.
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // Mount-only: later changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §8.2 — swap the texture in place, camera untouched.
  useEffect(() => {
    const viewer = viewerRef.current;
    const src = panoramaFor(scene);
    if (!viewer || !src) return;
    void viewer
      .setPanorama(src, { transition: true, showLoader: false })
      .catch(() => setFailed(true));
    if (scene) onSceneChange?.(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, state]);

  if (failed || !scene) {
    return (
      <div className="tour-fallback">
        <p className="prose">
          The interactive tour could not load here. Every room is in the gallery as a flat image.
        </p>
      </div>
    );
  }

  return (
    <div className="tour">
      <div ref={hostRef} className="tour-canvas" />

      {/* §6.5 — a keyboard route through every scene, and a text alternative
          listing the rooms. A panorama that only answers to dragging excludes
          keyboard and screen-reader users completely. */}
      <nav className="tour-scenes" aria-label="Rooms in this tour">
        <ul>
          {tour.scenes.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSceneKey(s.key)}
                aria-current={s.key === sceneKey ? 'true' : undefined}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {scene.hotspots.length > 0 && (
        <p className="note">
          From {scene.label.toLowerCase()} you can reach{' '}
          {scene.hotspots
            .map((h) => h.targetScene?.label ?? h.label)
            .filter(Boolean)
            .join(', ')}
          .
        </p>
      )}
    </div>
  );
}
