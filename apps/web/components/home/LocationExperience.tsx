'use client';

import { useMemo, useState } from 'react';
import { formatDistance } from '@avida/types';
import type { LandmarkDto } from '../../lib/api';
import { useContact } from '../providers/ContactProvider';
import { RevealText } from '../ui/RevealText';
import { CATEGORY_LABEL, KigaliMap } from './KigaliMap';
import styles from './LocationExperience.module.css';

/**
 * 07 — In the heart of Kigali. The words come from the CMS (Homepage
 * location); the places from Website → Location in the admin. Distances are
 * computed by PostGIS from the coordinates unless the admin typed them; drive
 * times are modelled estimates, and the footnote says so.
 *
 * The list and the map are one instrument: hovering either highlights the
 * other, clicking either pins a card open, and the category filter thins
 * both at once.
 */
export function LocationExperience({
  landmarks,
  latitude,
  longitude,
  kicker,
  title,
  lede,
  note,
  id = 'location',
  ground = 'quiet',
}: {
  landmarks: LandmarkDto[];
  latitude: number;
  longitude: number;
  kicker: string;
  title: string;
  lede: string;
  note: string;
  id?: string;
  ground?: 'stone' | 'quiet' | 'night';
}) {
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const contact = useContact();

  const sorted = useMemo(
    () => [...landmarks].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9)),
    [landmarks],
  );

  // Only the categories this development actually has, in order of how many.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of sorted) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sorted]);

  const shown = filter ? sorted.filter((l) => l.category === filter) : sorted;

  // A pin that has just been filtered away must not stay pinned open.
  const inView = (landmarkId: string | null) =>
    landmarkId && shown.some((l) => l.id === landmarkId) ? landmarkId : null;

  const pick = (landmarkId: string) =>
    setSelected((s) => (s === landmarkId ? null : landmarkId));

  return (
    <section id={id} className={`section ${styles.section}`} data-ground={ground} aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.text}>
          {kicker && <p id={title ? undefined : `${id}-title`} className={`kicker-lg ${styles.kicker}`}>{kicker}</p>}
          {title && <RevealText as="h2" id={`${id}-title`} className="title-sm" lines={[title]} />}
          {lede && <p className="lead">{lede}</p>}

          {categories.length > 1 && (
            <div className={styles.filters} role="group" aria-label="Filter nearby places by kind">
              <button
                type="button"
                className={styles.chip}
                data-on={filter === null ? 'true' : 'false'}
                aria-pressed={filter === null}
                onClick={() => setFilter(null)}
              >
                All
                <span className={styles.chipCount}>{sorted.length}</span>
              </button>
              {categories.map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  className={styles.chip}
                  data-category={cat}
                  data-on={filter === cat ? 'true' : 'false'}
                  aria-pressed={filter === cat}
                  onClick={() => setFilter((f) => (f === cat ? null : cat))}
                >
                  <span className={styles.swatch} aria-hidden="true" />
                  {CATEGORY_LABEL[cat] ?? cat}
                  <span className={styles.chipCount}>{count}</span>
                </button>
              ))}
            </div>
          )}

          <ul className={styles.list} aria-label="Nearby, by distance">
            {shown.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={styles.row}
                  data-category={l.category}
                  data-active={active === l.id || selected === l.id ? 'true' : 'false'}
                  aria-pressed={selected === l.id}
                  onMouseEnter={() => setActive(l.id)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(l.id)}
                  onBlur={() => setActive(null)}
                  onClick={() => pick(l.id)}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.name}>{l.name}</span>
                  <span className={styles.cat}>{CATEGORY_LABEL[l.category] ?? l.category}</span>
                  <span className={styles.dist}>{l.distanceM !== null ? formatDistance(l.distanceM) : ''}</span>
                  <span className={styles.time}>{l.driveMinutes ? `${l.driveMinutes} min by car` : ''}</span>
                </button>
              </li>
            ))}
          </ul>

          {note && <p className="caption">{note}</p>}
          <a
            className={`link-line ${styles.maps}`}
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the site in Google Maps
          </a>
        </div>

        <div className={styles.mapCol}>
          <KigaliMap
            landmarks={sorted}
            origin={{ lat: latitude, lng: longitude }}
            filter={filter}
            active={inView(active)}
            selected={inView(selected)}
            onHover={setActive}
            onSelect={setSelected}
            originLabel={contact.developmentName || undefined}
          />
        </div>
      </div>
    </section>
  );
}
