'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Uncovers its media from the lower edge the first time it enters the
 * viewport (see `.reveal-media` in app.css). Purely presentational: the image
 * is in the HTML from the start, and reduced motion or no JavaScript shows it
 * as it is.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.dataset.revealed = 'true';
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal-media ${className ?? ''}`} data-revealed="false">
      {children}
    </div>
  );
}
