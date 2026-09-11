'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import film from '../../lib/film-data.json';
import { prefersLightMedia, useReducedMotion } from '../../lib/motion';
import styles from './FilmPlayer.module.css';

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

/**
 * The film, with chapters. It never autoplays with motion reduced; it picks the
 * smaller rendition on small screens and slow connections; every control is a
 * real button or range input, and the chapter list doubles as a transcript.
 */
export function FilmPlayer() {
  const reduced = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setSrc(window.innerWidth < 900 || prefersLightMedia() ? film.sd : film.hd);
  }, []);

  const chapter = film.chapters.reduce((acc, c, i) => (time + 0.05 >= c.t ? i : acc), 0);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(film.duration, t));
    setTime(v.currentTime);
    setStarted(true);
  }, []);

  const fullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, dialog')) return;
      const v = videoRef.current;
      if (!v) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowRight') seek(v.currentTime + 5);
      else if (e.key === 'ArrowLeft') seek(v.currentTime - 5);
      else if (e.key === 'f') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, toggle]);

  return (
    <div className={styles.player}>
      <div ref={frameRef} className={styles.frame} data-started={started ? 'true' : 'false'}>
        {src && (
          <video
            ref={videoRef}
            className={styles.video}
            src={src}
            poster={film.poster}
            playsInline
            muted
            preload="metadata"
            autoPlay={!reduced}
            onPlay={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onClick={toggle}
            aria-label="Almasi Residences, an architectural film"
          />
        )}
        {!playing && (
          <button type="button" className={styles.bigPlay} onClick={toggle} aria-label={started ? 'Play' : 'Play the film'}>
            <span aria-hidden="true" />
          </button>
        )}
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span className={`${styles.time} tabular`}>
            {clock(time)} / {clock(film.duration)}
          </span>
          <div className={styles.scrub}>
            <input
              type="range"
              min={0}
              max={film.duration}
              step={0.1}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Position in the film"
              aria-valuetext={`${clock(time)}, ${film.chapters[chapter]?.title ?? ''}`}
              style={{ '--pos': `${(time / film.duration) * 100}%` } as React.CSSProperties}
            />
            {film.chapters.map((c) => (
              <span key={c.t} className={styles.tick} style={{ left: `${(c.t / film.duration) * 100}%` }} aria-hidden="true" />
            ))}
          </div>
          <button type="button" className={styles.control} onClick={fullscreen}>
            Full screen
          </button>
        </div>
      </div>

      <div className={`container ${styles.below}`}>
        <ol className={styles.chapters} aria-label="Chapters">
          {film.chapters.map((c, i) => (
            <li key={c.t}>
              <button
                type="button"
                className={styles.chapter}
                aria-current={i === chapter && started ? 'true' : undefined}
                onClick={() => seek(c.t + 0.01)}
              >
                <span className={`${styles.chapterTime} tabular`}>{clock(c.t)}</span>
                <span className={styles.chapterTitle}>{c.title}</span>
                <span className={styles.chapterPlace}>{c.place}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="caption">
          A silent film of artist’s impressions and concept visuals, {clock(film.duration)} long.{' '}
          <a className="link-line" href={film.hd} download="Almasi-Residences-film.mp4">
            Download the film (MP4)
          </a>
        </p>
      </div>
    </div>
  );
}
