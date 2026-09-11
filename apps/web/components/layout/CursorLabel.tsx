'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CursorLabel.module.css';

/**
 * A quiet label that follows a fine pointer over media that does something —
 * "Drag", "Play", "Explore" — declared with `data-cursor` on the element. The
 * system cursor is never hidden; touch and reduced motion get nothing at all.
 */
export function CursorLabel() {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el) return;

    let x = -200;
    let y = -200;
    let tx = x;
    let ty = y;
    let current: string | null = null;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const target = (e.target as Element | null)?.closest?.('[data-cursor]');
      const next = target?.getAttribute('data-cursor') ?? null;
      if (next !== current) {
        current = next;
        setLabel(next);
      }
    };
    const loop = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={styles.cursor} data-active={label ? 'true' : 'false'} aria-hidden="true">
      <span className={styles.disc}>
        <span className={styles.text}>{label}</span>
      </span>
    </div>
  );
}
