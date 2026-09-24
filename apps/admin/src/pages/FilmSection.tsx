import { useState } from 'react';
import { Clapperboard, ExternalLink, Film, ImageIcon } from 'lucide-react';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { SectionSettings } from '../components/SectionSettings';
import { useToast } from '../components/Toast';
import { Button, Card, CardHead, ErrorBox, LoadingPage, MediaImg, PageHead } from '../components/ui';

const SLOT = 'home-film-teaser';

interface SlotRow {
  key: string;
  image: MediaView | null;
  video: MediaView | null;
}

/** The picture and quiet loop behind the invitation — the same placement as Website → Placements. */
function TeaserMedia() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('media.edit');
  const { data, error, refetch } = useQuery('slots', () => get<SlotRow[]>('/admin/slots'));
  const [pick, setPick] = useState<'IMAGE' | 'VIDEO' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const slot = data.find((s) => s.key === SLOT);
  const save = async (body: { imageId?: string | null; videoId?: string | null }) => {
    try {
      await put(`/admin/slots/${SLOT}`, body);
      toast.success('Saved. The homepage updates straight away.');
      invalidate('slots');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Card>
      <CardHead title="Picture and loop" icon={<ImageIcon size={18} />} sub="Shown full width behind the words; the loop plays silently when set.">
        <Link to="/film" className="btn">Edit the film itself</Link>
      </CardHead>
      <div className="card-body row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 320 }}>
          <div className="placement-media" style={{ aspectRatio: '16 / 9' }}>
            {slot?.image ? <MediaImg m={slot.image} sizes="320px" /> : <div className="placement-empty"><ImageIcon size={22} /> No picture</div>}
          </div>
        </div>
        <div className="stack" style={{ flex: 1 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Loop: {slot?.video ? <strong>{slot.video.title ?? 'set'}</strong> : 'none — the picture stands still'}
          </p>
          {editable && (
            <div className="row-wrap" style={{ gap: 6 }}>
              <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick('IMAGE')}>{slot?.image ? 'Change' : 'Choose'} picture</Button>
              <Button size="sm" icon={<Clapperboard size={14} />} onClick={() => setPick('VIDEO')}>{slot?.video ? 'Change' : 'Add'} loop</Button>
              {slot?.video && <Button size="sm" variant="ghost" onClick={() => void save({ videoId: null })}>Remove loop</Button>}
            </div>
          )}
        </div>
      </div>
      {pick && <MediaPicker kind={pick} onClose={() => setPick(null)} onPick={([m]) => m && void save(pick === 'IMAGE' ? { imageId: m.id } : { videoId: m.id })} />}
    </Card>
  );
}

/** Website → Film — the homepage's invitation to watch the film: its words, its picture, and whether it shows. */
export default function FilmSection() {
  return (
    <>
      <PageHead
        title="Film"
        sub="The film section of the homepage: whether it is shown, its words and its picture."
        crumbs={[{ label: 'Website' }, { label: 'Film' }]}
      >
        <a className="btn" href={`${SITE_URL}/#film-teaser-title`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>
      <SectionSettings
        pageKey="filmSection"
        title="Section"
        icon={<Film size={18} />}
        fields={[
          { key: 'showFilmSection', label: 'Show the film section', type: 'boolean', hint: 'Off hides the film invitation on the homepage. The /film page itself stays live.' },
          { key: 'kicker', label: 'Kicker', type: 'text', hint: 'Small line above the title, e.g. “The Film”.' },
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'cta', label: 'Button', type: 'text', hint: 'The play label, e.g. “Play the film”. Leave empty to show no button.' },
        ]}
      />
      <TeaserMedia />
    </>
  );
}
