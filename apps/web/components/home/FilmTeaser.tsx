'use client';

import Link from 'next/link';
import { useSlot } from '../providers/MediaSlotsProvider';
import { MotionMedia } from '../ui/MotionMedia';
import styles from './FilmTeaser.module.css';

/** 10 — the way into the film: a placement chosen in the admin, looping quietly, and one action. */
export function FilmTeaser({ kicker, title, cta }: { kicker: string; title: string; cta: string }) {
  const slot = useSlot('home-film-teaser');
  return (
    <section className={styles.section} data-ground="night" aria-labelledby="film-teaser-title">
      <Link href="/film" className={styles.frame} data-cursor="Play">
        <MotionMedia image={slot.image} video={slot.video} loop sizes="100vw" label="Film teaser" />
        <span className={styles.shade} aria-hidden="true" />
        <span className={styles.copy}>
          {kicker && <span className={`mark ${styles.kicker}`}>{kicker}</span>}
          <span id="film-teaser-title" className={styles.title} role="heading" aria-level={2}>
            {title}
          </span>
          {cta && (
            <span className={styles.play}>
              <span className={styles.icon} aria-hidden="true" />
              {cta}
            </span>
          )}
        </span>
      </Link>
    </section>
  );
}
