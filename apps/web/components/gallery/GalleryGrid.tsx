'use client';

import { useEffect, useRef, useState } from 'react';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { SceneImage } from '../ui/SceneImage';
import styles from './GalleryGrid.module.css';

const GROUPS: { id: string; label: string; scenes: SceneId[] }[] = [
  { id: 'building', label: 'The building', scenes: ['street', 'arrival', 'aerial', 'pool'] },
  { id: 'residences', label: 'Residences', scenes: ['living-2br', 'two-kitchen', 'one-living', 'one-bedroom', 'one-kitchen'] },
  { id: 'penthouses', label: 'Penthouses', scenes: ['ph-living', 'ph-kitchen', 'ph-bedroom', 'ph-bath', 'ph-terrace', 'view'] },
  { id: 'amenities', label: 'Amenities', scenes: ['lobby', 'restaurant', 'gym', 'wellness', 'cowork', 'parking'] },
  { id: 'plans', label: 'Plans', scenes: ['plan-1br', 'plan-2br', 'plan-ph'] },
];

/** Every image, grouped, each opening full screen. The lightbox is a native <dialog>. */
export function GalleryGrid() {
  const [group, setGroup] = useState<string>('all');
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const list = (group === 'all' ? GROUPS : GROUPS.filter((g) => g.id === group)).flatMap((g) => g.scenes);
  const current = open !== null ? scene(list[open]!) : null;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + list.length) % list.length));

  return (
    <>
      <div className={`container ${styles.filters}`} role="group" aria-label="Show">
        <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
          Everything
        </button>
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      <ul className={`container ${styles.grid}`}>
        {list.map((id, i) => {
          const s = scene(id);
          return (
            <li key={id} className={styles.item}>
              <button type="button" className={styles.open} onClick={() => setOpen(i)} data-cursor="View">
                <span className={styles.frame} style={{ aspectRatio: `${s.width} / ${s.height}` }}>
                  <SceneImage id={id} sizes="(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 33vw" />
                </span>
                <span className={styles.caption}>
                  <span>{s.title}</span>
                  <span className="cgi-note">{PROVENANCE_NOTE[s.provenance]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        className={styles.lightbox}
        aria-label={current ? current.title : 'Image'}
        data-ground="night"
        onClose={() => setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        {current && (
          <div className={styles.lightInner}>
            <div className={styles.lightImage}>
              <SceneImage id={current.id} sizes="100vw" quality={82} />
            </div>
            <div className={styles.lightBar}>
              <p>
                <span className={styles.lightTitle}>{current.title}</span>{' '}
                <span className="cgi-note">{PROVENANCE_NOTE[current.provenance]}</span>
              </p>
              <p className="tabular muted">
                {(open ?? 0) + 1} / {list.length}
              </p>
              <div className={styles.lightActions}>
                <button type="button" onClick={() => step(-1)} aria-label="Previous image">
                  Previous
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next image">
                  Next
                </button>
                <button type="button" onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
