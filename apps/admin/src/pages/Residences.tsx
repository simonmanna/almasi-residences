import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Copy,
  Download,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { STATUS_LABEL, UNIT_STATUSES } from '@avida/types';
import { del, downloadUrl, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area, code as fmtCode, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { floorName, useFloors, useTypes } from '../lib/ref';
import { Link, navigate, useDebounced, useSearchState } from '../lib/router';
import type { Paged, ResidenceRow } from '../lib/types';
import { InlinePrice } from '../components/InlinePrice';
import { StatusSelect } from '../components/StatusSelect';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Input, MediaImg, Menu, Modal, Field, PageHead, Pagination, Select, Skeleton, useConfirm } from '../components/ui';

const invalidateResidences = () => invalidate('residences', 'residence:', 'dashboard', 'building', 'floors', 'floor:', 'types', 'search:');

/** §25 — size, floor and bedrooms edited where they are shown. */
function InlineSelect({ id, value, options, field, label, confirmText }: { id: string; value: string; options: { value: string; label: string }[]; field: string; label: string; confirmText?: (next: string) => string }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const current = options.find((o) => o.value === value)?.label ?? value;
  if (!can('residence.edit')) return <span>{current}</span>;
  return (
    <select
      className="select sm"
      style={{ minHeight: 30, width: 'auto', border: '1px dashed transparent', background: 'transparent', paddingLeft: 6 }}
      value={value}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const next = e.target.value;
        if (confirmText && !(await confirm({ title: confirmText(options.find((o) => o.value === next)?.label ?? next), confirm: 'Move' }))) return;
        try {
          await patch(`/admin/residences/${id}`, { [field]: field === 'bedrooms' ? Number(next) : next });
          toast.success('Saved.');
          invalidateResidences();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function InlineArea({ id, value }: { id: string; value: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  if (!can('residence.edit')) return <span>{area(value)}</span>;
  const save = async () => {
    const n = Number(text);
    setEditing(false);
    if (!Number.isFinite(n) || n <= 0 || n === value) return;
    try {
      await patch(`/admin/residences/${id}`, { areaSqm: n });
      toast.success(`Size saved: ${area(n)}.`);
      invalidateResidences();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return editing ? (
    <span className="inline-edit" onClick={(e) => e.stopPropagation()}>
      <input autoFocus value={text} inputMode="decimal" style={{ width: 70 }} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }} aria-label="Size in square metres" />
    </span>
  ) : (
    <button type="button" className="inline-edit" style={{ background: 'none', font: 'inherit', color: 'inherit' }} onClick={(e) => { e.stopPropagation(); setText(String(value)); setEditing(true); }} title="Click to change the size">
      {area(value)}
    </button>
  );
}

function SortHead({ label, k, sort, dir, onSort, num }: { label: string; k: string; sort: string; dir: string; onSort: (k: string) => void; num?: boolean }) {
  const active = sort === k;
  return (
    <th className={num ? 'num' : undefined} aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}>
      <button type="button" onClick={() => onSort(k)}>
        {label}
        {active ? dir === 'desc' ? <ArrowDown size={13} /> : <ArrowUp size={13} /> : <ArrowUpDown size={12} className="faint" />}
      </button>
    </th>
  );
}

function BulkPrice({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'percent' | 'amount' | 'set'>('percent');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      await post('/admin/residences/bulk', { ids, action: 'price', priceMode: mode, value: Number(value), note: note || undefined });
      toast.success(`Prices updated for ${ids.length} residences.`);
      invalidateResidences();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Change the price of ${ids.length} residences`} sub="Each change is written to its price history and the website updates straight away." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={value === '' || !Number.isFinite(Number(value))} onClick={() => void apply()}>Apply</Button></>}>
      <Field label="How">
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} options={[{ value: 'percent', label: 'Raise or lower by a percentage' }, { value: 'amount', label: 'Raise or lower by an amount' }, { value: 'set', label: 'Set every price to' }]} />
      </Field>
      <Field label={mode === 'percent' ? 'Percentage (use a minus sign to lower)' : mode === 'amount' ? 'Amount in USD (minus to lower)' : 'New price in USD'}>
        <Input value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} placeholder={mode === 'percent' ? '5' : mode === 'amount' ? '2500' : '125000'} autoFocus />
      </Field>
      <Field label="Reason" hint="Recorded in each residence's price history.">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Q4 price review" />
      </Field>
    </Modal>
  );
}

function exportSelected(rows: ResidenceRow[]) {
  const header = ['code', 'floor', 'type', 'bedrooms', 'size_sqm', 'price', 'price_now', 'currency', 'status', 'published'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.code, floorName(r.floor), r.typology.name, r.bedrooms, r.areaSqm, r.priceMinor / 100, r.effectivePriceMinor / 100, r.currency, r.status, r.published ? 'yes' : 'no'].map(esc).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `residences-${rows.length}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Residences() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState({ sort: 'floor', dir: 'asc', page: '1', pageSize: '25' });
  const [search, setSearch] = useState(s.q ?? '');
  const debounced = useDebounced(search);
  const [more, setMore] = useState(Boolean(s.minPrice || s.maxPrice || s.minSize || s.maxSize));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const { data: floors } = useFloors();
  const { data: types } = useTypes();

  if ((s.q ?? '') !== debounced) set({ q: debounced, page: 1 });

  const params = { q: s.q, floorId: s.floorId, typologyId: s.typologyId, status: s.status, bedrooms: s.bedrooms, minPrice: s.minPrice, maxPrice: s.maxPrice, minSize: s.minSize, maxSize: s.maxSize, published: s.published, featured: s.featured, archived: s.archived, sort: s.sort, dir: s.dir, page: s.page, pageSize: s.pageSize };
  const query = qs(params);
  const { data, error, loading, refetch } = useQuery(`residences:list:${query}`, () => get<Paged<ResidenceRow>>(`/admin/residences${query}`));
  const rows = useMemo(() => data?.data ?? [], [data]);
  const archivedView = s.archived === 'true';

  const onSort = (k: string) => set({ sort: k, dir: s.sort === k && s.dir === 'asc' ? 'desc' : 'asc' });
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...selected];
  const floorOptions = (floors ?? []).map((f) => ({ value: f.id, label: floorName(f) }));

  const bulk = async (action: string, extra: Record<string, unknown> = {}, ask?: { title: string; body?: string; danger?: boolean }) => {
    if (ask && !(await confirm({ ...ask, confirm: 'Continue' }))) return;
    try {
      await post('/admin/residences/bulk', { ids, action, ...extra });
      toast.success(`Done — ${ids.length} residence${ids.length === 1 ? '' : 's'} updated.`);
      setSelected(new Set());
      invalidateResidences();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rowAction = async (r: ResidenceRow, action: 'duplicate' | 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete' | 'feature' | 'unfeature') => {
    try {
      if (action === 'duplicate') {
        const code = window.prompt(`New unit code for the copy of ${fmtCode(r.code)}`, `${r.code}-COPY`);
        if (!code) return;
        const copy = await post<{ id: string }>(`/admin/residences/${r.id}/duplicate`, { code: code.toUpperCase() });
        toast.success(`Created ${code.toUpperCase()} (hidden until you publish it).`);
        invalidateResidences();
        navigate(`/residences/${copy.id}`);
        return;
      }
      if (action === 'archive') {
        const ok = await confirm({
          title: `Archive ${fmtCode(r.code)}?`,
          body: 'It disappears from the website and from the building view, but its history, media and enquiries are kept. You can restore it at any time.',
          confirm: 'Archive residence',
          danger: true,
        });
        if (!ok) return;
        await post(`/admin/residences/${r.id}/archive`);
      } else if (action === 'restore') await post(`/admin/residences/${r.id}/restore`);
      else if (action === 'delete') {
        const ok = await confirm({
          title: `Delete ${fmtCode(r.code)} permanently?`,
          body: 'This removes the residence record for good. Only residences created by mistake — never sold, no enquiries — can be deleted; everything else stays archived.',
          confirm: 'Delete permanently',
          danger: true,
          typeToConfirm: r.code,
        });
        if (!ok) return;
        await del(`/admin/residences/${r.id}`);
      } else if (action === 'publish' || action === 'unpublish') await patch(`/admin/residences/${r.id}`, { published: action === 'publish' });
      else await patch(`/admin/residences/${r.id}`, { featured: action === 'feature' });
      toast.success('Done.');
      invalidateResidences();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title={archivedView ? 'Archived residences' : 'Residences'} sub={data ? `${data.meta.total} residence${data.meta.total === 1 ? '' : 's'}${archivedView ? ' in the archive' : ''}` : ' '}>
        <a className="btn" href={downloadUrl(`/admin/residences/export.csv${query}`)}>
          <Download size={16} /> Export
        </a>
        {can('residence.edit') && (
          <Link to="/residences/new" className="btn primary">
            <Plus size={16} /> Add residence
          </Link>
        )}
      </PageHead>

      <Card>
        <div className="card-head" style={{ gap: 10 }}>
          <Input placeholder="Search by unit code, type or tag…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} className="sm" />
          <Select className="sm" style={{ width: 'auto' }} value={s.floorId ?? ''} onChange={(e) => set({ floorId: e.target.value, page: 1 })} placeholder="All floors" options={floorOptions} />
          <Select className="sm" style={{ width: 'auto' }} value={s.typologyId ?? ''} onChange={(e) => set({ typologyId: e.target.value, page: 1 })} placeholder="All types" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          <Select className="sm" style={{ width: 'auto' }} value={s.status ?? ''} onChange={(e) => set({ status: e.target.value, page: 1 })} placeholder="All statuses" options={UNIT_STATUSES.map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
          <Select className="sm" style={{ width: 'auto' }} value={s.bedrooms ?? ''} onChange={(e) => set({ bedrooms: e.target.value, page: 1 })} placeholder="Any bedrooms" options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} bedroom${n > 1 ? 's' : ''}` }))} />
          <Select className="sm" style={{ width: 'auto' }} value={s.published ?? ''} onChange={(e) => set({ published: e.target.value, page: 1 })} placeholder="Published or hidden" options={[{ value: 'true', label: 'Published' }, { value: 'false', label: 'Hidden' }]} />
          <Button size="sm" icon={<SlidersHorizontal size={15} />} onClick={() => setMore((m) => !m)} aria-pressed={more}>
            Price & size
          </Button>
          <span className="spacer" />
          <Button size="sm" variant={archivedView ? 'primary' : 'default'} icon={<Archive size={15} />} onClick={() => set({ archived: archivedView ? '' : 'true', page: 1 })}>
            {archivedView ? 'Showing archive' : 'Archive'}
          </Button>
          {(s.q || s.floorId || s.typologyId || s.status || s.bedrooms || s.published || s.minPrice || s.maxPrice || s.minSize || s.maxSize) && (
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => { setSearch(''); set({ q: '', floorId: '', typologyId: '', status: '', bedrooms: '', published: '', minPrice: '', maxPrice: '', minSize: '', maxSize: '', page: 1 }); }}>
              Clear
            </Button>
          )}
        </div>
        {more && (
          <div className="table-toolbar">
            <span className="small muted">Price (USD)</span>
            <Input className="sm" style={{ width: 120 }} placeholder="Min" value={s.minPrice ?? ''} onChange={(e) => set({ minPrice: e.target.value.replace(/[^\d]/g, ''), page: 1 })} />
            <Input className="sm" style={{ width: 120 }} placeholder="Max" value={s.maxPrice ?? ''} onChange={(e) => set({ maxPrice: e.target.value.replace(/[^\d]/g, ''), page: 1 })} />
            <span className="small muted" style={{ marginLeft: 12 }}>Size (m²)</span>
            <Input className="sm" style={{ width: 100 }} placeholder="Min" value={s.minSize ?? ''} onChange={(e) => set({ minSize: e.target.value.replace(/[^\d.]/g, ''), page: 1 })} />
            <Input className="sm" style={{ width: 100 }} placeholder="Max" value={s.maxSize ?? ''} onChange={(e) => set({ maxSize: e.target.value.replace(/[^\d.]/g, ''), page: 1 })} />
          </div>
        )}

        {error && <div className="card-body"><ErrorBox error={error} onRetry={refetch} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px' }}>
          <table className="table">
            <thead>
              <tr>
                <th className="check">
                  <Checkbox aria-label="Select all on this page" checked={allChecked} indeterminate={!allChecked && rows.some((r) => selected.has(r.id))} onChange={(on) => setSelected(on ? new Set([...selected, ...rows.map((r) => r.id)]) : new Set([...selected].filter((id) => !rows.some((r) => r.id === id))))} />
                </th>
                <th style={{ width: 56 }} />
                <SortHead label="Unit" k="code" sort={s.sort!} dir={s.dir!} onSort={onSort} />
                <SortHead label="Floor" k="floor" sort={s.sort!} dir={s.dir!} onSort={onSort} />
                <th>Type</th>
                <SortHead label="Beds" k="bedrooms" sort={s.sort!} dir={s.dir!} onSort={onSort} num />
                <SortHead label="Size" k="size" sort={s.sort!} dir={s.dir!} onSort={onSort} num />
                <SortHead label="Price" k="price" sort={s.sort!} dir={s.dir!} onSort={onSort} num />
                <SortHead label="Status" k="status" sort={s.sort!} dir={s.dir!} onSort={onSort} />
                <th className="num" title="Enquiries and interested clients">Interest</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={11}><Skeleton h={22} /></td>
                </tr>
              ))}
              {rows.map((r) => (
                <tr key={r.id} data-clickable="true" data-selected={selected.has(r.id)} onClick={() => navigate(`/residences/${r.id}`)}>
                  <td className="check" onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>{r.cover ? <MediaImg m={r.cover} thumb className="thumb" sizes="60px" /> : <span className="thumb-empty"><Building2 size={15} /></span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="cell-strong">{fmtCode(r.code)}</span>
                      {r.featured && <Star size={13} fill="var(--gold)" color="var(--gold)" aria-label="Featured" />}
                      {!r.published && <Badge tone="grey" plain>Hidden</Badge>}
                    </div>
                    {r.tags.length > 0 && <div className="small muted">{r.tags.join(' · ')}</div>}
                  </td>
                  <td><InlineSelect id={r.id} value={r.floorId} options={floorOptions} field="floorId" label={`Floor of ${r.code}`} confirmText={(to) => `Move ${fmtCode(r.code)} to ${to}?`} /></td>
                  <td className="muted">{r.typology.name}</td>
                  <td className="num"><InlineSelect id={r.id} value={String(r.bedrooms)} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} field="bedrooms" label={`Bedrooms in ${r.code}`} /></td>
                  <td className="num"><InlineArea id={r.id} value={r.areaSqm} /></td>
                  <td className="num"><InlinePrice id={r.id} code={r.code} priceMinor={r.priceMinor} currency={r.currency} effectiveMinor={r.effectivePriceMinor} /></td>
                  <td><StatusSelect id={r.id} code={r.code} status={r.status} disabled={archivedView} /></td>
                  <td className="num muted">{r.enquiryCount + r.interestCount || '—'}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <Link to={`/residences/${r.id}`} className="btn xs">Edit</Link>
                      <Menu trigger={(t) => <Button size="sm" variant="ghost" icon={<MoreVertical size={16} />} onClick={t} aria-label={`More actions for ${r.code}`} />}>
                        {(close) => (
                          <>
                            <Link to={`/residences/${r.id}?tab=preview`} onClick={close}><Eye size={15} /> Public preview</Link>
                            {can('residence.edit') && !archivedView && (
                              <>
                                <button type="button" onClick={() => { close(); void rowAction(r, r.published ? 'unpublish' : 'publish'); }}>{r.published ? <><EyeOff size={15} /> Unpublish</> : <><Eye size={15} /> Publish</>}</button>
                                <button type="button" onClick={() => { close(); void rowAction(r, r.featured ? 'unfeature' : 'feature'); }}><Star size={15} /> {r.featured ? 'Remove from featured' : 'Feature on homepage'}</button>
                                <button type="button" onClick={() => { close(); void rowAction(r, 'duplicate'); }}><Copy size={15} /> Duplicate</button>
                              </>
                            )}
                            {can('residence.delete') && (
                              <>
                                <hr />
                                {archivedView ? (
                                  <>
                                    <button type="button" onClick={() => { close(); void rowAction(r, 'restore'); }}><RotateCcw size={15} /> Restore</button>
                                    <button type="button" className="danger" onClick={() => { close(); void rowAction(r, 'delete'); }}><Trash2 size={15} /> Delete permanently</button>
                                  </>
                                ) : (
                                  <button type="button" className="danger" onClick={() => { close(); void rowAction(r, 'archive'); }}><Archive size={15} /> Archive</button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </Menu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty title={archivedView ? 'The archive is empty' : 'No residences match'} icon={<Building2 size={34} />}>
              {archivedView ? 'Archived residences appear here, with their history intact.' : 'Try clearing a filter.'}
            </Empty>
          )}
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar" role="region" aria-label="Bulk actions">
            <strong>{selected.size} selected</strong>
            {can('residence.status') && !archivedView && (
              <Select className="sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && void bulk('status', { status: e.target.value }, e.target.value === 'SOLD' ? { title: `Mark ${selected.size} residences as sold?`, body: 'The website shows them as sold at once. Only a super admin can undo a sale.' } : undefined)} placeholder="Change status…" options={UNIT_STATUSES.map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
            )}
            {can('residence.price') && !archivedView && <Button size="sm" onClick={() => setBulkPrice(true)}>Change price</Button>}
            {can('residence.edit') && !archivedView && (
              <>
                <Button size="sm" icon={<Eye size={14} />} onClick={() => void bulk('publish')}>Publish</Button>
                <Button size="sm" icon={<EyeOff size={14} />} onClick={() => void bulk('unpublish')}>Unpublish</Button>
                <Button size="sm" icon={<Star size={14} />} onClick={() => void bulk('feature')}>Feature</Button>
                <Select className="sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && void bulk('floor', { floorId: e.target.value }, { title: `Move ${selected.size} residences to ${floorOptions.find((f) => f.value === e.target.value)?.label}?` })} placeholder="Assign floor…" options={floorOptions} />
                <span className="row" style={{ gap: 4 }}>
                  <Input className="sm" style={{ width: 120 }} placeholder="Tag" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
                  <Button size="sm" icon={<Tag size={14} />} disabled={!bulkTag.trim()} onClick={() => { void bulk('tag', { tag: bulkTag.trim() }); setBulkTag(''); }}>Add tag</Button>
                </span>
              </>
            )}
            {can('residence.delete') && (archivedView ? (
              <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void bulk('restore')}>Restore</Button>
            ) : (
              <Button size="sm" icon={<Archive size={14} />} onClick={() => void bulk('archive', {}, { title: `Archive ${selected.size} residences?`, body: 'They disappear from the website; their history is kept and you can restore them.', danger: true })}>Archive</Button>
            ))}
            <Button size="sm" icon={<Download size={14} />} onClick={() => exportSelected(rows.filter((r) => selected.has(r.id)))}>Export</Button>
            <span className="spacer" />
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => setSelected(new Set())} aria-label="Clear selection" />
          </div>
        )}

        <div className="table-foot">
          {data && `Showing ${rows.length ? (data.meta.page - 1) * data.meta.pageSize + 1 : 0}–${(data.meta.page - 1) * data.meta.pageSize + rows.length} of ${data.meta.total}`}
          {data && rows.length > 0 && <span className="muted">· total value {money(rows.reduce((a, r) => a + r.effectivePriceMinor, 0), rows[0]!.currency, { compact: true })} on this page</span>}
          <Select className="sm" style={{ width: 'auto', marginLeft: 12 }} value={s.pageSize!} onChange={(e) => set({ pageSize: e.target.value, page: 1 })} options={['25', '50', '100'].map((n) => ({ value: n, label: `${n} per page` }))} />
          {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}
        </div>
      </Card>

      {bulkPrice && <BulkPrice ids={ids} onClose={() => setBulkPrice(false)} />}
    </>
  );
}
