'use client';

import {
  formatMoney,
  ORIENTATIONS,
  STATUS_LABEL,
  UNIT_STATUSES,
  type Orientation,
  type UnitFilterState,
  type UnitStatus,
} from '@avida/types';

/** §9 Phase 1 task 4 — filters over the elevation stack. */
export function UnitFilters({
  filters,
  onChange,
  typologies,
  currency,
  priceBounds,
  matching,
  total,
}: {
  filters: UnitFilterState;
  onChange: (next: UnitFilterState) => void;
  typologies: { slug: string; name: string }[];
  currency: string;
  priceBounds: { min: number; max: number };
  matching: number;
  total: number;
}) {
  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <div className="filters">
      <fieldset className="filter-group">
        <legend>Typology</legend>
        {typologies.map((t) => (
          <label key={t.slug} className="filter-check">
            <input
              type="checkbox"
              checked={filters.typologySlugs.includes(t.slug)}
              onChange={() =>
                onChange({ ...filters, typologySlugs: toggle(filters.typologySlugs, t.slug) })
              }
            />
            <span>{t.name}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Status</legend>
        {UNIT_STATUSES.map((s: UnitStatus) => (
          <label key={s} className="filter-check">
            <input
              type="checkbox"
              checked={filters.statuses.includes(s)}
              onChange={() => onChange({ ...filters, statuses: toggle(filters.statuses, s) })}
            />
            <span>{STATUS_LABEL[s]}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Orientation</legend>
        <div className="filter-compass">
          {ORIENTATIONS.map((o: Orientation) => (
            <label key={o} className="filter-chip">
              <input
                type="checkbox"
                checked={filters.orientations.includes(o)}
                onChange={() =>
                  onChange({ ...filters, orientations: toggle(filters.orientations, o) })
                }
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group filter-price">
        <legend>
          Price ceiling{' '}
          <span data-numeric className="muted">
            {formatMoney({
              amountMinor: filters.priceMinorMax ?? priceBounds.max,
              currency,
            })}
          </span>
        </legend>
        <input
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={100_000}
          value={filters.priceMinorMax ?? priceBounds.max}
          aria-label="Maximum price"
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ...filters, priceMinorMax: v >= priceBounds.max ? null : v });
          }}
        />
      </fieldset>

      <p className="filter-count" aria-live="polite">
        {/* §2.5 — non-matching units are dimmed, not hidden, so the count says
            how many match rather than how many exist. */}
        <span data-numeric>{matching}</span> of <span data-numeric>{total}</span> units match
      </p>
    </div>
  );
}
