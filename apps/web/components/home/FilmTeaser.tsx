'use client';

import Link from 'next/link';
import { MotionMedia } from '../ui/MotionMedia';
import styles from './FilmTeaser.module.css';

/** 10 — the way into the film: the aerial approach, looping quietly, and one action. */
export function FilmTeaser() {
  return (
    <section className={styles.section} data-ground="night" aria-labelledby="film-teaser-title">
      <Link href="/film" className={styles.frame} data-cursor="Play">
        <MotionMedia id="aerial" loop sizes="100vw" />
        <span className={styles.shade} aria-hidden="true" />
        <span className={styles.copy}>
          <span className={`mark ${styles.kicker}`}>The film</span>
          <span id="film-teaser-title" className={styles.title} role="heading" aria-level={2}>
            Almasi, <em>an architectural film</em>
          </span>
          <span className={styles.play}>
            <span className={styles.icon} aria-hidden="true" />
            Play the film
          </span>
        </span>
      </Link>
    </section>
  );
}
