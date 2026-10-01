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
 * Two columns that do not overlap: the words hold the left on solid dusk, the
 * render holds the right and is allowed to be bright. Nothing is set over the
 * facade, so nothing has to be rescued by a scrim. The render here is the close
 * facade crop — a second, nearer look at the building the hero showed whole.
 */
const DETAIL_STILL = '/media/introduction-arrival-v2.png';
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

  // One sentence per line: "A Rare Place. / Thoughtfully Designed." sits on two
  // lines instead of wrapping to three mid-phrase.
  const titleLines = title.split(/(?<=[.!?])\s+/).filter(Boolean);

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


  // The ground is "night", not "quiet": this section paints its own dusk
  // gradient, and the quiet ground's dark walnut ink was being set on top of
  // it — the headline and all three figures were brown on brown.
  return (
    <section className={styles.intro} data-ground="night" aria-labelledby="intro-title">
      <div className={`container ${styles.inner}`}>
        <div className={styles.statement}>
          {/* The count is the eyebrow; the address is the headline. It used to
              be the other way round, which read as an accident. */}
          <p className={`mark ${styles.eyebrow}`}>{summary.total} private residences</p>
          {title && <RevealText as="h2" id="intro-title" className={styles.title} lines={titleLines} />}
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
              {/* An outlined button beside a solid one read as a disabled
                  twin on this ground; a ruled line reads as a second choice. */}
              {secondary && (
                <Link href={secondary.href} className={`link-line ${styles.quietCta}`}>
                  {secondary.label}
                </Link>
              )}
            </div>
          )}
          {stats.length > 0 && (
            <dl className={styles.stats}>
              {stats.map((st) => (
                <div key={st.label} className={`stat ${styles.stat}`}>
                  <dt className="stat__label">{st.label}</dt>
                  <dd className="stat__value">{st.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className={styles.media}>
          <Image
            src={DETAIL_STILL}
            alt="The illuminated entrance and planted glass balconies of Almasi Residence at blue hour"
            fill
            sizes="(max-width: 900px) 100vw, 48vw"
            quality={82}
            className={styles.image}
          />
          <div className={styles.mediaEdge} aria-hidden="true" />
          <div className={styles.mediaMeta} aria-hidden="true">
            <span className="mark">The arrival</span>
            <span>{developmentName}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
