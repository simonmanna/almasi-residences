'use client';

import { useState } from 'react';
import { formatDistance } from '@avida/types';
import type { LandmarkDto } from '../../lib/api';
import { RevealText } from '../ui/RevealText';
import { KigaliMap } from './KigaliMap';
import styles from './LocationExperience.module.css';

const CATEGORY_TEXT: Record<string, string> = {
  BUSINESS: 'Business',
  SHOPPING: 'Shopping',
  HOSPITAL: 'Health',
  SCHOOL: 'School',
  AIRPORT: 'Airport',
  LEISURE: 'Leisure',
  EMBASSY: 'Embassy',
};

/**
 * 07 — In the heart of Kigali. Distances are computed by PostGIS from the
 * site's coordinates (never typed in); drive times are the API's modelled
 * estimates, and the page says so.
 */
export function LocationExperience({
  landmarks,
  latitude,
  longitude,
  id = 'location',
}: {
  landmarks: LandmarkDto[];
  latitude: number;
  longitude: number;
  id?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...landmarks].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));

  return (
    <section id={id} className={`section ${styles.section}`} aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.text}>
          <p className={styles.kicker}>Location</p>
          <RevealText as="h2" id={`${id}-title`} className={styles.title} lines={['In the heart of Kigali']} />
          <p className="lead">
            Kimihurura rises just east of the city centre: embassies, restaurants and the Convention
            Centre on one side, the golf course and the airport road on the other, and quiet,
            tree-lined streets in between.
          </p>

          <ul className={styles.list} aria-label="Nearby, by distance">
            {sorted.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={styles.row}
                  data-active={active === l.id ? 'true' : 'false'}
                  onMouseEnter={() => setActive(l.id)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(l.id)}
                  onBlur={() => setActive(null)}
                >
                  <span className={styles.name}>{l.name}</span>
                  <span className={styles.cat}>{CATEGORY_TEXT[l.category] ?? l.category}</span>
                  <span className={styles.dist}>{l.distanceM !== null ? formatDistance(l.distanceM) : ''}</span>
                  <span className={styles.time}>{l.driveMinutes ? `${l.driveMinutes} min by car` : ''}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="caption">
            Straight-line distances from the site. Drive times are estimates at an average city speed.
          </p>
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
          <KigaliMap landmarks={sorted} origin={{ lat: latitude, lng: longitude }} active={active} />
        </div>
      </div>
    </section>
  );
}
