import type { LandmarkDto } from '../../lib/api';
import styles from './KigaliMap.module.css';

const SIZE = 600;
const C = SIZE / 2;

/** Kilometres east/north of the site, on a local flat projection (fine at city scale). */
function project(lat: number, lng: number, origin: { lat: number; lng: number }) {
  const kx = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (lng - origin.lng) * kx, y: -(lat - origin.lat) * 110.57 };
}

/**
 * Hills drawn as contour lines around three rises — a nod to the land of a
 * thousand hills, not survey data. Deterministic, so server and client agree.
 */
const CONTOURS: string[] = (() => {
  const hills = [
    { x: 190, y: 230, r: 64, seed: 1 },
    { x: 420, y: 395, r: 92, seed: 2 },
    { x: 405, y: 150, r: 54, seed: 3 },
    { x: 150, y: 450, r: 70, seed: 4 },
  ];
  const out: string[] = [];
  for (const h of hills) {
    for (let ring = 1; ring <= 4; ring++) {
      const pts: string[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const wobble = 1 + 0.09 * Math.sin(3 * t + h.seed) + 0.05 * Math.sin(5 * t + h.seed * 2.3);
        const r = h.r * ring * 0.55 * wobble;
        pts.push(`${(h.x + Math.cos(t) * r).toFixed(1)} ${(h.y + Math.sin(t) * r).toFixed(1)}`);
      }
      out.push(`M${pts.join(' L')}Z`);
    }
  }
  return out;
})();

// The site's own label, centred above the dot (18px display type).
const HOME_LABEL = { x0: C - 80, x1: C + 80, y0: C - 36, y1: C + 10 };

/** Puts a landmark's label beside its pin, clear of the site's label. */
function labelPlacement(px: number, py: number, name: string) {
  const w = name.length * 7;
  const hits = (x0: number, x1: number, y0: number, y1: number) =>
    x0 < HOME_LABEL.x1 && x1 > HOME_LABEL.x0 && y0 < HOME_LABEL.y1 && y1 > HOME_LABEL.y0;
  const top = py - 9;
  const bottom = py + 6;
  if (!hits(px + 10, px + 10 + w, top, bottom) && px + 10 + w <= SIZE) {
    return { x: 10, y: 4, anchor: 'start' as const };
  }
  if (!hits(px - 10 - w, px - 10, top, bottom) && px - 10 - w >= 0) {
    return { x: -10, y: 4, anchor: 'end' as const };
  }
  // Close to the site: the site's label sits above it, so go below the pin
  // unless the pin itself is above that label.
  return py < HOME_LABEL.y0
    ? { x: 0, y: -14, anchor: 'middle' as const }
    : { x: 0, y: Math.max(26, HOME_LABEL.y1 - py + 20), anchor: 'middle' as const };
}

/**
 * A minimal map of the neighbourhood: distance rings from the site, the
 * landmarks placed by their real coordinates, and nothing else — no tile
 * server, no third-party script, no cookie banner.
 */
export function KigaliMap({
  landmarks,
  origin,
  active,
}: {
  landmarks: LandmarkDto[];
  origin: { lat: number; lng: number };
  active: string | null;
}) {
  const pts = landmarks.map((l) => ({ l, p: project(l.latitude, l.longitude, origin) }));
  const maxKm = Math.max(3, ...pts.map(({ p }) => Math.hypot(p.x, p.y)));
  const scale = 250 / maxKm;
  const rings = [1, 2, 4, 6, 8].filter((r) => r <= maxKm + 0.6);
  const on = pts.find(({ l }) => l.id === active);

  return (
    <figure className={styles.map}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby="kigali-map-title">
        <title id="kigali-map-title">
          Map of Kimihurura with distance rings from Almasi Residences and nearby landmarks
        </title>
        <g className={styles.contours}>
          {CONTOURS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g className={styles.rings}>
          {rings.map((r) => (
            <g key={r}>
              <circle cx={C} cy={C} r={r * scale} />
              <text x={C + r * scale * 0.71 + 6} y={C - r * scale * 0.71 - 6}>
                {r} km
              </text>
            </g>
          ))}
        </g>
        {on && (
          <line
            className={styles.ray}
            x1={C}
            y1={C}
            x2={C + on.p.x * scale}
            y2={C + on.p.y * scale}
          />
        )}
        {pts.map(({ l, p }) => {
          const px = C + p.x * scale;
          const py = C + p.y * scale;
          const label = labelPlacement(px, py, l.name);
          return (
            <g
              key={l.id}
              className={styles.pin}
              data-active={l.id === active ? 'true' : 'false'}
              transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}
            >
              <circle r={4} />
              <text x={label.x} y={label.y} textAnchor={label.anchor}>
                {l.name}
              </text>
            </g>
          );
        })}
        <g className={styles.home} transform={`translate(${C} ${C})`}>
          <circle className={styles.pulse} r={12} />
          <circle r={5.5} />
          <text y={-20} textAnchor="middle">
            Almasi Residences
          </text>
        </g>
        <g className={styles.north} transform="translate(560 48)">
          <path d="M0 -16 L7 8 L0 3 L-7 8 Z" />
          <text y={28} textAnchor="middle">
            N
          </text>
        </g>
      </svg>
    </figure>
  );
}
