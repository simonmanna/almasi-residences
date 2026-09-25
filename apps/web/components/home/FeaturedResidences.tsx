'use client';

import Link from 'next/link';
import { formatMoney } from '@avida/types';
import type { PublicResidenceCardDto } from '../../lib/api';
import { STATUS_TEXT, TYPE_TEXT, visiblePriceMinor } from '../../lib/residences';
import { useResidenceShortlist } from '../../lib/shortlist';
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
  const shortlist = useResidenceShortlist();
  const live = items
    .map((card) => ({ card, r: residences.find((x) => x.id === card.id) }))
    .filter((x): x is { card: PublicResidenceCardDto; r: NonNullable<typeof x.r> } => Boolean(x.r));
  if (live.length === 0) return null;

  return (
    <section className={`section ${styles.section}`} data-ground="night" aria-labelledby="featured-title">
      <div className="container">
        <header className={styles.head}>
          <div>
            <p className={`eyebrow ${styles.eyebrow}`}>Our Residences</p>
            <p className={`mark kicker-lg ${styles.kicker}`}>Selected Residences</p>
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
                  {/* Phones: the type rides on the photograph as a small plate. */}
                  <span className={styles.plate} aria-hidden="true">
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" focusable="false">
                      <path d="M6 0.6 11.4 5 6 11.4 0.6 5Z" />
                    </svg>
                    {TYPE_TEXT[r.type]}
                  </span>
                  <div className={styles.text}>
                    <p className="eyebrow">{TYPE_TEXT[r.type]}</p>
                    <h3 className="h3">Residence {r.label}</h3>
                    <p className={styles.size}>
                      {r.areaSqm} m² · {r.floorLabel}
                    </p>
                    <p className={styles.where}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
                        <path d="M12 20.5s-6.5-5.6-6.5-10.6a6.5 6.5 0 0 1 13 0c0 5-6.5 10.6-6.5 10.6Z" />
                        <circle cx="12" cy="9.9" r="2.3" />
                      </svg>
                      {r.floorLabel} · faces {r.orientation}
                    </p>
                    <div className={styles.facts}>
                      <span>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" focusable="false">
                          <path d="M3.5 19V8.5M3.5 14h17v5M20.5 19v-3.5A1.5 1.5 0 0 0 19 14M6.5 14v-2.2a1.3 1.3 0 0 1 1.3-1.3h4.4a1.3 1.3 0 0 1 1.3 1.3V14" />
                        </svg>
                        {r.bedrooms} {r.bedrooms === 1 ? 'Bed' : 'Beds'}
                      </span>
                      {r.bathrooms !== null && (
                        <span>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" focusable="false">
                            <path d="M4 12h16v2.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM6.5 12V6a2 2 0 0 1 3.6-1.2M7 19.5 6 21M17 19.5l1 1.5" />
                          </svg>
                          {r.bathrooms} {r.bathrooms === 1 ? 'Bath' : 'Baths'}
                        </span>
                      )}
                      <span>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" focusable="false">
                          <rect x="4" y="4" width="16" height="16" rx="1.5" />
                          <path d="M8 16 16 8M11.5 8H16v4.5" />
                        </svg>
                        {r.areaSqm} m²
                      </span>
                      <b className={styles.price}>
                        {price !== null ? formatMoney({ amountMinor: price, currency: r.currency }) : STATUS_TEXT[r.publicStatus]}
                      </b>
                    </div>
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
                <button
                  type="button"
                  className={styles.save}
                  aria-pressed={shortlist.favorites.includes(r.id)}
                  aria-label={shortlist.favorites.includes(r.id) ? `Remove residence ${r.label} from saved` : `Save residence ${r.label}`}
                  onClick={() => shortlist.toggleFavorite(r.id)}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
