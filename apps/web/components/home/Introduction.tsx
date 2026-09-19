'use client';

import Image from 'next/image';
import Link from 'next/link';
import { typesPresent } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import styles from './Introduction.module.css';

/**
 * 02 — the statement. Every count in it is read from the live inventory; the
 * words come from the CMS (Homepage → introduction); an empty field renders nothing.
 *
 * A simple, generous layout: a single column on the left of the page with a
 * display headline, a short body, and a pair of CTAs. The image stays as a
 * low-contrast backdrop on the right.
 */
export function Introduction({
  title,
  body,
  developmentName,
  buildingConfig,
  primary,
  secondary,
}: {
  handover: string | null;
  title: string;
  body: string;
  kicker: string;
  developmentName: string;
  buildingConfig?: string | null;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  const { summary } = useInventory();

  const areas = typesPresent(summary).map((t) => summary.byType[t]);
  const stats = [
    { value: String(summary.total), label: 'Private residences' },
    buildingConfig ? { value: buildingConfig, label: 'Floors' } : null,
    areas.length
      ? { value: `${Math.min(...areas.map((a) => a.areaMin))}–${Math.max(...areas.map((a) => a.areaMax))} m²`, label: 'Residence sizes' }
      : null,
  ].filter((x): x is { value: string; label: string } => x !== null);

  const name = developmentName.split(' ')[0] ?? '';
  const lead =
    name && body.startsWith(`${name} `) ? (
      <>
        <em>{name}</em>
        {body.slice(name.length)}
      </>
    ) : (
      body
    );


  return (
    <section className={styles.intro} data-ground="quiet" aria-labelledby="intro-title">
      <div className={styles.media} aria-hidden="true">
        <Image
          src="/media/introduction.png"
          alt=""
          fill
          sizes="100vw"
          quality={82}
          className={styles.image}
        />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.statement}>
          <RevealText
            as="p"
            className="kicker-lg"
            lines={[`${summary.total} private residences.`]}
          />
          {title && <RevealText as="h2" id="intro-title" className="title-sm" lines={[title]} />}
          {body && <p className={styles.lead}>{lead}</p>}
          {(primary || secondary) && (
            <div className={styles.ctas}>
              {primary && (
                <Link href={primary.href} className={`btn btn--solid ${styles.cta}`}>
                  {primary.label}
                  <span aria-hidden="true" className={styles.ctaArrow}>
                    →
                  </span>
                </Link>
              )}
              {secondary && (
                <Link href={secondary.href} className={`btn ${styles.cta}`}>
                  {secondary.label}
                </Link>
              )}
            </div>
          )}
          {stats.length > 0 && (
            <dl className={styles.stats}>
              {stats.map((st, i) => (
                <div key={st.label} className={`stat ${styles.stat}`} data-reveal style={{ '--reveal-i': i } as React.CSSProperties}>
                  <dt className="stat__label">{st.label}</dt>
                  <dd className="stat__value">{st.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}
