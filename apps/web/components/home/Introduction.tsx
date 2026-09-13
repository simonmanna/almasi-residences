'use client';

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
}: {
  handover: string | null;
  title: string;
  body: string;
  kicker: string;
  developmentName: string;
  buildingConfig?: string | null;
}) {
  const { summary } = useInventory();
  const facts = [
    { label: 'Private residences', value: String(summary.total) },
    ...typesPresent(summary).map((t) => ({ label: t === 'penthouse' ? 'Penthouses' : TYPE_TEXT[t], value: String(summary.byType[t].total) })),
    ...(buildingConfig ? [{ label: 'Basement, ground and upper floors', value: buildingConfig.replace(/\s+/g, '') }] : []),
    ...(handover ? [{ label: 'Planned handover', value: handover }] : []),
  ];
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
    <section className={`section ${styles.intro}`} aria-labelledby="intro-title">
      <div className="container">
        {kicker && <p className={`mark ${styles.kicker}`}>{kicker}</p>}
        <RevealText
          as="h2"
          id="intro-title"
          className={`display ${styles.statement}`}
          lines={[`${summary.total} private residences.`, ...(title ? [title] : [])]}
        />
        <div className={styles.grid}>
          {body && <p className={styles.lead}>{lead}</p>}
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
