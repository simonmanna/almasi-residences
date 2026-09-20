import { useEffect, useState } from 'react';
import { ExternalLink, Eye, Save, Send, Star, StarOff } from 'lucide-react';
import { get, patch, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area, ago, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { SITE_URL } from '../lib/site';
import type { Paged, ResidenceRow } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, Empty, ErrorBox, Field, LoadingPage, MediaImg, PageHead, Toggle, useConfirm } from '../components/ui';

interface SectionPage {
  title: string;
  content: Record<string, unknown>;
  hasDraft: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
}

/** The one switch that decides whether the homepage shows the section at all. */
function Visibility() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery('pages:featuredSection', () => get<SectionPage>('/admin/pages/featuredSection'));
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setContent(data.content);
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const canPublish = can('content.publish');
  const dirty = JSON.stringify(content) !== JSON.stringify(data.content);
  const shown = content.showFeaturedResidences !== false;
  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/pages/featuredSection', { content, ...(canPublish ? { publish: true } : {}) });
      toast.success(canPublish ? 'Saved. The homepage updates straight away.' : 'Draft saved. Someone who can publish must approve it.');
      invalidate('pages:featuredSection', 'pages', 'publishing');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHead
        title="Section visibility"
        icon={<Eye size={18} />}
        sub={data.publishedAt ? `Last published ${ago(data.publishedAt)}` : data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}
      >
        {editable && (
          <Button variant="primary" icon={canPublish ? <Send size={15} /> : <Save size={15} />} busy={busy} disabled={!dirty && !(canPublish && data.hasDraft)} onClick={() => void save()}>
            {canPublish ? 'Publish' : 'Save draft'}
          </Button>
        )}
      </CardHead>
      {data.hasDraft && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Alert tone="warn">There is an unpublished draft of this setting.{!canPublish && ' Someone who can publish must approve it.'}</Alert>
        </div>
      )}
      <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
        <Field label="Show selected residences" hint="Off hides the whole “Selected” residences section on the homepage. The residences themselves stay published.">
          <Toggle checked={shown} onChange={(v) => setContent({ ...content, showFeaturedResidences: v })} label={shown ? 'Visible on the homepage' : 'Hidden from the homepage'} />
        </Field>
      </fieldset>
    </Card>
  );
}

/** Website → Selected Residence — show or hide the homepage's selected residences, and see which ones they are. */
export default function SelectedResidences() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, error, refetch } = useQuery('residences:featured', () => get<Paged<ResidenceRow>>('/admin/residences?featured=true&pageSize=100'));
  const editable = can('residence.edit');
  const unfeature = async (r: ResidenceRow) => {
    if (!(await confirm({ title: `Remove ${r.code} from the selection?`, body: 'It disappears from the homepage section. The residence itself stays published.', confirm: 'Remove' }))) return;
    try {
      await patch(`/admin/residences/${r.id}`, { featured: false });
      toast.success(`${r.code} removed from the selection.`);
      invalidate('residences', 'residence:', 'dashboard');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <PageHead
        title="Selected residences"
        sub="The “Selected” section of the homepage: whether it is shown, and which residences it holds."
        crumbs={[{ label: 'Website' }, { label: 'Selected residences' }]}
      >
        <a className="btn" href={`${SITE_URL}/#featured-title`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>
      <Visibility />
      <Card>
        <CardHead title="Residences in the selection" icon={<Star size={18} />} sub="Marked featured under Property → Residences">
          <Link to="/residences" className="btn">Choose residences</Link>
        </CardHead>
        {error ? (
          <ErrorBox error={error} onRetry={refetch} />
        ) : !data ? (
          <LoadingPage />
        ) : data.data.length === 0 ? (
          <Empty title="No residence is selected yet" icon={<Star size={32} />}>
            Mark a residence as featured under Property → Residences and it appears here, and in the homepage section.
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th /><th>Residence</th><th>Type</th><th>Floor</th><th>Size</th><th>Price</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ width: 56 }}><MediaImg m={r.cover} thumb sizes="48px" style={{ width: 48, height: 34, objectFit: 'cover', borderRadius: 4 }} /></td>
                    <td><Link to={`/residences/${r.id}`}><strong style={{ color: 'var(--navy)' }}>{r.code}</strong></Link></td>
                    <td>{r.typology.name}</td>
                    <td>{r.floor.label}</td>
                    <td className="tabular nowrap">{area(r.areaSqm)}</td>
                    <td className="tabular nowrap">{money(r.effectivePriceMinor, r.currency)}</td>
                    <td><Badge tone={r.published ? 'green' : 'amber'} plain>{r.published ? 'Published' : 'Unpublished'}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      {editable && <Button size="sm" icon={<StarOff size={14} />} onClick={() => void unfeature(r)}>Remove</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
