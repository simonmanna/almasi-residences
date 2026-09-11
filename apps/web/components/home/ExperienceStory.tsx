'use client';

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { formatCount } from '@avida/types';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { useIsoLayoutEffect, useReducedMotion } from '../../lib/motion';
import { useInventory } from '../providers/InventoryProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { SceneImage } from '../ui/SceneImage';
import styles from './ExperienceStory.module.css';

type GaugeKey = 'sky' | 'R' | '4' | '3' | '2' | '1' | 'G' | 'street';

/** Top of the building first, as the gauge is read. */
const GAUGE: { key: GaugeKey; label: string }[] = [
  { key: 'sky', label: 'Above' },
  { key: 'R', label: 'Roof' },
  { key: '4', label: 'Level 4' },
  { key: '3', label: 'Level 3' },
  { key: '2', label: 'Level 2' },
  { key: '1', label: 'Level 1' },
  { key: 'G', label: 'Ground' },
  { key: 'street', label: 'Street' },
];

interface Chapter {
  scene: SceneId;
  gauge: GaugeKey;
  mark: string;
  title: string;
  text: string;
}

function useChapters(): Chapter[] {
  const { summary } = useInventory();
  const two = summary.byType['two-bedroom'];
  const ph = summary.byType.penthouse;
  return [
    {
      scene: 'aerial',
      gauge: 'sky',
      mark: 'Kimihurura, from the air',
      title: 'A quiet rise above the city',
      text: 'One of Kigali’s greenest ridges, minutes from the Convention Centre and the city centre.',
    },
    {
      scene: 'street',
      gauge: 'street',
      mark: 'KG 15 Ave',
      title: 'Arrive',
      text: 'A stone gatehouse and a walled garden. The building stands back behind palms, lit from within.',
    },
    {
      scene: 'arrival',
      gauge: 'G',
      mark: 'Ground floor',
      title: 'The porte-cochère',
      text: 'A covered drop-off under walnut, a water wall, and the lobby doors a few steps from the car.',
    },
    {
      scene: 'lobby',
      gauge: 'G',
      mark: 'Ground floor',
      title: 'Reception',
      text: 'Double height, travertine and walnut, and a front desk staffed from morning until late.',
    },
    {
      scene: 'pool',
      gauge: '1',
      mark: 'Level 1, the amenity deck',
      title: 'The pool deck',
      text: 'A fifteen-metre pool, a gym, a sauna and a massage room, one floor above the garden.',
    },
    {
      scene: 'living-2br',
      gauge: '2',
      mark: 'Level 2',
      title: 'Space to live.',
      text: `Two bedrooms from ${two.areaMin} m², the living room opening onto a balcony and the hills.`,
    },
    {
      scene: 'ph-living',
      gauge: '4',
      mark: 'Level 4',
      title: 'Designed for living.',
      text: `The top floor holds ${formatCount(ph.total).toLowerCase()} penthouses, from ${ph.areaMin} to ${ph.areaMax} m².`,
    },
    {
      scene: 'ph-terrace',
      gauge: 'R',
      mark: 'The roof',
      title: 'Your view of Kigali.',
      text: 'A private terrace and pool above the city, turned to the evening light.',
    },
  ];
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 05 — the experience: one continuous passage from the air to the roof, as in
 * an architectural film. The stage pins; each scroll length reveals the next
 * space, wiping upward when the journey climbs and downward when it descends,
 * while the gauge on the right keeps the visitor oriented in the building.
 */
export function ExperienceStory() {
  const chapters = useChapters();
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

  if (reduced) return <StaticStory chapters={chapters} />;

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
          <li key={c.scene}>
            {c.mark}. {c.title} {c.text}
          </li>
        ))}
      </ol>

      <div ref={stage} className={styles.stage}>
        {chapters.map((c, i) => (
          <div key={c.scene} className={styles.layer} data-layer style={{ zIndex: i + 1 }} aria-hidden="true">
            <div className={styles.inner} data-layer-inner>
              <MotionMedia
                id={c.scene}
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
            The experience
          </h2>
          <p className={styles.counter} aria-hidden="true">
            <span>{pad(active + 1)}</span> / {pad(n)}
          </p>
        </header>

        <div className={styles.captions} aria-hidden="true">
          {chapters.map((c) => (
            <div key={c.scene} className={styles.caption} data-caption>
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

        <p className={`cgi-note ${styles.note}`}>{PROVENANCE_NOTE[scene(current.scene).provenance]}</p>
        <div className={styles.progress} aria-hidden="true">
          <span ref={bar} />
        </div>
      </div>
    </section>
  );
}

function StaticStory({ chapters }: { chapters: Chapter[] }) {
  return (
    <section id="experience" className={styles.static} data-ground="night" aria-labelledby="experience-title">
      <div className="container">
        <h2 id="experience-title" className="h2">
          The experience
        </h2>
      </div>
      <ol>
        {chapters.map((c) => (
          <li key={c.scene} className={styles.staticItem}>
            <div className={styles.staticMedia}>
              <SceneImage id={c.scene} sizes="100vw" />
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
