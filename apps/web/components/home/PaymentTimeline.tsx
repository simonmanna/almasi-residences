'use client';

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { formatCount, formatMoney, formatPercent } from '@avida/types';
import type { MilestoneDto } from '../../lib/api';
import { RESIDENCE_TYPES, TYPE_TEXT, type ResidenceType } from '../../lib/residences';
import { useIsoLayoutEffect } from '../../lib/motion';
import { useInventory } from '../providers/InventoryProvider';
import { RevealText } from '../ui/RevealText';
import styles from './PaymentTimeline.module.css';

/**
 * 09 — the payment plan as the construction programme it follows. The line
 * draws as the page moves; each stage lights as the line reaches it. Example
 * amounts use the lowest available price of the chosen type, from the live
 * inventory — so they are never a stale figure.
 */
export function PaymentTimeline({
  milestones,
  handover,
  id = 'payment',
}: {
  milestones: MilestoneDto[];
  /** "Q2 2028", or null when the property has no handover date. */
  handover: string | null;
  id?: string;
}) {
  const { summary, currency } = useInventory();
  const priced = RESIDENCE_TYPES.filter((t) => summary.byType[t].priceFromMinor !== null);
  const [type, setType] = useState<ResidenceType>(priced.includes('two-bedroom') ? 'two-bedroom' : priced[0] ?? 'two-bedroom');
  const price = summary.byType[type].priceFromMinor;
  const root = useRef<HTMLElement>(null);
  const stages = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el?.style.setProperty('--p', '1');
      el?.querySelectorAll<HTMLElement>('[data-stage]').forEach((n) => (n.dataset.active = 'true'));
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const nodes = gsap.utils.toArray<HTMLElement>('[data-stage]');
      gsap.fromTo(
        el,
        { '--p': 0 },
        {
          '--p': 1,
          ease: 'none',
          scrollTrigger: {
            trigger: el.querySelector('[data-track]'),
            start: 'top 78%',
            end: 'bottom 42%',
            scrub: 0.6,
            onUpdate: (self) => {
              nodes.forEach((n, i) => {
                n.dataset.active = String(self.progress >= i / Math.max(1, nodes.length - 1) - 0.04);
              });
            },
          },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [stages.length]);

  return (
    <section ref={root} id={id} className={`section ${styles.section}`} aria-labelledby={`${id}-title`}>
      <div className="container">
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>Payment plan</p>
            <RevealText as="h2" id={`${id}-title`} className={styles.title} lines={['Pay as it rises.']} />
          </div>
          <div className={styles.aside}>
            {/* Counted from the plan itself: this sentence once said "four" above a plan the admin could change. */}
            {stages.length > 0 && (
              <p className="lead">
                {formatCount(stages.length)} payment{stages.length === 1 ? '' : 's'}, each tied to a stage of construction rather than a
                date{stages.at(-1)?.triggerType === 'ON_HANDOVER' ? ', with the last on the day you receive the keys' : ''}.
              </p>
            )}
            {priced.length > 0 && (
              <div className={styles.types} role="group" aria-label="Show example amounts for">
                {priced.map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={t === type} onClick={() => setType(t)}>
                    {TYPE_TEXT[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <ol className={styles.timeline} data-track>
          <li className={styles.track} aria-hidden="true">
            <span className={styles.fill} />
          </li>
          {stages.map((m) => (
            <li key={m.id} className={styles.stage} data-stage data-active="false">
              <span className={styles.dot} aria-hidden="true" />
              <p className={styles.percent}>{formatPercent(m.percent)}</p>
              <p className={styles.label}>{m.label}</p>
              {m.triggerNote && <p className={styles.note}>{m.triggerNote}</p>}
              {price !== null && (
                <p className={styles.amount}>
                  {formatMoney({ amountMinor: Math.round((price * m.percent) / 100), currency })}
                </p>
              )}
            </li>
          ))}
        </ol>

        <p className={styles.foot}>
          {handover && <span className={styles.handover}>Handover {handover}</span>}
          {price !== null && (
            <span className="caption">
              Example amounts on the lowest available {TYPE_TEXT[type].toLowerCase()} price,{' '}
              {formatMoney({ amountMinor: price, currency })}. Each residence has its own schedule on
              its page.
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
