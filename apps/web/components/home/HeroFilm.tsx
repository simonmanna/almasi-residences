'use client';

import { useEffect, useRef, useState } from 'react';
import { heroFilm, heroFilmSources, pickHeroFilm, type HeroFilmVariant } from '../../lib/hero-film';
import styles from './HeroExperience.module.css';

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/**
 * The hero film, laid over the poster render. It is chosen after hydration
 * for this screen and connection, fades in only once frames are actually
 * playing, and pauses whenever the hero is off screen or the tab is hidden.
 * Reduced motion, Save-Data, a 2G connection or a blocked autoplay all leave
 * the poster in place — never a black frame.
 */
export function HeroFilm({ paused, onPlaying }: { paused: boolean; onPlaying: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [variant, setVariant] = useState<HeroFilmVariant | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!heroFilm.enabled) return;
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    setVariant(
      pickHeroFilm({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        saveData: conn?.saveData,
        effectiveType: conn?.effectiveType,
      }),
    );
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || !variant) return;
    v.muted = true;
    let inView = true;
    const sync = () => {
      if (paused || !inView || document.hidden) v.pause();
      else v.play().catch(() => undefined);
    };
    const io = new IntersectionObserver(([e]) => {
      inView = e?.isIntersecting ?? true;
      sync();
    });
    io.observe(v);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [variant, paused]);

  if (!variant) return null;
  const src = heroFilmSources(variant);

  return (
    <video
      ref={ref}
      className={styles.film}
      data-playing={playing || undefined}
      data-variant={variant}
      muted
      playsInline
      loop
      autoPlay
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => {
        setPlaying(true);
        onPlaying();
      }}
    >
      <source src={src.webm} type='video/webm; codecs="vp9"' />
      <source src={src.mp4} type="video/mp4" />
    </video>
  );
}
