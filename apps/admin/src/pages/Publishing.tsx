import { Archive, Eye, FileText, RotateCcw, Send, Trash2 } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { ago, date } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { PAGE_PATH } from '../lib/site';
import { PreviewButton } from '../components/PreviewButton';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, LoadingPage, PageHead, useConfirm } from '../components/ui';

interface Item {
  entity: string;
  entityLabel: string;
  id: string;
  title: string;
  path: string;
  archivedAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  canPublish: boolean;
  canEdit: boolean;
  deletable: boolean;
}
interface Overview {
  pages: { key: string; title: string; draftUpdatedAt: string | null; draftUpdatedBy: string | null; changedFields: number }[];
  drafts: Item[];
  archived: Item[];
  canPublish: boolean;
}

const ACTION_DONE = { publish: 'Published.', unpublish: 'Unpublished.', archive: 'Archived.', restore: 'Restored — still unpublished until you publish it.' } as const;

/**
 * §40.2 — the publish queue: every draft waiting to go live, and the archive
 * where a mistake is undone. Nothing on the website changes until something
 * here is published.
 */
export default function Publishing() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, refetch } = useQuery('publishing', () => get<Overview>('/admin/publishing'));
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const act = async (it: Item, action: keyof typeof ACTION_DONE) => {
    try {
      await post(`/admin/publishing/${it.entity}/${it.id}/${action}`);
      toast.success(ACTION_DONE[action]);
      invalidate('publishing', 'amenities', 'faqs', 'progress', 'specifications', 'galleries', 'tours', 'types', 'floors', 'payment-plans', 'assets');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const publishPage = async (key: string) => {
    try {
      await post(`/admin/pages/${key}/publish`);
      toast.success('Page published.');
      invalidate('publishing', `pages:${key}`, 'pages');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const row = { padding: '12px 22px', borderTop: '1px solid var(--line-2)' } as const;

  return (
    <>
      <PageHead title="Publishing" sub={`${data.pages.length + data.drafts.length} waiting · ${data.archived.length} in the archive`}>
        <PreviewButton path="/" label="Preview the whole site" />
      </PageHead>

      <Card>
        <CardHead title="Page drafts" icon={<FileText size={18} />} sub="Edited copy the website does not show yet" />
        {data.pages.length === 0 && <Empty title="No unpublished page edits" />}
        {data.pages.map((p) => (
          <div key={p.key} className="row" style={row}>
            <div style={{ flex: 1 }}>
              <Link to={`/content/${p.key}`}><strong>{p.title}</strong></Link>
              <div className="muted small">{p.changedFields} field{p.changedFields === 1 ? '' : 's'} · saved {ago(p.draftUpdatedAt)}{p.draftUpdatedBy ? ` by ${p.draftUpdatedBy}` : ''}</div>
            </div>
            <PreviewButton path={PAGE_PATH[p.key] ?? '/'} size="sm" />
            {data.canPublish && <Button size="sm" variant="primary" icon={<Send size={14} />} onClick={() => void publishPage(p.key)}>Publish</Button>}
          </div>
        ))}
      </Card>

      <Card>
        <CardHead title="Not published" icon={<Eye size={18} />} sub="Hidden from visitors: new drafts, or taken down" />
        {data.drafts.length === 0 && <Empty title="Everything is published" />}
        {data.drafts.map((it) => (
          <div key={`${it.entity}:${it.id}`} className="row" style={row}>
            <Badge tone="sky" plain>{it.entityLabel}</Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ color: 'var(--navy)' }}>{it.title}</strong>
              <div className="muted small">{it.unpublishedAt ? `Unpublished ${date(it.unpublishedAt)}` : 'Never published'}</div>
            </div>
            <PreviewButton path={it.path} size="sm" />
            {it.canPublish && <Button size="sm" variant="primary" icon={<Send size={14} />} onClick={() => void act(it, 'publish')}>Publish</Button>}
            {it.canEdit && <Button size="sm" variant="ghost" icon={<Archive size={14} />} aria-label={`Archive ${it.title}`} onClick={() => void act(it, 'archive')} />}
          </div>
        ))}
      </Card>

      <Card>
        <CardHead title="Archive" icon={<Archive size={18} />} sub="Removed from the website and the admin lists, and restorable" />
        {data.archived.length === 0 && <Empty title="The archive is empty" />}
        {data.archived.map((it) => (
          <div key={`${it.entity}:${it.id}`} className="row" style={row}>
            <Badge tone="grey" plain>{it.entityLabel}</Badge>
            <div style={{ flex: 1 }}>
              <strong>{it.title}</strong>
              <div className="muted small">Archived {date(it.archivedAt)}</div>
            </div>
            {it.canEdit && <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void act(it, 'restore')}>Restore</Button>}
            {it.canEdit && it.deletable && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                aria-label={`Delete ${it.title} permanently`}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete “${it.title}” permanently?`, body: 'This cannot be undone.', confirm: 'Delete permanently', danger: true }))) return;
                  try {
                    await del(`/admin/publishing/${it.entity}/${it.id}`);
                    toast.success('Deleted permanently.');
                    invalidate('publishing');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
