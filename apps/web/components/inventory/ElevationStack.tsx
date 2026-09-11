'use client';

import { useMemo } from 'react';
import {
  formatMoney,
  isFilterActive,
  STATUS_FILL,
  STATUS_LABEL,
  unitMatches,
  type UnitFilterState,
} from '@avida/types';
import type { StackFloorDto, StackUnitDto } from '../../lib/api';

/**
 * §2.5 — the building drawn as a section elevation: floors stacked as they
 * exist, ground at the bottom, each unit drawn to relative width.
 *
 * SVG rather than divs, for the reasons the spec gives: crisp at any zoom,
 * hatch patterns via <pattern>, one accessible tree, and printable as a PDF for
 * the sales team.
 *
 * §2.5 also requires status to read without colour, so each status has a fill
 * *treatment* — solid, hatched, outline — as well as a hue.
 */

const ROW_HEIGHT = 34;
const ROW_GAP = 4;
const LABEL_WIDTH = 96;
const STACK_WIDTH = 720;
const UNIT_GAP = 4;

export interface ElevationStackProps {
  floors: StackFloorDto[];
  currency: string;
  filters: UnitFilterState;
  selectedUnitId?: string | null;
  onSelect: (unitId: string) => void;
}

export function ElevationStack({
  floors,
  currency,
  filters,
  selectedUnitId,
  onSelect,
}: ElevationStackProps) {
  // §2.5 — ground floor at the bottom. The API returns building order; the
  // drawing reverses it, which is the whole point of an elevation.
  const rows = useMemo(() => [...floors].sort((a, b) => b.level - a.level), [floors]);
  const filtering = isFilterActive(filters);

  const height = rows.length * (ROW_HEIGHT + ROW_GAP);
  const width = LABEL_WIDTH + STACK_WIDTH;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="elevation"
      role="group"
      aria-label="Building elevation. Each row is a floor; each block is a unit."
      preserveAspectRatio="xMidYMin meet"
    >
      <defs>
        {/* 45° hatch for reserved and booked — §2.5 requires a treatment, not
            only a hue, so status survives colour-blindness and all four time
            states. `currentColor` keeps it inside the token cascade. */}
        <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="var(--surface)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="3" />
        </pattern>
      </defs>

      {rows.map((floor, rowIndex) => {
        const y = rowIndex * (ROW_HEIGHT + ROW_GAP);
        const totalRatio = floor.units.reduce((sum, u) => sum + u.widthRatio, 0) || 1;
        const usable = STACK_WIDTH - UNIT_GAP * Math.max(0, floor.units.length - 1);
        let x = LABEL_WIDTH;

        return (
          <g key={floor.id}>
            <text
              x={LABEL_WIDTH - 12}
              y={y + ROW_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="elevation-floor-label"
            >
              {floor.label}
            </text>

            {floor.units.length === 0 && (
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={STACK_WIDTH}
                height={ROW_HEIGHT}
                className="elevation-nonresidential"
              />
            )}

            {floor.units.map((unit) => {
              const w = (unit.widthRatio / totalRatio) * usable;
              const unitX = x;
              x += w + UNIT_GAP;
              return (
                <UnitBlock
                  key={unit.id}
                  unit={unit}
                  floorLabel={floor.label}
                  currency={currency}
                  x={unitX}
                  y={y}
                  width={w}
                  dimmed={filtering && !unitMatches(unit, filters)}
                  selected={unit.id === selectedUnitId}
                  onSelect={onSelect}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function UnitBlock({
  unit,
  floorLabel,
  currency,
  x,
  y,
  width,
  dimmed,
  selected,
  onSelect,
}: {
  unit: StackUnitDto;
  floorLabel: string;
  currency: string;
  x: number;
  y: number;
  width: number;
  dimmed: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const fill = STATUS_FILL[unit.status];
  // §6.4 — a full spoken label, not just the code: a screen-reader user gets
  // the same information a sighted user reads off the drawing.
  const label =
    `Unit ${unit.code}, ${floorLabel}, ${unit.typology.name.toLowerCase()}, ` +
    `${unit.areaSqm} square metres, facing ${unit.orientation}, ` +
    `${STATUS_LABEL[unit.status].toLowerCase()}, ` +
    formatMoney({ amountMinor: unit.priceMinor, currency });

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      className="elevation-unit"
      data-fill={fill}
      data-dimmed={dimmed || undefined}
      data-selected={selected || undefined}
      onClick={() => onSelect(unit.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(unit.id);
        }
      }}
    >
      <rect x={x} y={y} width={width} height={ROW_HEIGHT} rx={1} />
      {width > 34 && (
        <text
          x={x + width / 2}
          y={y + ROW_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="elevation-unit-code"
        >
          {unit.code}
        </text>
      )}
    </g>
  );
}
