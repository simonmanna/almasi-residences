'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { formatMoney } from '@avida/types';
import { useIsoLayoutEffect } from '../../lib/motion';
import { Magnetic } from '../ui/Magnetic';
import { RESIDENCE_TYPES } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { HeroFilm } from './HeroFilm';
import styles from './HeroExperience.module.css';

const INTRO_KEY = 'almasi:intro-seen';

/**
 * The opening frame: the whole building on its corner at dusk, crown to
 * entrance, with open sky down the left where the headline sits. Nothing is
 * cropped away — the silhouette is the first thing a buyer should see.
 */
const HERO_STILL = '/media/hero-wide-v2.png';

/**
 * Phones only: the opening frame becomes a slow cinematic sequence. The first
 * slide is the still above (with its glows and film); the rest are laid over
 * it and cross-fade in turn. Each crop is aimed at its subject for a portrait
 * screen. They are never rendered on a wide screen, so desktop never loads them.
 */
const PHONE_SLIDES = [
  { src: HERO_STILL, caption: 'Dusk on the corner', focus: '68% 50%' },
  { src: '/media/almasi/pool.jpg', caption: 'Garden-deck pool', focus: '34% 50%' },
  { src: '/media/almasi/ph-terrace.jpg', caption: 'Penthouse terrace', focus: '42% 50%' },
  { src: '/media/almasi/aerial.jpg', caption: 'Kimihurura, above', focus: '50% 50%' },
] as const;
const SLIDE_MS = 6500;
const pad = (n: number) => String(n).padStart(2, '0');

/** Thin line icons for the facts panel. One stroke weight, one 24-unit box. */
const icons = {
  building: (
    <>
      <path d="M4 21h16M6 21V5.5A1.5 1.5 0 0 1 7.5 4h6A1.5 1.5 0 0 1 15 5.5V21M15 10h2.5A1.5 1.5 0 0 1 19 11.5V21" />
      <path d="M9 8h3M9 12h3M9 16h3" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V7M3 12h18v6M21 18v-4.5A1.5 1.5 0 0 0 19.5 12" />
      <path d="M6.5 12V9.5A1.5 1.5 0 0 1 8 8h8a1.5 1.5 0 0 1 1.5 1.5V12" />
    </>
  ),
  tag: (
    <>
      <path d="M11.2 3.5H20v8.8l-8.6 8.6a1.6 1.6 0 0 1-2.3 0l-6.5-6.5a1.6 1.6 0 0 1 0-2.3Z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.6" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </>
  ),
};

/** "1, 2 & 3" is read from what is actually built, not written into the CMS. */
const BEDROOM_COUNTS = [
  { type: 'one-bedroom', label: '1' },
  { type: 'two-bedroom', label: '2' },
  { type: 'three-bedroom', label: '3' },
] as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}

const chars = (text: string) =>
  [...text].map((c, i) => (
    <span key={i} data-intro-char>
      {c === ' ' ? ' ' : c}
    </span>
  ));

/**
 * The opening. First visit of a session:
 *   1. darkness, the name set letter by letter, then the place;
 *   2. the building appears through an aperture that opens to the full frame
 *      while the frame pulls back from the facade, a band of evening light
 *      crosses the glass, and the windows come up;
 *   3. the title and the two ways in.
 * After that the render is never quite still: a slow drift, the interiors
 * breathing, the low sun, and a few pixels of depth under the pointer.
 * Return visits get only the last beat. Any scroll, key or touch finishes the
 * sequence at once; reduced motion shows the final frame with no sequence.
 *
 * The pending state is set by an inline script in <head> before first paint,
 * so the full-frame server render never flashes before the intro begins.
 */
export function HeroExperience({
  kicker,
  title,
  subtitle,
  tagline,
  place,
  primary,
  handover,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  /** One short serif line under the title on a phone: "A rare place to call home." */
  tagline?: string;
  /** "Kimihurura, Kigali" — from the property record. */
  place: string;
  primary: { label: string; href: string };
  /** "Q2 2028" — already formatted by the page. */
  handover?: string | null;
}) {
  const [lineA, ...rest] = title.trim().split(/\s+/);
  // When the CMS subtitle already says the tagline, it is set once, as the tagline.
  const norm = (t?: string) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const taglineIsLede = !!tagline && norm(tagline) === norm(subtitle);
  const lineB = rest.join(' ');
  const { summary, currency } = useInventory();

  /**
   * The panel along the foot of the frame: the four facts a buyer looks for
   * before they look at anything else. Each is read live — an unpriced or
   * unconfigured development shows fewer cells rather than a placeholder.
   */
  const priceFrom = RESIDENCE_TYPES.map((t) => summary.byType[t].priceFromMinor).filter(
    (p): p is number => p !== null,
  );
  const bedrooms = BEDROOM_COUNTS.filter((b) => summary.byType[b.type].total > 0).map((b) => b.label);
  const bedroomText =
    bedrooms.length > 1 ? `${bedrooms.slice(0, -1).join(', ')} & ${bedrooms.at(-1)}` : bedrooms[0] ?? '';
  const facts = [
    summary.total ? { icon: 'building' as const, value: String(summary.total), label: 'Residences' } : null,
    bedroomText ? { icon: 'bed' as const, value: bedroomText, label: 'Bedroom units' } : null,
    priceFrom.length
      ? {
          icon: 'tag' as const,
          value: formatMoney({ amountMinor: Math.min(...priceFrom), currency }),
          label: 'Price from',
        }
      : null,
    handover ? { icon: 'calendar' as const, value: handover, label: 'Handover' } : null,
  ].filter((f): f is { icon: keyof typeof icons; value: string; label: string } => f !== null);
  const root = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  // Decided once per mount. React's development double-run of effects must not
  // turn a first visit into a return visit halfway through.
  const firstVisitRef = useRef<boolean | null>(null);
  const finishedRef = useRef(false);
  const [skippable, setSkippable] = useState(false);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [filmPaused, setFilmPaused] = useState(false);
  const [phone, setPhone] = useState(false);
  const [slide, setSlide] = useState(0);
  const [still, setStill] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const count = PHONE_SLIDES.length;
  const go = (step: number) => setSlide((s) => (s + step + count) % count);

  // The sequence exists only on a phone; the query is live so a rotated tablet
  // or a resized window gains or loses it cleanly.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setPhone(mq.matches);
      setStill(reduced.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    reduced.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, []);

  // Advances on its own, restarting the clock whenever the visitor steps it by
  // hand. It holds while the intro plays, the tab is hidden or the film runs.
  useEffect(() => {
    if (!phone || still || filmPlaying) return;
    let t = 0;
    const tick = () => {
      if (document.hidden || document.documentElement.dataset.intro === 'playing') t = window.setTimeout(tick, 1000);
      else setSlide((s) => (s + 1) % count);
    };
    t = window.setTimeout(tick, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [phone, still, filmPlaying, slide, count]);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current;
    const t = e.changedTouches[0];
    touchRef.current = null;
    if (!phone || !start || !t) return;
    const dx = t.clientX - start.x;
    // A horizontal flick steps the frame; anything more vertical is a scroll.
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.4) go(dx < 0 ? 1 : -1);
  };

  useIsoLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current;
    if (!el) return;
    const html = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      delete html.dataset.intro;
      return;
    }
    firstVisitRef.current ??= html.dataset.intro === 'pending';
    const firstVisit = firstVisitRef.current && !finishedRef.current;

    const finish = () => {
      finishedRef.current = true;
      delete html.dataset.intro;
      setSkippable(false);
      try {
        sessionStorage.setItem(INTRO_KEY, '1');
      } catch {
        /* private mode: the intro simply plays again next time */
      }
    };

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el);
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });
      tlRef.current = tl;

      if (firstVisit) {
        html.dataset.intro = 'playing';
        setSkippable(true);
        tl.set(q('[data-intro]'), { autoAlpha: 1 })
          .set(q('[data-aperture]'), { clipPath: 'inset(50% 50% 50% 50%)' })
          .from(q('[data-intro-char]'), { yPercent: 120, opacity: 0, duration: 1.3, stagger: 0.035 }, 0.3)
          .from(q('[data-intro-sub]'), { opacity: 0, y: 14, duration: 1.1 }, 1.2)
          // The two ways in reach the screen at ~4.0s rather than ~4.8s: the
          // choreography is unchanged, the waiting is not.
          .to(q('[data-intro-copy]'), { opacity: 0, y: -18, duration: 0.7, ease: 'power2.in' }, 2.2)
          .to(q('[data-aperture]'), { clipPath: 'inset(0% 0% 0% 0%)', duration: 2.0, ease: 'expo.inOut' }, 2.4)
          .fromTo(q('[data-media-inner]'), { scale: 1.32 }, { scale: 1, duration: 3.4, ease: 'power3.out' }, 2.4)
          .fromTo(q('[data-glow]'), { opacity: 0 }, { opacity: 1, duration: 2.4, ease: 'power2.out', stagger: 0.25 }, 3.0)
          .fromTo(q('[data-sheen]'), { xPercent: -100 }, { xPercent: 100, duration: 2.6, ease: 'power2.inOut' }, 2.9)
          .set(q('[data-intro]'), { autoAlpha: 0 }, 4.1)
          .from(q('[data-hero-line]'), { yPercent: 110, duration: 1.4, stagger: 0.1 }, 3.6)
          .from(q('[data-hero-fade]'), { opacity: 0, y: 18, duration: 1.1, stagger: 0.08 }, 4.0);
        // Same choreography, played at double speed: the headline lands at ~2s.
        tl.timeScale(2);
      } else {
        tl.set(q('[data-intro]'), { autoAlpha: 0 })
          .fromTo(q('[data-media-inner]'), { scale: 1.12 }, { scale: 1, duration: 2.6, ease: 'power3.out' }, 0)
          .fromTo(q('[data-glow]'), { opacity: 0 }, { opacity: 1, duration: 2.2, ease: 'power2.out', stagger: 0.25 }, 0.3)
          .fromTo(q('[data-sheen]'), { xPercent: -100 }, { xPercent: 100, duration: 2.4, ease: 'power2.inOut' }, 0.4)
          .from(q('[data-hero-line]'), { yPercent: 110, duration: 1.4, stagger: 0.1 }, 0.15)
          .from(q('[data-hero-fade]'), { opacity: 0, y: 18, duration: 1.1, stagger: 0.08 }, 0.55);
      }

      // Leaving the hero: the frame drifts, the words lift away.
      gsap.to(q('[data-media-scroll]'), {
        yPercent: 14,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to(q('[data-hero-content]'), {
        opacity: 0,
        y: -80,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: '55% top', scrub: true },
      });
      // A few pixels of depth under a mouse; touch screens keep the frame still.
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        const layer = q('[data-parallax]')[0];
        if (layer) {
          const toX = gsap.quickTo(layer, 'x', { duration: 1.4, ease: 'power3.out' });
          const toY = gsap.quickTo(layer, 'y', { duration: 1.4, ease: 'power3.out' });
          const onMove = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            toX(((e.clientX - r.left) / r.width - 0.5) * -22);
            toY(((e.clientY - r.top) / r.height - 0.5) * -14);
          };
          const onLeave = () => {
            toX(0);
            toY(0);
          };
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerleave', onLeave);
          return () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerleave', onLeave);
          };
        }
      }
    }, el);

    // Any sign of wanting to move on ends the sequence: a visitor is never held.
    const hurry = () => {
      const tl = tlRef.current;
      if (tl && tl.progress() < 1) tl.timeScale(7);
    };
    const opts = { passive: true, once: true } as const;
    window.addEventListener('wheel', hurry, opts);
    window.addEventListener('touchmove', hurry, opts);
    window.addEventListener('keydown', hurry, { once: true });

    return () => {
      window.removeEventListener('wheel', hurry);
      window.removeEventListener('touchmove', hurry);
      window.removeEventListener('keydown', hurry);
      ctx.revert();
      // An interrupted first visit stays pending, so a remount replays it from the start.
      if (finishedRef.current || !firstVisit) delete html.dataset.intro;
      else html.dataset.intro = 'pending';
    };
  }, []);

  return (
    <section
      ref={root}
      className={styles.hero}
      data-ground="night"
      data-nav-over
      data-slide={phone ? slide : undefined}
      aria-labelledby="hero-title"
      onTouchStart={phone ? onTouchStart : undefined}
      onTouchEnd={phone ? onTouchEnd : undefined}
    >
      <div className={styles.media} data-media-scroll>
        <div className={styles.aperture} data-aperture>
          <div className={styles.mediaInner} data-media-inner>
            <div className={styles.drift}>
              {/* Painted dusk under the contained render, so the frame is full
                of evening at every aspect ratio. */}
            <div className={styles.sky} aria-hidden="true" />
            <div className={styles.parallax} data-parallax>
                <Image
                  src={HERO_STILL}
                  alt="Almasi Residence at dusk, seen from the street corner: five storeys of lit, glass-fronted apartments with planted balconies above a street-level lobby, against an evening sky"
                  fill
                  preload
                  sizes="100vw"
                  quality={82}
                  className={styles.image}
                  onLoad={(e) => {
                    e.currentTarget.parentElement?.setAttribute('data-loaded', '');
                  }}
                />
                <div className={styles.windows} data-glow aria-hidden="true" />
                <div className={styles.bloom} data-glow aria-hidden="true" />
                <div className={styles.sun} data-glow aria-hidden="true" />
                <HeroFilm paused={filmPaused} onPlaying={() => setFilmPlaying(true)} />
              </div>
            </div>
            {phone &&
              PHONE_SLIDES.slice(1).map((s, i) => (
                <div
                  key={s.src}
                  className={styles.slide}
                  data-on={slide === i + 1 ? '' : undefined}
                  aria-hidden="true"
                >
                  <Image
                    src={s.src}
                    alt=""
                    fill
                    sizes="100vw"
                    quality={75}
                    className={styles.slideImage}
                    style={{ objectPosition: s.focus }}
                  />
                </div>
              ))}
          </div>
          <div className={styles.sheen} data-sheen aria-hidden="true" />
        </div>
        <div className={styles.scrim} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />
      </div>

      <div className={styles.intro} data-intro aria-hidden="true">
        <div className={styles.introCopy} data-intro-copy>
          <p className={styles.introTitle}>{chars(title)}</p>
          <p className={styles.introSub} data-intro-sub>
            {kicker}
          </p>
        </div>
      </div>

      <div className={`container ${styles.content}`} data-hero-content>
        {kicker && (
          <p className={`mark ${styles.eyebrow}`} data-hero-fade>
            {kicker}
          </p>
        )}
        <h1 id="hero-title" className={styles.title}>
          <span className={styles.line}>
            <span data-hero-line>{lineA}</span>
          </span>
          <span className={styles.line}>
            {/* The second line carries the accent, as the reference does: the
                name states itself, the accent makes it sing. */}
            <span data-hero-line className={`italic ${styles.accentLine}`}>
              {lineB}
            </span>
          </span>
        </h1>
        <div className={styles.aside}>
          {tagline && !taglineIsLede && (
            <p className={styles.tagline} data-hero-fade>
              {tagline}
            </p>
          )}
          <p className={taglineIsLede ? `${styles.lede} ${styles.ledeAsTagline}` : styles.lede} data-hero-fade>
            {subtitle}
          </p>
          {/* One way in, and one quiet alternative. A third button only made the
              two that matter harder to see. */}
          <div className={styles.ctas} data-hero-fade>
            {primary.label && primary.href && (
              <Magnetic>
                <Link href={primary.href} className="btn btn--solid">
                  {primary.label}
                  <span aria-hidden="true" className="btn-arrow">
                    →
                  </span>
                </Link>
              </Magnetic>
            )}
            {/* The 3D walkthrough is what this development has and its
                neighbours do not, so it keeps its place here. "Book a viewing"
                does not: the nav and the sticky bar both already offer it. */}
            <Link href="/3d-design" className={`btn ${styles.watch}`}>
              <span className={styles.play} aria-hidden="true">
                <svg viewBox="0 0 12 14" width="9" height="11" fill="currentColor" focusable="false">
                  <path d="M0 0.8v12.4a.8.8 0 0 0 1.22.68l10-6.2a.8.8 0 0 0 0-1.36l-10-6.2A.8.8 0 0 0 0 .8Z" />
                </svg>
              </span>
              <span className={styles.watchWide}>Experience in 3D</span>
              <span className={styles.watchPhone}>
                Property tour
                <span>in 3D</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* The facts panel along the foot of the frame: four numbers a buyer can
          take in before they have read a word of the copy. */}
      {facts.length > 0 && (
        <div className={`container ${styles.panelWrap}`} data-hero-fade>
          <dl className={styles.panel} style={{ '--fact-count': facts.length } as React.CSSProperties}>
            {facts.map((f) => (
              // A description list holds a term and its description in that
              // order; the value reads first on screen, which CSS arranges.
              <div key={f.label} className={styles.cell}>
                <dt className={styles.cellLabel}>{f.label}</dt>
                <dd className={styles.cellValue}>
                  <span className={styles.cellIcon} aria-hidden="true">
                    <Icon name={f.icon} />
                  </span>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className={styles.foot} data-hero-fade>
        <span className="mark">{place}</span>
        <span className={styles.cue} aria-hidden="true">
          <span />
        </span>
        {filmPlaying && (
          <button
            type="button"
            className={styles.filmToggle}
            aria-pressed={filmPaused}
            onClick={() => setFilmPaused((p) => !p)}
          >
            {filmPaused ? 'Play film' : 'Pause film'}
          </button>
        )}
      </div>

      {phone && (
        <div className={styles.slider} data-hero-fade>
          <p className={styles.slideCaption} aria-live="polite">
            {PHONE_SLIDES[slide]?.caption}
          </p>
          <div className={styles.slideNav}>
            <span className={styles.counter}>
              <b>{pad(slide + 1)}</b> / {pad(count)}
            </span>
            <button type="button" className={styles.arrow} aria-label="Previous picture" onClick={() => go(-1)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button type="button" className={styles.arrow} aria-label="Next picture" onClick={() => go(1)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <span className={styles.progress} aria-hidden="true">
            <span
              key={slide}
              data-run={still || filmPlaying ? undefined : ''}
              style={{ '--slide-ms': `${SLIDE_MS}ms`, '--slide-at': (slide + 1) / count } as React.CSSProperties}
            />
          </span>
        </div>
      )}

      {skippable && (
        <button type="button" className={styles.skip} onClick={() => tlRef.current?.progress(1)}>
          Skip intro
        </button>
      )}
    </section>
  );
}
