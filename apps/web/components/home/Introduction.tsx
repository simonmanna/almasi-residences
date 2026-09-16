'use client';

import Image from 'next/image';
import Link from 'next/link';
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

  const statementLines = [
    `${summary.total} private residences.`,
    ...(title ? [title] : []),
  ];

  return (
    <section className={styles.intro} data-ground="night" aria-labelledby="intro-title">
      <div className={styles.media} aria-hidden="true">
        <Image
          src="/media/introduction.png"
          alt=""
          fill
          sizes="100vw"
          quality={82}
          className={styles.image}
        />
        <div className={styles.scrim} />
      </div>

      <div className={`container ${styles.inner}`}>
        <div className={styles.statement}>
          <RevealText
            as="h2"
            id="intro-title"
            className={`display ${styles.statementHead}`}
            lines={statementLines}
          />
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
        </div>
      </div>
    </section>
  );
}
