'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney, toMajorUnits, toMinorUnits } from '@avida/types';
import type { PublicMediaDto, TypologyCardDto } from '../../lib/api';
import {
  EMPTY_FILTER,
  ORIENTATION_TEXT,
  PUBLIC_STATUSES,
  typesPresent,
  SIZE_BANDS,
  SORT_TEXT,
  STATUS_TEXT,
  TYPE_TEXT,
  filterToSearch,
  isFiltering,
  matchesFilter,
  sortResidences,
  viewText,
  visiblePriceMinor,
  type Residence,
  type ResidenceFilter,
  type SortKey,
} from '../../lib/residences';
import { track } from '../../lib/analytics';
import { useResidenceShortlist } from '../../lib/shortlist';
import { useInventory } from '../providers/InventoryProvider';
import { ElevationStack, StatusLegend } from '../explore/ElevationStack';
import { ExploreAlmasi } from '../explore/ExploreAlmasi';
import { SceneImage } from '../ui/SceneImage';
import styles from './ResidenceExplorer.module.css';

/** A round step at or above `rough` — 25k, 50k, 100k, 250k and so on. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  for (const multiple of [1, 2.5, 5, 10]) {
    const step = multiple * magnitude;
    if (step >= rough) return step;
  }
  return 10 * magnitude;
}

type ListKey = 'types' | 'bedrooms' | 'floors' | 'sizes' | 'statuses';

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * The inventory, filterable and shareable. Filters live in the URL; the list,
 * the elevation beside it and the 3D view all read the same residences from
 * the inventory provider, and a residence that does not match is dimmed in the
 * drawings rather than removed — how much of the building is gone is itself
 * worth seeing.
 */
export function ResidenceExplorer({
  initialFilter,
  initialSort,
  cards = [],
  place = '',
}: {
  initialFilter: ResidenceFilter;
  initialSort: SortKey;
  /** Residence types, for the artwork each residence borrows from its own type. */
  cards?: TypologyCardDto[];
  /** "Kimihurura, Kigali" — from the property record, never written here. */
  place?: string;
}) {
  const { residences, floors, summary, currency } = useInventory();
  const router = useRouter();
  const [filter, setFilter] = useState<ResidenceFilter>(initialFilter);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [view, setView] = useState<'list' | 'building'>('list');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Open on the server so the filters are there without JavaScript; a phone
  // closes them on hydration, where an open panel would fill the screen.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const shortlist = useResidenceShortlist();

  const coverFor = useMemo(() => {
    const byType = new Map<string, PublicMediaDto | null>();
    for (const c of cards) if (c.cover && !byType.has(c.slug)) byType.set(c.slug, c.cover);
    return (slug: string) => byType.get(slug) ?? null;
  }, [cards]);

  useEffect(() => {
    setFiltersOpen(window.matchMedia('(min-width: 821px)').matches);
  }, []);

  // The first run is the render the URL already describes; pushing it would
  // cost the visitor a Back press that does nothing.
  const urlSynced = useRef(false);
  useEffect(() => {
    const qs = filterToSearch(filter, sort);
    const url = qs ? `/residences?${qs}` : '/residences';
    if (!urlSynced.current) {
      urlSynced.current = true;
      return;
    }
    // Next syncs its router with the native History API, so Back undoes one
    // filter without a server round-trip.
    window.history.pushState(null, '', url);
  }, [filter, sort]);

  const matches = useMemo(() => residences.filter((r) => matchesFilter(r, filter)), [residences, filter]);
  const matchIds = useMemo(() => new Set(matches.map((r) => r.id)), [matches]);
  const sorted = useMemo(() => sortResidences(matches, sort), [matches, sort]);
  const filtering = isFiltering(filter);

  const flip = <K extends ListKey>(key: K, value: ResidenceFilter[K][number]) => {
    setFilter((f) => ({ ...f, [key]: toggle(f[key] as ResidenceFilter[K][number][], value) }));
    track('filter_applied', { key, value: String(value) });
  };

  const compared = useMemo(
    () => shortlist.compare.map((id) => residences.find((r) => r.id === id)).filter((r): r is Residence => Boolean(r)),
    [shortlist.compare, residences],
  );

  // The ladder follows what is actually for sale; a fixed one goes wrong the
  // moment the development reprices or changes currency.
  const priceCaps = useMemo(() => {
    const prices = residences.map(visiblePriceMinor).filter((p): p is number => p !== null);
    if (prices.length === 0) return [];
    const top = toMajorUnits(Math.max(...prices), currency);
    const step = niceStep(top / 5);
    return Array.from({ length: 5 }, (_, i) => step * (i + 1)).filter((cap) => cap < top);
  }, [residences, currency]);

  // An empty inventory must read as empty, not as "from Infinity to -Infinity".
  const areas = residences.map((r) => r.areaSqm);
  const areaMin = areas.length ? Math.min(...areas) : 0;
  const areaMax = areas.length ? Math.max(...areas) : 0;

  const bedroomOptions = [...new Set(residences.map((r) => r.bedrooms))].sort();
  const floorOptions = floors.filter((f) => f.total > 0).sort((a, b) => a.level - b.level);
  const statusCount = (s: string) => residences.filter((r) => r.publicStatus === s).length;

  const resultCount = (
    <p aria-live="polite" className={styles.resultCount}>
      <span className="tabular">{matches.length}</span> of <span className="tabular">{summary.total}</span>{' '}
      residences {filtering ? 'match' : 'shown'}
    </p>
  );

  const statusRow = (
    <div className={styles.status}>
      {resultCount}
      {filtering && (
        <button type="button" className="link-line" onClick={() => setFilter(EMPTY_FILTER)}>
          Clear filters
        </button>
      )}
      {(shortlist.favorites.length > 0 || shortlist.compare.length > 0) && (
        <p className={styles.savedSummary} aria-live="polite">
          {shortlist.favorites.length} saved · {shortlist.compare.length}/3 comparing
        </p>
      )}
      <div className={styles.views} role="group" aria-label="View">
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
          List
        </button>
        <button type="button" aria-pressed={view === 'building'} onClick={() => setView('building')}>
          3D building
        </button>
      </div>
    </div>
  );

  return (
    <>
      <header className={`container ground-band ${styles.header}`} data-ground="night" data-nav-over>
        <h1 className={`display ${styles.title}`}>Residences</h1>
        <p className={`small ${styles.tally}`}>
          <span className="tabular">{summary.total}</span> residences ·{' '}
          <span className={`tabular ${styles.kicker}`}>{summary.available}</span> available
        </p>
        <p className="lead">
          {typesPresent(summary).map((t) => `${summary.byType[t].total} ${t === 'penthouse' ? 'penthouses' : `${TYPE_TEXT[t].toLowerCase()} apartments`}`).join(', ')}
          {place ? ` for sale in ${place}` : ' for sale'}
          {areas.length > 0 ? `, from ${areaMin} to ${areaMax} m²` : ''}.
          {' '}Availability is live from the sales team’s own records.
        </p>
        <dl className={styles.counts}>
          {typesPresent(summary).map((t) => (
            <div key={t}>
              <dt>{TYPE_TEXT[t]}</dt>
              <dd>
                <span className="tabular">{summary.byType[t].available}</span> of{' '}
                <span className="tabular">{summary.byType[t].total}</span> available
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className={styles.bar} data-ground="quiet">
        <div className={`container ${styles.barInner}`}>
          <details
            className={styles.filters}
            open={filtersOpen}
            onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
          >
            <summary className={styles.summary}>
              <span>Filters</span>
              {filtering && <span className={styles.badge}>on</span>}
            </summary>
            <div className={styles.groups}>
              <fieldset className={styles.group}>
                <legend>Residence</legend>
                {typesPresent(summary).map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={filter.types.includes(t)} onClick={() => flip('types', t)}>
                    {TYPE_TEXT[t]}
                  </button>
                ))}
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Bedrooms</legend>
                {bedroomOptions.map((b) => (
                  <button key={b} type="button" className="chip" aria-pressed={filter.bedrooms.includes(b)} onClick={() => flip('bedrooms', b)}>
                    {b}
                  </button>
                ))}
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Floor</legend>
                {floorOptions.map((f) => (
                  <button
                    key={f.level}
                    type="button"
                    className="chip"
                    aria-pressed={filter.floors.includes(f.level)}
                    aria-label={f.label}
                    onClick={() => flip('floors', f.level)}
                  >
                    {f.mark}
                  </button>
                ))}
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Size</legend>
                {SIZE_BANDS.map((b) => (
                  <button key={b.id} type="button" className="chip" aria-pressed={filter.sizes.includes(b.id)} onClick={() => flip('sizes', b.id)}>
                    {b.label}
                  </button>
                ))}
              </fieldset>
              <fieldset className={styles.group}>
                <legend>Availability</legend>
                {PUBLIC_STATUSES.map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={filter.statuses.includes(s)} onClick={() => flip('statuses', s)}>
                    {STATUS_TEXT[s]} <span className="tabular muted">{statusCount(s)}</span>
                  </button>
                ))}
              </fieldset>
              <div className={styles.selects}>
                <label className="field">
                  <span className="field-label">Price up to</span>
                  <select
                    value={filter.maxPriceMinor === null ? '' : String(filter.maxPriceMinor)}
                    onChange={(e) =>
                      setFilter((f) => ({ ...f, maxPriceMinor: e.target.value ? Number(e.target.value) : null }))
                    }
                  >
                    <option value="">Any price</option>
                    {priceCaps.map((cap) => {
                      const minor = toMinorUnits(cap, currency);
                      return (
                        <option key={cap} value={minor}>
                          {formatMoney({ amountMinor: minor, currency })}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Sort by</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    {(Object.keys(SORT_TEXT) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_TEXT[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filtersOpen && statusRow}
            </div>
          </details>

          {!filtersOpen && statusRow}
        </div>
      </div>

      {view === 'building' ? (
        <ExploreAlmasi
          id="residences-3d"
          heading="The building, filtered"
          lede="Residences outside your filters fade back; the ones that match stay lit."
          matchIds={filtering ? matchIds : null}
        />
      ) : (
        <div className={`container ${styles.results}`}>
          <div className={styles.list}>
            {sorted.length === 0 ? (
              <div className={styles.empty}>
                <p className="h3">Nothing matches all of those.</p>
                <p className="muted">Loosen a filter, or ask the sales team about residences not yet released.</p>
                <button type="button" className="btn btn--ghost" onClick={() => setFilter(EMPTY_FILTER)}>
                  Clear filters
                </button>
              </div>
            ) : (
              <table className={styles.table}>
                <caption className="visually-hidden">Residences matching your filters</caption>
                <thead>
                  <tr>
                    <th scope="col" colSpan={2}>Residence</th>
                    <th scope="col">Type</th>
                    <th scope="col">Size</th>
                    <th scope="col" className={styles.colAspect}>Aspect</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={styles.colPrice}>Price</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <ResidenceRow key={r.id} r={r} cover={coverFor(r.typologySlug)} hovered={hoveredId === r.id} onHover={setHoveredId} shortlist={shortlist} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <aside className={styles.side} aria-label="Where they are in the building">
            <p className="mark muted">In the building</p>
            <ElevationStack
              residences={residences}
              floors={floors}
              focusLevel={null}
              selectedId={hoveredId}
              matchIds={matchIds}
              onSelect={(r) => router.push(`/residences/${r.slug}`)}
              onHover={setHoveredId}
            />
            <StatusLegend />
          </aside>
        </div>
      )}
      {/* The shortlist used to announce itself only at the foot of the page,
          after every residence. It follows the visitor now. */}
      {shortlist.compare.length > 0 && (
        <div className={styles.tray} data-ground="night" role="region" aria-label="Shortlist">
          <p className={styles.trayCount}>
            <span className="tabular">{shortlist.compare.length}</span> of 3 selected
            {shortlist.compare.length === 1 ? ' — add one more to compare' : ''}
          </p>
          <div className={styles.trayActions}>
            <button
              type="button"
              className="btn btn--solid btn--sm"
              disabled={shortlist.compare.length < 2}
              onClick={() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Compare
            </button>
            <button type="button" className="link-line" onClick={shortlist.clearCompare}>
              Clear
            </button>
          </div>
        </div>
      )}

      {shortlist.compare.length >= 2 && (
        <section id="compare" className={styles.compare} data-ground="quiet" aria-labelledby="compare-title">
          <div className="container">
            <div className={styles.compareHead}>
              <div><p className="mark muted">Shortlist</p><h2 id="compare-title" className="h3">Compare residences</h2></div>
              <div className={styles.compareActions}>
                {/* The document a buyer abroad forwards to their family. */}
                <a
                  className="btn btn--ghost btn--sm"
                  href={`/api/v1/residences/shortlist.pdf?codes=${encodeURIComponent(compared.map((r) => r.code).join(','))}`}
                  onClick={() => track('brochure_downloaded', { residence: compared.map((r) => r.code).join('+') })}
                >
                  Download comparison (PDF)
                </a>
                <button type="button" className="link-line" onClick={shortlist.clearCompare}>Clear comparison</button>
              </div>
            </div>
            <div className={styles.compareGrid}>
              {compared.map((r) => (
                <article key={r.id} className={styles.compareCard}>
                  <p className={styles.compareCode}>{r.label}</p>
                  <h3>{TYPE_TEXT[r.type]}</h3>
                  <dl>
                    <div><dt>Floor</dt><dd>{r.floorLabel}</dd></div>
                    <div><dt>Interior</dt><dd>{r.areaSqm} m²</dd></div>
                    <div><dt>Bedrooms</dt><dd>{r.bedrooms}</dd></div>
                    <div><dt>Faces</dt><dd>{ORIENTATION_TEXT[r.orientation]}</dd></div>
                    <div><dt>Status</dt><dd>{STATUS_TEXT[r.publicStatus]}</dd></div>
                    <div><dt>Price</dt><dd>{visiblePriceMinor(r) !== null ? formatMoney({ amountMinor: visiblePriceMinor(r)!, currency: r.currency }) : 'Ask sales'}</dd></div>
                  </dl>
                  <Link href={`/residences/${r.slug}`} className="btn btn--solid">View {r.label}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ResidenceRow({
  r,
  cover,
  hovered,
  onHover,
  shortlist,
}: {
  r: Residence;
  cover: PublicMediaDto | null;
  hovered: boolean;
  onHover: (id: string | null) => void;
  shortlist: ReturnType<typeof useResidenceShortlist>;
}) {
  const saved = shortlist.favorites.includes(r.id);
  const comparing = shortlist.compare.includes(r.id);
  const price = visiblePriceMinor(r);
  return (
    <tr
      className={styles.row}
      data-hovered={hovered ? 'true' : 'false'}
      onMouseEnter={() => onHover(r.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(r.id)}
      onBlur={() => onHover(null)}
    >
      <td className={styles.thumbCell}>
        <Link href={`/residences/${r.slug}`} className={styles.thumb} tabIndex={-1} aria-hidden="true">
          <SceneImage media={cover} sizes="(max-width: 820px) 120px, 112px" label={TYPE_TEXT[r.type]} />
        </Link>
      </td>
      <th scope="row" className={styles.code}>{r.label}</th>
      <td className={`${styles.cell} ${styles.cellType}`}>
        {TYPE_TEXT[r.type]}
        <small>
          {r.bedrooms} bed{r.bedrooms > 1 ? 's' : ''}
          {r.bathrooms !== null ? ` · ${r.bathrooms} bath${r.bathrooms > 1 ? 's' : ''}` : ''}
        </small>
      </td>
      <td className={`${styles.cell} ${styles.cellSize} tabular`}>
        {r.areaSqm} m²
        <small>{r.floorLabel}</small>
      </td>
      <td className={`${styles.cell} ${styles.cellAspect}`}>
        Faces {ORIENTATION_TEXT[r.orientation].toLowerCase()}
        <small>{viewText(r.viewTags)}</small>
      </td>
      <td className={styles.cellStatus}>
        <span className={styles.statusBadge} data-status={r.publicStatus}>
          {STATUS_TEXT[r.publicStatus]}
        </span>
      </td>
      <td className={`${styles.price} tabular`}>
        {price !== null ? formatMoney({ amountMinor: price, currency: r.currency }) : '—'}
      </td>
      <td className={styles.rowActions}>
        <Link href={`/residences/${r.slug}`} className={styles.go}>View</Link>
        <Link
          href={`/3d-design?residence=${r.slug}&tour=1`}
          className={styles.tour3d}
          aria-label={`3D tour of residence ${r.label}`}
          onClick={() => track('tour_started', { residence: r.code, source: 'residences-3d' })}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z M2 5l6 3.5L14 5 M8 8.5v6" /></svg>
          3D Tour
        </Link>
        <span className={styles.shortlistActions}>
          <button
            type="button"
            aria-pressed={saved}
            title={`${saved ? 'Remove residence' : 'Save residence'} ${r.label}`}
            onClick={() => { if (shortlist.toggleFavorite(r.id)) track('favorite_added', { residence: r.code }); }}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            aria-pressed={comparing}
            title={`${comparing ? 'Stop comparing' : 'Compare'} residence ${r.label}`}
            onClick={() => { if (shortlist.toggleCompare(r.id)) track('compare_added', { residence: r.code }); }}
          >
            {comparing ? 'Comparing' : 'Compare'}
          </button>
        </span>
      </td>
    </tr>
  );
}
