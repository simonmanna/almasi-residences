'use client';

import type { CSSProperties } from 'react';
import { toMajorUnits } from '@avida/types';
import {
  STATUS_TEXT,
  TYPE_TEXT,
  visiblePriceMinor,
  type FloorSummary,
  type PublicStatus,
  type Residence,
} from '../../lib/residences';
import styles from './ElevationStack.module.css';

const KEY_ORDER: readonly PublicStatus[] = ['available', 'reserved', 'booked', 'sold', 'unavailable'];

/** For a tile a small phone leaves about 30px wide; the colour and the key carry the rest. */
const STATUS_SHORT: Record<PublicStatus, string> = {
  available: 'Avail.',
  reserved: 'Resv.',
  booked: 'Bkd.',
  sold: 'Sold',
  unavailable: 'N/A',
};

/** `C2` → `C`; `PH-A` → `PH-A`. Columns line up by the letter a residence shares with the floors above and below it. */
const columnKey = (code: string) => code.replace(/\d+$/, '');

const compact = new Map<string, Intl.NumberFormat>();
function compactPrice(r: Residence): string | null {
  const minor = visiblePriceMinor(r);
  if (minor === null) return null;
  let fmt = compact.get(r.currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en', { style: 'currency', currency: r.currency, notation: 'compact', maximumFractionDigits: 0 });
    compact.set(r.currency, fmt);
  }
  return fmt.format(toMajorUnits(minor, r.currency));
}

/**
 * The building as a sales board: floors stacked as they stand, penthouse at
 * the top, each residence a tile coloured by where it is in the sale. Tiles
 * line up in columns by their letter so a buyer can follow one plan up the
 * building. This is also the keyboard- and screen-reader path through the
 * inventory, and the fallback when WebGL is unavailable.
 */
export function ElevationStack({
  residences,
  floors,
  focusLevel,
  selectedId,
  matchIds,
  onSelect,
  onFocusLevel,
  onHover,
}: {
  residences: Residence[];
  floors: FloorSummary[];
  focusLevel: number | null;
  selectedId: string | null;
  matchIds?: ReadonlySet<string> | null;
  onSelect: (r: Residence) => void;
  onFocusLevel?: (level: number | null) => void;
  onHover?: (id: string | null) => void;
}) {
  const unitsOn = (level: number) =>
    residences.filter((r) => r.floorLevel === level).sort((a, b) => a.positionIndex - b.positionIndex);

  // A column is a letter that repeats up the building; a one-off code gets a
  // free-flowing row instead of a column of its own.
  const standing = floors.filter((f) => f.level >= 0);
  const seen = new Map<string, number>();
  for (const f of standing) {
    for (const key of new Set(unitsOn(f.level).map((r) => columnKey(r.code)))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const shared = (r: Residence) => (seen.get(columnKey(r.code)) ?? 0) > 1;
  const reference = standing.reduce<Residence[]>((best, f) => {
    const here = unitsOn(f.level).filter(shared);
    return here.length > best.length ? here : best;
  }, []);
  const columns =
    reference.length > 1
      ? reference.map((r) => ({ key: columnKey(r.code), type: TYPE_TEXT[r.type], area: r.areaSqm }))
      : [];
  const columnIndex = new Map(columns.map((c, i) => [c.key, i]));
  const gridStyle = { '--cols': Math.max(columns.length, 1) } as CSSProperties;

  const counts = KEY_ORDER.map((s) => ({ status: s, n: residences.filter((r) => r.publicStatus === s).length })).filter(
    (c) => c.n > 0,
  );
  const total = residences.length;
  const available = residences.filter((r) => r.publicStatus === 'available').length;
  const gone = residences.filter((r) => r.publicStatus === 'sold' || r.publicStatus === 'booked').length;
  const fromMinor = residences
    .map(visiblePriceMinor)
    .filter((p): p is number => p !== null)
    .reduce<number | null>((min, p) => (min === null || p < min ? p : min), null);
  const cheapest = fromMinor === null ? null : residences.find((r) => visiblePriceMinor(r) === fromMinor)!;

  let order = 0;
  const tile = (r: Residence, style?: CSSProperties) => {
    const price = compactPrice(r);
    const i = order++;
    return (
      <button
        key={r.id}
        type="button"
        className={styles.unit}
        data-status={r.publicStatus}
        data-dim={matchIds && !matchIds.has(r.id) ? 'true' : 'false'}
        aria-pressed={selectedId === r.id}
        aria-label={`${r.label}: ${TYPE_TEXT[r.type].toLowerCase()}, ${r.areaSqm} square metres, ${STATUS_TEXT[r.publicStatus].toLowerCase()}${price ? `, ${price}` : ''}`}
        title={`${r.label} · ${TYPE_TEXT[r.type]} · ${r.areaSqm} m²`}
        style={{ ...style, '--i': i } as CSSProperties}
        onClick={() => onSelect(r)}
        onMouseEnter={() => onHover?.(r.id)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(r.id)}
        onBlur={() => onHover?.(null)}
      >
        {r.publicStatus === 'available' && <span className={styles.live} aria-hidden="true" />}
        <span className={styles.code}>{r.label}</span>
        {price ? (
          <span className={styles.sub}>{price}</span>
        ) : (
          <span className={styles.sub}>
            <span className={styles.subLong}>{STATUS_TEXT[r.publicStatus]}</span>
            <span className={styles.subShort} aria-hidden="true">
              {STATUS_SHORT[r.publicStatus]}
            </span>
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={styles.board}>
      {total > 0 && (
        <div className={styles.pulse}>
          <p className={styles.headline}>
            <span className={styles.now}>
              <span className={styles.nowDot} aria-hidden="true" />
              <b className="tabular">{available}</b> available now
            </span>
            {cheapest && (
              <span className={styles.from}>
                from <b className="tabular">{compactPrice(cheapest)}</b>
              </span>
            )}
            {gone > 0 && (
              <span className={styles.gone}>
                <b className="tabular">{Math.round((gone / total) * 100)}%</b> already sold or booked
              </span>
            )}
          </p>
          <div className={styles.bar} role="img" aria-label={counts.map((c) => `${c.n} ${STATUS_TEXT[c.status].toLowerCase()}`).join(', ')}>
            {counts.map((c) => (
              <span key={c.status} data-status={c.status} style={{ flexGrow: c.n }} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.stack} style={gridStyle} role="group" aria-label="Elevation of the building, floor by floor">
        {columns.length > 1 && (
          <div className={styles.head} aria-hidden="true">
            <span />
            {columns.map((c) => (
              <span key={c.key} className={styles.colHead}>
                <b>{c.type}</b>
                <small>
                  {c.key} · {c.area} m²
                </small>
              </span>
            ))}
          </div>
        )}

        {standing.map((f) => {
          const units = unitsOn(f.level);
          const keys = units.map((r) => columnKey(r.code));
          const aligned =
            units.length > 0 && keys.every((k) => columnIndex.has(k)) && new Set(keys).size === keys.length;
          const lastCol = aligned ? Math.max(...units.map((r) => columnIndex.get(columnKey(r.code))!)) : -1;
          return (
            <div key={f.level} className={styles.row} data-focus={focusLevel === f.level ? 'true' : 'false'}>
              {onFocusLevel ? (
                <button
                  type="button"
                  className={styles.mark}
                  aria-pressed={focusLevel === f.level}
                  aria-label={`${f.label}: ${f.available} of ${f.total} available`}
                  onClick={() => onFocusLevel(focusLevel === f.level ? null : f.level)}
                >
                  <span className={styles.markShort}>{f.mark}</span>
                  <span className={styles.markLong}>{f.label}</span>
                </button>
              ) : (
                <span className={styles.mark} aria-hidden="true">
                  <span className={styles.markShort}>{f.mark}</span>
                  <span className={styles.markLong}>{f.label}</span>
                </span>
              )}
              {aligned ? (
                <>
                  {units.map((r) => tile(r, { gridColumn: columnIndex.get(columnKey(r.code))! + 2 }))}
                  {f.level === 0 && lastCol < columns.length - 1 && (
                    <span className={styles.common} style={{ gridColumn: `${lastCol + 3} / -1` }}>
                      Reception, co-working, restaurant
                    </span>
                  )}
                </>
              ) : (
                <div className={styles.span}>
                  {units.map((r) => tile(r, { flexGrow: r.areaSqm }))}
                  {f.level === 0 && (
                    <span className={styles.common} style={{ flexGrow: 220 }}>
                      Reception, co-working, restaurant
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.row}>
          <span className={styles.mark} aria-hidden="true">
            <span className={styles.markShort}>B</span>
            <span className={styles.markLong}>Basement</span>
          </span>
          <span className={styles.common} style={{ gridColumn: '2 / -1' }}>
            Basement: parking for every residence, storage and plant
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * `board` matches the coloured tiles above; `model` keeps the quieter key the
 * 3D maquette's own lighting is drawn to.
 */
export function StatusLegend({ className, tone = 'board' }: { className?: string; tone?: 'board' | 'model' }) {
  if (tone === 'model') {
    return (
      <ul className={`${styles.legend} ${className ?? ''}`} aria-label="Key">
        {(['available', 'reserved', 'booked', 'sold', 'unavailable'] as const).map((s) => (
          <li key={s} className="status" data-status={s}>
            {STATUS_TEXT[s]}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={`${styles.legend} ${className ?? ''}`} aria-label="Key">
      {KEY_ORDER.map((s) => (
        <li key={s} className={styles.key} data-status={s}>
          {STATUS_TEXT[s]}
        </li>
      ))}
    </ul>
  );
}
