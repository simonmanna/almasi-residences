'use client';

import { useState } from 'react';
import type { Orientation } from '@avida/types';
import type { PublicResidenceDto } from '../../lib/api';
import styles from './PlanDrawing.module.css';

type RoomDto = PublicResidenceDto['rooms'][number];

const COMPASS: Record<Orientation, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const PAD = 20;

/**
 * The residence plan, drawn from the rooms the admin placed (Room.planX/Y/W/H)
 * as an architect's diagram: rooms, their relationships, the outside spaces
 * hatched. Pointing at a room names its area.
 *
 * Roadmap item 20: the rectangles used to be invented per residence type in
 * this file. With no placed rooms the drawing is not attempted — the rooms are
 * listed instead, never drawn from a guess.
 */
export function PlanDrawing({
  rooms,
  orientation,
  areaSqm,
  label,
}: {
  rooms: RoomDto[];
  orientation: Orientation;
  areaSqm: number;
  label: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const placed = rooms.filter((r) => r.planX != null && r.planY != null && r.planW && r.planH);

  if (placed.length === 0) {
    return (
      <figure className={styles.figure}>
        {rooms.length > 0 ? (
          <ul className={styles.roomList}>
            {rooms.map((r) => (
              <li key={r.id}>
                <span>{r.name}</span>
                {r.areaSqm != null && <span className="tabular muted">{r.areaSqm} m²</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="body muted">The plan of this residence is available from the sales team.</p>
        )}
        <figcaption className="caption">{areaSqm} m² in total. The architect’s dimensioned plan is available from the sales team.</figcaption>
      </figure>
    );
  }

  const maxX = Math.max(...placed.map((r) => r.planX! + r.planW!));
  const maxY = Math.max(...placed.map((r) => r.planY! + r.planH!));
  const minX = Math.min(...placed.map((r) => r.planX!));
  const minY = Math.min(...placed.map((r) => r.planY!));
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  // The drawing's lower edge faces the residence's aspect; north turns to match.
  const north = (180 - COMPASS[orientation] + 360) % 360;
  const current = placed.find((r) => r.id === active) ?? null;

  return (
    <figure className={styles.figure}>
      {/* Not role="img": each room is a focusable control, and an image may
          not contain them. It is a group of controls with an accessible name. */}
      <svg viewBox={`${minX - PAD} ${minY - PAD} ${w} ${h}`} className={styles.svg} role="group" aria-labelledby={`plan-${label}`}>
        <title id={`plan-${label}`}>{`Plan of residence ${label}, ${areaSqm} square metres, opening toward the ${orientation}`}</title>
        <defs>
          <pattern id="terrace-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" className={styles.hatch} />
          </pattern>
        </defs>
        {placed.map((r) => (
          <g
            key={r.id}
            className={styles.roomGroup}
            data-active={active === r.id ? 'true' : 'false'}
            tabIndex={0}
            role="button"
            aria-label={`${r.name}${r.areaSqm != null ? `, ${r.areaSqm} square metres` : ''}`}
            onMouseEnter={() => setActive(r.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(r.id)}
            onBlur={() => setActive(null)}
          >
            <rect x={r.planX!} y={r.planY!} width={r.planW!} height={r.planH!} className={r.planOpen ? styles.open : styles.room} fill={r.planOpen ? 'url(#terrace-hatch)' : undefined} />
            <text x={r.planX! + r.planW! / 2} y={r.planY! + r.planH! / 2} className={styles.name} textAnchor="middle" dominantBaseline="middle">
              {r.name}
            </text>
          </g>
        ))}
        <g transform={`translate(${maxX + PAD - 30} ${maxY + PAD - 36}) rotate(${north})`} className={styles.north}>
          <path d="M0 -15 L6 7 L0 3 L-6 7 Z" />
        </g>
      </svg>
      <figcaption className="caption" aria-live="polite">
        {current ? `${current.name}${current.areaSqm != null ? ` · ${current.areaSqm} m²` : ''}${current.description ? ` — ${current.description}` : ''}` : `Indicative layout, not to scale. ${areaSqm} m² in total. The architect’s dimensioned plan is available from the sales team.`}
      </figcaption>
    </figure>
  );
}
