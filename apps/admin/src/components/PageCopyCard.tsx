import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Save, Send } from 'lucide-react';
import type { ContentField } from '@avida/types';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { PAGE_PATH, SITE_URL } from '../lib/site';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, Textarea } from './ui';
import { useToast } from './Toast';

interface PageData {
  title: string;
  fields: ContentField[];
  content: Record<string, unknown>;
  hasDraft: boolean;
  draftFields: string[];
  publishedAt: string | null;
  updatedAt: string | null;
}

/**
 * The text fields of one Website content page, edited where the page's subject
 * is managed (e.g. the /residences header on Property → Residences). Same
 * draft/publish flow and the same stored copy as Website content.
 */
export function PageCopyCard({ pageKey, title }: { pageKey: string; title: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery(`pages:${pageKey}`, () => get<PageData>(`/admin/pages/${pageKey}`));
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
  const save = async () => {
    setBusy(true);
    try {
      await put(`/admin/pages/${pageKey}`, { content, ...(canPublish ? { publish: true } : {}) });
      toast.success(canPublish ? 'Published. The website updates straight away.' : 'Draft saved. Someone who can publish must approve it.');
      invalidate(`pages:${pageKey}`, 'pages', 'publishing');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fields = data.fields.filter((f) => f.type === 'text' || f.type === 'textarea');
  return (
    <Card>
      <CardHead
        title={title}
        icon={<FileText size={18} />}
        sub={data.publishedAt ? `Last published ${ago(data.publishedAt)}` : data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}
      >
        <a className="btn" href={`${SITE_URL}${PAGE_PATH[pageKey] ?? '/'}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View page</a>
        {editable && (
          <Button variant="primary" icon={canPublish ? <Send size={15} /> : <Save size={15} />} busy={busy} disabled={!dirty && !(canPublish && data.hasDraft)} onClick={() => void save()}>
            {canPublish ? 'Publish' : 'Save draft'}
          </Button>
        )}
      </CardHead>
      {data.hasDraft && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Alert tone="warn">There is an unpublished draft of this copy.{!canPublish && ' Someone who can publish must approve it.'}</Alert>
        </div>
      )}
      <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
        {fields.map((f) => {
          const v = (content[f.key] as string) ?? '';
          const set = (val: string) => setContent({ ...content, [f.key]: val });
          return (
            <Field key={f.key} label={f.label} hint={f.help}>
              {f.type === 'textarea' ? <Textarea rows={3} value={v} onChange={(e) => set(e.target.value)} /> : <Input value={v} onChange={(e) => set(e.target.value)} />}
            </Field>
          );
        })}
      </fieldset>
    </Card>
  );
}
