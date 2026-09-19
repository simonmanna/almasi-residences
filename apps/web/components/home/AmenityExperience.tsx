'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { ApiImage } from '../ui/ApiImage';
import { RevealText } from '../ui/RevealText';
import styles from './AmenityExperience.module.css';

/** An amenity as the API sends it. Only the name is required. */
export interface AmenityInput {
  id?: string;
  slug?: string | null;
  name: string;
  shortDescription?: string | null;
  descriptionMd: string | null;
  iconKey: string | null;
  location?: string | null;
  specifications?: { label: string; value: string }[];
  images?: PublicMediaDto[];
}

/**
 * 06 — The art of living. Not a grid of icons: each amenity is a large image
 * card with its name set over the photograph, the first given twice the room.
 * On a phone the cards become a row to swipe.
 *
 * An amenity with no photograph in the library shows an empty frame that says
 * so — never another room's picture behind the right name (audit §5.3).
 */
export function AmenityExperience({
  amenities,
  id = 'amenities',
  kicker,
  lines,
  lead,
  ground = 'night',
}: {
  amenities: AmenityInput[];
  id?: string;
  kicker: string;
  lines: string[];
  lead: string;
  ground?: 'stone' | 'quiet' | 'night';
}) {
  const [selected, setSelected] = useState<(AmenityInput & { photo: PublicMediaDto | null }) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
  }, [selected]);
  // The heading and the lead are CMS fields and may both be empty. When there
  // is no heading the section is named by its kicker instead, so the label
  // never points at an element that was not rendered.
  const titleId = `${id}-title`;
  const labelledBy = lines.length > 0 || kicker ? titleId : undefined;
  const items = amenities.map((a, i) => ({ ...a, key: a.slug ?? a.id ?? String(i), photo: a.images?.find((m) => m.kind === 'IMAGE') ?? null }));
  if (items.length === 0) return null;
  // The first card takes four cells of a four-column grid; the last one widens
  // to close the final row instead of leaving a hole.
  const fill = (4 - ((items.length + 3) % 4)) % 4;
  const media = (it: (typeof items)[number], sizes: string) => {
    if (it.photo) return <ApiImage m={it.photo} sizes={sizes} focus={it.photo.focus ?? undefined} />;
    return (
      <div className={styles.placeholder}>
        <p className="mark">{it.name}</p>
        <p>Photography to follow</p>
      </div>
    );
  };

  return (
    <section
      id={id}
      className={`section ${styles.section}`}
      data-ground={ground}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : 'Amenities'}
    >
      <div className="container">
        <header className={styles.head}>
          {kicker && <p id={lines.length > 0 ? undefined : titleId} className={styles.kicker}>{kicker}</p>}
          {lines.length > 0 && <RevealText as="h2" id={titleId} className={styles.title} lines={lines.length > 1 ? [lines.join(' ')] : lines} />}
          {lead && <p className="lead">{lead}</p>}
        </header>

        <ul className={styles.grid}>
          {items.map((it, i) => (
            <li
              key={it.key}
              className={`lux-card ${styles.card}`}
              data-reveal
              style={{ '--reveal-i': i % 4, '--span': i > 0 && i === items.length - 1 ? 1 + fill : 1 } as React.CSSProperties}
            >
              <button type="button" className={styles.cardButton} onClick={() => setSelected(it)} aria-label={`View details for ${it.name}`}>
                <div className={styles.media}>{media(it, i === 0 ? '(max-width: 900px) 82vw, 50vw' : '(max-width: 900px) 82vw, 25vw')}</div>
                <div className={styles.caption}>
                  <h3 className={styles.name}>{it.name}</h3>
                  {(it.shortDescription ?? it.descriptionMd) && <p className={styles.desc}>{it.shortDescription ?? it.descriptionMd}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="amenity-dialog-title"
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        {selected && (
          <div className={styles.dialogPanel}>
            <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Close amenity details">×</button>
            {selected.photo && <div className={styles.dialogMedia}><ApiImage m={selected.photo} sizes="(max-width: 800px) 100vw, 62vw" focus={selected.photo.focus ?? undefined} /></div>}
            <div className={styles.dialogCopy}>
              <p className="mark">Amenity</p>
              <h2 id="amenity-dialog-title" className={styles.dialogTitle}>{selected.name}</h2>
              {selected.location && <p className={styles.location}>{selected.location}</p>}
              {(selected.descriptionMd ?? selected.shortDescription) && <p className={styles.dialogDescription}>{selected.descriptionMd ?? selected.shortDescription}</p>}
              {selected.specifications && selected.specifications.length > 0 && (
                <dl className={styles.specifications}>
                  {selected.specifications.map((spec) => (
                    <div key={`${spec.label}-${spec.value}`}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
