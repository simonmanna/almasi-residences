'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TourStationDto } from '../../lib/api';
import { useReducedMotion } from '../../lib/motion';
import { MotionMedia } from '../ui/MotionMedia';
import { SceneImage } from '../ui/SceneImage';
import styles from './TourExperience.module.css';

const AUTOPLAY_MS = 7000;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The tour: one space at a time, full screen. Moving on is a walk forward —
 * the room you leave grows past you as the next one settles into place. A
 * mouse looks around a little; a finger swipes between spaces; the arrow keys,
 * the buttons and the strip of spaces along the bottom all do the same.
 *
 * The stations — words, order, photographs and films — are a walkthrough
 * edited in the admin (Website → Tours); none of it lives in this repository.
 */
export function TourExperience({
  stations,
  title,
  otherTour,
}: {
  stations: TourStationDto[];
  title: string;
  otherTour: { href: string; label: string };
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [auto, setAuto] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLOListElement>(null);
  const n = stations.length;
  const station = stations[Math.min(index, Math.max(0, n - 1))];

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= n || next === index) return;
      setDirection(next > index ? 'forward' : 'back');
      setLeaving(index);
      setIndex(next);
    },
    [index, n],
  );

  // The leaving frame is only needed for the length of the transition.
  useEffect(() => {
    if (leaving === null) return;
    const t = window.setTimeout(() => setLeaving(null), reduced ? 0 : 1300);
    return () => window.clearTimeout(t);
  }, [leaving, reduced]);

  useEffect(() => {
    if (!auto) return;
    if (index >= n - 1) {
      setAuto(false);
      return;
    }
    const t = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [auto, index, n, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, dialog')) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(n - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, n]);

  // Keep the current space in view in the strip.
  useEffect(() => {
    const el = stripRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [index, reduced]);

  // Look around with a mouse; swipe between spaces with a finger.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || reduced) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    };
    const down = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(e.clientY - startY) * 1.4) go(index + (dx < 0 ? 1 : -1));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
    };
  }, [go, index, reduced]);

  if (!station) {
    return (
      <div className={styles.tour} data-ground="night" data-nav-over>
        <h1 className="visually-hidden">{title}</h1>
        <p className="container lead" style={{ paddingTop: 160 }}>
          This tour is being prepared.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tour} data-ground="night" data-nav-over>
      <h1 className="visually-hidden">{title}</h1>

      <div ref={stageRef} className={styles.stage} data-direction={direction} data-cursor="Look">
        {stations.map((s, i) => {
          const state = i === index ? 'active' : i === leaving ? 'leaving' : 'idle';
          const near = Math.abs(i - index) <= 1 || i === leaving;
          return (
            <div key={s.key} className={styles.frame} data-state={state} aria-hidden={i !== index}>
              <div className={styles.look}>
                {near && (
                  <MotionMedia
                    image={s.image}
                    video={s.video}
                    label={s.title}
                    active={i === index}
                    load={i === index || Math.abs(i - index) === 1}
                    restartOnActive
                    priority={i === 0}
                    sizes="100vw"
                  />
                )}
              </div>
            </div>
          );
        })}
        <div className={styles.shade} aria-hidden="true" />
      </div>

      <div className={styles.top}>
        <p className={styles.counter}>
          <span className="tabular">{pad(index + 1)}</span> / <span className="tabular">{pad(n)}</span>
        </p>
        <div className={styles.topActions}>
          <button type="button" className={styles.textButton} aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            {auto ? 'Pause' : 'Play the tour'}
          </button>
          <Link href={otherTour.href} className={styles.textButton}>
            {otherTour.label}
          </Link>
        </div>
      </div>

      <div className={styles.caption} aria-live="polite" aria-atomic="true">
        {station.place && <p className={`mark ${styles.place}`}>{station.place}</p>}
        <h2 key={station.key} className={styles.title}>
          {station.title}
        </h2>
        {station.body && <p className={styles.text}>{station.body}</p>}
        {station.image?.note && <p className="cgi-note">{station.image.note}</p>}
      </div>

      <div className={styles.arrows}>
        <button type="button" aria-label="Previous space" disabled={index === 0} onClick={() => go(index - 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </button>
        <button type="button" aria-label="Next space" disabled={index === n - 1} onClick={() => go(index + 1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5 L16 12 L9 19" />
          </svg>
        </button>
      </div>

      <nav className={styles.stripWrap} aria-label="Spaces in this tour">
        <ol ref={stripRef} className={styles.strip}>
          {stations.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                className={styles.stop}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
              >
                <span className={styles.thumb}>
                  <SceneImage media={s.image} sizes="160px" />
                </span>
                <span className={styles.stopTitle}>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.progress} aria-hidden="true">
        <span style={{ transform: `scaleX(${(index + 1) / n})` }} />
      </div>
    </div>
  );
}
