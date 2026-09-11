'use client';

import { STATUS_TEXT, TYPE_TEXT, type FloorSummary, type Residence } from '../../lib/residences';
import styles from './ElevationStack.module.css';

/**
 * The building as an architect draws it in section: floors stacked as they
 * stand, penthouse at the top, each residence drawn to its area. Status is a
 * fill treatment — solid, hatched, outlined, dotted — so it survives any
 * colour vision and any ground. This is also the keyboard- and screen-reader
 * path through the inventory, and the fallback when WebGL is unavailable.
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
  return (
    <div className={styles.stack} role="group" aria-label="Elevation of the building, floor by floor">
      {floors
        .filter((f) => f.level >= 0)
        .map((f) => {
          const units = residences
            .filter((r) => r.floorLevel === f.level)
            .sort((a, b) => a.positionIndex - b.positionIndex);
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
                  {f.mark}
                </button>
              ) : (
                <span className={styles.mark} aria-hidden="true">
                  {f.mark}
                </span>
              )}
              <div className={styles.units}>
                {units.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={styles.unit}
                    data-status={r.publicStatus}
                    data-dim={matchIds && !matchIds.has(r.id) ? 'true' : 'false'}
                    aria-pressed={selectedId === r.id}
                    aria-label={`${r.label}: ${TYPE_TEXT[r.type].toLowerCase()}, ${r.areaSqm} square metres, ${STATUS_TEXT[r.publicStatus].toLowerCase()}`}
                    style={{ flexGrow: r.areaSqm }}
                    onClick={() => onSelect(r)}
                    onMouseEnter={() => onHover?.(r.id)}
                    onMouseLeave={() => onHover?.(null)}
                    onFocus={() => onHover?.(r.id)}
                    onBlur={() => onHover?.(null)}
                  >
                    <span className={styles.code}>{r.label}</span>
                    <span className={styles.area}>{r.areaSqm} m²</span>
                  </button>
                ))}
                {f.level === 0 && (
                  <span className={styles.common} style={{ flexGrow: 220 }}>
                    Reception, co-working, restaurant
                  </span>
                )}
              </div>
            </div>
          );
        })}
      <div className={styles.row}>
        <span className={styles.mark} aria-hidden="true">
          B
        </span>
        <div className={styles.units}>
          <span className={styles.common} style={{ flexGrow: 1 }}>
            Basement: parking for every residence, storage and plant
          </span>
        </div>
      </div>
    </div>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={`${styles.legend} ${className ?? ''}`} aria-label="Key">
      {(['available', 'reserved', 'sold', 'unavailable'] as const).map((s) => (
        <li key={s} className="status" data-status={s}>
          {STATUS_TEXT[s]}
        </li>
      ))}
    </ul>
  );
}
