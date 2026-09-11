import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

/** Layout effect in the browser, plain effect during SSR — for GSAP setup that must precede paint. */
export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function mediaStore(query: string) {
  return {
    subscribe(onChange: () => void) {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    get: () => window.matchMedia(query).matches,
  };
}

const reduced = mediaStore('(prefers-reduced-motion: reduce)');
const fine = mediaStore('(hover: hover) and (pointer: fine)');

/** The server cannot know, so it renders the calm version; the client corrects on hydration. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(reduced.subscribe, reduced.get, () => true);
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(fine.subscribe, fine.get, () => false);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type NetworkInfo = { saveData?: boolean; effectiveType?: string };
const connection = () =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: NetworkInfo }).connection;

/**
 * Save-Data, a 2G connection or a device short of memory: stills instead of
 * film, and a lighter 3D scene. Read once; it rarely changes mid-visit.
 */
export function prefersLightMedia(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = connection();
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory !== undefined && memory < 2;
}

/** A small screen or a 3G-class connection: the smaller film rendition. */
export function prefersSmallMedia(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 900 || connection()?.effectiveType === '3g';
}
