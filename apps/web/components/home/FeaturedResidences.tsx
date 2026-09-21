'use client';

import Link from 'next/link';
import { formatMoney } from '@avida/types';
import type { PublicResidenceCardDto } from '../../lib/api';
import { STATUS_TEXT, TYPE_TEXT, visiblePriceMinor } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { Reveal } from '../ui/Reveal';
import { RevealText } from '../ui/RevealText';
import { SceneImage } from '../ui/SceneImage';
import styles from './FeaturedResidences.module.css';

/**
 * §48 — the residences the developer chose to feature, marked in the admin.
 * Their status and price are read from the live inventory, so a featured
 * residence that sells changes here within the minute.
 */
export function FeaturedResidences({ items }: { items: PublicResidenceCardDto[] }) {
  const { residences } = useInventory();
  const live = items
    .map((card) => ({ card, r: residences.find((x) => x.id === card.id) }))
    .filter((x): x is { card: PublicResidenceCardDto; r: NonNullable<typeof x.r> } => Boolean(x.r));
  if (live.length === 0) return null;

  return (
    <section className={`section ${styles.section}`} data-ground="night" aria-labelledby="featured-title">
      <div className="container">
        <header className={styles.head}>
          <div>
            <p className={`mark kicker-lg ${styles.kicker}`}>Selected</p>
            <RevealText as="h2" id="featured-title" className="title-sm" lines={['Residences Worth A Closer Look.']} />
          </div>
          <div className={styles.aside}>
            <Link href="/residences" className="link-line">
              See every residence
            </Link>
          </div>
        </header>
        <ul className={styles.grid}>
          {live.map(({ card, r }) => {
            const price = visiblePriceMinor(r);
            return (
              <li key={r.id} className={styles.item} data-reveal>
                <Link href={`/residences/${r.slug}`} className={styles.card} data-cursor="View">
                  <Reveal className={styles.media}>
                    <SceneImage media={card.cover} sizes="(max-width: 700px) 100vw, 33vw" label={`Residence ${r.label}`} />
                  </Reveal>
                  <div className={styles.text}>
                    <p className="eyebrow">{TYPE_TEXT[r.type]}</p>
                    <h3 className="h3">Residence {r.label}</h3>
                    <p className={styles.size}>
                      {r.areaSqm} m² · {r.floorLabel}
                    </p>
                    <p className={styles.line}>{card.shortDescription ?? `${TYPE_TEXT[r.type]}, facing ${r.orientation}.`}</p>
                    <dl className={styles.meta}>
                      <div>
                        <dt>Bedrooms</dt>
                        <dd>{r.bedrooms}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          <span className="status" data-status={r.publicStatus}>
                            {STATUS_TEXT[r.publicStatus]}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Price</dt>
                        <dd>{price !== null ? formatMoney({ amountMinor: price, currency: r.currency }) : 'On request'}</dd>
                      </div>
                    </dl>
                    <span className={`lux-cta ${styles.cta}`}>
                      View residence <span className="btn-arrow" aria-hidden="true">→</span>
                    </span>
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
