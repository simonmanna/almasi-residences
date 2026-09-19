'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatMoney } from '@avida/types';
import {
  STATUS_TEXT,
  TYPE_TEXT,
  visiblePriceMinor,
  type FloorSummary,
  type Residence,
} from '../../lib/residences';
import { prefersLightMedia, useReducedMotion } from '../../lib/motion';
import { useInventory } from '../providers/InventoryProvider';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { ElevationStack, StatusLegend } from './ElevationStack';
import type { ViewCommand, ViewCommandKind } from './Building3D';
import styles from './ExploreAlmasi.module.css';

const Building3D = dynamic(() => import('./Building3D'), { ssr: false });

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

const floorName = (f: FloorSummary) =>
  f.level < 0 ? 'Basement' : f.level === 0 ? 'Ground floor' : f.mark === 'PH' ? 'Penthouses' : f.label;

/**
 * 03 — Explore Almasi. The maquette turns, a floor lifts out, and the
 * residences on it are named, sized and marked as the inventory says right
 * now. The panel beside it is the same inventory in words, and the whole
 * thing works without the 3D: keyboard, screen reader and no-WebGL visitors
 * get the elevation stack and the lists.
 */
export function ExploreAlmasi({
  id = 'explore',
  heading = 'Explore Almasi',
  lede = 'Turn the building, lift out a floor, and see every residence as it stands today. Lit means available.',
  matchIds = null,
}: {
  id?: string;
  heading?: string;
  lede?: string;
  matchIds?: ReadonlySet<string> | null;
}) {
  const { residences, floors, summary } = useInventory();
  const { open } = useEnquiry();
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());

  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'model' | 'elevation'>('model');
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [command, setCommand] = useState<ViewCommand | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const ok = supportsWebGL();
    setWebgl(ok);
    if (!ok) setMode('elevation');
    setQuality(prefersLightMedia() || window.innerWidth < 760 ? 'low' : 'high');
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // Three.js is the heaviest thing this page can fetch, so a phone gets a
    // tighter trigger than a desktop that can afford the head start.
    const loader = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), {
      rootMargin: window.innerWidth < 760 ? '200px 0px' : '600px 0px',
    });
    const loop = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? false));
    loader.observe(el);
    loop.observe(el);
    return () => {
      loader.disconnect();
      loop.disconnect();
    };
  }, []);

  const selected = residences.find((r) => r.id === selectedId) ?? null;
  const focusFloor = floors.find((f) => f.level === focusLevel) ?? null;
  const floorUnits =
    focusLevel === null
      ? []
      : residences.filter((r) => r.floorLevel === focusLevel).sort((a, b) => a.positionIndex - b.positionIndex);

  const send = (kind: ViewCommandKind) => setCommand({ kind, nonce: performance.now() });
  const chooseFloor = (level: number | null) => {
    setFocusLevel(level);
    setSelectedId(null);
  };
  const selectResidence = (r: Residence) => {
    setSelectedId(r.id);
    setFocusLevel(r.floorLevel);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, ViewCommandKind> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      '+': 'zoom-in',
      '=': 'zoom-in',
      '-': 'zoom-out',
      '0': 'reset',
    };
    if (e.key === 'Escape') {
      chooseFloor(null);
      return;
    }
    const kind = map[e.key];
    if (kind) {
      e.preventDefault();
      send(kind);
      setTouched(true);
    }
  };

  const showModel = mode === 'model' && webgl !== false;

  return (
    <section id={id} className={styles.explore} data-ground="night" aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.head}`}>
        <div>
          <p className={`mark kicker-lg ${styles.kicker}`}>The building</p>
          <h2 id={`${id}-title`} className="title-sm">
            {heading}
          </h2>
        </div>
        <div className={styles.lede}><p>{lede}</p><Link href="/3d-design" className={styles.designLink}>Enter the 3D Design experience ↗</Link></div>
        <div className={styles.switch} role="group" aria-label="How to show the building">
          <button
            type="button"
            aria-pressed={mode === 'model'}
            disabled={webgl === false}
            onClick={() => setMode('model')}
          >
            3D model
          </button>
          <button type="button" aria-pressed={mode === 'elevation'} onClick={() => setMode('elevation')}>
            Elevation
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <div
          ref={stageRef}
          className={styles.stage}
          hidden={!showModel}
          tabIndex={showModel ? 0 : -1}
          role="application"
          aria-roledescription="3D model"
          aria-label="Model of Almasi Residences. Arrow keys turn it, plus and minus zoom, Escape returns to the whole building. Floors and residences are listed beside it."
          onKeyDown={onKey}
          data-cursor={touched ? undefined : 'Drag'}
        >
          {near && showModel && (
            <Building3D
              residences={residences}
              focusLevel={focusLevel}
              hoveredId={hoveredId}
              selectedId={selectedId}
              matchIds={matchIds}
              onHover={setHoveredId}
              onSelect={selectResidence}
              command={command}
              labelRefs={labelRefs}
              active={onScreen}
              quality={quality}
              reducedMotion={reduced}
              onInteract={() => setTouched(true)}
            />
          )}

          <div className={styles.labels} aria-hidden="true">
            {residences.map((r) => (
              <button
                key={r.id}
                type="button"
                tabIndex={-1}
                ref={(el) => {
                  if (el) labelRefs.current.set(r.id, el);
                  else labelRefs.current.delete(r.id);
                }}
                className={styles.label}
                data-status={r.publicStatus}
                data-visible="false"
                onClick={() => selectResidence(r)}
              >
                <b>{r.label}</b>
                {(r.id === hoveredId || r.id === selectedId) && (
                  <em>
                    {TYPE_TEXT[r.type]}, {r.areaSqm} m², {STATUS_TEXT[r.publicStatus].toLowerCase()}
                  </em>
                )}
              </button>
            ))}
          </div>

          <div className={styles.controls}>
            <button type="button" aria-label="Zoom in" onClick={() => send('zoom-in')}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => send('zoom-out')}>
              −
            </button>
            <button type="button" className={styles.reset} onClick={() => send('reset')}>
              Reset view
            </button>
          </div>

          {!touched && <p className={styles.hint}>Drag to turn. Pinch to zoom.</p>}
          <StatusLegend className={styles.legend} tone="model" />
        </div>

        {!showModel && (
          <div className={`${styles.elevation} container`}>
            <ElevationStack
              residences={residences}
              floors={floors}
              focusLevel={focusLevel}
              selectedId={selectedId}
              matchIds={matchIds}
              onSelect={selectResidence}
              onFocusLevel={chooseFloor}
              onHover={setHoveredId}
            />
            <StatusLegend className={styles.legendStatic} />
          </div>
        )}

        <aside className={styles.panel} aria-label="Floors and residences">
          <div className={styles.floors} role="group" aria-label="Choose a floor">
            <button
              type="button"
              className={styles.floor}
              aria-pressed={focusLevel === null}
              onClick={() => chooseFloor(null)}
            >
              <span className={styles.floorMark}>All</span>
              <span>Whole building</span>
              <span className={styles.floorCount}>
                {summary.available} of {summary.total}
              </span>
            </button>
            {floors.map((f) => (
              <button
                key={f.level}
                type="button"
                className={styles.floor}
                aria-pressed={focusLevel === f.level}
                onClick={() => chooseFloor(f.level)}
              >
                <span className={styles.floorMark}>{f.mark}</span>
                <span>{floorName(f)}</span>
                <span className={styles.floorCount}>
                  {f.total > 0 ? `${f.available} of ${f.total}` : 'Parking'}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.detail} aria-live="polite">
            {selected ? (
              <ResidenceSummary
                r={selected}
                onBack={() => setSelectedId(null)}
                onEnquire={() =>
                  open({
                    residence: {
                      id: selected.id,
                      label: selected.label,
                      summary: `${TYPE_TEXT[selected.type]}, ${selected.areaSqm} m², ${selected.floorLabel.toLowerCase()}`,
                    },
                    intent: 'INFORMATION',
                    source: 'explore',
                  })
                }
              />
            ) : focusFloor && focusFloor.level < 0 ? (
              <p className={styles.note}>
                The basement holds a parking bay for every residence, with storage and the building’s plant.
                Lifts run from here to every floor.
              </p>
            ) : focusFloor ? (
              <>
                <p className={styles.detailHead}>
                  {floorName(focusFloor)}: {focusFloor.available} of {focusFloor.total} available
                </p>
                <ul className={styles.units}>
                  {floorUnits.map((r) => {
                    const price = visiblePriceMinor(r);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={styles.unit}
                          onClick={() => selectResidence(r)}
                          onMouseEnter={() => setHoveredId(r.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onFocus={() => setHoveredId(r.id)}
                          onBlur={() => setHoveredId(null)}
                        >
                          <span className={styles.unitCode}>{r.label}</span>
                          <span className={styles.unitMeta}>
                            {TYPE_TEXT[r.type]}
                            <br />
                            <span className="tabular">{r.areaSqm} m²</span>
                          </span>
                          <span className={styles.unitEnd}>
                            <span className="status" data-status={r.publicStatus}>
                              {STATUS_TEXT[r.publicStatus]}
                            </span>
                            {price !== null && (
                              <span className="tabular muted">
                                {formatMoney({ amountMinor: price, currency: r.currency })}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className={styles.note}>
                {summary.available} of {summary.total} residences are available today. Choose a floor to see
                each one, or open the full list of <Link href="/residences" className="link-line">residences</Link>.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ResidenceSummary({ r, onBack, onEnquire }: { r: Residence; onBack: () => void; onEnquire: () => void }) {
  const price = visiblePriceMinor(r);
  return (
    <div className={styles.summary}>
      <button type="button" className={`${styles.back} link-line`} onClick={onBack}>
        Back to {r.floorLabel.toLowerCase()}
      </button>
      <p className={styles.summaryCode}>{r.label}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Type</dt>
          <dd>{TYPE_TEXT[r.type]}</dd>
        </div>
        <div>
          <dt>Interior</dt>
          <dd className="tabular">{r.areaSqm} m²</dd>
        </div>
        <div>
          <dt>Floor</dt>
          <dd>{r.floorLabel}</dd>
        </div>
        <div>
          <dt>Faces</dt>
          <dd>{r.orientation}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="status" data-status={r.publicStatus}>
              {STATUS_TEXT[r.publicStatus]}
            </span>
          </dd>
        </div>
        {price !== null && (
          <div>
            <dt>Price</dt>
            <dd className="tabular">{formatMoney({ amountMinor: price, currency: r.currency })}</dd>
          </div>
        )}
      </dl>
      <div className={styles.summaryActions}>
        <Link href={`/residences/${r.slug}`} className="btn btn--solid">
          View residence
        </Link>
        <Link href={`/3d-design?residence=${r.slug}`} className="btn btn--ghost">
          Explore in 3D
        </Link>
        {r.publicStatus === 'available' && (
          <button type="button" className="btn btn--ghost" onClick={onEnquire}>
            Enquire about {r.label}
          </button>
        )}
      </div>
    </div>
  );
}
