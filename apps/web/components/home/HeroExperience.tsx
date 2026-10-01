'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatMoney } from '@avida/types';
import { RESIDENCE_TYPES } from '../../lib/residences';
import { useInventory } from '../providers/InventoryProvider';
import styles from './HeroExperience.module.css';

/**
 * The opening frame: the whole building on its corner at dusk, crown to
 * entrance, with open sky down the left where the headline sits. Nothing is
 * cropped away — the silhouette is the first thing a buyer should see.
 */
const HERO_STILL = '/media/hero-wide-v2.jpg';

/** Thin line icons for the facts panel. One stroke weight, one 24-unit box. */
const icons = {
  building: (
    <>
      <path d="M4 21h16M6 21V5.5A1.5 1.5 0 0 1 7.5 4h6A1.5 1.5 0 0 1 15 5.5V21M15 10h2.5A1.5 1.5 0 0 1 19 11.5V21" />
      <path d="M9 8h3M9 12h3M9 16h3" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V7M3 12h18v6M21 18v-4.5A1.5 1.5 0 0 0 19.5 12" />
      <path d="M6.5 12V9.5A1.5 1.5 0 0 1 8 8h8a1.5 1.5 0 0 1 1.5 1.5V12" />
    </>
  ),
  tag: (
    <>
      <path d="M11.2 3.5H20v8.8l-8.6 8.6a1.6 1.6 0 0 1-2.3 0l-6.5-6.5a1.6 1.6 0 0 1 0-2.3Z" />
      <circle cx="16.2" cy="7.8" r="1.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.6" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </>
  ),
};

/** "1, 2 & 3" is read from what is actually built, not written into the CMS. */
const BEDROOM_COUNTS = [
  { type: 'one-bedroom', label: '1' },
  { type: 'two-bedroom', label: '2' },
  { type: 'three-bedroom', label: '3' },
] as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}

/**
 * The opening: one still picture, shown as it is. No intro sequence, film,
 * glows or parallax — the frame is on screen at first paint and the words
 * settle in over half a second (pure CSS, nothing waits for hydration).
 */
export function HeroExperience({
  kicker,
  title,
  subtitle,
  tagline,
  place,
  primary,
  handover,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  /** One short serif line under the title on a phone: "A rare place to call home." */
  tagline?: string;
  /** "Kimihurura, Kigali" — from the property record. */
  place: string;
  primary: { label: string; href: string };
  /** "Q2 2028" — already formatted by the page. */
  handover?: string | null;
}) {
  const [lineA, ...rest] = title.trim().split(/\s+/);
  // When the CMS subtitle already says the tagline, it is set once, as the tagline.
  const norm = (t?: string) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const taglineIsLede = !!tagline && norm(tagline) === norm(subtitle);
  const lineB = rest.join(' ');
  const { summary, currency } = useInventory();

  /**
   * The panel along the foot of the frame: the four facts a buyer looks for
   * before they look at anything else. Each is read live — an unpriced or
   * unconfigured development shows fewer cells rather than a placeholder.
   */
  const priceFrom = RESIDENCE_TYPES.map((t) => summary.byType[t].priceFromMinor).filter(
    (p): p is number => p !== null,
  );
  const bedrooms = BEDROOM_COUNTS.filter((b) => summary.byType[b.type].total > 0).map((b) => b.label);
  const bedroomText =
    bedrooms.length > 1 ? `${bedrooms.slice(0, -1).join(', ')} & ${bedrooms.at(-1)}` : bedrooms[0] ?? '';
  const facts = [
    summary.total ? { icon: 'building' as const, value: String(summary.total), label: 'Residences' } : null,
    bedroomText ? { icon: 'bed' as const, value: bedroomText, label: 'Bedroom units' } : null,
    priceFrom.length
      ? {
          icon: 'tag' as const,
          value: formatMoney({ amountMinor: Math.min(...priceFrom), currency }),
          label: 'Price from',
        }
      : null,
    handover ? { icon: 'calendar' as const, value: handover, label: 'Handover' } : null,
  ].filter((f): f is { icon: keyof typeof icons; value: string; label: string } => f !== null);
  return (
    <section className={styles.hero} data-ground="night" data-nav-over aria-labelledby="hero-title">
      <div className={styles.media}>
        {/* Painted dusk under the render, so the frame is full of evening at every aspect ratio. */}
        <div className={styles.sky} aria-hidden="true" />
        <div className={styles.parallax}>
          <Image
            src={HERO_STILL}
            alt="Almasi Residence at dusk, seen from the street corner: five storeys of lit, glass-fronted apartments with planted balconies above a street-level lobby, against an evening sky"
            fill
            preload
            sizes="100vw"
            quality={75}
            className={styles.image}
          />
        </div>
        <div className={styles.scrim} aria-hidden="true" />
      </div>

      <div className={`container ${styles.content}`}>
        {kicker && <p className={`mark ${styles.eyebrow}`}>{kicker}</p>}
        <h1 id="hero-title" className={styles.title}>
          <span className={styles.line}>{lineA}</span>
          <span className={`italic ${styles.line} ${styles.accentLine}`}>{lineB}</span>
        </h1>
        <div className={styles.aside}>
          {tagline && !taglineIsLede && <p className={styles.tagline}>{tagline}</p>}
          <p className={taglineIsLede ? `${styles.lede} ${styles.ledeAsTagline}` : styles.lede}>{subtitle}</p>
          <div className={styles.ctas}>
            {primary.label && primary.href && (
              <Link href={primary.href} className="btn btn--solid">
                {primary.label}
                <span aria-hidden="true" className="btn-arrow">
                  →
                </span>
              </Link>
            )}
            <Link href="/3d-design" className={`btn ${styles.watch}`}>
              <span className={styles.play} aria-hidden="true">
                <svg viewBox="0 0 12 14" width="9" height="11" fill="currentColor" focusable="false">
                  <path d="M0 0.8v12.4a.8.8 0 0 0 1.22.68l10-6.2a.8.8 0 0 0 0-1.36l-10-6.2A.8.8 0 0 0 0 .8Z" />
                </svg>
              </span>
              <span className={styles.watchWide}>Experience in 3D</span>
              <span className={styles.watchPhone}>
                Property tour
                <span>in 3D</span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      {facts.length > 0 && (
        <div className={`container ${styles.panelWrap}`}>
          <dl className={styles.panel} style={{ '--fact-count': facts.length } as React.CSSProperties}>
            {facts.map((f) => (
              <div key={f.label} className={styles.cell}>
                <dt className={styles.cellLabel}>{f.label}</dt>
                <dd className={styles.cellValue}>
                  <span className={styles.cellIcon} aria-hidden="true">
                    <Icon name={f.icon} />
                  </span>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className={styles.foot}>
        <span className="mark">{place}</span>
      </div>
    </section>
  );
}
