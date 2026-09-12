import { ArrowRight, Bath, BedDouble, Compass, Eye, Frame, Images, Inbox, Maximize2 } from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area, code as fmtCode, date, money, ORIENTATION_TEXT } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import type { ResidenceDetail } from '../lib/types';
import { InlinePrice } from './InlinePrice';
import { StatusSelect } from './StatusSelect';
import { Badge, Button, Drawer, ErrorBox, KV, MediaImg, Skeleton } from './ui';

/**
 * §24 / §50 — everything sales needs about one residence without leaving the
 * building view: status and price (editable in place), size, who is
 * interested, and the ways into its full record.
 */
export function UnitQuickView({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const { data: u, error, refetch } = useQuery(`residence:${id}`, () => get<ResidenceDetail>(`/admin/residences/${id}`));
  const cover = u?.media.find((m) => m.isCover && m.collection === 'LIBRARY') ?? u?.media.find((m) => m.collection === 'LIBRARY' && m.kind === 'IMAGE');
  const plans = u?.media.filter((m) => m.collection === 'FLOOR_PLAN') ?? [];

  return (
    <Drawer
      title={u ? `Residence ${fmtCode(u.code)}` : 'Residence'}
      sub={u && `${u.floor.displayName ?? u.floor.label} · ${u.typology.name}`}
      onClose={onClose}
      footer={
        <>
          <Link to={`/residences/${id}`} className="btn primary" style={{ flex: 1 }}>
            Open residence <ArrowRight size={16} />
          </Link>
          <Link to={`/residences/${id}?tab=preview`} className="btn">
            <Eye size={16} /> Preview
          </Link>
        </>
      }
    >
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {!u && !error && (
        <div className="stack">
          <Skeleton h={180} />
          <Skeleton h={18} w="60%" />
          <Skeleton h={18} w="40%" />
        </div>
      )}
      {u && (
        <>
          <div className="featured-photo">
            {cover ? <MediaImg m={cover} sizes="480px" /> : <div className="empty" style={{ height: '100%' }}>No photographs yet</div>}
          </div>
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <StatusSelect id={u.id} code={u.code} status={u.status} onChanged={refetch} />
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              <InlinePrice id={u.id} code={u.code} priceMinor={u.priceMinor} currency={u.currency} effectiveMinor={u.effectivePriceMinor} />
            </div>
          </div>
          <div className="row-wrap" style={{ gap: 16, color: 'var(--ink-2)' }}>
            <span className="row" style={{ gap: 6 }}><BedDouble size={16} /> {u.bedrooms} bed</span>
            <span className="row" style={{ gap: 6 }}><Bath size={16} /> {u.bathrooms} bath</span>
            <span className="row" style={{ gap: 6 }}><Maximize2 size={16} /> {area(u.areaSqm)}</span>
            <span className="row" style={{ gap: 6 }}><Compass size={16} /> {ORIENTATION_TEXT[u.orientation]}</span>
          </div>
          <KV
            items={[
              ['Price per m²', u.pricePerSqmMinor ? money(u.pricePerSqmMinor, u.currency) : '—'],
              ['On the website', u.published ? <Badge tone="green" plain>Published</Badge> : <Badge tone="grey" plain>Hidden</Badge>],
              ['Available from', date(u.availabilityDate)],
              ['Parking', `${u.parkingIncluded} bay${u.parkingIncluded === 1 ? '' : 's'}${u.parkingSpaces.length ? ` (${u.parkingSpaces.map((p) => p.code).join(', ')})` : ''}`],
              ...(can('buyer.view') ? ([['Buyer', u.buyer && !u.buyer.restricted ? <Link to={`/buyers/${u.buyer.id}`}>{u.buyer.fullName}</Link> : '—']] as [string, React.ReactNode][]) : []),
              ['Interested clients', u.interests.length ? u.interests.map((b) => b.fullName).join(', ') : can('buyer.view') ? 'None yet' : `${u.interests.length}`],
            ]}
          />
          <div className="grid-3" style={{ gap: 10 }}>
            <Link to={`/residences/${id}?tab=plan`} className="btn sm"><Frame size={15} /> Floor plan{plans.length ? ` (${plans.length})` : ''}</Link>
            <Link to={`/residences/${id}?tab=images`} className="btn sm"><Images size={15} /> Gallery</Link>
            <Link to={`/residences/${id}?tab=enquiries`} className="btn sm"><Inbox size={15} /> Enquiries ({u.enquiryCount})</Link>
          </div>
          {u.statusLog[0] && (
            <p className="muted small" style={{ margin: 0 }}>
              Last status change: {u.statusLog[0].actorName}, {date(u.statusLog[0].createdAt)}.
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={refetch} style={{ justifySelf: 'start' }}>Refresh</Button>
        </>
      )}
    </Drawer>
  );
}
