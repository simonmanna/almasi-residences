import { useEffect, useState } from 'react';
import { ImagePlus, Save, Star, Trash2, X } from 'lucide-react';
import { del, get, patch, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { navigate } from '../lib/router';
import type { MediaView } from '../lib/types';
import { MediaGrid, MediaPicker, MediaUploader } from '../components/Media';
import { useToast } from '../components/Toast';
import { Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, PageHead, Textarea, Toggle, useConfirm } from '../components/ui';

interface GalleryDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  published: boolean;
  coverMediaId: string | null;
  coverMedia: MediaView | null;
  items: MediaView[];
}

/** §16 — one gallery: its words, its cover and its items, in order. */
export default function GalleryDetailPage({ params }: { params: Record<string, string> }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: g, error, refetch } = useQuery(`gallery:${params.id}`, () => get<GalleryDetail>(`/admin/galleries/${params.id}`));
  const [d, setD] = useState({ title: '', slug: '', description: '', published: true });
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (g) setD({ title: g.title, slug: g.slug, description: g.description ?? '', published: g.published });
  }, [g]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!g) return <LoadingPage />;
  const editable = can('gallery.edit');

  const setItems = async (ids: string[], msg = 'Gallery updated.') => {
    try {
      await put(`/admin/galleries/${g.id}/items`, { mediaIds: ids });
      toast.success(msg);
      invalidate(`gallery:${g.id}`, 'galleries');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const saveMeta = async (extra: Record<string, unknown> = {}) => {
    try {
      await patch(`/admin/galleries/${g.id}`, { title: d.title, slug: d.slug, description: d.description || null, published: d.published, ...extra });
      toast.success('Saved.');
      invalidate(`gallery:${g.id}`, 'galleries');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const first = [...selected][0];

  return (
    <>
      <PageHead title={g.title} crumbs={[{ label: 'Galleries', to: '/galleries' }, { label: g.title }]} sub={`${g.items.length} items · drag to reorder`}>
        {editable && (
          <>
            <Button icon={<ImagePlus size={16} />} onClick={() => setPicking(true)}>Add from library</Button>
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
              if (!(await confirm({ title: `Delete the gallery “${g.title}”?`, body: 'Only the selection is deleted — every file stays in the media library.', confirm: 'Delete gallery', danger: true }))) return;
              await del(`/admin/galleries/${g.id}`);
              invalidate('galleries');
              navigate('/galleries');
            }}>Delete</Button>
          </>
        )}
      </PageHead>

      <div className="detail-grid">
        <Card>
          <CardHead title="Items" sub="The order here is the order on the website.">
            {editable && selected.size > 0 && (
              <>
                {selected.size === 1 && <Button size="sm" icon={<Star size={14} />} onClick={() => { void saveMeta({ coverMediaId: first }); setSelected(new Set()); }}>Make cover</Button>}
                <Button size="sm" icon={<X size={14} />} onClick={() => { void setItems(g.items.filter((m) => !selected.has(m.id)).map((m) => m.id), `Removed ${selected.size} from the gallery.`); setSelected(new Set()); }}>Remove {selected.size}</Button>
              </>
            )}
          </CardHead>
          <div className="card-body stack">
            {editable && <MediaUploader fields={{ collection: 'LIBRARY', category: 'OTHER', galleryId: g.id }} title="Upload straight into this gallery" />}
            <MediaGrid
              items={g.items.map((m) => ({ ...m, isCover: m.id === g.coverMediaId }))}
              selected={selected}
              onToggle={editable ? (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }) : undefined}
              onOpen={editable ? (m) => setSelected((cur) => { const n = new Set(cur); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; }) : undefined}
              onReorder={editable ? (ids) => void setItems(ids, 'Order saved.') : undefined}
              empty={<Empty title="This gallery is empty">Add files from the library or upload new ones.</Empty>}
            />
          </div>
        </Card>
        <Card>
          <CardHead title="Details" />
          <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
            <Field label="Title"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
            <Field label="Handle" hint="Part of the web address."><Input value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
            <Field label="Description"><Textarea rows={4} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
            <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
            <Button variant="primary" icon={<Save size={15} />} onClick={() => void saveMeta()}>Save details</Button>
          </fieldset>
        </Card>
      </div>

      {picking && (
        <MediaPicker multiple title={`Add to ${g.title}`} onClose={() => setPicking(false)} onPick={(ms) => void setItems([...g.items.map((m) => m.id), ...ms.map((m) => m.id).filter((id) => !g.items.some((x) => x.id === id))], `Added ${ms.length} to the gallery.`)} />
      )}
    </>
  );
}
