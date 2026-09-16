'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { ApiImage } from './ApiImage';
import styles from './Lightbox.module.css';

const MIN = 1;
const MAX = 5;
const STEP = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A drawing a buyer actually needs to read: full frame, zoomable, pannable.
 *
 * Built on <dialog> so focus trapping, Escape and the top layer come from the
 * platform rather than from us. Pointer events cover mouse, pen and touch;
 * two-finger pinch is handled directly because the dialog must not hand the
 * gesture to the page behind it.
 */
export function Lightbox({
  media,
  open,
  onClose,
  caption,
}: {
  media: PublicMediaDto | null;
  open: boolean;
  onClose: () => void;
  caption?: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());

  const reset = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      reset();
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, reset]);

  // Panning past the frame edge is pointless at 1×, so the offset follows the scale.
  const limit = (next: { x: number; y: number }, atScale: number) => {
    const reach = (atScale - 1) * 400;
    return { x: clamp(next.x, -reach, reach), y: clamp(next.y, -reach, reach) };
  };

  const zoomBy = (delta: number) => {
    const next = clamp(scale + delta, MIN, MAX);
    setScale(next);
    setPan((p) => (next === MIN ? { x: 0, y: 0 } : limit(p, next)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.current.size === 2) {
      const [a, b] = [...points.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale };
      drag.current = null;
      return;
    }
    if (scale === MIN) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (points.current.has(e.pointerId)) points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && points.current.size === 2) {
      const [a, b] = [...points.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const next = clamp((distance / pinch.current.distance) * pinch.current.scale, MIN, MAX);
      setScale(next);
      setPan((p) => limit(p, next));
      return;
    }

    const d = drag.current;
    if (!d) return;
    setPan(limit({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) }, scale));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    points.current.delete(e.pointerId);
    if (points.current.size < 2) pinch.current = null;
    if (points.current.size === 0) drag.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    zoomBy(e.deltaY < 0 ? STEP / 2 : -STEP / 2);
  };

  if (!media) return null;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-ground="night"
      aria-label="Floor plan, full screen"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className={styles.shell}>
        <div
          className={styles.stage}
          data-zoomed={scale > MIN ? 'true' : 'false'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          onDoubleClick={() => (scale > MIN ? reset() : zoomBy(STEP * 2))}
        >
          <div
            className={styles.frame}
            style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}
          >
            <ApiImage m={media} sizes="100vw" priority />
          </div>
        </div>

        <div className={styles.bar}>
          {caption && <p className={styles.caption}>{caption}</p>}
          <div className={styles.controls} role="group" aria-label="Zoom">
            <button type="button" onClick={() => zoomBy(-STEP)} disabled={scale <= MIN} aria-label="Zoom out">
              &minus;
            </button>
            <span className="tabular" aria-live="polite">
              {Math.round(scale * 100)}%
            </span>
            <button type="button" onClick={() => zoomBy(STEP)} disabled={scale >= MAX} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={reset} disabled={scale === MIN}>
              Reset
            </button>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
