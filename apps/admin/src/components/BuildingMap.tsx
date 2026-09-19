import { STATUS_LABEL, VISIBLE_UNIT_STATUSES, type UnitStatus } from '@avida/types';
import { code as fmtCode } from '../lib/format';
import type { BuildingFloor, BuildingUnit } from '../lib/types';

const DOT: Record<UnitStatus, string> = {
  AVAILABLE: 'var(--green)',
  RESERVED: 'var(--blue)',
  BOOKED: 'var(--orange)',
  SOLD: 'var(--red)',
  UNAVAILABLE: 'var(--grey)',
};

export function StatusLegend({ counts }: { counts?: Partial<Record<UnitStatus, number>> }) {
  return (
    <div className="legend">
      {VISIBLE_UNIT_STATUSES.map((s) => (
        <span key={s}>
          <i style={{ background: DOT[s] }} />
          {STATUS_LABEL[s]}
          {counts && <strong className="tabular">{counts[s] ?? 0}</strong>}
        </span>
      ))}
    </div>
  );
}

/**
 * §24 / §49 — the building drawn floor by floor, top first. Each residence is
 * a tile in its status colour; clicking one opens it. `dim` greys out the
 * residences a filter does not match, rather than hiding them — seeing the
 * whole building matters to sales staff.
 */
export function BuildingMap({
  floors,
  onSelect,
  selectedId,
  dim,
  compact,
}: {
  floors: BuildingFloor[];
  onSelect: (u: BuildingUnit, floor: BuildingFloor) => void;
  selectedId?: string | null;
  dim?: (u: BuildingUnit) => boolean;
  compact?: boolean;
}) {
  const shown = floors.filter((f) => f.units.length > 0 || f.level >= 0);
  return (
    <div className={`building ${compact ? 'compact' : ''}`}>
      {!compact && <div className="roofline" aria-hidden="true" />}
      {shown.map((f) => (
        <div key={f.id} className="floor-row">
          <div className="floor-name">
            {f.displayName ?? f.label}
            {!compact && <small>{f.units.length ? `${f.units.length} residence${f.units.length === 1 ? '' : 's'}` : 'No residences'}{!f.published && ' · hidden'}</small>}
          </div>
          <div className="floor-units">
            {f.units.length === 0 && <span className="muted small" style={{ padding: 14 }}>Lobby, amenities and services</span>}
            {f.units.map((u) => (
              <button
                key={u.id}
                type="button"
                className="unit-tile"
                data-status={u.status}
                data-dim={dim ? dim(u) : false}
                data-selected={u.id === selectedId}
                title={`${fmtCode(u.code)} · ${u.typology.name} · ${u.areaSqm} m² · ${STATUS_LABEL[u.status]}${u.enquiryCount ? ` · ${u.enquiryCount} enquiries` : ''}`}
                onClick={() => onSelect(u, f)}
              >
                {fmtCode(u.code)}
                {!compact && <small>{u.typology.isPenthouse ? 'PH' : `${u.bedrooms}BR`} · {Math.round(u.areaSqm)} m²</small>}
                {(u.enquiryCount > 0 || u.interestCount > 0) && <span className="flag" aria-label="Has interest" />}
              </button>
            ))}
          </div>
          {!compact && (
            <div className="floor-count">
              <strong className="tabular">{f.stats.AVAILABLE}</strong> available
              <br />
              {f.stats.RESERVED + f.stats.BOOKED} held · {f.stats.SOLD} sold
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
