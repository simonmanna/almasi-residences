'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A short crossfade between routes. Skipped on first load (so it never delays
 * the largest paint) and under reduced motion.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ref.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 460,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}
