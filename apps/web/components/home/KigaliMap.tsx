'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistance } from '@avida/types';
import type { LandmarkDto } from '../../lib/api';
import { distanceText, driveText, walkText } from '../../lib/distance';
import styles from './KigaliMap.module.css';

const SIZE = 600;
const C = SIZE / 2;
const RADIUS = 232; // how far from the centre the outermost framed pin sits
const MAX_K = 4;

/** Kilometres east/north of the site, on a local flat projection (fine at city scale). */
function project(lat: number, lng: number, origin: { lat: number; lng: number }) {
  const kx = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (lng - origin.lng) * kx, y: -(lat - origin.lat) * 110.57 };
}

/**
 * Hills drawn as contour lines around four rises — a nod to the land of a
 * thousand hills, not survey data. Deterministic, so server and client agree.
 *
 * Everything else on this map is measured: the pins sit at the landmarks'
 * real coordinates and the rings are real distances. No street, park or
 * waterway is drawn, because drawing one we had not surveyed would tell a
 * buyer something about the neighbourhood that we do not actually know.
 */
const CONTOURS: { d: string; ring: number }[] = (() => {
  const hills = [
    { x: -150, y: -108, r: 30, seed: 1 },
    { x: 156, y: 128, r: 42, seed: 2 },
    { x: 132, y: -178, r: 26, seed: 3 },
    { x: -186, y: 176, r: 34, seed: 4 },
    { x: -34, y: 210, r: 24, seed: 5 },
    { x: 214, y: -36, r: 28, seed: 6 },
  ];
  const out: { d: string; ring: number }[] = [];
  for (const h of hills) {
    for (let ring = 1; ring <= 5; ring++) {
      const pts: string[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const wobble = 1 + 0.09 * Math.sin(3 * t + h.seed) + 0.05 * Math.sin(5 * t + h.seed * 2.3);
        const r = h.r * ring * 0.5 * wobble;
        pts.push(`${(h.x + Math.cos(t) * r).toFixed(1)} ${(h.y + Math.sin(t) * r).toFixed(1)}`);
      }
      out.push({ d: `M${pts.join(' L')}Z`, ring });
    }
  }
  return out;
})();

/** The teardrop every visitor already reads as "a place on a map". */
const PIN_PATH = 'M0 0c-3.4-6.2-9.6-10.2-9.6-16.6a9.6 9.6 0 1 1 19.2 0C9.6-10.2 3.4-6.2 0 0Z';

const CATEGORY_TEXT: Record<string, string> = {
  BUSINESS: 'Business',
  SHOPPING: 'Shopping',
  HOSPITAL: 'Health',
  SCHOOL: 'School',
  AIRPORT: 'Airport',
  LEISURE: 'Leisure',
  EMBASSY: 'Embassy',
};

/** One glyph per category, drawn inside the pin's head at 12px. */
const CATEGORY_GLYPH: Record<string, string> = {
  BUSINESS: 'M-4-4h8v8h-8Zm2-3h4v3h-4Z',
  SHOPPING: 'M-4.5-2.5h9l-1 7h-7Zm2.5 0a2.5 2.5 0 0 1 5 0',
  HOSPITAL: 'M-1.4-4.5h2.8v3.1h3.1v2.8h-3.1v3.1h-2.8v-3.1h-3.1v-2.8h3.1Z',
  SCHOOL: 'M0-4.8 5.2-2 0 .8-5.2-2Zm-3.4 3.2v3L0 4.8l3.4-1.4v-3L0 2.2Z',
  AIRPORT: 'M0-5.2c.8 0 1.2.7 1.2 1.6v1.7l4 2.4v1.4l-4-1.2v2.4l1.4 1v1L0 5.4l-2.6.9v-1l1.4-1V1.9l-4 1.2V1.7l4-2.4v-1.7c0-.9.4-1.6 1.2-1.6Z',
  LEISURE: 'M0-5a5 5 0 1 1 0 10A5 5 0 0 1 0-5Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
  EMBASSY: 'M-3-5h.9v10H-3Zm.9 0L4.2-3-2.1-1Z',
};

export const CATEGORY_LABEL = CATEGORY_TEXT;

/** The distance the opening frame is built around. One airport 8 km out must
    not shrink the eight places within walking distance into a single blob, so
    the frame is cut at the third quartile and zooming out reaches the rest. */
function framedKm(distances: number[]) {
  if (distances.length === 0) return 3;
  const sorted = [...distances].sort((a, b) => a - b);
  const q3 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]!;
  return Math.max(1.2, q3 * 1.15);
}

/** A round number of kilometres for the scale bar, at the current zoom. */
function scaleStep(pxPerKm: number) {
  for (const km of [0.25, 0.5, 1, 2, 5, 10, 20]) {
    if (km * pxPerKm >= 90) return km;
  }
  return 20;
}

export interface KigaliMapProps {
  landmarks: LandmarkDto[];
  origin: { lat: number; lng: number };
  /** Hovered in the list beside the map, or on the map itself. */
  active: string | null;
  /** Pinned open by a click, on either side. */
  selected?: string | null;
  /** A category chosen in the list: the rest of the pins fade back rather
      than disappear, so the map never re-scales under the visitor. */
  filter?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  originLabel?: string;
}

/**
 * The neighbourhood as a map a buyer already knows how to use: pins they can
 * click, a card that names the place and how far it is, zoom and recentre
 * controls, a scale bar and a compass — and no tile server, no third-party
 * script and no cookie banner behind any of it.
 */
export function KigaliMap({
  landmarks,
  origin,
  active,
  selected = null,
  filter = null,
  onHover,
  onSelect,
  originLabel = 'Almasi Residence',
}: KigaliMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  // The scale bar is the one thing here measured in real pixels rather than
  // in the 600-unit box, so the frame's rendered width has to be known.
  const [framePx, setFramePx] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFramePx(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Positions are measured once per landmark set: the site sits at 0,0 and
  // everything else is placed from its real coordinates.
  const { pts, scale, rings, minK } = useMemo(() => {
    const p = landmarks.map((l) => ({ l, p: project(l.latitude, l.longitude, origin) }));
    const km = p.map(({ p: q }) => Math.hypot(q.x, q.y));
    const framed = framedKm(km);
    const furthest = Math.max(framed, ...km);
    const s = RADIUS / framed;
    return {
      pts: p,
      scale: s,
      // Zooming all the way out has to reach the furthest landmark there is.
      minK: Math.min(0.75, (framed / furthest) * 0.92),
      rings: [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16].filter((r) => r <= furthest + 0.6),
    };
  }, [landmarks, origin]);

  const clampK = useCallback((k: number) => Math.min(MAX_K, Math.max(minK, k)), [minK]);

  /** Landmark kilometres to a point in the frame's 600×600 box. */
  const toFrame = useCallback(
    (q: { x: number; y: number }) => ({
      x: C + view.x + q.x * scale * view.k,
      y: C + view.y + q.y * scale * view.k,
    }),
    [view, scale],
  );

  const open = selected ?? active;
  const openPt = pts.find(({ l }) => l.id === open) ?? null;

  // Picking the airport from the list must not point at an empty frame: if the
  // pin is outside the view, pull back until it is inside it.
  useEffect(() => {
    if (!selected) return;
    const pt = pts.find(({ l }) => l.id === selected);
    if (!pt) return;
    const km = Math.hypot(pt.p.x, pt.p.y);
    setView((v) => {
      const needed = (RADIUS * 0.88) / (km * scale);
      return needed >= v.k ? v : { x: 0, y: 0, k: clampK(needed) };
    });
  }, [selected, pts, scale, clampK]);

  const zoom = (factor: number) =>
    setView((v) => {
      const k = clampK(v.k * factor);
      const ratio = k / v.k;
      return { x: v.x * ratio, y: v.y * ratio, k };
    });

  const recentre = () => setView({ x: 0, y: 0, k: 1 });

  // Dragging pans. The wheel is deliberately left alone: this map sits in the
  // middle of a long page, and a map that eats the scroll is the single most
  // complained-about thing on the web.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Pointer pixels are frame pixels; the SVG box is 600 wide whatever the frame is.
    const unit = SIZE / rect.width;
    const dx = (e.clientX - d.x) * unit;
    const dy = (e.clientY - d.y) * unit;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const limit = SIZE * 0.5 * view.k;
    setView((v) => ({
      ...v,
      x: Math.max(-limit, Math.min(limit, v.x + dx)),
      y: Math.max(-limit, Math.min(limit, v.y + dy)),
    }));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && !d.moved) onSelect?.(null);
  };

  // Escape closes the card, as it does everywhere else on the site.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelect?.(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect]);

  const pxPerKm = scale * view.k;
  const step = scaleStep(pxPerKm);
  const barPx = ((step * pxPerKm) / SIZE) * framePx;

  const card = openPt
    ? (() => {
        const f = toFrame(openPt.p);
        const left = Math.max(4, Math.min(96, (f.x / SIZE) * 100));
        const top = Math.max(4, Math.min(96, (f.y / SIZE) * 100));
        return { l: openPt.l, left, top, flipX: left > 52, flipY: top < 34 };
      })()
    : null;

  return (
    <figure className={styles.map}>
      <div
        ref={frameRef}
        className={styles.frame}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => zoom(1.6)}
      >
        {/* A group, not an image: the landmarks inside it are buttons, and an
            image may not contain anything a keyboard can reach. */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-labelledby="kigali-map-title">
          {/* One interpolated string, not a mix of text and expressions: React
              serialises a multi-child <title> differently on the server and
              the client, which fails hydration. */}
          <title id="kigali-map-title">
            {`Map of Kimihurura: ${originLabel} at the centre, with distance rings and ${landmarks.length} nearby landmarks placed by their coordinates.`}
          </title>

          {/* Terrain and rings move and grow with the map. */}
          <g transform={`translate(${C + view.x} ${C + view.y}) scale(${view.k})`}>
            <g className={styles.contours}>
              {CONTOURS.map((c, i) => (
                <path key={i} d={c.d} style={{ opacity: 0.26 - c.ring * 0.035 }} />
              ))}
            </g>

            <g className={styles.rings}>
              {rings
                .filter((r) => r * scale * view.k > 26)
                .map((r) => (
                  <circle key={r} cx={0} cy={0} r={r * scale} />
                ))}
            </g>

            {openPt && (
              <line
                className={styles.ray}
                x1={0}
                y1={0}
                x2={openPt.p.x * scale}
                y2={openPt.p.y * scale}
              />
            )}
          </g>

          {/* Pins, labels and ring captions keep their size at every zoom —
              a 14px label is 14px whether you are looking at 1 km or 8. */}
          <g className={styles.rings} aria-hidden="true">
            {rings.map((r) => {
              // The caption sits where the ring crosses the north-east diagonal.
              const radius = r * scale * view.k;
              // Zoomed out, the inner rings crowd into the centre: label only
              // the ones with room to be read.
              if (radius < 58) return null;
              const x = C + view.x + radius * 0.707;
              const y = C + view.y - radius * 0.707;
              if (x < 24 || x > SIZE - 24 || y < 24 || y > SIZE - 24) return null;
              return (
                <text key={r} x={x + 5} y={y - 5}>
                  {r < 1 ? `${r * 1000} m` : `${r} km`}
                </text>
              );
            })}
          </g>

          {[...pts]
            .sort((a, b) => Number(a.l.id === open) - Number(b.l.id === open))
            .map(({ l, p }) => {
            const f = toFrame(p);
            if (f.x < -40 || f.x > SIZE + 40 || f.y < -40 || f.y > SIZE + 40) return null;
            const isOpen = l.id === open;
            const dim = filter !== null && l.category !== filter;
            return (
              <g
                key={l.id}
                className={styles.pin}
                data-active={isOpen ? 'true' : 'false'}
                data-dim={dim ? 'true' : 'false'}
                data-category={l.category}
                aria-hidden={dim ? 'true' : undefined}
                transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`}
                tabIndex={dim ? -1 : 0}
                role="button"
                aria-pressed={selected === l.id}
                aria-label={`${l.name}, ${CATEGORY_TEXT[l.category] ?? l.category}${
                  l.distanceM !== null ? `, ${formatDistance(l.distanceM)} away` : ''
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dim) return;
                  onSelect?.(selected === l.id ? null : l.id);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelect?.(selected === l.id ? null : l.id);
                }}
                onMouseEnter={() => !dim && onHover?.(l.id)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(l.id)}
                onBlur={() => onHover?.(null)}
              >
                <ellipse className={styles.pinShadow} cx={0} cy={1.5} rx={5} ry={2} />
                <path className={styles.pinBody} d={PIN_PATH} />
                <path
                  className={styles.pinGlyph}
                  d={CATEGORY_GLYPH[l.category] ?? CATEGORY_GLYPH.BUSINESS}
                  transform="translate(0 -16.6)"
                />
                <circle className={styles.hit} r={16} cy={-10} />
              </g>
              );
            })}

          {/* The site itself, always on top of everything else. */}
          <g
            className={styles.home}
            transform={`translate(${(C + view.x).toFixed(1)} ${(C + view.y).toFixed(1)})`}
          >
            <circle className={styles.pulse} r={12} />
            <circle className={styles.homeRing} r={10} />
            <circle className={styles.homeDot} r={5} />
          </g>
        </svg>

        {/* The site's name is HTML, not SVG: it has to sit on a plate and wrap. */}
        <p
          className={styles.homeLabel}
          aria-hidden="true"
          style={{
            left: `${((C + view.x) / SIZE) * 100}%`,
            top: `${((C + view.y) / SIZE) * 100}%`,
          }}
        >
          {originLabel}
        </p>

        {card && (
          <div
            className={styles.card}
            data-flip-x={card.flipX ? 'true' : 'false'}
            data-flip-y={card.flipY ? 'true' : 'false'}
            style={{ left: `${card.left}%`, top: `${card.top}%` }}
            role="status"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className={styles.cardCat} data-category={card.l.category}>
              {CATEGORY_TEXT[card.l.category] ?? card.l.category}
            </p>
            <p className={styles.cardName}>{card.l.name}</p>
            <p className={styles.cardMeta}>
              {card.l.distanceM !== null && <span>{distanceText(card.l)}</span>}
              {card.l.driveMinutes ? <span>{driveText(card.l, 'drive')}</span> : null}
              {card.l.walkMinutes ? <span>{walkText(card.l, 'walk')}</span> : null}
            </p>
            <a
              className={styles.cardLink}
              href={`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${card.l.latitude},${card.l.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Directions
            </a>
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button type="button" onClick={() => zoom(1.5)} disabled={view.k >= MAX_K} aria-label="Zoom in">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" onClick={() => zoom(1 / 1.5)} disabled={view.k <= minK} aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          className={styles.recentre}
          onClick={recentre}
          disabled={view.k === 1 && view.x === 0 && view.y === 0}
          aria-label="Recentre on the site"
        >
          <svg viewBox="-12 -12 24 24" aria-hidden="true">
            <circle r="4.5" />
            <path d="M0-11v4M0 7v4M-11 0h4M7 0h4" />
          </svg>
        </button>
      </div>

      <div className={styles.compass} aria-hidden="true">
        <svg viewBox="-16 -20 32 40">
          <path d="M0-16 7 6 0 1.5-7 6Z" />
          <text y="17" textAnchor="middle">
            N
          </text>
        </svg>
      </div>

      <div className={styles.scaleBar} aria-hidden="true">
        <span className={styles.scaleRule} style={{ width: `${Math.round(barPx)}px` }} />
        <span className={styles.scaleText}>{step < 1 ? `${step * 1000} m` : `${step} km`}</span>
      </div>

      <figcaption className={styles.hint}>
        Drag to pan, double-click to zoom. Straight-line distances from the site.
      </figcaption>
    </figure>
  );
}
