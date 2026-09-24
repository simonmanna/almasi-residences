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
import { Alert, Badge, Button, Card, CardHead, Empty, ErrorBox, Field, LoadingPage, MediaImg, PageHead, Tabs, Toggle, useConfirm } from '../components/ui';

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
  const [tab, setTab] = useState<'settings' | 'residences'>('settings');

  // Fetch featured residences
  const { data: featuredData, error: featuredError, refetch: refetchFeatured } = useQuery('residences:featured', () => get<Paged<ResidenceRow>>('/admin/residences?featured=true&pageSize=100'));
  // Fetch all residences for the selection tab
  const { data: allData, error: allError, refetch: refetchAll } = useQuery('residences:all', () => get<Paged<ResidenceRow>>('/admin/residences?pageSize=200'));
  const editable = can('residence.edit');

  const unfeature = async (r: ResidenceRow) => {
    if (!(await confirm({ title: `Remove ${r.code} from the selection?`, body: 'It disappears from the homepage section. The residence itself stays published.', confirm: 'Remove' }))) return;
    try {
      await patch(`/admin/residences/${r.id}`, { featured: false });
      toast.success(`${r.code} removed from the selection.`);
      invalidate('residences', 'residence:', 'dashboard');
      refetchFeatured();
      refetchAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const feature = async (r: ResidenceRow) => {
    try {
      await patch(`/admin/residences/${r.id}`, { featured: true });
      toast.success(`${r.code} added to the selection.`);
      invalidate('residences', 'residence:', 'dashboard');
      refetchFeatured();
      refetchAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const featuredCount = featuredData?.data.length ?? 0;
  const allCount = allData?.data.length ?? 0;
  const featuredIds = new Set(featuredData?.data.map(r => r.id) ?? []);

  return (
    <>
      <PageHead
        title="Selected residences"
        sub="The “Selected” section of the homepage: whether it is shown, and which residences it holds."
        crumbs={[{ label: 'Website' }, { label: 'Selected residences' }]}
      >
        <a className="btn" href={`${SITE_URL}/#featured-title`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'settings', label: 'Settings', count: featuredCount > 0 ? featuredCount : undefined },
        { value: 'residences', label: 'Residences', count: allCount },
      ]} />

      {tab === 'settings' && <Visibility />}

      {tab === 'residences' && (
        <Card>
          <CardHead title="All residences" icon={<Star size={18} />} sub="Toggle the star to add or remove a residence from the homepage selection.">
            <Link to="/residences" className="btn">Manage residences</Link>
          </CardHead>
          {allError ? (
            <ErrorBox error={allError} onRetry={refetchAll} />
          ) : !allData ? (
            <LoadingPage />
          ) : allData.data.length === 0 ? (
            <Empty title="No residences yet" icon={<Star size={32} />}>
              Create residences under Property → Residences to add them to the selection.
            </Empty>
          ) : (
            <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
              <table className="table">
                <thead><tr><th /><th>Residence</th><th>Type</th><th>Floor</th><th>Size</th><th>Price</th><th>Status</th><th style={{ width: 100, textAlign: 'center' }}>Selected</th></tr></thead>
                <tbody>
                  {allData.data.map((r) => {
                    const isFeatured = featuredIds.has(r.id);
                    return (
                      <tr key={r.id}>
                        <td style={{ width: 56 }}><MediaImg m={r.cover} thumb sizes="48px" style={{ width: 48, height: 34, objectFit: 'cover', borderRadius: 4 }} /></td>
                        <td><Link to={`/residences/${r.id}`}><strong style={{ color: 'var(--navy)' }}>{r.code}</strong></Link></td>
                        <td>{r.typology.name}</td>
                        <td>{r.floor.label}</td>
                        <td className="tabular nowrap">{area(r.areaSqm)}</td>
                        <td className="tabular nowrap">{money(r.effectivePriceMinor, r.currency)}</td>
                        <td><Badge tone={r.published ? 'green' : 'amber'} plain>{r.published ? 'Published' : 'Unpublished'}</Badge></td>
                        <td style={{ textAlign: 'center' }}>
                          {editable && (
                            <Button
                              size="sm"
                              variant={isFeatured ? 'primary' : 'ghost'}
                              icon={isFeatured ? <Star size={14} /> : <StarOff size={14} />}
                              onClick={() => isFeatured ? void unfeature(r) : void feature(r)}
                              aria-label={isFeatured ? `Remove ${r.code} from selection` : `Add ${r.code} to selection`}
                            >
                              {isFeatured ? 'Selected' : 'Add'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
