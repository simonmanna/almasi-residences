import { useState } from 'react';
import { ArrowDown, ArrowUp, Images, Plus } from 'lucide-react';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { navigate } from '../lib/router';
import type { MediaView } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorBox, Field, Input, LoadingPage, MediaImg, Modal, PageHead, Textarea } from '../components/ui';

export interface GalleryRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  published: boolean;
  sortOrder: number;
  itemCount: number;
  cover: MediaView | null;
  preview: MediaView[];
}

/** §16 — curated galleries. The public gallery page shows these, in this order. */
export default function Galleries() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error } = useQuery('galleries', () => get<GalleryRow[]>('/admin/galleries'));
  const [creating, setCreating] = useState(false);
  const [d, setD] = useState({ title: '', description: '' });
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const editable = can('gallery.edit');

  const move = async (i: number, dir: -1 | 1) => {
    const ids = data.map((g) => g.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post('/admin/galleries/reorder', { ids });
    invalidate('galleries');
  };

  return (
    <>
      <PageHead title="Galleries" sub={`${data.length} galleries · ${data.reduce((a, g) => a + g.itemCount, 0)} items`}>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>New gallery</Button>}
      </PageHead>
      <div className="grid-3">
        {data.map((g, i) => (
          <Card key={g.id}>
            <div className="media-tile" style={{ aspectRatio: '16 / 9', borderRadius: '14px 14px 0 0', border: 0 }} onClick={() => navigate(`/galleries/${g.id}`)}>
              {g.cover ? <MediaImg m={g.cover} sizes="400px" /> : <div className="doc"><Images size={28} />Empty gallery</div>}
              <div className="tile-tag">{!g.published && <Badge tone="grey" plain>Hidden</Badge>}</div>
            </div>
            <div className="card-body" style={{ paddingTop: 14 }}>
              <div className="row">
                <h3 style={{ flex: 1 }}>{g.title}</h3>
                {editable && (
                  <>
                    <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Earlier" disabled={i === 0} onClick={() => void move(i, -1)} />
                    <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Later" disabled={i === data.length - 1} onClick={() => void move(i, 1)} />
                  </>
                )}
              </div>
              <p className="muted small" style={{ margin: '4px 0 10px', minHeight: 36 }}>{g.description}</p>
              <div className="row small">
                <span className="muted">{g.itemCount} items</span>
                <button type="button" className="btn xs" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/galleries/${g.id}`)}>Open</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {creating && (
        <Modal title="New gallery" onClose={() => setCreating(false)} footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!d.title.trim()} onClick={async () => {
          try {
            const g = await post<{ id: string }>('/admin/galleries', { title: d.title.trim(), description: d.description.trim() || null });
            invalidate('galleries');
            navigate(`/galleries/${g.id}`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}>Create</Button></>}>
          <Field label="Title"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} autoFocus placeholder="Construction progress" /></Field>
          <Field label="Description"><Textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}
