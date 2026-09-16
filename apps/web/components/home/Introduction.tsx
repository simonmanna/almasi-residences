'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TYPE_TEXT, typesPresent } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import styles from './Introduction.module.css';

/**
 * 02 — the statement. Every count in it is read from the live inventory; the
 * words come from the CMS (Homepage → introduction); an empty field renders nothing.
 */
export function Introduction({
  handover,
  title,
  body,
  kicker,
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
  const facts = [
    { label: 'Private residences', value: String(summary.total) },
    ...typesPresent(summary).map((t) => ({ label: t === 'penthouse' ? 'Penthouses' : TYPE_TEXT[t], value: String(summary.byType[t].total) })),
    ...(buildingConfig ? [{ label: 'Floors', value: buildingConfig.replace(/\s+/g, '') }] : []),
    ...(handover ? [{ label: 'Handover', value: handover }] : []),
  ].slice(0, 4);
  const name = developmentName.split(' ')[0] ?? '';
  const lead = name && body.startsWith(`${name} `) ? (
    <>
      <em>{name}</em>
      {body.slice(name.length)}
    </>
  ) : (
    body
  );

  return (
    <section className={styles.intro} data-ground="night" aria-labelledby="intro-title">
      <div className={styles.media}>
        <Image
          src="/media/introduction.png"
          alt={`${developmentName || 'The building'} at dusk, seen from the street`}
          fill
          sizes="100vw"
          quality={82}
          className={styles.image}
        />
        <div className={styles.scrim} aria-hidden="true" />
      </div>

      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          {kicker && <p className={`mark ${styles.kicker}`}>{kicker}</p>}
          <RevealText
            as="h2"
            id="intro-title"
            className={`display ${styles.statement}`}
            lines={[`${summary.total} private residences.`, ...(title ? [title] : [])]}
          />
          {body && <p className={styles.lead}>{lead}</p>}
          {(primary || secondary) && (
            <div className={styles.ctas}>
              {primary && (
                <Link href={primary.href} className="btn btn--solid">
                  {primary.label}
                </Link>
              )}
              {secondary && (
                <Link href={secondary.href} className="btn">
                  {secondary.label}
                </Link>
              )}
            </div>
          )}
        </div>

        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label} className={styles.fact}>
              <dt className={styles.label}>{f.label}</dt>
              <dd className={styles.value}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
