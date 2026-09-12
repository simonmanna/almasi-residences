'use client';

import Link from 'next/link';
import { formatCount, formatMoney } from '@avida/types';
import { TYPE_MEDIA } from '../../lib/media-manifest';
import { typesPresent, type ResidenceType } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { Reveal } from '../ui/Reveal';
import { RevealText } from '../ui/RevealText';
import { SceneImage } from '../ui/SceneImage';
import styles from './ResidencesPreview.module.css';

const COPY: Record<ResidenceType, { title: string; line: string }> = {
  'one-bedroom': {
    title: 'One bedroom',
    line: 'An open living and dining room, a bedroom behind a full-height door, and a balcony of its own.',
  },
  'two-bedroom': {
    title: 'Two bedroom',
    line: 'Two bedrooms and two bathrooms, the main suite with a walk-in wardrobe, the living room onto the balcony.',
  },
  'three-bedroom': {
    title: 'Three bedroom',
    line: 'Three bedrooms for a family, with room to entertain and a balcony onto the hills.',
  },
  penthouse: {
    title: 'Penthouse',
    line: 'The top floor, from wrap-around glass to a duplex with its own roof terrace and pool.',
  },
};

/** 04 — the residence groups that exist, each with its live count and lowest available price. */
export function ResidencesPreview() {
  const { summary } = useInventory();
  const types = typesPresent(summary);
  const areas = types.map((t) => summary.byType[t]);
  const min = areas.length ? Math.min(...areas.map((t) => t.areaMin)) : 0;
  const max = areas.length ? Math.max(...areas.map((t) => t.areaMax)) : 0;

  return (
    <section id="residences" className={`section ${styles.section}`} aria-labelledby="residences-title">
      <div className="container">
        <header className={styles.head}>
          <div>
            <p className={`mark ${styles.kicker}`}>Residences</p>
            <RevealText as="h2" id="residences-title" className="h2" lines={[`${formatCount(types.length || 3)} ways`, 'to live here.']} />
          </div>
          <div className={styles.aside}>
            <p className="lead">
              {summary.available} of {summary.total} residences are available today, from {min} to {max} m².
            </p>
            <Link href="/residences" className="link-line">
              See all {summary.total} residences
            </Link>
          </div>
        </header>

        <ul className={styles.grid}>
          {types.map((t) => {
            const s = summary.byType[t];
            return (
              <li key={t} className={styles.item}>
                <Link href={`/residences?type=${t}`} className={styles.card} data-cursor="Explore">
                  <Reveal className={styles.media}>
                    <SceneImage id={TYPE_MEDIA[t].hero} sizes="(max-width: 900px) 100vw, 33vw" />
                  </Reveal>
                  <div className={styles.text}>
                    <h3 className="h3">{COPY[t].title}</h3>
                    <p className={styles.size}>
                      {s.areaMin === s.areaMax ? s.areaMin : `${s.areaMin}–${s.areaMax}`} m²
                    </p>
                    <p className={styles.line}>{COPY[t].line}</p>
                    <dl className={styles.meta}>
                      <div>
                        <dt>Residences</dt>
                        <dd>{s.total}</dd>
                      </div>
                      <div>
                        <dt>Available</dt>
                        <dd>{s.available}</dd>
                      </div>
                      <div>
                        <dt>From</dt>
                        <dd>
                          {s.priceFromMinor !== null
                            ? formatMoney({ amountMinor: s.priceFromMinor, currency: 'USD' })
                            : 'On request'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
