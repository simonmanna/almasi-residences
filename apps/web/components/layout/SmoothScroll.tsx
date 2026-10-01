'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type Lenis from 'lenis';

const LenisContext = createContext<Lenis | null>(null);

/** The Lenis instance, or null under reduced motion (native scrolling). */
export const useLenis = () => useContext(LenisContext);

/**
 * Inertial scrolling, driven from GSAP's ticker so ScrollTrigger and Lenis
 * share one clock. Reduced motion gets the browser's own scrolling untouched.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import('lenis'), import('gsap'), import('gsap/ScrollTrigger')]).then(([lenisModule, gsapModule, triggerModule]) => {
      if (disposed) return;
      const LenisCtor = lenisModule.default;
      const { gsap } = gsapModule;
      const { ScrollTrigger } = triggerModule;
      gsap.registerPlugin(ScrollTrigger);
      const instance = new LenisCtor({ lerp: 0.09, wheelMultiplier: 0.95, anchors: { offset: -72 } });
      instance.on('scroll', ScrollTrigger.update);
      const raf = (time: number) => instance.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      setLenis(instance);
      cleanup = () => {
        gsap.ticker.remove(raf);
        instance.destroy();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
      setLenis(null);
    };
  }, []);

  // A new route starts at its top, unless the URL names an anchor. Keyed on the
  // route alone: Lenis loads lazily, and resetting when it arrives yanked a
  // visitor who had already scrolled back to the top of the page.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (window.location.hash) return;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname, lenis]);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
