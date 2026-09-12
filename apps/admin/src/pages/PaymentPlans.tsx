import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2, Wallet, X } from 'lucide-react';
import { humanise, MILESTONE_TRIGGERS } from '@avida/types';
import { del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date, money } from '../lib/format';
import { invalidate } from '../lib/query';
import { usePlans } from '../lib/ref';
import type { Milestone, PaymentPlan } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, Modal, MoneyInput, NumberInput, PageHead, Select, Textarea, Toggle, useConfirm } from '../components/ui';

const blank = (): Milestone => ({ label: '', percent: 0, triggerType: 'ON_CONSTRUCTION_STAGE', triggerDate: null, triggerNote: null });

function PlanForm({ plan, onClose }: { plan?: PaymentPlan; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    isDefault: plan?.isDefault ?? false,
    published: plan?.published ?? true,
    depositPercent: plan?.depositPercent ?? (null as number | null),
    reservationFeeMinor: plan?.reservationFeeMinor ?? (null as number | null),
    installmentCount: plan?.installmentCount ?? (null as number | null),
    durationMonths: plan?.durationMonths ?? (null as number | null),
  });
  const [ms, setMs] = useState<Milestone[]>(plan?.milestones.map((m) => ({ ...m, triggerDate: m.triggerDate?.slice(0, 10) ?? null })) ?? [blank()]);
  const [busy, setBusy] = useState(false);
  const total = Math.round(ms.reduce((a, m) => a + (Number(m.percent) || 0), 0) * 100) / 100;
  const edit = (i: number, patchM: Partial<Milestone>) => setMs(ms.map((m, k) => (k === i ? { ...m, ...patchM } : m)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ms.length) return;
    const next = [...ms];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setMs(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...d,
        description: d.description || null,
        milestones: ms.map((m) => ({ label: m.label.trim(), percent: Number(m.percent), triggerType: m.triggerType, triggerDate: m.triggerType === 'ON_DATE' ? m.triggerDate : null, triggerNote: m.triggerNote || null })),
      };
      if (plan) await patch(`/admin/payment-plans/${plan.id}`, { ...body, isDefault: d.isDefault || undefined });
      else await post('/admin/payment-plans', body);
      toast.success('Payment plan saved.');
      invalidate('payment-plans', 'residence:');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New payment plan'} size="xl" onClose={onClose} footer={<><span className={total === 100 ? 'muted small' : 'small'} style={{ marginRight: 'auto', color: total === 100 ? undefined : 'var(--red)' }}>Milestones total {total}% {total === 100 ? '✓' : '— must be exactly 100%'}</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!d.name.trim() || total !== 100 || ms.some((m) => !m.label.trim())} onClick={() => void save()}>Save plan</Button></>}>
      <div className="form-grid three">
        <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
        <Field label="Deposit"><NumberInput value={d.depositPercent} suffix="%" onChange={(v) => setD({ ...d, depositPercent: v })} /></Field>
        <Field label="Reservation fee"><MoneyInput value={d.reservationFeeMinor} onChange={(v) => setD({ ...d, reservationFeeMinor: v })} /></Field>
        <Field label="Instalments"><NumberInput value={d.installmentCount} step="1" onChange={(v) => setD({ ...d, installmentCount: v })} /></Field>
        <Field label="Duration"><NumberInput value={d.durationMonths} step="1" suffix="months" onChange={(v) => setD({ ...d, durationMonths: v })} /></Field>
        <div className="field"><span>Options</span><Toggle checked={d.isDefault} onChange={(v) => setD({ ...d, isDefault: v })} label="Default plan" /><Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" /></div>
        <Field label="Description" className="full"><Textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} style={{ minHeight: 60 }} /></Field>
      </div>
      <div className="stack-sm">
        <div className="label">Milestones</div>
        {ms.map((m, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="row" style={{ gap: 2, paddingTop: 5 }}>
              <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Up" disabled={i === 0} onClick={() => move(i, -1)} />
              <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Down" disabled={i === ms.length - 1} onClick={() => move(i, 1)} />
            </span>
            <Input className="sm" style={{ flex: 2 }} placeholder="On completion of structure" value={m.label} onChange={(e) => edit(i, { label: e.target.value })} />
            <div style={{ width: 100 }}><NumberInput value={m.percent} suffix="%" onChange={(v) => edit(i, { percent: v ?? 0 })} /></div>
            <Select className="sm" style={{ width: 190 }} value={m.triggerType} onChange={(e) => edit(i, { triggerType: e.target.value })} options={MILESTONE_TRIGGERS.map((t) => ({ value: t, label: humanise(t.replace('ON_', '')) }))} />
            {m.triggerType === 'ON_DATE' ? (
              <Input className="sm" type="date" style={{ width: 160 }} value={m.triggerDate ?? ''} onChange={(e) => edit(i, { triggerDate: e.target.value })} />
            ) : (
              <Input className="sm" style={{ flex: 2 }} placeholder="Shown where a date would go" value={m.triggerNote ?? ''} onChange={(e) => edit(i, { triggerNote: e.target.value })} />
            )}
            <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label="Remove milestone" disabled={ms.length === 1} onClick={() => setMs(ms.filter((_, k) => k !== i))} />
          </div>
        ))}
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setMs([...ms, blank()])} style={{ justifySelf: 'start' }}>Add milestone</Button>
      </div>
    </Modal>
  );
}

/** §10 — payment plans. The default plan's milestones are what the website's payment timeline shows. */
export default function PaymentPlans() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: plans, error } = usePlans();
  const [edit, setEdit] = useState<PaymentPlan | 'new' | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!plans) return <LoadingPage />;
  const editable = can('payment-plan.edit');
  return (
    <>
      <PageHead title="Payment plans" sub="Residences follow the default plan unless given another.">
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>New plan</Button>}
      </PageHead>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHead title={<>{p.name} {p.isDefault && <Badge tone="gold" plain><Star size={11} /> Default</Badge>} {!p.published && <Badge tone="grey" plain>Hidden</Badge>}</>} icon={<Wallet size={18} />} sub={p.description}>
              {editable && (
                <>
                  {!p.isDefault && <Button size="sm" onClick={async () => { await patch(`/admin/payment-plans/${p.id}`, { isDefault: true }); invalidate('payment-plans'); toast.success(`${p.name} is now the default.`); }}>Make default</Button>}
                  <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(p)}>Edit</Button>
                  {!p.isDefault && <Button size="sm" variant="danger" icon={<Trash2 size={14} />} aria-label="Delete plan" onClick={async () => {
                    if (!(await confirm({ title: `Delete ${p.name}?`, confirm: 'Delete', danger: true }))) return;
                    try { await del(`/admin/payment-plans/${p.id}`); invalidate('payment-plans'); } catch (e) { toast.error((e as Error).message); }
                  }} />}
                </>
              )}
            </CardHead>
            <div className="card-body stack-sm">
              {p.totalPercent !== 100 && <Alert tone="error">Milestones total {p.totalPercent}%, not 100%.</Alert>}
              <div className="row-wrap small muted" style={{ gap: 16 }}>
                <span>{p.residences} residences</span>
                {p.depositPercent !== null && <span>Deposit {p.depositPercent}%</span>}
                {p.reservationFeeMinor !== null && <span>Reservation fee {money(p.reservationFeeMinor)}</span>}
                {p.installmentCount !== null && <span>{p.installmentCount} instalments</span>}
                {p.durationMonths !== null && <span>{p.durationMonths} months</span>}
              </div>
              <table className="table">
                <thead><tr><th>Milestone</th><th className="num">%</th><th>When</th></tr></thead>
                <tbody>
                  {p.milestones.map((m) => (
                    <tr key={m.id ?? m.label}><td>{m.label}</td><td className="num">{m.percent}%</td><td className="muted">{m.triggerType === 'ON_DATE' ? date(m.triggerDate) : m.triggerNote ?? humanise(m.triggerType.replace('ON_', ''))}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="progress" title={`${p.totalPercent}%`}><span style={{ width: `${Math.min(100, p.totalPercent ?? 0)}%` }} /></div>
            </div>
          </Card>
        ))}
      </div>
      {edit && <PlanForm plan={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
