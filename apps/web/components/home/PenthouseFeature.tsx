'use client';

import Link from 'next/link';
import { STATUS_TEXT } from '../../lib/residences';
import { fillCopy } from '../../lib/copy-tokens';
import { useInventory } from '../providers/InventoryProvider';
import { useSlot } from '../providers/MediaSlotsProvider';
import { MotionMedia } from '../ui/MotionMedia';
import { RevealText } from '../ui/RevealText';
import styles from './PenthouseFeature.module.css';

/** 08 — the top floor, with each penthouse's live status. */
export function PenthouseFeature({ kicker, title, lede }: { kicker: string; title: string; lede: string }) {
  const { residences, summary } = useInventory();
  const slot = useSlot('home-penthouse');
  const penthouses = residences.filter((r) => r.type === 'penthouse').sort((a, b) => a.positionIndex - b.positionIndex);
  if (penthouses.length === 0) return null;
  const lines = fillCopy(title, summary).split('|').map((l) => l.trim()).filter(Boolean);

  return (
    <section className={styles.section} data-ground="night" aria-labelledby="penthouse-title">
      <div className={styles.media}>
        <MotionMedia image={slot.image} video={slot.video} loop sizes="(max-width: 960px) 100vw, 58vw" label="Penthouse feature" />
        <p className={`cgi-note ${styles.note}`}>{slot.image?.note ?? ''}</p>
      </div>

      <div className={styles.text}>
        {kicker && <p className={`mark ${styles.kicker}`}>{kicker}</p>}
        {lines.length > 0 && <RevealText as="h2" id="penthouse-title" className="h2" lines={lines} />}
        {lede && <p className="lead">{fillCopy(lede, summary)}</p>}

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
