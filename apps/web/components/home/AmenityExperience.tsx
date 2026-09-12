'use client';

import { useState } from 'react';
import type { PublicMediaDto } from '../../lib/api';
import { PROVENANCE_NOTE, scene, type SceneId } from '../../lib/media-manifest';
import { ApiImage } from '../ui/ApiImage';
import { RevealText } from '../ui/RevealText';
import { SceneImage } from '../ui/SceneImage';
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
 * Artwork for an amenity that has no photograph in the media library yet,
 * paired by its handle or icon. Presentation only: which amenities exist, in
 * what order and with what words, is decided in the admin (§19).
 *
 * There is deliberately no default. An amenity the developer adds without an
 * uploaded photograph shows an empty frame that says so — showing the lobby
 * instead would put the wrong room behind the right name.
 */
const SCENE_BY_KEY: Record<string, SceneId> = {
  'swimming-pool': 'pool',
  pool: 'pool',
  restaurant: 'restaurant',
  gym: 'gym',
  fitness: 'gym',
  sauna: 'wellness',
  'massage-room': 'wellness',
  spa: 'wellness',
  wellness: 'wellness',
  'co-working': 'cowork',
  'residents-working-space': 'cowork',
  work: 'cowork',
  reception: 'lobby',
  lobby: 'lobby',
  concierge: 'lobby',
  'basement-parking': 'parking',
  parking: 'parking',
};

const sceneFor = (a: AmenityInput): SceneId | null => SCENE_BY_KEY[a.slug ?? ''] ?? SCENE_BY_KEY[a.iconKey ?? ''] ?? null;

/**
 * 06 — The art of living. Not a grid of icons: the names are set large, and
 * pointing at one brings its space into the frame beside it. On a phone the
 * same list becomes a row of images to swipe.
 */
export function AmenityExperience({
  amenities,
  id = 'amenities',
  kicker = 'Amenities',
  lines = ['The art', 'of living'],
  lead = 'Everything a resident uses every day is inside the gate, from the pool deck on level one to the parking bay below.',
}: {
  amenities: AmenityInput[];
  id?: string;
  kicker?: string;
  lines?: string[];
  lead?: string;
}) {
  const [active, setActive] = useState(0);
  const items = amenities.map((a, i) => ({ ...a, key: a.slug ?? a.id ?? String(i), photo: a.images?.find((m) => m.kind === 'IMAGE') ?? null }));
  if (items.length === 0) return null;
  const current = items[Math.min(active, items.length - 1)]!;
  const note = (it: (typeof items)[number]) => {
    if (it.photo) return it.photo.caption ?? '';
    const id = sceneFor(it);
    return id ? PROVENANCE_NOTE[scene(id).provenance] : '';
  };
  const media = (it: (typeof items)[number], sizes: string) => {
    if (it.photo) return <ApiImage m={it.photo} sizes={sizes} />;
    const id = sceneFor(it);
    if (id) return <SceneImage id={id} sizes={sizes} />;
    return (
      <div className={styles.placeholder}>
        <p className="mark">{it.name}</p>
        <p>Photography to follow</p>
      </div>
    );
  };

  return (
    <section id={id} className={`section ${styles.section}`} data-ground="night" aria-labelledby={`${id}-title`}>
      <div className="container">
        <header className={styles.head}>
          <p className={`mark ${styles.kicker}`}>{kicker}</p>
          <RevealText as="h2" id={`${id}-title`} className="h2" lines={lines} />
          <p className="lead">{lead}</p>
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
