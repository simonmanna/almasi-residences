'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicGalleryDto } from '../../lib/api';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { ApiImage } from '../ui/ApiImage';
import { SceneImage } from '../ui/SceneImage';
import styles from './GalleryGrid.module.css';

/** Used only until the admin has published a gallery. */
const FALLBACK_GROUPS: { id: string; label: string; scenes: SceneId[] }[] = [
  { id: 'building', label: 'The building', scenes: ['street', 'arrival', 'aerial', 'pool'] },
  { id: 'residences', label: 'Residences', scenes: ['living-2br', 'two-kitchen', 'one-living', 'one-bedroom', 'one-kitchen'] },
  { id: 'penthouses', label: 'Penthouses', scenes: ['ph-living', 'ph-kitchen', 'ph-bedroom', 'ph-bath', 'ph-terrace', 'view'] },
  { id: 'amenities', label: 'Amenities', scenes: ['lobby', 'restaurant', 'gym', 'wellness', 'cowork', 'parking'] },
  { id: 'plans', label: 'Plans', scenes: ['plan-1br', 'plan-2br', 'plan-ph'] },
];

interface Item {
  key: string;
  title: string;
  note: string;
  aspect: string;
  render: (sizes: string) => ReactNode;
}

interface Group {
  id: string;
  label: string;
  items: Item[];
}

function fromGalleries(galleries: PublicGalleryDto[]): Group[] {
  return galleries.map((g) => ({
    id: g.slug,
    label: g.title,
    items: g.items
      .filter((m) => m.kind === 'IMAGE')
      .map((m) => ({
        key: `${g.slug}:${m.id}`,
        title: m.title ?? g.title,
        note: m.caption ?? '',
        aspect: m.width && m.height ? `${m.width} / ${m.height}` : '16 / 10',
        render: (sizes: string) => <ApiImage m={m} sizes={sizes} />,
      })),
  }));
}

function fromScenes(): Group[] {
  return FALLBACK_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.scenes.map((id) => {
      const s = scene(id);
      return { key: id, title: s.title, note: PROVENANCE_NOTE[s.provenance], aspect: `${s.width} / ${s.height}`, render: (sizes: string) => <SceneImage id={id} sizes={sizes} /> };
    }),
  }));
}

/**
 * Every image, grouped, each opening full screen. The groups are the galleries
 * published in the admin (§16), in their order. The lightbox is a native <dialog>.
 */
export function GalleryGrid({ galleries = [] }: { galleries?: PublicGalleryDto[] }) {
  const groups = galleries.length ? fromGalleries(galleries) : fromScenes();
  const [group, setGroup] = useState<string>('all');
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // One image appears once in "Everything", even when two galleries share it.
  const all = group === 'all';
  const seen = new Set<string>();
  const list = (all ? groups : groups.filter((g) => g.id === group))
    .flatMap((g) => g.items)
    .filter((it) => {
      const id = it.key.split(':').pop()!;
      if (!all) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const current = open !== null ? list[open] : null;

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
        {groups.filter((g) => g.items.length).map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      <ul className={`container ${styles.grid}`}>
        {list.map((it, i) => (
          <li key={it.key} className={styles.item}>
            <button type="button" className={styles.open} onClick={() => setOpen(i)} data-cursor="View">
              <span className={styles.frame} style={{ aspectRatio: it.aspect, position: 'relative' }}>
                {it.render('(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 33vw')}
              </span>
              <span className={styles.caption}>
                <span>{it.title}</span>
                {it.note && <span className="cgi-note">{it.note}</span>}
              </span>
            </button>
          </li>
        ))}
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
            <div className={styles.lightImage} style={{ position: 'relative' }}>
              {current.render('100vw')}
            </div>
            <div className={styles.lightBar}>
              <p>
                <span className={styles.lightTitle}>{current.title}</span>{' '}
                {current.note && <span className="cgi-note">{current.note}</span>}
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
