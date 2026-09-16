'use client';

import { useState } from 'react';
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
  images?: PublicMediaDto[];
}

/**
 * 06 — The art of living. Not a grid of icons: the names are set large, and
 * pointing at one brings its space into the frame beside it. On a phone the
 * same list becomes a row of images to swipe.
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
}: {
  amenities: AmenityInput[];
  id?: string;
  kicker: string;
  lines: string[];
  lead: string;
}) {
  const [active, setActive] = useState(0);
  // The heading and the lead are CMS fields and may both be empty. When there
  // is no heading the section is named by its kicker instead, so the label
  // never points at an element that was not rendered.
  const titleId = `${id}-title`;
  const labelledBy = lines.length > 0 || kicker ? titleId : undefined;
  const items = amenities.map((a, i) => ({ ...a, key: a.slug ?? a.id ?? String(i), photo: a.images?.find((m) => m.kind === 'IMAGE') ?? null }));
  if (items.length === 0) return null;
  const current = items[Math.min(active, items.length - 1)]!;
  const note = (it: (typeof items)[number]) => it.photo?.note || (it.photo?.caption ?? '');
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
      data-ground="night"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : 'Amenities'}
    >
      <div className="container">
        <header className={styles.head}>
          {kicker && <p id={lines.length > 0 ? undefined : titleId} className={styles.kicker}>{kicker}</p>}
          {lines.length > 0 && <RevealText as="h2" id={titleId} className={styles.title} lines={lines.length > 1 ? [lines.join(' ')] : lines} />}
          {lead && <p className="lead">{lead}</p>}
        </header>

        <div className={styles.layout}>
          <ul className={styles.list}>
            {items.map((it, i) => (
              <li key={it.key} className={styles.entry} data-active={i === active ? 'true' : 'false'}>
                <div className={styles.mobileMedia}>{media(it, '82vw')}</div>
                <button
                  type="button"
                  className={styles.item}
                  aria-expanded={i === active}
                  aria-controls={`${id}-${it.key}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <span className={styles.name}>{it.name}</span>
                </button>
                <div id={`${id}-${it.key}`} className={styles.desc}>
                  <div>
                    <p>{it.shortDescription ?? it.descriptionMd ?? ''}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.frame} aria-hidden="true">
            {items.map((it, i) => (
              <div key={it.key} className={styles.slide} data-active={i === active ? 'true' : 'false'}>
                {media(it, '(max-width: 900px) 100vw, 56vw')}
              </div>
            ))}
            <p className={`cgi-note ${styles.note}`}>{note(current)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
