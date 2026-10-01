'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toMajorUnits } from '@avida/types';
import { useInventory } from '../providers/InventoryProvider';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { STATUS_TEXT, TYPE_TEXT, visiblePriceMinor, type Residence } from '../../lib/residences';
import { track } from '../../lib/analytics';
import {
  EXTERIOR_HOTSPOTS,
  INITIAL_TWIN,
  PLACES,
  roomById,
  sceneFor,
  type Environment,
  type InteriorMode,
  type Place,
  type RoomId,
  type TourScene,
  type TwinState,
} from '../../lib/digital-twin';
import type { EngineUnit, Quality, TwinEngine } from './engine/Engine';
import { useAmbience } from './ambience';
import styles from './DigitalTwin.module.css';

type Phase = 'idle' | 'loading' | 'ready' | 'failed';

const ENVS: { id: Environment; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
];
const MODES: { id: InteriorMode; label: string }[] = [
  { id: 'tour', label: 'Tour' },
  { id: 'walk', label: 'Walk' },
  { id: 'dollhouse', label: 'Dollhouse' },
];

const priceFmt = new Map<string, Intl.NumberFormat>();
function price(r: Residence): string | null {
  const minor = visiblePriceMinor(r);
  if (minor === null) return null;
  let f = priceFmt.get(r.currency);
  if (!f) {
    f = new Intl.NumberFormat('en', { style: 'currency', currency: r.currency, maximumFractionDigits: 0 });
    priceFmt.set(r.currency, f);
  }
  return f.format(toMajorUnits(minor, r.currency));
}

const DOCK_LABEL: Record<Exclude<Place, 'residence'>, string> = {
  exterior: 'Building',
  arrival: 'Arrival',
  reception: 'Reception',
  pool: 'Pool',
  garden: 'Gardens',
};

/** A render of each kind of home, from the site's own media, for the residence card. */
const TYPE_IMAGE: Record<Residence['type'], { src: string; alt: string }> = {
  'one-bedroom': { src: '/media/almasi/one-living.jpg', alt: 'A one-bedroom living room at dusk' },
  'two-bedroom': { src: '/media/almasi/living-2br.jpg', alt: 'A two-bedroom living room at dusk' },
  'three-bedroom': { src: '/media/almasi/living-2br.jpg', alt: 'A living room at dusk' },
  penthouse: { src: '/media/almasi/ph-living.jpg', alt: 'A penthouse living room at dusk' },
};

const GALLERY: readonly (readonly [src: string, caption: string])[] = [
  ['/media/almasi/aerial.jpg', 'Almasi from above'],
  ['/media/almasi/living-2br.jpg', 'Two-bedroom living room'],
  ['/media/almasi/ph-terrace.jpg', 'Penthouse terrace'],
  ['/media/almasi/pool.jpg', 'The pool'],
  ['/media/almasi/lobby.jpg', 'Reception'],
  ['/media/almasi/ph-bedroom.jpg', 'Penthouse primary suite'],
];

const ICONS = {
  arrow: 'M4 12h15M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'M9 6l6 6-6 6',
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const floorShort = (level: number) => (level === 4 ? 'PH' : level === 0 ? 'G' : String(level));

function detect(): { webgl: boolean; quality: Quality } {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return { webgl: false, quality: 'lite' };
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    // Integrated and software GPUs start light; the engine only ever steps down from here.
    const weakGpu = /Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i.test(gpu);
    return { webgl: true, quality: mobile || weakGpu || mem <= 4 || cores <= 4 ? 'lite' : 'high' };
  } catch {
    return { webgl: false, quality: 'lite' };
  }
}

function emit(action: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent('almasi:3d', { detail: { action, ...detail } }));
}

export function DigitalTwin() {
  const { residences, ready } = useInventory();
  const { open } = useEnquiry();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<TwinEngine | null>(null);
  const planDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ p: 0, step: 'Preparing your experience' });
  const [quality, setQuality] = useState<Quality>('high');
  const [state, setState] = useState<TwinState>(INITIAL_TWIN);
  const [focus, setFocus] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [availability, setAvailability] = useState(false);
  const [pose, setPose] = useState({ x: 0, z: 4, yaw: Math.PI, room: INITIAL_TWIN.room as RoomId | null });
  const [caption, setCaption] = useState<string | null>(null);
  const [cinematic, setCinematic] = useState(false);
  const [fading, setFading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'list' | 'card' | 'rooms'>('none');
  const [listOpen, setListOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const deepLink = useRef<{ key: string | null; tour: boolean } | null>(null);
  const [linkWaited, setLinkWaited] = useState(false);

  const selected = residences.find((r) => r.id === selectedId) ?? null;
  const { scene: tour, demo } = sceneFor(selected ? { typologySlug: selected.typologySlug } : null);
  useAmbience(sound, state.place === 'residence');
  const hovered = residences.find((r) => r.id === hoveredId) ?? null;
  const availableCount = residences.filter((r) => r.publicStatus === 'available').length;
  const inside = state.place === 'residence';
  const floors = useMemo(() => {
    const levels = [...new Set(residences.map((r) => r.floorLevel))].sort((a, b) => b - a);
    return levels.map((level) => {
      const list = residences.filter((r) => r.floorLevel === level);
      return {
        level,
        label: list[0]?.floorLabel ?? `Level ${level}`,
        total: list.length,
        available: list.filter((r) => r.publicStatus === 'available').length,
      };
    });
  }, [residences]);
  const shown = useMemo(
    () => residences.filter((r) => focus === null || r.floorLevel === focus),
    [residences, focus],
  );
  const units: EngineUnit[] = useMemo(
    () =>
      residences.map((r) => ({
        id: r.id,
        code: r.code,
        floorLevel: r.floorLevel,
        modelSlot: r.modelSlot,
        bedrooms: r.bedrooms,
        status: r.publicStatus,
      })),
    [residences],
  );
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const residencesRef = useRef(residences);
  residencesRef.current = residences;

  // ─── Engine lifecycle ────────────────────────────────────────────────

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      const r = residencesRef.current.find((x) => x.id === id);
      if (r) {
        setFocus(r.floorLevel);
        track('residence_viewed', { residence: r.code, source: '3d-design' });
        emit('residence_selected', { residence: r.code });
      }
      if (window.matchMedia('(max-width: 820px)').matches) setSheet('card');
    }
    engine.current?.select(id);
  }, []);

  useEffect(() => {
    const d = detect();
    const forced = new URLSearchParams(window.location.search).get('quality');
    if (forced === 'lite' || forced === 'high') d.quality = forced;
    if (!d.webgl) {
      setPhase('failed');
      return;
    }
    setQuality(d.quality);
    if (!host.current) return;
    let instance: TwinEngine | null = null;
    let cancelled = false;
    setPhase('loading');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void import('./engine/Engine')
      .then(async ({ TwinEngine }) => {
        if (cancelled || !host.current) return;
        instance = new TwinEngine(
          host.current,
          {
            progress: (p, step) => setProgress({ p, step }),
            hover: setHoveredId,
            select: onSelect,
            pose: setPose,
            caption: setCaption,
            fade: setFading,
            quality: setQuality,
            interacted: () => {
              setTouched(true);
              setCinematic(false);
            },
          },
          { quality: d.quality, reducedMotion, scene: sceneFor(null).scene },
        );
        engine.current = instance;
        instance.setUnits(unitsRef.current);
        await instance.load();
        if (cancelled) return;
        setPhase('ready');
        track('tour_started', { source: '3d-design' });
        emit('tour_started');
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof Error && e.message === 'disposed')) return;
        console.error(e);
        setPhase('failed');
      });
    return () => {
      cancelled = true;
      instance?.dispose();
      engine.current = null;
    };
  }, [onSelect]);

  // Deep links: ?residence=c2 opens onto that home; &tour=1 (the residences list's 3D Tour) walks straight in.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get('residence')?.trim().toLowerCase() || null;
    if (key || q.has('tour')) deepLink.current = { key, tour: q.has('tour') || key === 'penthouse' };
    const t = window.setTimeout(() => setLinkWaited(true), 8000);
    return () => window.clearTimeout(t);
  }, []);
  const enterRef = useRef<(room?: RoomId) => void>(() => {});
  useEffect(() => {
    const link = deepLink.current;
    if (phase !== 'ready' || !link) return;
    const r = link.key ? residences.find((x) => x.slug === link.key || x.code.toLowerCase() === link.key || x.id === link.key) : null;
    // Wait for live inventory so the tour knows which residence it is showing.
    if (link.key && link.key !== 'penthouse' && !r && !ready && !linkWaited) return;
    deepLink.current = null;
    if (r) onSelect(r.id);
    if (link.tour) window.setTimeout(() => enterRef.current(), r ? 2600 : 900);
  }, [phase, residences, ready, linkWaited, onSelect]);

  useEffect(() => engine.current?.setUnits(units), [units, phase]);
  useEffect(() => engine.current?.setAvailability(availability), [availability, phase]);
  useEffect(() => {
    const t = window.setTimeout(() => setTouched(true), 9000);
    return () => window.clearTimeout(t);
  }, []);
  const [liteNote, setLiteNote] = useState(false);
  useEffect(() => {
    if (quality !== 'lite' || phase !== 'ready') return;
    setLiteNote(true);
    const t = window.setTimeout(() => setLiteNote(false), 6000);
    return () => window.clearTimeout(t);
  }, [quality, phase]);

  // ─── Actions ─────────────────────────────────────────────────────────

  const labelRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      engine.current?.bindLabel(key, el);
    },
    [],
  );
  // Labels mount before the engine exists; bind them again once it does.
  const [, force] = useState(0);
  useEffect(() => {
    if (phase === 'ready') force((n) => n + 1);
  }, [phase]);

  const setEnv = (env: Environment) => {
    setState((s) => ({ ...s, environment: env }));
    engine.current?.setEnvironment(env);
    emit('environment_changed', { environment: env });
  };

  const goTo = (place: Exclude<Place, 'residence'>) => {
    setState((s) => ({ ...s, place }));
    setCinematic(false);
    setFocus(null);
    setSelectedId(null);
    setSheet('none');
    engine.current?.goTo(place);
    emit(`${place}_viewed`);
  };

  const chooseFloor = (level: number | null) => {
    setFocus(level);
    if (level !== null) setListOpen(true);
    setSelectedId(null);
    setCinematic(false);
    setState((s) => ({ ...s, place: 'exterior' }));
    engine.current?.focusFloor(level);
    track('filter_applied', { source: '3d-design', floor: level ?? 'all' });
    emit('floor_selected', { floor: level });
  };

  const enter = (room: RoomId = tour.startRoom) => {
    setState((s) => ({ ...s, place: 'residence', room }));
    setSheet('none');
    setCinematic(false);
    engine.current?.enterResidence(room);
    emit('residence_entered', { residence: selected?.code ?? tour.id, scene: tour.id, demo });
  };
  enterRef.current = enter;

  const exit = () => {
    setState((s) => ({ ...s, place: 'exterior', mode: 'tour' }));
    engine.current?.exitResidence();
  };

  const goRoom = (room: RoomId) => {
    setState((s) => ({ ...s, room, mode: s.mode === 'dollhouse' ? 'tour' : s.mode }));
    engine.current?.goToRoom(room);
    planDialog.current?.close();
    if (sheet === 'rooms') setSheet('none');
    emit('room_selected', { room, residence: selected?.code });
  };

  const setMode = (mode: InteriorMode) => {
    setState((s) => ({ ...s, mode }));
    engine.current?.setMode(mode);
    if (mode === 'dollhouse') emit('dollhouse_opened', { residence: selected?.code });
  };

  const toggleCinematic = () => {
    if (cinematic) {
      setCinematic(false);
      engine.current?.stopCinematic();
      return;
    }
    setCinematic(true);
    setFocus(null);
    setSelectedId(null);
    setState((s) => ({ ...s, place: 'exterior' }));
    engine.current?.startCinematic();
    emit('cinematic_started');
  };

  const enquire = (intent?: 'viewing') => {
    emit(intent ? 'viewing_request_clicked' : 'enquiry_clicked', { residence: selected?.code });
    open({
      source: '3d-design',
      intent: intent === 'viewing' ? 'VIEWING' : undefined,
      residence: selected
        ? {
            id: selected.id,
            label: selected.label,
            summary: `${selected.bedrooms} bedroom, ${selected.areaSqm} m², ${selected.floorLabel.toLowerCase()}`,
          }
        : undefined,
    });
  };

  const showPlan = () => {
    planDialog.current?.showModal();
    track('floor_plan_viewed', { residence: selected?.code, source: '3d-design' });
    emit('floor_plan_opened', { residence: selected?.code });
  };

  const hoverRow = (id: string | null) => {
    setHoveredId(id);
    engine.current?.hover(id);
  };

  const breadcrumb = [
    { label: 'Almasi', go: () => goTo('exterior') },
    ...(focus !== null ? [{ label: floors.find((f) => f.level === focus)?.label ?? `Level ${focus}`, go: () => chooseFloor(focus) }] : []),
    ...(selected ? [{ label: `Residence ${selected.label}`, go: () => onSelect(selected.id) }] : []),
    ...(inside && !selected ? [{ label: tour.name, go: null }] : []),
    ...(inside ? [{ label: roomById(tour, pose.room ?? state.room).name, go: null }] : []),
    ...(!inside && state.place !== 'exterior' ? [{ label: PLACES.find((p) => p.id === state.place)?.name ?? '', go: null }] : []),
  ];

  const place = PLACES.find((p) => p.id === state.place);
  const heading = inside
    ? roomById(tour, pose.room ?? state.room)
    : selected
      ? { name: `Residence ${selected.label}`, detail: `${TYPE_TEXT[selected.type]}, ${selected.floorLabel.toLowerCase()}` }
      : focus !== null
        ? { name: floors.find((f) => f.level === focus)?.label ?? 'Floor', detail: 'Choose a residence on the plan.' }
        : { name: place?.id === 'exterior' ? 'Explore Almasi' : place?.name ?? '', detail: place?.caption ?? '' };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    // This page wears the site's Blue theme whatever the admin chose for the rest: the theme on <main>, its night ground inside.
    <main id="main" data-theme="blue" data-nav-ground="night" data-hide-sticky-cta>
    <div className={styles.page} data-ground="night">
      <section
        className={styles.stage}
        aria-label="Almasi Residence interactive 3D experience"
        data-lenis-prevent
        data-inside={inside}
        data-phase={phase}
        data-cinematic={cinematic}
        data-sheet={sheet}
      >
        <div className={styles.viewport} ref={host} />
        <div className={styles.vignette} aria-hidden />

        {/* Hotspots and residence labels, positioned by the engine each frame. */}
        <div className={styles.labels} aria-hidden={phase !== 'ready'}>
          {EXTERIOR_HOTSPOTS.map((h) => (
            <button key={h.id} ref={labelRef(`place:${h.id}`)} className={styles.hotspot} data-kind="place" data-visible="false" onClick={() => goTo(h.id)}>
              <span className={styles.ring} />
              <span className={styles.hotspotLabel}>{h.label}</span>
            </button>
          ))}
          {tour.rooms.map((r) => (
            <button key={r.id} ref={labelRef(`room:${r.id}`)} className={styles.hotspot} data-visible="false" onClick={() => goRoom(r.id)}>
              <span className={styles.ring} />
              <span className={styles.hotspotLabel}>{r.name}</span>
            </button>
          ))}
          {residences.map((r) => (
            <button
              key={r.id}
              ref={labelRef(`unit:${r.id}`)}
              className={styles.unitPin}
              data-visible="false"
              data-status={r.publicStatus}
              data-selected={r.id === selectedId}
              onClick={() => onSelect(r.id)}
              onMouseEnter={() => hoverRow(r.id)}
              onMouseLeave={() => hoverRow(null)}
            >
              <strong>{r.label}</strong>
              <span>
                {r.bedrooms} bed, {r.areaSqm} m²
              </span>
            </button>
          ))}
          <div ref={labelRef('hover:')} className={styles.tooltip} data-visible="false">
            {hovered && (
              <>
                <strong>Residence {hovered.label}</strong>
                <span>
                  {TYPE_TEXT[hovered.type]}, {hovered.areaSqm} m², {hovered.floorLabel.toLowerCase()}
                </span>
                <em data-status={hovered.publicStatus}>{STATUS_TEXT[hovered.publicStatus]}</em>
              </>
            )}
          </div>
        </div>

        {/* The title: where the visitor is. */}
        <header className={styles.heading} data-hidden={cinematic}>
          <h1 key={heading.name} className={styles.title}>
            {heading.name}
          </h1>
          <p key={heading.detail} className={styles.lede}>
            {heading.detail}
          </p>
          {breadcrumb.length > 1 && (
            <nav className={styles.crumbs} aria-label="You are here">
              {breadcrumb.map((c, i) => (
                <span key={i}>
                  {i > 0 && <Icon name="chevron" />}
                  {c.go && i < breadcrumb.length - 1 ? <button onClick={c.go}>{c.label}</button> : <b>{c.label}</b>}
                </span>
              ))}
            </nav>
          )}
          {!touched && phase === 'ready' && !inside && (
            <p className={styles.hint}>Drag to orbit, scroll to zoom, select any residence on the building</p>
          )}
        </header>

        {/* Top-right: time of day and view tools. */}
        <div className={styles.tools} data-hidden={phase !== 'ready'}>
          <div className={styles.segmented} role="group" aria-label="Time of day">
            {ENVS.map((e) => (
              <button key={e.id} aria-pressed={state.environment === e.id} onClick={() => setEnv(e.id)}>
                {e.label}
              </button>
            ))}
          </div>
          <div className={styles.iconRow}>
            <button aria-label="Zoom in" onClick={() => engine.current?.zoom(0.8)}>
              <Icon name="plus" />
            </button>
            <button aria-label="Zoom out" onClick={() => engine.current?.zoom(1.25)}>
              <Icon name="minus" />
            </button>
            {!inside && (
              <button aria-label="Show availability on the building" aria-pressed={availability} onClick={() => setAvailability((a) => !a)}>
                <svg viewBox="0 0 24 24" aria-hidden><rect x="5" y="4" width="14" height="16" rx="1" /><path d="M5 9h14M5 14h14M12 4v16" /></svg>
              </button>
            )}
            <button aria-label={sound ? 'Turn ambient sound off' : 'Turn ambient sound on'} aria-pressed={sound} onClick={() => setSound((v) => !v)}>
              {sound ? (
                <svg viewBox="0 0 24 24" aria-hidden><path d="M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden><path d="M4 10v4h4l5 4V6L8 10H4zM16.5 9.5l5 5M21.5 9.5l-5 5" /></svg>
              )}
            </button>
            <button aria-label="How to explore" onClick={() => helpDialog.current?.showModal()}>
              <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.5a2.3 2.3 0 1 1 3.4 2c-.8.4-1.2 1-1.2 1.8M12 16.5v.2" /></svg>
            </button>
          </div>
          {availability && !inside && (
            <ul className={styles.legend} aria-label="Availability colours">
              {(['available', 'reserved', 'sold'] as const).map((s) => (
                <li key={s} data-status={s}>
                  {STATUS_TEXT[s]}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: the floor stack, like a lift panel. */}
        {!inside && phase === 'ready' && floors.length > 0 && (
          <nav className={styles.floors} aria-label="Choose a floor">
            <button aria-pressed={focus === null} onClick={() => chooseFloor(null)} className={styles.floorAll}>
              All
            </button>
            {floors.map((f) => (
              <button key={f.level} aria-pressed={focus === f.level} onClick={() => chooseFloor(f.level)} title={f.label}>
                <strong>{floorShort(f.level)}</strong>
                <span>{f.available}/{f.total}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Left: the residence selector. It opens when a floor is chosen, so the building is first seen whole. */}
        {!inside && (
          <aside className={styles.selector} data-open={listOpen} data-sheet={sheet === 'list'} aria-label="Select a residence">
            <div className={styles.selectorHead}>
              <h2>Select a residence</h2>
              {residences.length > 0 && (
                <p className={styles.count}>
                  {availableCount} of {residences.length} available
                </p>
              )}
              <button className={styles.collapse} onClick={() => (sheet === 'list' ? setSheet('none') : setListOpen((o) => !o))} aria-expanded={listOpen} aria-label={listOpen ? 'Hide residences' : 'Show residences'}>
                <Icon name={listOpen ? 'minus' : 'plus'} />
              </button>
            </div>
            <div className={styles.chips} role="group" aria-label="Floor">
              <button aria-pressed={focus === null} onClick={() => chooseFloor(null)}>All</button>
              {[...floors].reverse().map((f) => (
                <button key={f.level} aria-pressed={focus === f.level} onClick={() => chooseFloor(f.level)}>
                  {floorShort(f.level)}
                </button>
              ))}
            </div>
            <div className={styles.table} role="list">
              <div className={styles.row} data-head aria-hidden>
                <span>Residence</span>
                <span>Type</span>
                <span>Size</span>
                <span>Price</span>
              </div>
              {shown.map((r) => (
                <button
                  key={r.id}
                  role="listitem"
                  className={styles.row}
                  aria-pressed={r.id === selectedId}
                  data-hot={r.id === hoveredId}
                  onMouseEnter={() => hoverRow(r.id)}
                  onMouseLeave={() => hoverRow(null)}
                  onFocus={() => hoverRow(r.id)}
                  onBlur={() => hoverRow(null)}
                  onClick={() => onSelect(r.id)}
                >
                  <span>
                    <strong>{r.label}</strong>
                    <small>{floorShort(r.floorLevel) === 'G' ? 'Ground' : floorShort(r.floorLevel) === 'PH' ? 'Penthouse' : `Level ${r.floorLevel}`}</small>
                  </span>
                  <span>{r.type === 'penthouse' ? 'Penthouse' : `${r.bedrooms} bed`}</span>
                  <span>{r.areaSqm} m²</span>
                  <span className={styles.status} data-status={r.publicStatus}>
                    {price(r) ?? STATUS_TEXT[r.publicStatus]}
                  </span>
                </button>
              ))}
              {!shown.length && (
                <p className={styles.empty}>
                  {ready ? 'No residences on this floor.' : 'Live availability is loading. You can still explore the building and the reference residence.'}
                </p>
              )}
            </div>
          </aside>
        )}

        {/* The chosen residence, under a render of its kind of home. */}
        {selected && !inside && (
          <aside className={styles.card} data-sheet={sheet === 'card'} aria-label={`Residence ${selected.label}`}>
            <div className={styles.cardMedia}>
              <Image src={TYPE_IMAGE[selected.type].src} alt={TYPE_IMAGE[selected.type].alt} fill sizes="(max-width: 820px) 100vw, 380px" quality={70} />
              <div className={styles.cardTitle}>
                <h2>Residence {selected.label}</h2>
                <p>{selected.floorLabel}</p>
              </div>
            </div>
            <button className={styles.close} aria-label="Close residence" onClick={() => { setSheet('none'); onSelect(null); chooseFloor(selected.floorLevel); }}>
              <Icon name="close" />
            </button>
            <dl className={styles.facts}>
              <div><dt>Type</dt><dd>{TYPE_TEXT[selected.type]}</dd></div>
              <div><dt>Interior</dt><dd>{selected.areaSqm} m²</dd></div>
              <div><dt>Bedrooms</dt><dd>{selected.bedrooms}</dd></div>
              <div><dt>Bathrooms</dt><dd>{selected.bathrooms ?? '—'}</dd></div>
            </dl>
            <div className={styles.priceRow}>
              <span className={styles.status} data-status={selected.publicStatus}>{STATUS_TEXT[selected.publicStatus]}</span>
              {price(selected) && <strong>{price(selected)}</strong>}
            </div>
            {demo && (
              <p className={styles.demo}>
                <b>3D demo</b>
                {selected.type === 'penthouse'
                  ? 'Interactive tour of our reference penthouse design.'
                  : 'Interactive 3D preview currently showing our penthouse design.'}
              </p>
            )}
            <button className={styles.primary} onClick={() => enter()}>
              Enter 3D tour <Icon name="arrow" />
            </button>
            <div className={styles.secondary}>
              <button onClick={showPlan}>Floor plan</button>
              <Link href={`/residences/${selected.slug}`}>Details</Link>
              <button onClick={() => enquire()}>Enquire</button>
            </div>
          </aside>
        )}

        {/* Inside: rooms, modes and the plan. */}
        {inside && phase === 'ready' && (
          <aside className={styles.roomPanel} data-sheet={sheet === 'rooms'} aria-label="Residence and rooms">
            <button className={styles.close} aria-label="Close rooms" onClick={() => setSheet('none')}>
              <Icon name="close" />
            </button>
            <h2 className={styles.panelTitle}>{selected ? TYPE_TEXT[selected.type] : tour.name}</h2>
            <p className={styles.panelFacts}>
              {selected
                ? `Residence ${selected.label}, ${selected.bedrooms} bedroom${selected.bedrooms > 1 ? 's' : ''}, ${selected.areaSqm} m², ${selected.floorLabel.toLowerCase()}`
                : tour.summary}
            </p>
            {demo && selected && (
              <p className={styles.demo}>
                <b>3D demo</b>
                {selected.type === 'penthouse'
                  ? 'Our reference penthouse design. Each penthouse has its own approved layout.'
                  : `Showing our penthouse design. Residence ${selected.label} has its own layout — ask for its plan.`}
              </p>
            )}
            <ul className={styles.rooms}>
              {tour.rooms.map((r) => (
                <li key={r.id}>
                  <button aria-current={(pose.room ?? state.room) === r.id} onClick={() => goRoom(r.id)}>
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
            <label className={styles.finish}>
              Timber
              <select
                value={state.finish}
                onChange={(e) => {
                  const f = e.target.value as TwinState['finish'];
                  setState((s) => ({ ...s, finish: f }));
                  engine.current?.setFinish(f);
                }}
              >
                <option value="oak">Natural oak</option>
                <option value="walnut">Smoked walnut</option>
              </select>
            </label>
            <div className={styles.panelActions}>
              <button className={styles.textLink} onClick={showPlan}>Floor plan</button>
              <button className={styles.textLink} onClick={() => enquire()}>Enquire</button>
            </div>
            <button className={styles.primary} onClick={() => enquire('viewing')}>
              Book a viewing <Icon name="arrow" />
            </button>
          </aside>
        )}

        {inside && phase === 'ready' && (
          <button className={styles.minimap} onClick={showPlan} aria-label="Open the floor plan">
            <Plan scene={tour} pose={pose} current={pose.room ?? state.room} compact />
          </button>
        )}

        {/* Cinematic caption. */}
        {caption && cinematic && <p className={styles.caption}>{caption}</p>}

        {/* The dock: outside, a strip of stills of this model, one for each place to go. */}
        {phase === 'ready' && (
          <nav className={styles.dock} aria-label="Explore">
            {!inside ? (
              <>
                <div className={styles.places}>
                  {PLACES.map((p) => (
                    <button
                      key={p.id}
                      className={styles.place}
                      aria-pressed={!cinematic && state.place === p.id && (p.id !== 'exterior' || (focus === null && !selected))}
                      onClick={() => goTo(p.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/media/twin/places/${p.id}.jpg`} alt="" width={480} height={320} decoding="async" />
                      <span>{DOCK_LABEL[p.id]}</span>
                    </button>
                  ))}
                </div>
                <span className={styles.sep} aria-hidden />
                <button aria-pressed={cinematic} onClick={toggleCinematic}>
                  {cinematic ? 'Stop film' : 'Cinematic'}
                </button>
                <button className={styles.dockAccent} onClick={() => enter()}>
                  {selected ? '3D tour' : 'Penthouse tour'}
                </button>
                <button className={styles.mobileOnly} onClick={() => setSheet(sheet === 'list' ? 'none' : 'list')}>
                  Residences
                </button>
              </>
            ) : (
              <>
                {MODES.map((m) => (
                  <button key={m.id} aria-pressed={state.mode === m.id} onClick={() => setMode(m.id)}>
                    {m.label}
                  </button>
                ))}
                <span className={styles.sep} aria-hidden />
                <button aria-pressed={state.lights} onClick={() => { const l = !state.lights; setState((s) => ({ ...s, lights: l })); engine.current?.setLights(l); }}>
                  Lights {state.lights ? 'on' : 'off'}
                </button>
                <button className={styles.mobileOnly} onClick={() => setSheet(sheet === 'rooms' ? 'none' : 'rooms')}>
                  Rooms
                </button>
                <button onClick={showPlan}>Plan</button>
                <button onClick={exit}>Exit</button>
              </>
            )}
          </nav>
        )}

        {inside && state.mode === 'walk' && phase === 'ready' && <Joystick onMove={(x, y) => engine.current?.move(x, y)} />}

        {liteNote && <p className={styles.lite} role="status">Lite 3D mode for smoother performance on this device.</p>}

        <div className={styles.fade} data-on={fading} aria-hidden />

        {/* The loader stays mounted so it can dissolve into the scene rather than cut to it. */}
        <div className={styles.loader} data-failed={phase === 'failed'} data-done={phase === 'ready'} role="status" aria-hidden={phase === 'ready'}>
          {/* A still of this model holds the frame until the live one is ready. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.poster} src="/media/twin/poster.jpg" alt="" decoding="async" />
          <div className={styles.mark}>
            <svg viewBox="0 0 64 32" aria-hidden><path d="M2 30 L20 6 L32 22 L44 6 L62 30" /></svg>
            <span>ALMASI</span>
            <small>RESIDENCE</small>
          </div>
          {phase === 'failed' ? (
            <>
              <p>Interactive 3D isn’t available on this device.</p>
              <a href="#gallery" className={styles.textLink}>View the residence gallery</a>
            </>
          ) : (
            <>
              <p>{progress.step}…</p>
              <div className={styles.bar}><span style={{ transform: `scaleX(${progress.p / 100})` }} /></div>
              <small className={styles.pct}>{progress.p}%</small>
            </>
          )}
        </div>
      </section>

      {/* Readable, indexable content: the 3D is the immersive layer, not the page. */}
      <section className={styles.details} id="gallery">
        <div className={styles.detailsIntro}>
          <h2>
            Every residence, <em>before you arrive.</em>
          </h2>
          <p>
            Almasi rises five storeys above Kimihurura: twenty-eight residences of one, two and three bedrooms, from 65 m² garden
            homes to penthouses of up to 390 m² with private roof terraces. Explore the building, open any floor, and step into a
            fully furnished penthouse — three bedroom suites, a marble great room, and a pool terrace above the Kigali hills.
          </p>
          <p className={styles.note}>
            An architectural interpretation for illustration. The furnished interior is our reference penthouse design, shown as a
            3D preview for every residence; layouts, finishes and views vary by residence. Ask our team for the approved plans of
            any home.
          </p>
        </div>
        <div className={styles.gallery}>
          {GALLERY.map(([src, caption]) => (
            <figure key={src}>
              <Image src={src} alt={caption} fill sizes="(max-width: 820px) 100vw, 50vw" quality={70} />
              <figcaption aria-hidden>{caption}</figcaption>
            </figure>
          ))}
        </div>
        <div className={styles.index}>
          <h3>Residences</h3>
          <ul>
            {residences.map((r) => (
              <li key={r.id}>
                <Link href={`/residences/${r.slug}`}>
                  <strong>{r.label}</strong>
                  <span>{TYPE_TEXT[r.type]}</span>
                  <span>{r.areaSqm} m²</span>
                  <span>{r.floorLabel}</span>
                  <span data-status={r.publicStatus}>{STATUS_TEXT[r.publicStatus]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <dialog ref={planDialog} className={styles.dialog} aria-labelledby="plan-title">
        <div className={styles.dialogTop}>
          <h2 id="plan-title">Choose a room.</h2>
          <button aria-label="Close floor plan" onClick={() => planDialog.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <p className={styles.dialogSub}>{tour.name}, illustrative plan</p>
        <Plan scene={tour} pose={inside ? pose : null} current={inside ? pose.room ?? state.room : null} onRoom={goRoom} />
        <p className={styles.note}>
          {demo && selected
            ? `Our penthouse design, shown for Residence ${selected.label}. Its own approved plan is available from our team.`
            : 'Illustrative, not to scale. Each residence has its own approved plan — ask our team for yours.'}
        </p>
      </dialog>

      <dialog ref={helpDialog} className={styles.dialog} aria-labelledby="help-title">
        <div className={styles.dialogTop}>
          <h2 id="help-title">Make yourself at home.</h2>
          <button aria-label="Close help" onClick={() => helpDialog.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <ul className={styles.helpList}>
          <li><b>Orbit</b> Drag the building. Scroll or pinch to zoom. Arrow keys work too.</li>
          <li><b>Choose</b> Click any residence on the facade, a floor on the right, or a row in the list.</li>
          <li><b>Step inside</b> Choose Enter 3D tour on any residence, or Penthouse tour. Rings lead from room to room.</li>
          <li><b>Walk</b> In Walk mode use W A S D, the arrow keys or the on-screen stick; drag to look.</li>
          <li><b>Dollhouse</b> See the whole home from above, then click a room to drop into it.</li>
          <li><b>Light</b> Day, Sunset and Night change the hour; Availability colours every home by status.</li>
        </ul>
        <button className={styles.primary} onClick={() => helpDialog.current?.close()}>
          Let’s explore <Icon name="arrow" />
        </button>
      </dialog>
    </div>
    </main>
  );
}

// ─── Floor plan (SVG), shared by the minimap and the dialog ──────────────

const S = 20;

function Plan({
  scene,
  pose,
  current,
  onRoom,
  compact,
}: {
  scene: TourScene;
  pose: { x: number; z: number; yaw: number } | null;
  current: RoomId | null;
  onRoom?: (id: RoomId) => void;
  compact?: boolean;
}) {
  const [bx0, bz0, bx1, bz1] = scene.bounds;
  const PX = (x: number) => (x - bx0) * S;
  const PZ = (z: number) => (z - bz0) * S;
  const w = PX(bx1);
  const h = PZ(bz1);
  const solid = [
    ...scene.partitions,
    ...scene.facade.filter((f) => f.kind === 'wall').map(({ from, to }) => [Math.min(from[0], to[0]) - 0.1, Math.min(from[1], to[1]) - 0.1, Math.max(from[0], to[0]) + 0.1, Math.max(from[1], to[1]) + 0.1] as const),
  ];
  return (
    <svg className={styles.plan} viewBox={`-10 -10 ${w + 20} ${h + 20}`} role={onRoom ? 'group' : 'img'} aria-label={`${scene.name} floor plan`}>
      <rect className={styles.planTerrace} x={0} y={0} width={w} height={h} />
      {scene.rooms.map((r) => {
        const [x0, z0, x1, z1] = r.rect;
        const active = r.id === current;
        return (
          <g
            key={r.id}
            data-active={active}
            data-outdoor={r.outdoor ?? false}
            className={onRoom ? styles.planRoom : undefined}
            role={onRoom ? 'button' : undefined}
            tabIndex={onRoom ? 0 : undefined}
            aria-label={onRoom ? `Go to ${r.name}` : undefined}
            onClick={onRoom ? () => onRoom(r.id) : undefined}
            onKeyDown={
              onRoom
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRoom(r.id);
                    }
                  }
                : undefined
            }
          >
            <rect x={PX(x0)} y={PZ(z0)} width={(x1 - x0) * S} height={(z1 - z0) * S} />
            {!compact && (
              <text x={PX((x0 + x1) / 2)} y={PZ((z0 + z1) / 2) + 4} textAnchor="middle">
                {r.name}
              </text>
            )}
          </g>
        );
      })}
      {solid.map(([x0, z0, x1, z1], i) => (
        <rect key={i} className={styles.planWall} x={PX(x0)} y={PZ(z0)} width={(x1 - x0) * S} height={(z1 - z0) * S} />
      ))}
      {scene.facade
        .filter((f) => f.kind !== 'wall')
        .map((f, i) => (
          <line key={i} className={f.kind === 'glass' ? styles.planGlass : styles.planDoor} x1={PX(f.from[0])} y1={PZ(f.from[1])} x2={PX(f.to[0])} y2={PZ(f.to[1])} />
        ))}
      {pose && (
        <g transform={`translate(${PX(pose.x)} ${PZ(pose.z)}) rotate(${(-pose.yaw * 180) / Math.PI + 180})`}>
          <path className={styles.planCone} d="M0 0 L-26 -46 A52 52 0 0 1 26 -46 Z" />
          <circle className={styles.planDot} r={compact ? 9 : 7} />
        </g>
      )}
    </svg>
  );
}

// ─── Touch joystick for Walk mode ────────────────────────────────────────

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    onMove(x, -y);
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      className={styles.joystick}
      role="application"
      aria-label="Walk: drag to move"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}
