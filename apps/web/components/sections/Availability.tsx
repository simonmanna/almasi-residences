'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_FILTERS,
  formatCount,
  formatMoneyRange,
  isFilterActive,
  STATUS_LABEL,
  unitMatches,
  UNIT_STATUSES,
  type UnitFilterState,
  type UnitStatus,
} from '@avida/types';
import type { InventoryDto, UnitDetailDto } from '../../lib/api';
import { track } from '../../lib/analytics';
import { ElevationStack } from '../inventory/ElevationStack';
import { UnitFilters } from '../inventory/UnitFilters';
import { UnitPanel } from '../inventory/UnitPanel';
import { EnquiryForm } from '../EnquiryForm';

/** §9 acceptance — a status change must reach the public site within 60 seconds. */
const LIVE_POLL_MS = 60_000;
/** §6.7 — stop polling after three consecutive failures; keep the last data. */
const MAX_POLL_FAILURES = 3;

export function Availability({ inventory }: { inventory: InventoryDto }) {
  const [filters, setFilters] = useState<UnitFilterState>(EMPTY_FILTERS);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [enquiryUnit, setEnquiryUnit] = useState<{ id: string; code: string } | null>(null);
  const [live, setLive] = useState<Record<string, { status: UnitStatus; priceMinor: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pollStopped, setPollStopped] = useState(false);

  // §5.3 — poll the status-only delta. Small, uncached, and the reason the
  // 60-second guarantee holds even when ISR revalidation fails (§6.7).
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`${api}/api/v1/inventory/live?development=${inventory.slug}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          units: { id: string; status: UnitStatus; priceMinor: number }[];
        };
        setLive(Object.fromEntries(data.units.map((u) => [u.id, u])));
        setLastUpdated(new Date());
        failures = 0;
      } catch {
        failures += 1;
        // §6.7 — this is not the visitor's problem. No error toast; keep the
        // last-known statuses and stop asking.
        if (failures >= MAX_POLL_FAILURES) {
          setPollStopped(true);
          return;
        }
      }
      timer = setTimeout(poll, LIVE_POLL_MS);
    };

    timer = setTimeout(poll, LIVE_POLL_MS);
    return () => clearTimeout(timer);
  }, [inventory.slug]);

  // Merge the live delta over the statically rendered inventory.
  const floors = useMemo(
    () =>
      inventory.buildings.flatMap((b) =>
        b.floors.map((f) => ({
          ...f,
          units: f.units.map((u) => (live[u.id] ? { ...u, ...live[u.id]! } : u)),
        })),
      ),
    [inventory, live],
  );

  const allUnits = useMemo(() => floors.flatMap((f) => f.units), [floors]);
  const matching = useMemo(
    () => (isFilterActive(filters) ? allUnits.filter((u) => unitMatches(u, filters)).length : allUnits.length),
    [allUnits, filters],
  );

  const typologies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of allUnits) seen.set(u.typology.slug, u.typology.name);
    return [...seen].map(([slug, name]) => ({ slug, name }));
  }, [allUnits]);

  const priceBounds = useMemo(() => {
    const prices = allUnits.map((u) => u.priceMinor);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [allUnits]);

  const counts = useMemo(() => {
    const acc: Partial<Record<UnitStatus, number>> = {};
    for (const u of allUnits) acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, [allUnits]);

  const available = counts.AVAILABLE ?? 0;
  const availablePrices = allUnits.filter((u) => u.status === 'AVAILABLE').map((u) => u.priceMinor);

  return (
    <section id="availability" className="section">
      <h2 className="head">Availability</h2>

      <p className="lead">
        {/* §2.7 — "Six of 92 units available", never "Limited units remaining!" */}
        {formatCount(available)} of {allUnits.length} units available
        {availablePrices.length > 0 && (
          <>
            , from{' '}
            <span data-numeric>
              {formatMoneyRange(
                { amountMinor: Math.min(...availablePrices), currency: inventory.currency },
                { amountMinor: Math.max(...availablePrices), currency: inventory.currency },
              )}
            </span>
          </>
        )}
        .
      </p>

      <div className="availability-layout">
        <div className="availability-stack">
          <ElevationStack
            floors={floors}
            currency={inventory.currency}
            filters={filters}
            selectedUnitId={selectedUnitId}
            onSelect={(id) => setSelectedUnitId((current) => (current === id ? null : id))}
          />

          <ul className="legend">
            {UNIT_STATUSES.map((s) => (
              <li key={s}>
                <svg width="18" height="12" aria-hidden="true" className="legend-swatch">
                  <g className="elevation-unit" data-fill={s === 'AVAILABLE' ? 'solid' : s === 'SOLD' ? 'outline' : s === 'NOT_RELEASED' ? 'faint' : 'hatch'}>
                    <rect width="18" height="12" />
                  </g>
                </svg>
                <span>{STATUS_LABEL[s]}</span>
                <span data-numeric className="muted">
                  {counts[s] ?? 0}
                </span>
              </li>
            ))}
          </ul>

          {lastUpdated && (
            <p className="note" aria-live="polite">
              Availability last updated{' '}
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {pollStopped && ' — not refreshing right now'}
            </p>
          )}
        </div>

        <div className="availability-side">
          <UnitFilters
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              track('unit_filtered', { typologies: next.typologySlugs.join(',') });
            }}
            typologies={typologies}
            currency={inventory.currency}
            priceBounds={priceBounds}
            matching={matching}
            total={allUnits.length}
          />

          <UnitPanel
            unitId={selectedUnitId}
            onClose={() => setSelectedUnitId(null)}
            onEnquire={(unit: UnitDetailDto) => setEnquiryUnit({ id: unit.id, code: unit.code })}
          />

          {enquiryUnit && (
            <div className="unit-enquiry">
              <h3 className="head">Request a viewing</h3>
              <EnquiryForm
                units={[enquiryUnit]}
                source="unit-panel"
                onClearUnits={() => setEnquiryUnit(null)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
