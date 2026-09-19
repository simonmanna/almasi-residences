'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * One observer for every `[data-reveal]` on the page (see app.css): each rises
 * into place the first time it enters the viewport, staggered by its
 * `--reveal-i`. Mounted once in the layout; re-scans when the route or the
 * DOM changes, batched to one pass per frame.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('motion' in document.documentElement.dataset)) return;
    const timers = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.dataset.revealed = 'in';
          // Hand the element's transitions back to its own rules (hover lift) once it has landed.
          const i = Number(getComputedStyle(el).getPropertyValue('--reveal-i')) || 0;
          const t = window.setTimeout(() => {
            el.dataset.revealed = 'done';
            timers.delete(t);
          }, 1300 + i * 90);
          timers.add(t);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    let frame = 0;
    const scan = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])').forEach((el) => io.observe(el));
    };
    scan();
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [pathname]);

  return null;
}
