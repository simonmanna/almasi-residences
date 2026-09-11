'use client';

import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import styles from './Introduction.module.css';

/** 02 — the statement. Every count in it is read from the live inventory. */
export function Introduction({ handover }: { handover: string }) {
  const { summary } = useInventory();
  const facts = [
    { label: 'Private residences', value: String(summary.total) },
    { label: 'One bedroom', value: String(summary.byType['one-bedroom'].total) },
    { label: 'Two bedroom', value: String(summary.byType['two-bedroom'].total) },
    { label: 'Penthouses', value: String(summary.byType.penthouse.total) },
    { label: 'Basement, ground and four floors', value: 'B+G+4' },
    { label: 'Planned handover', value: handover },
  ];

  return (
    <section className={`section ${styles.intro}`} aria-labelledby="intro-title">
      <div className="container">
        <p className={`mark ${styles.kicker}`}>Kimihurura, Kigali</p>
        <RevealText
          as="h2"
          id="intro-title"
          className={`display ${styles.statement}`}
          lines={[`${summary.total} private residences.`, 'One distinct address.']}
        />
        <div className={styles.grid}>
          <p className={styles.lead}>
            <em>Almasi</em> is Swahili for diamond. Stone, walnut and glass on a quiet rise in
            Kimihurura, planned to feel like fewer homes than it holds: generous rooms, deep
            balconies, and a floor of amenities that gives a reason to leave the apartment without
            leaving the building.
          </p>
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
