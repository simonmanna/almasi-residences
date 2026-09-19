import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Gauge, Plus, Shuffle, Trash2 } from 'lucide-react';
import { ASSIGNMENT_MODE_LABEL, ASSIGNMENT_MODES, can as roleCan, CRM_TONES, ENQUIRY_STATUSES, STAGE_LABEL } from '@avida/types';
import { del, get, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { refreshCrm, type Stage } from '../lib/crm';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { useToast } from '../components/Toast';
import { StageBadge } from '../components/crm';
import { Button, Card, CardHead, Checkbox, ErrorBox, Field, Input, Modal, NumberInput, PageHead, Select, Skeleton, Tabs, Toggle, useConfirm } from '../components/ui';

type StageRow = Stage & { leadCount: number };
interface Settings {
  assignmentMode: string;
  assignmentPool: string[];
  hotThreshold: number;
  warmThreshold: number;
  rules: { key: string; label: string; points: number; enabled: boolean }[];
}

/** The CRM's configuration: pipeline columns, lead scoring and who gets new leads. */
export default function CrmSettings() {
  const [tab, setTab] = useState<'pipeline' | 'scoring' | 'assignment'>('pipeline');
  return (
    <>
      <PageHead title="CRM settings" sub="Pipeline stages, lead scoring and assignment rules" crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Settings' }]} />
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pipeline', label: 'Pipeline stages' }, { value: 'scoring', label: 'Lead scoring' }, { value: 'assignment', label: 'Assignment' }]} />
        <div className="card-body">
          {tab === 'pipeline' && <PipelineEditor />}
          {tab === 'scoring' && <ScoringEditor />}
          {tab === 'assignment' && <AssignmentEditor />}
        </div>
      </Card>
    </>
  );
}

function PipelineEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data, error, refetch } = useQuery('crm:stages', () => get<StageRow[]>('/admin/crm/stages'));
  const [adding, setAdding] = useState(false);
  const editable = can('crm.configure');
  const save = async (id: string, body: Record<string, unknown>, msg = 'Stage saved.') => {
    try {
      await patch(`/admin/crm/stages/${id}`, body);
      toast.success(msg);
      invalidate('crm:stages');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const swap = async (i: number, j: number) => {
    if (!data) return;
    const ids = data.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await post('/admin/crm/stages/reorder', { ids });
      invalidate('crm:stages');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Skeleton h={300} />;
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Each column maps to a <strong>category</strong>. Automation reads the category — a completed viewing moves a lead to the first “Viewing completed” column, a reservation to “Reserved” — so you can rename, recolour and add columns freely.
      </p>
      <div className="stage-editor">
        {data.map((s, i) => (
          <div key={s.id} className={`stage-edit-row ${s.active ? '' : 'is-off'}`}>
            <div className="reorder">
              <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Move up" disabled={!editable || i === 0} onClick={() => void swap(i, i - 1)} />
              <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Move down" disabled={!editable || i === data.length - 1} onClick={() => void swap(i, i + 1)} />
            </div>
            <StageBadge label={s.label} color={s.color} />
            <Input className="sm" defaultValue={s.label} disabled={!editable} aria-label="Label" onBlur={(e) => e.target.value.trim() && e.target.value !== s.label && void save(s.id, { label: e.target.value.trim() })} />
            <span className="small muted">{STAGE_LABEL[s.category]}</span>
            <Select className="sm" value={s.color} disabled={!editable} aria-label="Colour" onChange={(e) => void save(s.id, { color: e.target.value })} options={CRM_TONES.map((t) => ({ value: t, label: t }))} />
            <div className="prob"><NumberInput defaultValue={s.probability} suffix="%" disabled={!editable} aria-label="Win probability" onBlur={(e) => Number(e.target.value) !== s.probability && void save(s.id, { probability: Math.max(0, Math.min(100, Number(e.target.value))) })} /></div>
            <span className="small tabular">{s.leadCount} lead{s.leadCount === 1 ? '' : 's'}</span>
            <Toggle checked={s.active} disabled={!editable} onChange={(v) => void save(s.id, { active: v }, v ? 'Stage switched on.' : 'Stage switched off; its leads moved.')} />
            {editable && <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} aria-label={`Delete ${s.label}`} onClick={async () => { if (await confirm({ title: `Delete “${s.label}”?`, body: `Its ${s.leadCount} lead(s) move to another column of the same category.`, danger: true, confirm: 'Delete' })) { try { await del(`/admin/crm/stages/${s.id}`); toast.success('Stage deleted.'); invalidate('crm:stages'); refreshCrm(); } catch (e) { toast.error((e as Error).message); } } }} />}
          </div>
        ))}
      </div>
      {editable && <Button icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add a stage</Button>}
      {adding && <AddStageModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddStageModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ label: '', category: 'QUALIFIED', color: 'sky', probability: 20 });
  const save = async () => {
    try {
      await post('/admin/crm/stages', d);
      toast.success('Stage added at the end — move it into place.');
      invalidate('crm:stages');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title="Add a pipeline stage" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.label.trim()} onClick={() => void save()}>Add</Button></>}>
      <div className="grid-2">
        <Field label="Label"><Input autoFocus value={d.label} placeholder="Awaiting mortgage approval" onChange={(e) => setD({ ...d, label: e.target.value })} /></Field>
        <Field label="Category" hint="What the system treats it as."><Select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} options={ENQUIRY_STATUSES.filter((s) => s !== 'SPAM').map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s }))} /></Field>
        <Field label="Colour"><Select value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} options={CRM_TONES.map((t) => ({ value: t, label: t }))} /></Field>
        <Field label="Win probability"><NumberInput value={d.probability} suffix="%" onChange={(v) => setD({ ...d, probability: v ?? 0 })} /></Field>
      </div>
    </Modal>
  );
}

function ScoringEditor() {
  const toast = useToast();
  const { can } = useAuth();
  const { data, error, refetch } = useQuery('crm:settings', () => get<Settings>('/admin/crm/settings'));
  const [rules, setRules] = useState<Settings['rules']>([]);
  const [th, setTh] = useState({ hot: 70, warm: 40 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      setRules(data.rules);
      setTh({ hot: data.hotThreshold, warm: data.warmThreshold });
    }
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Skeleton h={300} />;
  const editable = can('crm.configure');
  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/crm/settings', { scoringRules: rules.map(({ key, points, enabled }) => ({ key, points, enabled })), hotThreshold: th.hot, warmThreshold: th.warm });
      toast.success('Scoring saved — every open lead has been re-scored.');
      invalidate('crm:settings');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const max = rules.filter((r) => r.enabled && r.points > 0).reduce((a, r) => a + r.points, 0);
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>The score is a sum of plain facts — every point is shown on the lead with its reason. Scores are capped at 100. {max < 100 && <strong>The positive rules can reach only {max}.</strong>}</p>
      <div className="grid-2" style={{ maxWidth: 520 }}>
        <Field label="Hot from" hint="Score at or above"><NumberInput value={th.hot} disabled={!editable} onChange={(v) => setTh({ ...th, hot: v ?? 70 })} /></Field>
        <Field label="Warm from" hint="Below this is cold"><NumberInput value={th.warm} disabled={!editable} onChange={(v) => setTh({ ...th, warm: v ?? 40 })} /></Field>
      </div>
      <div className="rule-list">
        {rules.map((r, i) => (
          <div key={r.key} className={`rule-row ${r.enabled ? '' : 'is-off'}`}>
            <Toggle checked={r.enabled} disabled={!editable} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} />
            <span className="grow">{r.label}</span>
            <div className="prob"><NumberInput value={r.points} disabled={!editable} suffix="pts" onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, points: v ?? 0 } : x)))} /></div>
          </div>
        ))}
      </div>
      {editable && <div><Button variant="primary" icon={<Gauge size={15} />} busy={busy} onClick={() => void save()}>Save and re-score</Button></div>}
    </div>
  );
}

function AssignmentEditor() {
  const toast = useToast();
  const { can } = useAuth();
  const { data: team } = useTeam();
  const { data, error, refetch } = useQuery('crm:settings', () => get<Settings>('/admin/crm/settings'));
  const [mode, setMode] = useState('MANUAL');
  const [pool, setPool] = useState<string[]>([]);
  useEffect(() => {
    if (data) {
      setMode(data.assignmentMode);
      setPool(data.assignmentPool);
    }
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Skeleton h={200} />;
  const editable = can('crm.configure');
  const sellers = (team ?? []).filter((t) => roleCan(t.role, 'enquiry.edit'));
  const save = async () => {
    try {
      await put('/admin/crm/settings', { assignmentMode: mode, assignmentPool: pool });
      toast.success('Assignment rules saved.');
      invalidate('crm:settings');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <Field label="How new website leads get an owner">
        <div className="choice-list">
          {ASSIGNMENT_MODES.map((m) => (
            <label key={m} className={`choice ${mode === m ? 'on' : ''}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} disabled={!editable} onChange={() => setMode(m)} />
              <span>{ASSIGNMENT_MODE_LABEL[m]}</span>
            </label>
          ))}
        </div>
      </Field>
      {mode !== 'MANUAL' && (
        <Field label="Who is in the rotation" hint="Empty means every active sales agent and sales manager.">
          <div className="choice-list">
            {sellers.map((t) => <Checkbox key={t.id} checked={pool.includes(t.id)} onChange={(v) => setPool(v ? [...pool, t.id] : pool.filter((x) => x !== t.id))} label={t.name} />)}
          </div>
        </Field>
      )}
      <p className="muted small" style={{ margin: 0 }}><Shuffle size={13} /> A repeat enquiry from the same person joins their existing lead and keeps its owner. Managers are notified of every unassigned lead.</p>
      {editable && <div><Button variant="primary" onClick={() => void save()}>Save</Button></div>}
    </div>
  );
}
