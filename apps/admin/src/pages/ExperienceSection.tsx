import { ExternalLink, ImageIcon, Pencil, Sparkles } from 'lucide-react';
import { get } from '../lib/api';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { SectionSettings } from '../components/SectionSettings';
import { Badge, Card, CardHead, Empty, ErrorBox, LoadingPage, MediaImg, PageHead } from '../components/ui';

interface TourRow {
  id: string;
  slug: string;
}
interface Scene {
  id: string;
  label: string;
  place: string | null;
  body: string | null;
  published: boolean;
  image: MediaView | null;
  video: MediaView | null;
}

/** The reel's chapters are the stations of the "experience" tour; they are edited in its tour editor. */
function Chapters() {
  const tours = useQuery('tours', () => get<TourRow[]>('/admin/tours'));
  const id = tours.data?.find((t) => t.slug === 'experience')?.id;
  const tour = useQuery(id ? `tour:${id}` : null, () => get<{ scenes: Scene[] }>(`/admin/tours/${id}`));
  if (tours.error) return <ErrorBox error={tours.error} onRetry={tours.refetch} />;
  if (tour.error) return <ErrorBox error={tour.error} onRetry={tour.refetch} />;
  if (!tours.data || (id && !tour.data)) return <LoadingPage />;
  const scenes = tour.data?.scenes ?? [];
  return (
    <Card>
      <CardHead title={`${scenes.length} chapters`} icon={<ImageIcon size={18} />} sub="In the order the reel plays them">
        {id && <Link to={`/tours/${id}`} className="btn"><Pencil size={15} /> Edit chapters</Link>}
      </CardHead>
      {!id && <Empty title="No experience tour yet">The reel reads the “experience” tour; none exists for this property.</Empty>}
      {id && scenes.length === 0 && <Empty title="No chapters yet">Add chapters with Edit chapters. The section shows nothing until it has one.</Empty>}
      {scenes.map((s, i) => (
        <div key={s.id} className="row" style={{ padding: '12px 22px', borderTop: '1px solid var(--line-2)' }}>
          <span className="muted tabular" style={{ width: 24 }}>{String(i + 1).padStart(2, '0')}</span>
          <div className="thumb" style={{ width: 96, height: 60, borderRadius: 8, overflow: 'hidden', position: 'relative', background: 'var(--line-2)' }}>{s.image ? <MediaImg m={s.image} sizes="120px" /> : null}</div>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--navy)' }}>{s.label}</strong> {s.place && <span className="muted small">· {s.place}</span>}
            {s.body && <p className="muted small" style={{ margin: '4px 0 0' }}>{s.body}</p>}
          </div>
          {!s.image && <Badge tone="amber">No image</Badge>}
          {s.video && <Badge tone="sky" plain>Film</Badge>}
          {!s.published && <Badge tone="grey" plain>Hidden</Badge>}
        </div>
      ))}
    </Card>
  );
}

/** Website → Experience — the homepage's experience reel: its heading, its chapters, and whether it shows. */
export default function ExperienceSection() {
  return (
    <>
      <PageHead
        title="Experience"
        sub="The experience reel on the homepage: whether it is shown, its heading and its chapters."
        crumbs={[{ label: 'Website' }, { label: 'Experience' }]}
      >
        <a className="btn" href={`${SITE_URL}/#experience`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>
      <SectionSettings
        pageKey="experienceSection"
        title="Section"
        icon={<Sparkles size={18} />}
        fields={[
          { key: 'showExperienceSection', label: 'Show the experience', type: 'boolean', hint: 'Off hides the whole experience reel on the homepage. Its chapters are kept.' },
          { key: 'title', label: 'Heading', type: 'text', hint: 'The line above the reel, e.g. “The Experience”.' },
        ]}
      />
      <Chapters />
    </>
  );
}
