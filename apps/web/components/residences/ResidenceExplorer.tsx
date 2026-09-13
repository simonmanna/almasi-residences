'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney, toMinorUnits } from '@avida/types';
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
import styles from './ResidenceExplorer.module.css';

/** Whole major units; converted with the development's own minor-unit rule. */
const PRICE_CAPS = [100_000, 150_000, 200_000, 300_000, 500_000];

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
}: {
  initialFilter: ResidenceFilter;
  initialSort: SortKey;
}) {
  const { residences, floors, summary, currency } = useInventory();
  const [filter, setFilter] = useState<ResidenceFilter>(initialFilter);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [view, setView] = useState<'list' | 'building'>('list');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const shortlist = useResidenceShortlist();

  useEffect(() => {
    const qs = filterToSearch(filter, sort);
    window.history.replaceState(null, '', qs ? `/residences?${qs}` : '/residences');
  }, [filter, sort]);

  const matches = useMemo(() => residences.filter((r) => matchesFilter(r, filter)), [residences, filter]);
  const matchIds = useMemo(() => new Set(matches.map((r) => r.id)), [matches]);
  const sorted = useMemo(() => sortResidences(matches, sort), [matches, sort]);
  const filtering = isFiltering(filter);

  const flip = <K extends ListKey>(key: K, value: ResidenceFilter[K][number]) => {
    setFilter((f) => ({ ...f, [key]: toggle(f[key] as ResidenceFilter[K][number][], value) }));
    track('filter_applied', { key, value: String(value) });
  };

  const bedroomOptions = [...new Set(residences.map((r) => r.bedrooms))].sort();
  const floorOptions = floors.filter((f) => f.total > 0).sort((a, b) => a.level - b.level);
  const statusCount = (s: string) => residences.filter((r) => r.publicStatus === s).length;

  return (
    <>
      <header className={`container ${styles.header}`}>
        <p className={`mark ${styles.kicker}`}>Residences</p>
        <h1 className="display">
          {summary.total} residences.
          <br />
          <span className="italic">{summary.available} available.</span>
        </h1>
        <p className="lead">
          {typesPresent(summary).map((t) => `${summary.byType[t].total} ${t === 'penthouse' ? 'penthouses' : `${TYPE_TEXT[t].toLowerCase()} apartments`}`).join(', ')} for sale in Kimihurura, Kigali, from{' '}
          {Math.min(...residences.map((r) => r.areaSqm))} to {Math.max(...residences.map((r) => r.areaSqm))} m².
          Availability is live from the sales team’s own records.
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

      <div className={styles.bar} data-ground="stone">
        <div className={`container ${styles.barInner}`}>
          <details className={styles.filters} open>
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
                    {PRICE_CAPS.map((cap) => {
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
            </div>
          </details>

          <div className={styles.status}>
            <p aria-live="polite" className={styles.resultCount}>
              <span className="tabular">{matches.length}</span> of <span className="tabular">{summary.total}</span>{' '}
              residences {filtering ? 'match' : 'shown'}
            </p>
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
              <ol className={styles.rows}>
                {sorted.map((r) => (
                  <li key={r.id}>
                    <ResidenceRow r={r} hovered={hoveredId === r.id} onHover={setHoveredId} shortlist={shortlist} />
                  </li>
                ))}
              </ol>
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
              onSelect={(r) => {
                window.location.href = `/residences/${r.slug}`;
              }}
              onHover={setHoveredId}
            />
            <StatusLegend />
          </aside>
        </div>
      )}
      {shortlist.compare.length >= 2 && (
        <section className={styles.compare} aria-labelledby="compare-title">
          <div className="container">
            <div className={styles.compareHead}>
              <div><p className="mark muted">Shortlist</p><h2 id="compare-title" className="h3">Compare residences</h2></div>
              <button type="button" className="link-line" onClick={shortlist.clearCompare}>Clear comparison</button>
            </div>
            <div className={styles.compareGrid}>
              {shortlist.compare.map((id) => residences.find((r) => r.id === id)).filter((r): r is Residence => Boolean(r)).map((r) => (
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
  hovered,
  onHover,
  shortlist,
}: {
  r: Residence;
  hovered: boolean;
  onHover: (id: string | null) => void;
  shortlist: ReturnType<typeof useResidenceShortlist>;
}) {
  const price = visiblePriceMinor(r);
  return (
    <article
      className={styles.row}
      data-hovered={hovered ? 'true' : 'false'}
      onMouseEnter={() => onHover(r.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(r.id)}
      onBlur={() => onHover(null)}
    >
      <span className={styles.code}>{r.label}</span>
      <span className={styles.cell}>
        {TYPE_TEXT[r.type]}
        <small>
          {r.bedrooms} bedroom{r.bedrooms > 1 ? 's' : ''}
          {r.bathrooms !== null ? `, ${r.bathrooms} bathroom${r.bathrooms > 1 ? 's' : ''}` : ''}
        </small>
      </span>
      <span className={`${styles.cell} tabular`}>
        {r.areaSqm} m²
        <small>{r.floorLabel}</small>
      </span>
      <span className={styles.cell}>
        Faces {ORIENTATION_TEXT[r.orientation].toLowerCase()}
        <small>{viewText(r.viewTags)}</small>
      </span>
      <span className={styles.cell}>
        <span className="status" data-status={r.publicStatus}>
          {STATUS_TEXT[r.publicStatus]}
        </span>
      </span>
      <span className={`${styles.price} tabular`}>
        {price !== null ? formatMoney({ amountMinor: price, currency: r.currency }) : '—'}
      </span>
      <span className={styles.rowActions}>
        <button type="button" aria-pressed={shortlist.favorites.includes(r.id)} onClick={() => { const added = shortlist.toggleFavorite(r.id); if (added) track('favorite_added', { residence: r.code }); }}>{shortlist.favorites.includes(r.id) ? 'Saved' : 'Save'}</button>
        <button type="button" aria-pressed={shortlist.compare.includes(r.id)} onClick={() => { const added = shortlist.toggleCompare(r.id); if (added) track('compare_added', { residence: r.code }); }}>{shortlist.compare.includes(r.id) ? 'Comparing' : 'Compare'}</button>
        <Link href={`/residences/${r.slug}`} className={styles.go}>View</Link>
      </span>
    </article>
  );
}
