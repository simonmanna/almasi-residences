'use client';

import Link from 'next/link';
import { formatMoney } from '@avida/types';
import type { TypologyCardDto } from '../../lib/api';
import { fillCopy } from '../../lib/copy-tokens';
import { residenceType, TYPE_TEXT, typesPresent, type ResidenceType } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import { SceneImage } from '../ui/SceneImage';
import styles from './ResidencesPreview.module.css';

/** 04 — the residence groups that exist, each with its live count and lowest available price. */
export function ResidencesPreview({
  cards,
  kicker,
  title,
  priceText = {},
}: {
  cards: TypologyCardDto[];
  kicker: string;
  title: string;
  /** Website → Prices: a type's own words; a type absent is calculated. */
  priceText?: Partial<Record<ResidenceType, string>>;
}) {
  const { summary, currency } = useInventory();
  const types = typesPresent(summary);
  // A group's words and picture, each from the first residence type of that kind
  // that has one. They may come from different types: a group whose first type
  // carries words but no photograph used to draw an empty frame.
  const ofType = (t: ResidenceType) => cards.filter((c) => residenceType(c.isPenthouse, c.bedrooms) === t);
  const coverFor = (t: ResidenceType) => ofType(t).find((c) => c.cover)?.cover ?? null;
  const summaryFor = (t: ResidenceType) => ofType(t).find((c) => c.summary)?.summary ?? null;
  const lines = fillCopy(title, summary).split('|').map((l) => l.trim()).filter(Boolean);
  const areas = types.map((t) => summary.byType[t]);
  const min = areas.length ? Math.min(...areas.map((t) => t.areaMin)) : 0;
  const max = areas.length ? Math.max(...areas.map((t) => t.areaMax)) : 0;

  return (
    <section id="residences" className={`section ${styles.section}`} data-ground="quiet" aria-labelledby="residences-title">
      <div className="container">
        <header className={styles.head}>
          <div>
            <p className={`eyebrow ${styles.eyebrow}`}>Our Residences</p>
            {kicker && <p className={`mark kicker-lg ${styles.kicker}`}>{kicker}</p>}
            {lines.length > 0 && <RevealText as="h2" id="residences-title" className="title-sm" lines={[lines.join(' ')]} />}
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
          {types.map((t, i) => {
            const s = summary.byType[t];
            const words = summaryFor(t);
            return (
              <li key={t} className={styles.item} data-reveal style={{ '--reveal-i': i } as React.CSSProperties}>
                <Link href={`/residences?type=${t}`} className={`lux-card ${styles.card}`} data-cursor="Explore">
                  <div className={`lux-card__media ${styles.media}`}>
                    <SceneImage media={coverFor(t)} sizes="(max-width: 900px) 100vw, 33vw" label={TYPE_TEXT[t]} />
                    <span className={styles.badge} data-none={s.available === 0 ? 'true' : undefined}>
                      {s.available > 0 ? `${s.available} available` : 'Fully reserved'}
                    </span>
                  </div>
                  <div className={`lux-card__body ${styles.text}`}>
                    <h3 className={styles.name}>{TYPE_TEXT[t]}</h3>
                    <p className={styles.size}>
                      {s.areaMin === s.areaMax ? s.areaMin : `${s.areaMin}–${s.areaMax}`} m²
                    </p>
                    {words && <p className={styles.line}>{words}</p>}
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
                          {priceText[t] ??
                            (s.priceFromMinor !== null
                            ? formatMoney({ amountMinor: s.priceFromMinor, currency })
                              : 'On request')}
                        </dd>
                      </div>
                    </dl>
                    <span className={`lux-cta ${styles.cta}`}>
                      View residences <span className="btn-arrow" aria-hidden="true">→</span>
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
