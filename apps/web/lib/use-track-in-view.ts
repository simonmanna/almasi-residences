'use client';

import { useEffect, useRef } from 'react';
import { track, type AnalyticsEvent } from './analytics';

/** Counts a section once, the first time half of it is on screen (roadmap item 40). */
export function useTrackInView<T extends HTMLElement>(event: AnalyticsEvent, props: Record<string, string | number | boolean | undefined> = {}) {
  const ref = useRef<T>(null);
  const key = JSON.stringify(props);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          track(event, JSON.parse(key) as Record<string, string>);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [event, key]);
  return ref;
}
