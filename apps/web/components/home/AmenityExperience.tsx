'use client';

import { useState } from 'react';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { RevealText } from '../ui/RevealText';
import { SceneImage } from '../ui/SceneImage';
import styles from './AmenityExperience.module.css';

export interface AmenityInput {
  name: string;
  descriptionMd: string | null;
  iconKey: string | null;
}

/** The order a resident meets them, each tied to the API's amenity by its icon key. */
const ITEMS: { key: string; iconKey: string; title: string; scene: SceneId; fallback: string }[] = [
  { key: 'pool', iconKey: 'pool', title: 'Swimming pool', scene: 'pool', fallback: 'A fifteen-metre pool on the amenity deck.' },
  { key: 'restaurant', iconKey: 'restaurant', title: 'Restaurant', scene: 'restaurant', fallback: 'A ground-floor restaurant for residents and their guests.' },
  { key: 'fitness', iconKey: 'gym', title: 'Fitness', scene: 'gym', fallback: 'A gym with a view of the hills.' },
  { key: 'wellness', iconKey: 'spa', title: 'Wellness', scene: 'wellness', fallback: 'A sauna and a massage room.' },
  { key: 'cowork', iconKey: 'work', title: 'Co-working', scene: 'cowork', fallback: 'About 60 m² of shared working space.' },
  { key: 'reception', iconKey: 'concierge', title: 'Reception', scene: 'lobby', fallback: 'A staffed reception and lobby.' },
  { key: 'parking', iconKey: 'parking', title: 'Parking', scene: 'parking', fallback: 'A basement bay for every residence.' },
];

/**
 * 06 — The art of living. Not a grid of icons: the names are set large, and
 * pointing at one brings its space into the frame beside it. On a phone the
 * same list becomes a row of images to swipe.
 */
export function AmenityExperience({
  amenities,
  id = 'amenities',
}: {
  amenities: AmenityInput[];
  id?: string;
}) {
  const [active, setActive] = useState(0);
  const describe = (iconKey: string, fallback: string) =>
    amenities.find((a) => a.iconKey === iconKey)?.descriptionMd ?? fallback;
  const current = ITEMS[active]!;

  return (
    <section id={id} className={`section ${styles.section}`} data-ground="night" aria-labelledby={`${id}-title`}>
      <div className="container">
        <header className={styles.head}>
          <p className={`mark ${styles.kicker}`}>Amenities</p>
          <RevealText as="h2" id={`${id}-title`} className="h2" lines={['The art', 'of living']} />
          <p className="lead">
            Everything a resident uses every day is inside the gate, from the pool deck on level one to
            the parking bay below.
          </p>
        </header>

        <div className={styles.layout}>
          <ul className={styles.list}>
            {ITEMS.map((it, i) => (
              <li key={it.key} className={styles.entry} data-active={i === active ? 'true' : 'false'}>
                <div className={styles.mobileMedia}>
                  <SceneImage id={it.scene} sizes="82vw" />
                </div>
                <button
                  type="button"
                  className={styles.item}
                  aria-expanded={i === active}
                  aria-controls={`${id}-${it.key}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <span className={styles.name}>{it.title}</span>
                </button>
                <div id={`${id}-${it.key}`} className={styles.desc}>
                  <div>
                    <p>{describe(it.iconKey, it.fallback)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.frame} aria-hidden="true">
            {ITEMS.map((it, i) => (
              <div key={it.key} className={styles.slide} data-active={i === active ? 'true' : 'false'}>
                <SceneImage id={it.scene} sizes="(max-width: 900px) 100vw, 56vw" />
              </div>
            ))}
            <p className={`cgi-note ${styles.note}`}>{PROVENANCE_NOTE[scene(current.scene).provenance]}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
