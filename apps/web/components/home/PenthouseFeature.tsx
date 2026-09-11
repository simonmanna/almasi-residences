'use client';

import Link from 'next/link';
import { formatCount } from '@avida/types';
import { PROVENANCE_NOTE, scene } from '../../lib/media-manifest';
import { STATUS_TEXT } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { RevealText } from '../ui/RevealText';
import styles from './PenthouseFeature.module.css';

/** 08 — the top floor, with each penthouse's live status. */
export function PenthouseFeature() {
  const { residences, summary } = useInventory();
  const penthouses = residences.filter((r) => r.type === 'penthouse').sort((a, b) => a.positionIndex - b.positionIndex);
  const ph = summary.byType.penthouse;
  const largest = [...penthouses].sort((a, b) => b.areaSqm - a.areaSqm)[0];

  return (
    <section className={styles.section} data-ground="night" aria-labelledby="penthouse-title">
      <div className={styles.media}>
        <MotionMedia id="ph-terrace" loop sizes="(max-width: 960px) 100vw, 58vw" />
        <p className={`cgi-note ${styles.note}`}>{PROVENANCE_NOTE[scene('ph-terrace').provenance]}</p>
      </div>

      <div className={styles.text}>
        <p className={`mark ${styles.kicker}`}>The penthouses</p>
        <RevealText
          as="h2"
          id="penthouse-title"
          className="h2"
          lines={['The top floor,', `in ${formatCount(ph.total).toLowerCase()} residences.`]}
        />
        <p className="lead">
          From {ph.areaMin} to {ph.areaMax} m², glazed on three sides above the treetops.
          {largest ? ` ${largest.label} is a duplex with its own roof terrace and pool.` : ''}
        </p>

        <ul className={styles.list}>
          {penthouses.map((r) => (
            <li key={r.id}>
              <Link href={`/residences/${r.slug}`} className={styles.row}>
                <span className={styles.code}>{r.label}</span>
                <span className={styles.meta}>
                  {r.bedrooms} bedrooms
                  <br />
                  <span className="tabular">{r.areaSqm} m²</span>
                </span>
                <span className="status" data-status={r.publicStatus}>
                  {STATUS_TEXT[r.publicStatus]}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.ctas}>
          <Link href="/tour/penthouse" className="btn btn--solid">
            Take the penthouse tour
          </Link>
          <Link href="/residences?type=penthouse" className="btn btn--ghost">
            Penthouse availability
          </Link>
        </div>
      </div>
    </section>
  );
}
