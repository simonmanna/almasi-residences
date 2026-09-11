'use client';

import { useEffect, useState } from 'react';
import { formatArea, formatMoney, STATUS_LABEL } from '@avida/types';
import type { UnitDetailDto } from '../../lib/api';
import { track } from '../../lib/analytics';
import { PaymentSchedule } from './PaymentSchedule';

/**
 * §6.3 — the unit detail panel. Opens beside the elevation stack rather than
 * navigating away, so the visitor keeps their place in the building.
 */
export function UnitPanel({
  unitId,
  onClose,
  onEnquire,
}: {
  unitId: string | null;
  onClose: () => void;
  onEnquire: (unit: UnitDetailDto) => void;
}) {
  const [unit, setUnit] = useState<UnitDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId) {
      setUnit(null);
      return;
    }
    let cancelled = false;
    setError(null);
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    fetch(`${api}/api/v1/unit/${unitId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: UnitDetailDto) => {
        if (cancelled) return;
        setUnit(data);
        track('unit_viewed', { unitCode: data.code, typology: data.typology.slug });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  // Escape closes the panel — a keyboard user must not be trapped in it.
  useEffect(() => {
    if (!unitId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unitId, onClose]);

  if (!unitId) return null;

  return (
    <aside className="unit-panel" aria-label="Unit detail">
      <div className="unit-panel-head">
        <h3 className="unit-panel-title">
          {unit ? `Unit ${unit.code}` : 'Loading'}
          {unit && <span className="unit-status">{STATUS_LABEL[unit.status]}</span>}
        </h3>
        <button type="button" onClick={onClose} className="button-quiet">
          Close
        </button>
      </div>

      {error && <p className="fault">Could not load this unit: {error}</p>}

      {unit && (
        <>
          <dl className="unit-facts">
            <div>
              <dt>Typology</dt>
              <dd>{unit.typology.name}</dd>
            </div>
            <div>
              <dt>Floor</dt>
              <dd data-numeric>{unit.floor.label}</dd>
            </div>
            <div>
              <dt>Internal area</dt>
              <dd data-numeric>{formatArea(unit.areaSqm)}</dd>
            </div>
            {unit.balconySqm !== null && (
              <div>
                <dt>Balcony</dt>
                <dd data-numeric>{formatArea(unit.balconySqm)}</dd>
              </div>
            )}
            <div>
              <dt>Facing</dt>
              <dd>{unit.orientation}</dd>
            </div>
            <div>
              <dt>Outlook</dt>
              <dd>{unit.viewTags.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd data-numeric>
                {formatMoney({ amountMinor: unit.priceMinor, currency: unit.currency })}
              </dd>
            </div>
          </dl>

          <h4 className="unit-panel-subhead">Payment schedule</h4>
          <PaymentSchedule
            rows={unit.schedule.rows}
            cumulative={unit.schedule.cumulative}
            totalMinor={unit.schedule.totalMinor}
            currency={unit.schedule.currency}
          />

          <button
            type="button"
            className="button"
            onClick={() => {
              track('enquiry_started', { unitCode: unit.code, source: 'unit-panel' });
              onEnquire(unit);
            }}
          >
            {/* §2.7 — "Request a viewing", not "Submit Enquiry →". */}
            Request a viewing of {unit.code}
          </button>
        </>
      )}
    </aside>
  );
}
