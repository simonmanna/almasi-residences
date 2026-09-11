'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { SceneImage } from '../ui/SceneImage';
import styles from './GalleryStrip.module.css';

export const GALLERY_ORDER: SceneId[] = [
  'street',
  'arrival',
  'lobby',
  'pool',
  'living-2br',
  'ph-living',
  'ph-bedroom',
  'ph-terrace',
  'restaurant',
  'wellness',
  'one-living',
  'aerial',
];

/** A strip to swipe on a phone and drag with a mouse; the full gallery is one link away. */
export function GalleryStrip() {
  const track = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let moved = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) {
        moved = true;
        el.dataset.dragging = 'true';
      }
      el.scrollLeft = startLeft - dx;
    };
    const up = () => {
      dragging = false;
      el.dataset.dragging = 'false';
    };
    const click = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('click', click, true);
    };
  }, []);

  return (
    <section className={`section ${styles.section}`} aria-labelledby="gallery-strip-title">
      <div className={`container ${styles.head}`}>
        <div>
          <p className={`mark ${styles.kicker}`}>Gallery</p>
          <h2 id="gallery-strip-title" className="h2">
            Stone, walnut,
            <br />
            evening light.
          </h2>
        </div>
        <Link href="/gallery" className="link-line">
          Open the gallery
        </Link>
      </div>

      <ul
        ref={track}
        className={styles.track}
        data-cursor="Drag"
        tabIndex={0}
        aria-label="Gallery. Scroll sideways for more."
      >
        {GALLERY_ORDER.map((id, i) => {
          const s = scene(id);
          return (
            <li key={id} className={styles.shot} data-wide={i % 3 === 0 ? 'true' : 'false'}>
              <figure>
                <div className={styles.img}>
                  <SceneImage id={id} sizes="(max-width: 700px) 84vw, 44vw" />
                </div>
                <figcaption className={styles.caption}>
                  <span>{s.title}</span>
                  <span className="cgi-note">{PROVENANCE_NOTE[s.provenance]}</span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
