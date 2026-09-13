import { useState } from 'react';
import { Clapperboard, ExternalLink, ImageIcon, X } from 'lucide-react';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, ErrorBox, LoadingPage, MediaImg, PageHead } from '../components/ui';
import { SITE_URL } from '../lib/site';

interface SlotRow {
  key: string;
  label: string;
  where: string;
  group: string;
  allowsVideo: boolean;
  image: MediaView | null;
  video: MediaView | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Roadmap items 16–18 — every place on the website that shows a picture or a
 * film, and which library file fills it. Replacing the homepage photograph is
 * a choice here, not a deploy.
 */
export default function Placements() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('media.edit');
  const { data, error, refetch } = useQuery('slots', () => get<SlotRow[]>('/admin/slots'));
  const [pick, setPick] = useState<{ key: string; kind: 'IMAGE' | 'VIDEO' } | null>(null);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const rows = data;
  const save = async (key: string, body: { imageId?: string | null; videoId?: string | null }) => {
    try {
      await put(`/admin/slots/${key}`, body);
      toast.success('Placement saved. The website updates straight away.');
      invalidate('slots');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const groups = [...new Set(rows.map((r) => r.group))];
  const empty = rows.filter((r) => !r.image).length;

  return (
    <>
      <PageHead title="Placements" sub={empty ? `${empty} placement${empty === 1 ? '' : 's'} empty — the website shows a neutral frame there` : 'Every picture on the website comes from here or from its record'} />
      {groups.map((g) => (
        <Card key={g}>
          <CardHead title={g} />
          <div className="placement-grid">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <article key={r.key} className="placement">
                  <div className="placement-media">
                    {r.image ? <MediaImg m={r.image} sizes="360px" /> : <div className="placement-empty"><ImageIcon size={26} /> Empty</div>}
                    {r.video && <Badge tone="sky">Film plays over it</Badge>}
                  </div>
                  <div className="placement-body">
                    <strong>{r.label}</strong>
                    <p className="muted small">{r.where}</p>
                    {r.image && <p className="small">{r.image.title ?? 'Untitled'}{r.image.provenance && r.image.provenance !== 'PHOTOGRAPH' ? ' · render' : ''}</p>}
                    {r.updatedAt && <p className="muted small">Changed {date(r.updatedAt)}{r.updatedBy ? ` by ${r.updatedBy}` : ''}</p>}
                    {editable && (
                      <div className="row-wrap" style={{ gap: 6 }}>
                        <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick({ key: r.key, kind: 'IMAGE' })}>{r.image ? 'Change image' : 'Choose image'}</Button>
                        {r.image && <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label="Remove image" onClick={() => void save(r.key, { imageId: null })} />}
                        {r.allowsVideo && <Button size="sm" icon={<Clapperboard size={14} />} onClick={() => setPick({ key: r.key, kind: 'VIDEO' })}>{r.video ? 'Change film' : 'Add film'}</Button>}
                        {r.video && <Button size="sm" variant="ghost" onClick={() => void save(r.key, { videoId: null })}>Remove film</Button>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </Card>
      ))}
      <p className="muted small">
        <a href={SITE_URL} target="_blank" rel="noreferrer">Open the website <ExternalLink size={12} /></a>
      </p>
      {pick && (
        <MediaPicker
          kind={pick.kind}
          title={pick.kind === 'VIDEO' ? 'Choose a film' : 'Choose an image'}
          onClose={() => setPick(null)}
          onPick={([m]) => m && void save(pick.key, pick.kind === 'VIDEO' ? { videoId: m.id } : { imageId: m.id })}
        />
      )}
    </>
  );
}
