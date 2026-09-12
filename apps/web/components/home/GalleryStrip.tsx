'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { ApiImage } from '../ui/ApiImage';
import { SceneImage } from '../ui/SceneImage';
import styles from './GalleryStrip.module.css';

/** Used only until the admin has published a gallery. */
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

/**
 * A strip to swipe on a phone and drag with a mouse; the full gallery is one
 * link away. Its images are the published galleries' (§16).
 */
export function GalleryStrip({ items = [] }: { items?: PublicMediaDto[] }) {
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
    /* Prevent scroll interference during drag. */
    el.style.touchAction = 'pan-y pinch-zoom';
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('click', click, true);
    };
  }, []);

  const shots = items.length
    ? items.map((m) => ({ key: m.id, title: m.title ?? '', note: m.caption ?? '', media: <ApiImage m={m} sizes="(max-width: 700px) 84vw, 44vw" /> }))
    : GALLERY_ORDER.map((id) => {
        const s = scene(id);
        return { key: id, title: s.title, note: PROVENANCE_NOTE[s.provenance], media: <SceneImage id={id} sizes="(max-width: 700px) 84vw, 44vw" /> };
      });

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
        {shots.map((s, i) => (
          <li key={s.key} className={styles.shot} data-wide={i % 3 === 0 ? 'true' : 'false'}>
            <figure>
              <div className={styles.img} style={{ position: 'relative' }}>{s.media}</div>
              <figcaption className={styles.caption}>
                <span>{s.title}</span>
                {s.note && <span className="cgi-note">{s.note}</span>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
