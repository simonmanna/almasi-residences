'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { formatMoney } from '@avida/types';
import { TYPE_TEXT, typesPresent, type ResidenceType } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import styles from './MobileQuickNav.module.css';

/** One 24-unit box, one 1.25 stroke: drawn to sit inside a champagne ring. */
const ICONS: Record<string, ReactNode> = {
  all: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9v10.5h12V9M10 19.5v-5h4v5" />
    </>
  ),
  'one-bedroom': (
    <>
      <path d="M3.5 19V8.5M3.5 14h17v5M20.5 19v-3.5A1.5 1.5 0 0 0 19 14" />
      <path d="M6.5 14v-2.2A1.3 1.3 0 0 1 7.8 10.5h4.4a1.3 1.3 0 0 1 1.3 1.3V14" />
    </>
  ),
  'two-bedroom': (
    <>
      <path d="M3.5 19V8.5M3.5 14h17v5M20.5 19v-3.5A1.5 1.5 0 0 0 19 14" />
      <path d="M5.8 14v-2a1.2 1.2 0 0 1 1.2-1.2h3.4A1.2 1.2 0 0 1 11.6 12v2M12.4 14v-2a1.2 1.2 0 0 1 1.2-1.2H17a1.2 1.2 0 0 1 1.2 1.2v2" />
    </>
  ),
  'three-bedroom': (
    <>
      <path d="M4 20.5h16M6 20.5V6.5L12 3.5l6 3v14" />
      <path d="M9.5 9h5M9.5 12.5h5M9.5 16h5" />
    </>
  ),
  penthouse: (
    <>
      <path d="M4 20.5h16M6.5 20.5V9.5h11v11M5 9.5h14" />
      <path d="M8.5 6.5 12 3.5l3.5 3M9.5 13h2M12.5 13h2M9.5 16.5h2M12.5 16.5h2" />
    </>
  ),
  tour: (
    <>
      <path d="m12 3.5 7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5Z" />
      <path d="M4.5 7.75 12 12l7.5-4.25M12 12v8.5" />
    </>
  ),
  location: (
    <>
      <path d="M12 20.5s-6.5-5.6-6.5-10.6a6.5 6.5 0 0 1 13 0c0 5-6.5 10.6-6.5 10.6Z" />
      <circle cx="12" cy="9.9" r="2.3" />
    </>
  ),
};

function Glyph({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

const SHORT: Record<ResidenceType, string> = {
  'one-bedroom': '1 Bed',
  'two-bedroom': '2 Bed',
  'three-bedroom': '3 Bed',
  penthouse: 'Penthouse',
};

/**
 * Phones only: the finder that overlaps the foot of the opening frame, then a
 * row of ways in — each residence type that exists, the 3D tour and the
 * neighbourhood. Counts and the opening price are read live from the inventory.
 */
export function MobileQuickNav({ show3dTour, showLocation }: { show3dTour: boolean; showLocation: boolean }) {
  const { summary, currency } = useInventory();
  const types = typesPresent(summary);
  const from = types
    .map((t) => summary.byType[t].priceFromMinor)
    .filter((p): p is number => p !== null)
    .reduce<number | null>((min, p) => (min === null || p < min ? p : min), null);

  const shortcuts = [
    { href: '/residences', label: 'All', icon: 'all', title: 'All residences' },
    ...types.map((t) => ({ href: `/residences?type=${t}`, label: SHORT[t], icon: t, title: TYPE_TEXT[t] })),
    ...(show3dTour ? [{ href: '/3d-design', label: '3D tour', icon: 'tour', title: 'Walk through a residence in 3D' }] : []),
    ...(showLocation ? [{ href: '/location', label: 'Location', icon: 'location', title: 'The neighbourhood' }] : []),
  ];

  return (
    <nav className={styles.quick} aria-label="Find a residence">
      <div className={styles.deck}>
        <Link href="/residences" className={styles.finder}>
          <span className={styles.pin} aria-hidden="true">
            <Glyph name="location" size={22} />
          </span>
          <span className={styles.finderText}>
            <span className={styles.finderTitle}>Find your residence</span>
            <span className={styles.finderSub}>
              {summary.available} available
              {from !== null && <> · from {formatMoney({ amountMinor: from, currency })}</>}
            </span>
          </span>
          <span className={styles.go} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </Link>

        <ul className={styles.shortcuts}>
          {shortcuts.map((s, i) => (
            <li key={s.href} style={{ '--i': i } as CSSProperties}>
              {/* "All" leads, lit, as the default way in. */}
              <Link href={s.href} className={styles.shortcut} aria-label={s.title} data-lead={i === 0 ? '' : undefined}>
                <Glyph name={s.icon} size={22} />
                <span className={styles.label}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
