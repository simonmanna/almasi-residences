import { useEffect, useState, type ReactNode } from 'react';
import { Save, Send } from 'lucide-react';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from './Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, Textarea, Toggle } from './ui';

interface SectionPage {
  title: string;
  content: Record<string, unknown>;
  hasDraft: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface SectionField {
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'boolean';
  /** For `boolean`: the switch's label when on and when off. */
  on?: string;
  off?: string;
}

/**
 * One homepage section's CMS page — its words and its visibility switch — with
 * the same draft and publish flow as Page content. A switch never saved reads
 * as on, which is what the website assumes too.
 */
export function SectionSettings({ pageKey, title, icon, fields }: { pageKey: string; title: string; icon: ReactNode; fields: SectionField[] }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery(`pages:${pageKey}`, () => get<SectionPage>(`/admin/pages/${pageKey}`));
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
      toast.success(canPublish ? 'Published. The homepage updates straight away.' : 'Draft saved. Someone who can publish must approve it.');
      invalidate(`pages:${pageKey}`, 'pages', 'publishing');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHead title={title} icon={icon} sub={data.publishedAt ? `Last published ${ago(data.publishedAt)}` : data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}>
        {editable && (
          <Button variant="primary" icon={canPublish ? <Send size={15} /> : <Save size={15} />} busy={busy} disabled={!dirty && !(canPublish && data.hasDraft)} onClick={() => void save()}>
            {canPublish ? 'Publish' : 'Save draft'}
          </Button>
        )}
      </CardHead>
      {data.hasDraft && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Alert tone="warn">There is an unpublished draft of this section.{!canPublish && ' Someone who can publish must approve it.'}</Alert>
        </div>
      )}
      <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
        {fields.map((f) => {
          const v = content[f.key];
          const set = (value: unknown) => setContent({ ...content, [f.key]: value });
          return (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.type === 'boolean' ? (
                <Toggle checked={v !== false} onChange={set} label={v !== false ? (f.on ?? 'Visible on the homepage') : (f.off ?? 'Hidden from the homepage')} />
              ) : f.type === 'textarea' ? (
                <Textarea rows={4} value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
              ) : (
                <Input value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
              )}
            </Field>
          );
        })}
      </fieldset>
    </Card>
  );
}
