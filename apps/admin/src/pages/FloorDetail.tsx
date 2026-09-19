import { useState } from 'react';
import { Building2, Frame, Images, Pencil, Plus } from 'lucide-react';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area, code as fmtCode } from '../lib/format';
import { useQuery } from '../lib/query';
import { floorName } from '../lib/ref';
import { Link, navigate } from '../lib/router';
import type { FloorRow, MediaView, UnitStatus } from '../lib/types';
import { InlinePrice } from '../components/InlinePrice';
import { IMAGE_ACCEPT, MediaEditor, MediaGrid, MediaUploader, PLAN_ACCEPT } from '../components/Media';
import { StatusSelect } from '../components/StatusSelect';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, LoadingPage, MediaImg, PageHead, Stat } from '../components/ui';
import { FloorForm } from './Floors';

interface FloorDetail extends FloorRow {
  units: {
    id: string;
    code: string;
    status: UnitStatus;
    bedrooms: number;
    areaSqm: number;
    priceMinor: number;
    currency: string;
    published: boolean;
    typology: { id: string; name: string; isPenthouse: boolean };
    cover: MediaView | null;
  }[];
  media: MediaView[];
}

/** §5 — one floor: its residences, its plans and its images. */
export default function FloorDetailPage({ params }: { params: Record<string, string> }) {
  const { can } = useAuth();
  const { data: f, error, refetch } = useQuery(`floor:${params.id}`, () => get<FloorDetail>(`/admin/floors/${params.id}`));
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<MediaView | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!f) return <LoadingPage />;
  const plans = f.media.filter((m) => m.collection === 'FLOOR_PLAN');
  const images = f.media.filter((m) => m.collection !== 'FLOOR_PLAN');

  return (
    <>
      <PageHead title={floorName(f)} crumbs={[{ label: 'Floors', to: '/floors' }, { label: floorName(f) }]} sub={f.description ?? `Level ${f.level}`}>
        {!f.published && <Badge tone="grey">Hidden from the website</Badge>}
        {can('floor.edit') && <Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit floor</Button>}
        {can('residence.edit') && <Link to="/residences/new" className="btn primary"><Plus size={16} /> Add residence</Link>}
      </PageHead>

      <div className="grid-4">
        <Stat label="Residences" value={f.stats.total} icon={<Building2 size={20} />} tone="sky" />
        <Stat label="Available" value={f.stats.AVAILABLE} icon={<Building2 size={20} />} tone="green" />
        <Stat label="Reserved / booked" value={f.stats.RESERVED + f.stats.BOOKED} icon={<Building2 size={20} />} tone="blue" />
        <Stat label="Sold" value={f.stats.SOLD} icon={<Building2 size={20} />} tone="red" />
      </div>

      <Card>
        <CardHead title="Residences on this floor" icon={<Building2 size={18} />} />
        {f.units.length === 0 ? (
          <Empty title="No residences on this floor" />
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th style={{ width: 56 }} /><th>Unit</th><th>Type</th><th className="num">Beds</th><th className="num">Size</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
              <tbody>
                {f.units.map((u) => (
                  <tr key={u.id} data-clickable="true" onClick={() => navigate(`/residences/${u.id}`)}>
                    <td>{u.cover ? <MediaImg m={u.cover} thumb className="thumb" sizes="60px" /> : <span className="thumb-empty"><Building2 size={15} /></span>}</td>
                    <td className="cell-strong">{fmtCode(u.code)} {!u.published && <Badge tone="grey" plain>Hidden</Badge>}</td>
                    <td>{u.typology.name}</td>
                    <td className="num">{u.bedrooms}</td>
                    <td className="num">{area(u.areaSqm)}</td>
                    <td className="num"><InlinePrice id={u.id} code={u.code} priceMinor={u.priceMinor} currency={u.currency} /></td>
                    <td><StatusSelect id={u.id} code={u.code} status={u.status} /></td>
                    <td className="actions"><Link to={`/residences/${u.id}`} className="btn xs" onClick={(e) => e.stopPropagation()}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title="Floor plans & architectural drawings" icon={<Frame size={18} />} />
          <div className="card-body stack">
            <MediaUploader fields={{ floorId: f.id, collection: 'FLOOR_PLAN', category: 'FLOOR_PLAN' }} accept={PLAN_ACCEPT} title="Upload a floor plan" hint="Image or PDF. Residences on this floor show it when they have no plan of their own." />
            <MediaGrid items={plans} onOpen={setOpen} small empty={<Empty title="No floor plan yet" />} />
          </div>
        </Card>
        <Card>
          <CardHead title="Floor gallery" icon={<Images size={18} />} />
          <div className="card-body stack">
            <MediaUploader fields={{ floorId: f.id, collection: 'LIBRARY', category: 'INTERIOR' }} accept={IMAGE_ACCEPT} title="Upload images of this floor" hint="The first becomes the floor's cover image." />
            <MediaGrid items={images} onOpen={setOpen} small empty={<Empty title="No images yet" />} />
          </div>
        </Card>
      </div>

      {edit && <FloorForm floor={f} onClose={() => { setEdit(false); refetch(); }} />}
      {open && <MediaEditor media={open} onClose={() => setOpen(null)} />}
    </>
  );
}
