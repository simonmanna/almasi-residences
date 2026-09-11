'use client';

import { useEffect, useRef, useState } from 'react';
import { useCapabilities } from '../../lib/capability/useCapabilities';
import { mediaSrc } from '../../lib/media';

/**
 * §8.5 F11/F12 — the scroll-driven building orbit.
 *
 * Why an image ladder rather than a <video>: seeking a video element
 * frame-accurately is unreliable across browsers, especially Safari on iOS, and
 * every seek risks a visible stall. A preloaded image sequence gives
 * deterministic frame control.
 *
 * §8.5 step 2 — frames load in priority order: frame 0, then every 8th, then
 * the gaps. That gives usable coarse scrubbing in roughly 600ms instead of
 * waiting for all 120 frames.
 */

const COARSE_STRIDE = 8;

export interface FrameManifest {
  frameCount: number;
  ladders: { name: string; width: number; prefix: string }[];
  loopable: boolean;
  hotspots?: { unitId: string; frames: { i: number; x: number; y: number; r: number }[] }[];
}

export function FrameSequencePlayer({
  manifest,
  driver = 'scroll',
  scrollHeightVh = 300,
  onHotspot,
  label,
}: {
  manifest: FrameManifest;
  driver?: 'scroll' | 'drag';
  scrollHeightVh?: number;
  onHotspot?: (unitId: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<(HTMLImageElement | undefined)[]>([]);
  const currentRef = useRef(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const caps = useCapabilities();

  // Pick the ladder from viewport and memory — §8.5 step 1. A 2GB phone gets
  // the mobile ladder regardless of how wide its screen reports itself.
  const ladder =
    !caps.probed || caps.memory < 4 || window.innerWidth < 700
      ? (manifest.ladders.find((l) => l.name === 'mobile') ?? manifest.ladders[0])
      : window.innerWidth < 1200
        ? (manifest.ladders.find((l) => l.name === 'tablet') ?? manifest.ladders[0])
        : (manifest.ladders.find((l) => l.name === 'desktop') ?? manifest.ladders[0]);

  useEffect(() => {
    if (!ladder) return;
    framesRef.current = new Array<HTMLImageElement | undefined>(manifest.frameCount);
    let cancelled = false;
    let loaded = 0;

    const draw = (index: number) => {
      const canvas = canvasRef.current;
      const img = framesRef.current[index];
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const { width, height } = canvas.getBoundingClientRect();
      if (canvas.width !== width * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    const load = (index: number) =>
      new Promise<void>((resolve) => {
        if (cancelled || framesRef.current[index]) return resolve();
        const img = new Image();
        img.decoding = 'async';
        img.src = mediaSrc(`${ladder.prefix}/${String(index).padStart(4, '0')}.avif`);
        img.onload = () => {
          framesRef.current[index] = img;
          loaded += 1;
          setLoadedCount(loaded);
          if (index === currentRef.current) draw(index);
          resolve();
        };
        // A missing frame must not stall the ladder; the player holds the last
        // good frame instead.
        img.onerror = () => resolve();
      });

    void (async () => {
      await load(0);
      draw(0);
      const coarse: number[] = [];
      for (let i = COARSE_STRIDE; i < manifest.frameCount; i += COARSE_STRIDE) coarse.push(i);
      await Promise.all(coarse.map(load));
      for (let i = 1; i < manifest.frameCount && !cancelled; i++) await load(i);
    })();

    // §8.5 step 4 — scroll progress across a pinned container maps to a frame.
    const onScroll = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = container.offsetHeight - window.innerHeight;
      const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const index = Math.min(manifest.frameCount - 1, Math.round(progress * (manifest.frameCount - 1)));
      if (index !== currentRef.current) {
        currentRef.current = index;
        // Fall back to the nearest loaded frame so scrubbing stays smooth
        // while the gaps are still filling in.
        let nearest = index;
        while (nearest > 0 && !framesRef.current[nearest]) nearest -= 1;
        draw(nearest);
      }
    };

    if (driver === 'scroll') window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
    };
  }, [ladder, manifest.frameCount, driver]);

  // §8.5 step 7 / §2.6 — under reduced motion the sequence is a single frame
  // with a caption, and nothing is pinned to the scroll.
  if (caps.probed && caps.reducedMotion) {
    return (
      <figure className="frame-sequence-static">
        <img src={ladder ? mediaSrc(`${ladder.prefix}/0000.avif`) : ''} alt={label} />
        <figcaption className="note">{label}. Animation disabled at your request.</figcaption>
      </figure>
    );
  }

  const ready = loadedCount / Math.max(1, manifest.frameCount);

  return (
    <div
      ref={containerRef}
      className="frame-sequence"
      style={{ height: driver === 'scroll' ? `${scrollHeightVh}vh` : undefined }}
    >
      <div className="frame-sequence-stage">
        <canvas ref={canvasRef} className="frame-sequence-canvas" role="img" aria-label={label} />
        {/* §8.5 step 5 — a determinate bar below a quarter loaded. Anything
            less specific reads as "broken" on a slow connection. */}
        {ready < 0.25 && (
          <div className="frame-sequence-loading">
            <div className="frame-sequence-bar" style={{ width: `${Math.round(ready * 400)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
