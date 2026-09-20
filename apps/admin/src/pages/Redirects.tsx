import { useState } from 'react';
import { ArrowRight, Plus, Signpost, Trash2 } from 'lucide-react';
import { normalisePath } from '@avida/types';
import { del, get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, Modal, PageHead, Select, Toggle, useConfirm } from '../components/ui';

interface RedirectRow {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  reason: string | null;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
}

const CODES = [
  { value: '301', label: '301 — moved for good' },
  { value: '302', label: '302 — moved for now' },
];

function RedirectForm({ row, onClose }: { row?: RedirectRow; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    fromPath: row?.fromPath ?? '',
    toPath: row?.toPath ?? '',
    statusCode: String(row?.statusCode ?? 301),
    reason: row?.reason ?? '',
    enabled: row?.enabled ?? true,
  });
  const [busy, setBusy] = useState(false);
  const from = d.fromPath.trim() ? normalisePath(d.fromPath) : '';
  const to = d.toPath.trim().startsWith('http') ? d.toPath.trim() : d.toPath.trim() ? normalisePath(d.toPath) : '';
  const valid = Boolean(from && to && from !== to && from !== '/');

  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/seo/redirects', { fromPath: from, toPath: to, statusCode: Number(d.statusCode), reason: d.reason.trim() || null, enabled: d.enabled });
      toast.success(`${from} now goes to ${to}.`);
      invalidate('seo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={row ? `Edit ${row.fromPath}` : 'New redirect'}
      sub="An old address, and where a visitor who follows it should arrive."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Old address" hint="The path as it was, e.g. /residences/a-1. The homepage cannot be redirected.">
        <Input value={d.fromPath} onChange={(e) => setD({ ...d, fromPath: e.target.value })} placeholder="/residences/old-code" autoFocus disabled={Boolean(row)} />
      </Field>
      <Field label="Goes to" hint="A path on this site, or a full address elsewhere.">
        <Input value={d.toPath} onChange={(e) => setD({ ...d, toPath: e.target.value })} placeholder="/residences/new-code" />
      </Field>
      <Field label="Kind" hint="“Moved for good” is what search engines follow and remember.">
        <Select value={d.statusCode} onChange={(e) => setD({ ...d, statusCode: e.target.value })} options={CODES} />
      </Field>
      <Field label="Why" hint="For whoever reads this list in a year's time.">
        <Input value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="The residence was renumbered" />
      </Field>
      <Toggle checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label="Active" />
      {from && to && (
        <p className="muted small">
          {from} <ArrowRight size={12} /> {to}
        </p>
      )}
    </Modal>
  );
}

/**
 * Website → Redirects. Every old address that must still arrive somewhere.
 * Renaming a residence, a location page or an article writes one of these by
 * itself; this screen is for the ones only a person knows about.
 */
export default function Redirects() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('seo:redirects', () => get<RedirectRow[]>('/admin/seo/redirects'));
  const [edit, setEdit] = useState<RedirectRow | 'new' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const remove = async (r: RedirectRow) => {
    if (!(await confirm({ title: `Remove the redirect from ${r.fromPath}?`, body: 'Anyone following that old link will meet a 404 instead.', confirm: 'Remove', danger: true }))) return;
    try {
      await del(`/admin/seo/redirects/${r.id}`);
      toast.success('Redirect removed.');
      invalidate('seo');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Redirects" sub="Old addresses, and where they now lead" crumbs={[{ label: 'Website' }, { label: 'Redirects' }]}>
        {editable && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>
            Add redirect
          </Button>
        )}
      </PageHead>
      <Card>
        <CardHead title="Every redirect" icon={<Signpost size={18} />} sub={`${data.length} in place, ${data.filter((r) => r.enabled).length} active`} />
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Alert tone="info">A renamed residence, location page or article keeps its old address automatically — those rows appear here.</Alert>
        </div>
        {data.length === 0 ? (
          <Empty title="No redirects yet" icon={<Signpost size={32} />}>
            Nothing has been renamed, so no old address needs one.
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Kind</th>
                  <th>Used</th>
                  <th>Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ color: 'var(--navy)' }}>{r.fromPath}</strong>
                      {!r.enabled && (
                        <Badge tone="amber" plain>
                          Off
                        </Badge>
                      )}
                    </td>
                    <td className="muted">{r.toPath}</td>
                    <td className="tabular">{r.statusCode}</td>
                    <td className="tabular nowrap">
                      {r.hits}
                      {r.lastHitAt && <span className="muted small"> · {ago(r.lastHitAt)}</span>}
                    </td>
                    <td className="muted small">{r.reason ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {editable && (
                        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <Button size="sm" onClick={() => setEdit(r)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Remove the redirect from ${r.fromPath}`} onClick={() => void remove(r)} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <RedirectForm row={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
