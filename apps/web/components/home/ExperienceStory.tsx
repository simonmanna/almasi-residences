'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { gsap } from 'gsap';
import { TOUR_LEVELS } from '@avida/types';
import type { TourStationDto } from '../../lib/api';
import { fillCopy } from '../../lib/copy-tokens';
import { useIsoLayoutEffect, useReducedMotion } from '../../lib/motion';
import { useInventory } from '../providers/InventoryProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { SceneImage } from '../ui/SceneImage';
import styles from './ExperienceStory.module.css';

const GAUGE = TOUR_LEVELS;
/** How long a chapter holds before the reel moves on by itself. */
const AUTOPLAY_MS = 7000;

interface Chapter {
  key: string;
  image: TourStationDto['image'];
  video: TourStationDto['video'];
  gauge: string;
  mark: string;
  title: string;
  text: string;
}

/**
 * The chapters are the "experience" walkthrough edited in the admin (Website →
 * Tours). Live figures in their words — "{penthouse.areaMin} m²" — are filled
 * from the inventory, so a chapter never quotes a stale number.
 */
function useChapters(stations: TourStationDto[]): Chapter[] {
  const { summary } = useInventory();
  return stations.map((st) => ({
    key: st.key,
    image: st.image,
    video: st.video,
    gauge: st.level ?? 'G',
    mark: fillCopy(st.place ?? '', summary),
    title: fillCopy(st.title, summary),
    text: fillCopy(st.body ?? '', summary),
  }));
}

const pad = (n: number) => String(n).padStart(2, '0');
const wrap = (i: number, n: number) => ((i % n) + n) % n;

/**
 * 05 — the experience: a cinematic reel held in one screen. Each space wipes
 * in over the last in the direction of travel; arrows, a swipe, the keyboard
 * or the chapter tabs move it, and it advances by itself while in view and
 * untouched. The gauge on the right keeps the visitor oriented in the building.
 */
export function ExperienceStory({ stations, title }: { stations: TourStationDto[]; title: string }) {
  const chapters = useChapters(stations);
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [inView, setInView] = useState(false);
  const [hold, setHold] = useState(false);
  const [paused, setPaused] = useState(false);
  const prev = useRef(0);
  const n = chapters.length;

  const go = useCallback(
    (to: number, direction?: 1 | -1) => {
      if (n < 2) return;
      const next = wrap(to, n);
      setActive((cur) => {
        if (cur === next) return cur;
        setDir(direction ?? (next > cur ? 1 : -1));
        return next;
      });
    },
    [n],
  );

  // Autoplay only while the reel is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting && e.intersectionRatio > 0.5)), {
      threshold: [0, 0.5, 1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [n]);

  // The wipe: the incoming space is revealed from the side it travels from,
  // the outgoing one drifts the other way beneath it.
  useIsoLayoutEffect(() => {
    const el = root.current;
    const from = prev.current;
    prev.current = active;
    if (!el || from === active) return;
    const layers = gsap.utils.toArray<HTMLElement>('[data-layer]', el);
    const inners = gsap.utils.toArray<HTMLElement>('[data-layer-inner]', el);
    const inL = layers[active];
    const outL = layers[from];
    if (!inL || !outL) return;

    // A new move lands the previous one first, so rapid clicks never leave a torn frame.
    gsap.getTweensOf([...layers, ...inners]).forEach((t) => t.progress(1).kill());
    layers.forEach((l, i) => {
      l.style.zIndex = i === active ? '2' : i === from ? '1' : '0';
      l.style.visibility = i === active || i === from ? 'visible' : 'hidden';
    });

    if (reduced) {
      gsap.fromTo(inL, { opacity: 0, clipPath: 'inset(0% 0% 0% 0%)' }, { opacity: 1, duration: 0.4, ease: 'power1.out' });
    } else {
      gsap.fromTo(
        inL,
        { opacity: 1, clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'expo.inOut' },
      );
      gsap.fromTo(inners[active]!, { scale: 1.18, xPercent: 8 * dir }, { scale: 1.04, xPercent: 0, duration: 1.5, ease: 'expo.out' });
      gsap.to(inners[from]!, { scale: 1.1, xPercent: -10 * dir, duration: 1.1, ease: 'expo.inOut' });
    }

    const lines = el.querySelectorAll('[data-line]');
    gsap.fromTo(
      lines,
      reduced ? { autoAlpha: 0 } : { autoAlpha: 0, y: 28 },
      { autoAlpha: 1, y: 0, duration: reduced ? 0.3 : 0.8, ease: 'expo.out', stagger: 0.06, delay: reduced ? 0 : 0.35 },
    );
    // Only a change of chapter drives the wipe; direction and motion preference are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Swipe with a finger, drag with a mouse.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let x = 0;
    let y = 0;
    let armed = false;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      armed = true;
      x = e.clientX;
      y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!armed) return;
      armed = false;
      const dx = e.clientX - x;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(e.clientY - y) * 1.4) {
        setActive((cur) => {
          const next = wrap(cur + (dx < 0 ? 1 : -1), n);
          setDir(dx < 0 ? 1 : -1);
          return next;
        });
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [n]);

  if (n === 0) return null;

  const current = chapters[active]!;
  const upcoming = chapters[wrap(active + 1, n)]!;
  const playing = !reduced && !paused && inView && !hold && n > 1;
  const near = (i: number) => Math.min(Math.abs(i - active), n - Math.abs(i - active)) <= 1;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(active + 1, 1);
    else if (e.key === 'ArrowLeft') go(active - 1, -1);
    else return;
    e.preventDefault();
  };

  return (
    <section
      ref={root}
      id="experience"
      className={styles.story}
      data-ground="night"
      data-playing={playing ? 'true' : 'false'}
      aria-roledescription="carousel"
      aria-labelledby="experience-title"
      onKeyDown={onKey}
      onFocus={(e) => e.target.matches(':focus-visible') && setHold(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHold(false)}
    >
      <div className={styles.stage} data-cursor="Drag">
        {chapters.map((c, i) => (
          <div
            key={c.key}
            className={styles.layer}
            data-layer
            style={{ zIndex: i === 0 ? 2 : 0, visibility: i === 0 ? 'visible' : 'hidden' }}
            aria-hidden="true"
          >
            <div className={styles.inner} data-layer-inner>
              <MotionMedia
                image={c.image}
                video={c.video}
                label={c.title}
                active={i === active}
                load={near(i)}
                restartOnActive
              />
            </div>
          </div>
        ))}
        <div className={styles.shade} aria-hidden="true" />
      </div>

      <header className={styles.head}>
        <h2 id="experience-title" className="mark">
          {title}
        </h2>
        <div className={styles.headRight}>
          {!reduced && n > 1 && (
            <button type="button" className={styles.playToggle} aria-pressed={!paused} onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
          <p className={styles.counter} aria-hidden="true">
            <span>{pad(active + 1)}</span> / {pad(n)}
          </p>
        </div>
      </header>

      <div
        className={styles.caption}
        role="group"
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${n}`}
        aria-live={playing ? 'off' : 'polite'}
      >
        <p className="mark" data-line>
          {current.mark}
        </p>
        <h3 className={styles.title} data-line>
          {current.title}
        </h3>
        <p className={styles.text} data-line>
          {current.text}
        </p>
      </div>

      <div className={styles.gauge} aria-hidden="true">
        <ol>
          {GAUGE.map((g) => (
            <li key={g.key} data-active={g.key === current.gauge ? 'true' : 'false'}>
              <span>{g.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {n > 1 && (
        <div className={styles.controls}>
          <button type="button" className={styles.peek} onClick={() => go(active + 1, 1)} aria-label={`Next: ${upcoming.title}`}>
            <span className={styles.peekThumb}>
              <SceneImage media={upcoming.image} sizes="120px" />
            </span>
            <span className={styles.peekText}>
              <span className={styles.peekLabel}>Next</span>
              <span className={styles.peekTitle}>{upcoming.title}</span>
            </span>
          </button>
          <div className={styles.arrows}>
            <button type="button" aria-label="Previous space" onClick={() => go(active - 1, -1)} data-side="prev">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5M11 5l-7 7 7 7" />
              </svg>
            </button>
            <button type="button" aria-label="Next space" onClick={() => go(active + 1, 1)} data-side="next">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {n > 1 && (
        <nav className={styles.tabs} aria-label="Spaces in the experience">
          <ol>
            {chapters.map((c, i) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={styles.tab}
                  aria-current={i === active ? 'step' : undefined}
                  onClick={() => go(i)}
                >
                  <span className={styles.tabNum}>{pad(i + 1)}</span>
                  <span className={styles.tabTitle}>{c.title}</span>
                  <span className={styles.tabBar} aria-hidden="true">
                    {i === active && (
                      <span
                        key={`${c.key}-${active}`}
                        style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                        onAnimationEnd={() => go(active + 1, 1)}
                      />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <p className={`cgi-note ${styles.note}`}>{current.image?.note ?? ''}</p>
    </section>
  );
}
