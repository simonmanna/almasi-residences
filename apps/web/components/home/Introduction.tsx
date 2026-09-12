'use client';

import { TYPE_TEXT, typesPresent } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import styles from './Introduction.module.css';

const DEFAULT_BODY =
  'Almasi is Swahili for diamond. Stone, walnut and glass on a quiet rise in Kimihurura, planned to feel like fewer homes than it holds: generous rooms, deep balconies, and a floor of amenities that gives a reason to leave the apartment without leaving the building.';

/**
 * 02 — the statement. Every count in it is read from the live inventory; the
 * words come from the CMS (Homepage → introduction) and fall back to these.
 */
export function Introduction({
  handover,
  title = 'One distinct address.',
  body = DEFAULT_BODY,
  kicker = 'Kimihurura, Kigali',
  buildingConfig,
}: {
  handover: string;
  title?: string;
  body?: string;
  kicker?: string;
  buildingConfig?: string | null;
}) {
  const { summary } = useInventory();
  const facts = [
    { label: 'Private residences', value: String(summary.total) },
    ...typesPresent(summary).map((t) => ({ label: t === 'penthouse' ? 'Penthouses' : TYPE_TEXT[t], value: String(summary.byType[t].total) })),
    ...(buildingConfig ? [{ label: 'Basement, ground and upper floors', value: buildingConfig.replace(/\s+/g, '') }] : []),
    { label: 'Planned handover', value: handover },
  ];
  const lead = body.startsWith('Almasi ') ? (
    <>
      <em>Almasi</em>
      {body.slice(6)}
    </>
  ) : (
    body
  );

  return (
    <section className={`section ${styles.intro}`} aria-labelledby="intro-title">
      <div className="container">
        <p className={`mark ${styles.kicker}`}>{kicker}</p>
        <RevealText
          as="h2"
          id="intro-title"
          className={`display ${styles.statement}`}
          lines={[`${summary.total} private residences.`, title]}
        />
        <div className={styles.grid}>
          <p className={styles.lead}>{lead}</p>
          <dl className={styles.facts}>
            {facts.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt className={styles.label}>{f.label}</dt>
                <dd className={styles.value}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
