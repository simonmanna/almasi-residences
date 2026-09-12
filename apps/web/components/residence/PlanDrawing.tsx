import type { Orientation } from '@avida/types';
import type { ResidenceType } from '../../lib/residences';
import styles from './PlanDrawing.module.css';

type Room = { x: number; y: number; w: number; h: number; name: string; open?: boolean };

/**
 * Indicative plans, drawn as an architect's diagram rather than a picture:
 * rooms, their relationships and the side that opens to the view. They are
 * not to scale and say so; the architect's dimensioned plans replace them.
 */
const PLANS: Record<ResidenceType, { w: number; h: number; rooms: Room[] }> = {
  'one-bedroom': {
    w: 600,
    h: 430,
    rooms: [
      { x: 20, y: 20, w: 200, h: 130, name: 'Kitchen' },
      { x: 220, y: 20, w: 120, h: 130, name: 'Entry' },
      { x: 340, y: 20, w: 120, h: 130, name: 'Bath' },
      { x: 460, y: 20, w: 120, h: 130, name: 'Wardrobe' },
      { x: 20, y: 150, w: 320, h: 200, name: 'Living and dining' },
      { x: 340, y: 150, w: 240, h: 200, name: 'Bedroom' },
      { x: 20, y: 350, w: 560, h: 60, name: 'Balcony', open: true },
    ],
  },
  'two-bedroom': {
    w: 760,
    h: 470,
    rooms: [
      { x: 20, y: 20, w: 190, h: 160, name: 'Bedroom 2' },
      { x: 210, y: 20, w: 110, h: 160, name: 'Bath' },
      { x: 320, y: 20, w: 200, h: 160, name: 'Entry and hall' },
      { x: 520, y: 20, w: 110, h: 160, name: 'En-suite' },
      { x: 630, y: 20, w: 110, h: 160, name: 'Walk-in' },
      { x: 20, y: 180, w: 340, h: 210, name: 'Living and dining' },
      { x: 360, y: 180, w: 170, h: 210, name: 'Kitchen' },
      { x: 530, y: 180, w: 210, h: 210, name: 'Main bedroom' },
      { x: 20, y: 390, w: 720, h: 60, name: 'Balcony', open: true },
    ],
  },
  'three-bedroom': {
    w: 820,
    h: 470,
    rooms: [
      { x: 20, y: 20, w: 170, h: 160, name: 'Bedroom 2' },
      { x: 190, y: 20, w: 170, h: 160, name: 'Bedroom 3' },
      { x: 360, y: 20, w: 100, h: 160, name: 'Bath' },
      { x: 460, y: 20, w: 120, h: 160, name: 'Entry' },
      { x: 580, y: 20, w: 110, h: 160, name: 'En-suite' },
      { x: 690, y: 20, w: 110, h: 160, name: 'Walk-in' },
      { x: 20, y: 180, w: 360, h: 210, name: 'Living and dining' },
      { x: 380, y: 180, w: 180, h: 210, name: 'Kitchen' },
      { x: 560, y: 180, w: 240, h: 210, name: 'Main bedroom' },
      { x: 20, y: 390, w: 780, h: 60, name: 'Balcony', open: true },
    ],
  },
  penthouse: {
    w: 900,
    h: 540,
    rooms: [
      { x: 110, y: 20, w: 170, h: 150, name: 'Bedroom 3' },
      { x: 280, y: 20, w: 100, h: 150, name: 'Bath' },
      { x: 380, y: 20, w: 150, h: 150, name: 'Study' },
      { x: 530, y: 20, w: 110, h: 150, name: 'Powder' },
      { x: 640, y: 20, w: 240, h: 150, name: 'Bedroom 2 and bath' },
      { x: 110, y: 170, w: 400, h: 250, name: 'Living and dining' },
      { x: 510, y: 170, w: 170, h: 250, name: 'Kitchen' },
      { x: 680, y: 170, w: 200, h: 250, name: 'Master suite' },
      { x: 20, y: 20, w: 90, h: 400, name: 'Terrace', open: true },
      { x: 20, y: 420, w: 860, h: 100, name: 'Terrace', open: true },
    ],
  },
};

const COMPASS: Record<Orientation, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

export function PlanDrawing({
  type,
  orientation,
  areaSqm,
  label,
}: {
  type: ResidenceType;
  orientation: Orientation;
  areaSqm: number;
  label: string;
}) {
  const plan = PLANS[type];
  // The drawing's lower edge faces the residence's aspect; north turns to match.
  const north = (180 - COMPASS[orientation] + 360) % 360;

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${plan.w} ${plan.h}`}
        className={styles.svg}
        role="img"
        aria-labelledby={`plan-${label}`}
      >
        {/* One string: several text nodes inside an SVG <title> do not survive hydration. */}
        <title id={`plan-${label}`}>
          {`Indicative plan of residence ${label}, ${areaSqm} square metres, opening toward the ${orientation}`}
        </title>
        <defs>
          <pattern id="terrace-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" className={styles.hatch} />
          </pattern>
        </defs>
        {plan.rooms.map((r, i) => (
          <g key={i}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              className={r.open ? styles.open : styles.room}
              fill={r.open ? 'url(#terrace-hatch)' : undefined}
            />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} className={styles.name} textAnchor="middle" dominantBaseline="middle">
              {r.name}
            </text>
          </g>
        ))}
        <rect x={20} y={20} width={plan.w - 40} height={plan.h - 40} className={styles.shell} />
        <g transform={`translate(${plan.w - 34} ${plan.h - 40}) rotate(${north})`} className={styles.north}>
          <path d="M0 -15 L6 7 L0 3 L-6 7 Z" />
        </g>
      </svg>
      <figcaption className="caption">
        Indicative layout, not to scale. {areaSqm} m² interior. The architect’s dimensioned plan is
        available from the sales team.
      </figcaption>
    </figure>
  );
}
