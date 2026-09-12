import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, LoadingPage, Modal, PageHead, Textarea, Toggle, useConfirm } from '../components/ui';

interface Faq {
  id: string;
  question: string;
  answerMd: string;
  category: string;
  published: boolean;
  sortOrder: number;
}

function FaqForm({ faq, onClose }: { faq?: Faq; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ question: faq?.question ?? '', answerMd: faq?.answerMd ?? '', category: faq?.category ?? 'General', published: faq?.published ?? true });
  const save = async () => {
    try {
      if (faq) await patch(`/admin/faqs/${faq.id}`, d);
      else await post('/admin/faqs', d);
      toast.success('Question saved.');
      invalidate('faqs');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={faq ? 'Edit question' : 'New question'} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={d.question.trim().length < 3 || !d.answerMd.trim()} onClick={() => void save()}>Save</Button></>}>
      <Field label="Question"><Input value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} autoFocus /></Field>
      <Field label="Answer"><Textarea rows={6} value={d.answerMd} onChange={(e) => setD({ ...d, answerMd: e.target.value })} /></Field>
      <Field label="Group"><Input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Buying, Residences, Ownership…" /></Field>
      <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
    </Modal>
  );
}

/** §21 — the questions buyers ask, in the order the website lists them. */
export default function Faqs() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { data, error } = useQuery('faqs', () => get<Faq[]>('/admin/faqs'));
  const [edit, setEdit] = useState<Faq | 'new' | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const move = async (i: number, dir: -1 | 1) => {
    const ids = data.map((f) => f.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post('/admin/faqs/reorder', { ids });
    invalidate('faqs');
  };
  return (
    <>
      <PageHead title="FAQs" sub={`${data.filter((f) => f.published).length} of ${data.length} shown on the website`}>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>New question</Button>}
      </PageHead>
      <Card>
        {data.length === 0 && <Empty title="No questions yet" icon={<HelpCircle size={32} />} />}
        {data.map((f, i) => (
          <div key={f.id} className="row" style={{ padding: '16px 22px', borderTop: i ? '1px solid var(--line-2)' : 0, alignItems: 'flex-start' }}>
            {editable && (
              <span className="row" style={{ gap: 2 }}>
                <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Up" disabled={i === 0} onClick={() => void move(i, -1)} />
                <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Down" disabled={i === data.length - 1} onClick={() => void move(i, 1)} />
              </span>
            )}
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8 }}><strong style={{ color: 'var(--navy)' }}>{f.question}</strong><Badge tone="sky" plain>{f.category}</Badge>{!f.published && <Badge tone="grey" plain>Hidden</Badge>}</div>
              <p className="muted" style={{ margin: '6px 0 0' }}>{f.answerMd}</p>
            </div>
            {editable && (
              <span className="row" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" icon={f.published ? <Eye size={15} /> : <EyeOff size={15} />} aria-label={f.published ? 'Hide' : 'Show'} onClick={async () => { await patch(`/admin/faqs/${f.id}`, { published: !f.published }); invalidate('faqs'); }} />
                <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(f)}>Edit</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete this question?', body: f.question, confirm: 'Delete', danger: true })) { await del(`/admin/faqs/${f.id}`); invalidate('faqs'); } }} />
              </span>
            )}
          </div>
        ))}
      </Card>
      {edit && <FaqForm faq={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
