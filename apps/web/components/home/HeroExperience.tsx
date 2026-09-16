'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useIsoLayoutEffect } from '../../lib/motion';
import { useSlot } from '../providers/MediaSlotsProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { Magnetic } from '../ui/Magnetic';
import styles from './HeroExperience.module.css';

const INTRO_KEY = 'almasi:intro-seen';

const chars = (text: string) =>
  [...text].map((c, i) => (
    <span key={i} data-intro-char>
      {c === ' ' ? ' ' : c}
    </span>
  ));

/**
 * The opening. First visit of a session:
 *   1. darkness, the name set letter by letter, then the place;
 *   2. the building appears through a narrow vertical aperture that opens to
 *      the full frame while the frame pulls back from the facade, and the
 *      film takes over with a slow approach — its first frame is the still,
 *      so the hand-over is invisible;
 *   3. the title and the two ways in.
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
  place,
  primary,
  secondary,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  /** "Kimihurura, Kigali" — from the property record. */
  place: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}) {
  const hero = useSlot('home-hero');
  const [lineA, ...rest] = title.trim().split(/\s+/);
  const lineB = rest.join(' ');
  const root = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  // Decided once per mount. React's development double-run of effects must not
  // turn a first visit into a return visit halfway through.
  const firstVisitRef = useRef<boolean | null>(null);
  const finishedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [skippable, setSkippable] = useState(false);

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
          .fromTo(q('[data-media-inner]'), { scale: 1.45 }, { scale: 1.04, duration: 3.4, ease: 'power3.out' }, 2.4)
          .call(() => setPlaying(true), [], 2.4)
          .set(q('[data-intro]'), { autoAlpha: 0 }, 4.1)
          .from(q('[data-hero-line]'), { yPercent: 110, duration: 1.4, stagger: 0.1 }, 3.6)
          .from(q('[data-hero-fade]'), { opacity: 0, y: 18, duration: 1.1, stagger: 0.08 }, 4.0);
      } else {
        tl.set(q('[data-intro]'), { autoAlpha: 0 })
          .fromTo(q('[data-media-inner]'), { scale: 1.18 }, { scale: 1.04, duration: 2.6, ease: 'power3.out' }, 0)
          .call(() => setPlaying(true), [], 0)
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
      aria-labelledby="hero-title"
    >
      <div className={styles.media} data-media-scroll>
        <div className={styles.aperture} data-aperture>
          <div className={styles.mediaInner} data-media-inner>
            <MotionMedia image={hero.image} video={hero.video} priority active={playing} label="Homepage hero" />
          </div>
        </div>
        <div className={styles.scrim} aria-hidden="true" />
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
        <h1 id="hero-title" className={styles.title}>
          <span className={styles.line}>
            <span data-hero-line>{lineA}</span>
          </span>
          <span className={styles.line}>
            <span data-hero-line className="italic">
              {lineB}
            </span>
          </span>
        </h1>
        <div className={styles.aside}>
          <p className={styles.lede} data-hero-fade>
            {subtitle}
          </p>
          <div className={styles.ctas} data-hero-fade>
            {primary.label && primary.href && (
              <Magnetic>
                <Link href={primary.href} className="btn btn--solid">
                  {primary.label}
                </Link>
              </Magnetic>
            )}
            {secondary.label && secondary.href && (
              <Magnetic>
                <Link href={secondary.href} className="btn btn--ghost">
                  {secondary.label}
                </Link>
              </Magnetic>
            )}
          </div>
        </div>
      </div>

      <div className={styles.foot} data-hero-fade>
        <span className="mark">{place}</span>
        <span className={styles.cue} aria-hidden="true">
          <span />
        </span>
        <span className="cgi-note">{hero.image?.note ?? ''}</span>
      </div>

      {skippable && (
        <button type="button" className={styles.skip} onClick={() => tlRef.current?.progress(1)}>
          Skip intro
        </button>
      )}
    </section>
  );
}
