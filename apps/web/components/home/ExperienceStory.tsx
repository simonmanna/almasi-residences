'use client';

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TOUR_LEVELS } from '@avida/types';
import type { TourStationDto } from '../../lib/api';
import { fillCopy } from '../../lib/copy-tokens';
import { useIsoLayoutEffect, useReducedMotion } from '../../lib/motion';
import { useInventory } from '../providers/InventoryProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { SceneImage } from '../ui/SceneImage';
import styles from './ExperienceStory.module.css';

const GAUGE = TOUR_LEVELS;

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

/**
 * 05 — the experience: one continuous passage from the air to the roof, as in
 * an architectural film. The stage pins; each scroll length reveals the next
 * space, wiping upward when the journey climbs and downward when it descends,
 * while the gauge on the right keeps the visitor oriented in the building.
 */
export function ExperienceStory({ stations, title }: { stations: TourStationDto[]; title: string }) {
  const chapters = useChapters(stations);
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const n = chapters.length;

  useIsoLayoutEffect(() => {
    if (reduced) return;
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current;
    const pin = stage.current;
    if (!el || !pin) return;

    const order = chapters.map((c) => GAUGE.findIndex((g) => g.key === c.gauge));
    const ctx = gsap.context(() => {
      const layers = gsap.utils.toArray<HTMLElement>('[data-layer]');
      const inners = gsap.utils.toArray<HTMLElement>('[data-layer-inner]');
      const captions = gsap.utils.toArray<HTMLElement>('[data-caption]');
      gsap.set(captions.slice(1), { autoAlpha: 0, y: 48 });

      const tl = gsap.timeline({ defaults: { ease: 'none' } });
      for (let i = 1; i < n; i++) {
        const at = i - 1;
        const rising = order[i]! <= order[i - 1]!;
        tl.fromTo(
          layers[i]!,
          { clipPath: rising ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'power2.inOut' },
          at,
        )
          .fromTo(
            inners[i]!,
            { scale: 1.22, yPercent: rising ? 8 : -8 },
            { scale: 1.04, yPercent: 0, duration: 1.3, ease: 'power2.out' },
            at,
          )
          .to(inners[i - 1]!, { scale: 1.12, yPercent: rising ? -7 : 7, duration: 1, ease: 'power2.inOut' }, at)
          .to(captions[i - 1]!, { autoAlpha: 0, y: -48, duration: 0.3, ease: 'power2.in' }, at + 0.08)
          .fromTo(
            captions[i]!,
            { autoAlpha: 0, y: 48 },
            { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' },
            at + 0.55,
          );
      }
      tl.to({}, { duration: 0.6 });
      const total = tl.duration();

      ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: () => `+=${total * window.innerHeight * 1.1}`,
        pin,
        scrub: 0.9,
        animation: tl,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const idx = Math.max(0, Math.min(n - 1, Math.floor(self.progress * total + 0.45)));
          setActive((prev) => (prev === idx ? prev : idx));
          if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
        },
      });
    }, el);

    return () => ctx.revert();
    // The chapter list is fixed for the life of the page; its length is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, n]);

  if (n === 0) return null;
  if (reduced) return <StaticStory chapters={chapters} title={title} />;

  const current = chapters[active]!;

  return (
    <section
      ref={root}
      id="experience"
      className={styles.story}
      data-ground="night"
      aria-labelledby="experience-title"
    >
      {/* The passage, in reading order, for anyone not watching the stage. */}
      <ol className="visually-hidden">
        {chapters.map((c) => (
          <li key={c.key}>
            {c.mark}. {c.title} {c.text}
          </li>
        ))}
      </ol>

      <div ref={stage} className={styles.stage}>
        {chapters.map((c, i) => (
          <div key={c.key} className={styles.layer} data-layer style={{ zIndex: i + 1 }} aria-hidden="true">
            <div className={styles.inner} data-layer-inner>
              <MotionMedia
                image={c.image}
                video={c.video}
                label={c.title}
                active={i === active}
                load={Math.abs(i - active) <= 1}
                restartOnActive
              />
            </div>
          </div>
        ))}
        <div className={styles.shade} aria-hidden="true" />

        <header className={styles.head}>
          <h2 id="experience-title" className="mark">
            {title}
          </h2>
          <p className={styles.counter} aria-hidden="true">
            <span>{pad(active + 1)}</span> / {pad(n)}
          </p>
        </header>

        <div className={styles.captions} aria-hidden="true">
          {chapters.map((c) => (
            <div key={c.key} className={styles.caption} data-caption>
              <p className="mark">{c.mark}</p>
              <p className={styles.title}>{c.title}</p>
              <p className={styles.text}>{c.text}</p>
            </div>
          ))}
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

        <p className={`cgi-note ${styles.note}`}>{current.image?.note ?? ''}</p>
        <div className={styles.progress} aria-hidden="true">
          <span ref={bar} />
        </div>
      </div>
    </section>
  );
}

function StaticStory({ chapters, title }: { chapters: Chapter[]; title: string }) {
  return (
    <section id="experience" className={styles.static} data-ground="night" aria-labelledby="experience-title">
      <div className="container">
        <h2 id="experience-title" className="h2">
          {title}
        </h2>
      </div>
      <ol>
        {chapters.map((c) => (
          <li key={c.key} className={styles.staticItem}>
            <div className={styles.staticMedia}>
              <SceneImage media={c.image} sizes="100vw" label={c.title} />
            </div>
            <div className={`container ${styles.staticCaption}`}>
              <p className="mark">{c.mark}</p>
              <h3 className={styles.title}>{c.title}</h3>
              <p className={styles.text}>{c.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
