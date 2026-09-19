import { useState } from 'react';
import { Activity, AlertTriangle, ArrowRightLeft, CalendarCheck, Handshake, History, Inbox, KeyRound, ListTodo, LogIn, LogOut, Monitor, Pencil, Plus, ShieldCheck, ShieldOff, Trash2, UserCheck, UserRoundX } from 'lucide-react';
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  SCOPE_DESCRIPTION,
  SCOPE_LABEL,
  scopesFor,
  USER_STATUS_LABEL,
  type Permission,
  type PermissionScope,
} from '@avida/types';
import { get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, date, dateTime } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link, useSearchState } from '../lib/router';
import { device, type AuditRow, type OverrideRow, type UserAccess, type UserDetail as Detail } from '../lib/access';
import { DeactivateModal, EffectiveAccess, OneTimePassword, ReassignModal, ScopeChip, StatusDot, UserAvatar, UserFormModal } from '../components/access';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, Empty, ErrorBox, Field, Input, KV, LoadingPage, Modal, PageHead, Pagination, Segmented, Select, Tabs, Toggle, useConfirm } from '../components/ui';

type Tab = 'overview' | 'access' | 'activity' | 'security' | 'sessions';

export default function UserDetail({ params }: { params: Record<string, string> }) {
  const id = params.id!;
  const { user: me, can, refresh } = useAuth();
  const self = id === me?.id;
  // Anyone may open their own profile; other people's need user.view (the API agrees).
  const allowed = self || can('user.view');
  const [s, set] = useSearchState({ tab: 'overview' });
  const tab = s.tab as Tab;
  const { data: u, error, refetch } = useQuery(allowed ? `users:${id}` : null, () => get<Detail>(`/admin/users/${id}`));
  const { data: access } = useQuery(allowed ? `users:${id}:access` : null, () => get<UserAccess>(`/admin/users/${id}/access`));
  const [editing, setEditing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  if (!allowed) return <Alert tone="info">You can see your own access under Account & security.</Alert>;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!u) return <LoadingPage />;

  const reactivate = async () => {
    if (!(await confirm({ title: `Reactivate ${u.name}?`, body: `They can sign in again as ${u.role.name}.`, confirm: 'Reactivate' }))) return;
    try {
      await post(`/admin/users/${id}/reactivate`);
      toast.success(`${u.name} can sign in again.`);
      invalidate('users', 'team', 'roles');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const worksLeads = access?.lines.some((l) => l.permission === 'enquiry.edit' && l.effective !== 'NONE') || u.workload.total > 0;

  return (
    <>
      <PageHead title="" crumbs={[{ label: 'Users & Access', to: '/users' }, { label: u.name }]} />
      <Card>
        <div className="ua-hero">
          <UserAvatar name={u.name} size="lg" off={!u.active} />
          <div style={{ minWidth: 0 }}>
            <h1>{u.name}{self && <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}> (you)</span>}</h1>
            <div className="ua-hero-meta">
              <span><strong style={{ color: 'var(--ink)' }}>{u.role.name}</strong>{u.jobTitle ? ` · ${u.jobTitle}` : ''}</span>
              <StatusDot status={u.status} />
              {u.overrides > 0 && <span className="ua-flag sky">{u.overrides} individual {u.overrides === 1 ? 'permission' : 'permissions'}</span>}
              <span>{u.email}</span>
            </div>
          </div>
          <div className="ua-hero-actions">
            {u.allowed.edit && <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>Edit user</Button>}
            <Button icon={<ShieldCheck size={15} />} onClick={() => set({ tab: 'access' })}>Manage access</Button>
            {u.allowed.deactivate && (u.active
              ? <Button variant="danger" icon={<UserRoundX size={15} />} onClick={() => setStopping(true)}>Deactivate user</Button>
              : <Button variant="primary" icon={<UserCheck size={15} />} onClick={() => void reactivate()}>Reactivate</Button>)}
          </div>
        </div>
        <Tabs<Tab>
          value={tab}
          onChange={(t) => set({ tab: t })}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'access', label: 'Role & Permissions' },
            { value: 'activity', label: 'Activity' },
            { value: 'security', label: 'Security' },
            { value: 'sessions', label: 'Sessions' },
          ]}
        />
      </Card>

      {!u.active && (
        <Alert tone="warn">
          {u.name} is {USER_STATUS_LABEL[u.status].toLowerCase()}{u.deactivatedAt ? ` since ${date(u.deactivatedAt)}` : ''} and cannot sign in. Their records and history are kept.
          {u.workload.total > 0 && ` They still own ${u.workload.total} open ${u.workload.total === 1 ? 'record' : 'records'}.`}
        </Alert>
      )}

      {tab === 'overview' && <Overview u={u} worksLeads={Boolean(worksLeads)} onReassign={() => setReassigning(true)} />}
      {tab === 'access' && access && <AccessTab u={u} access={access} />}
      {tab === 'access' && !access && <LoadingPage />}
      {tab === 'activity' && <ActivityTab id={id} />}
      {tab === 'security' && <SecurityTab u={u} self={self} onPassword={setSecret} />}
      {tab === 'sessions' && <SessionsTab u={u} self={self} />}

      {editing && <UserFormModal user={u} self={self} canAssignRole={u.allowed.assignRole} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); invalidate(`users:${id}`); if (self) void refresh(); }} />}
      {stopping && <DeactivateModal user={u} onClose={() => setStopping(false)} onDone={() => setStopping(false)} />}
      {reassigning && <ReassignModal user={u} onClose={() => setReassigning(false)} onDone={() => { setReassigning(false); invalidate(`users:${id}`); }} />}
      {secret && <OneTimePassword email={u.email} password={secret} onClose={() => setSecret(null)} />}
    </>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────

function Overview({ u, worksLeads, onReassign }: { u: Detail; worksLeads: boolean; onReassign: () => void }) {
  const w = u.workload;
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHead title="Profile" />
        <div className="card-body">
          <KV items={[
            ['Email', <a href={`mailto:${u.email}`}>{u.email}</a>],
            ['Phone', u.phone ? <a href={`tel:${u.phone}`}>{u.phone}</a> : <span className="faint">—</span>],
            ['Department', u.department ?? <span className="faint">—</span>],
            ['Job title', u.jobTitle ?? <span className="faint">—</span>],
            ['Role', <Link to={`/settings/roles/${u.role.id}`}>{u.role.name}</Link>],
            ['Reports to', u.manager ? <Link to={`/users/${u.manager.id}`}>{u.manager.name}</Link> : <span className="faint">—</span>],
            ['Status', <StatusDot status={u.status} />],
            ['Created', date(u.createdAt)],
            ['Last sign-in', u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'],
            ['Last activity', u.lastActiveAt ? `${ago(u.lastActiveAt)} · ${dateTime(u.lastActiveAt)}` : 'Never'],
          ]} />
        </div>
      </Card>
      <div className="stack">
        {worksLeads && (
          <Card>
            <CardHead title="Current work" sub="Open records assigned to them.">
              {u.allowed.deactivate && w.total > 0 && <Button size="sm" icon={<ArrowRightLeft size={14} />} onClick={onReassign}>Reassign</Button>}
            </CardHead>
            <div className="card-body">
              <div className="ua-stats">
                <div><strong>{w.leads}</strong><span><Inbox size={12} /> Assigned leads</span></div>
                <div><strong>{w.tasks}</strong><span><ListTodo size={12} /> Open tasks</span></div>
                <div><strong>{w.viewings}</strong><span><CalendarCheck size={12} /> Upcoming viewings</span></div>
                <div><strong>{w.deals}</strong><span><Handshake size={12} /> Active deals</span></div>
              </div>
              {(w.reservations > 0 || w.pendingApprovals > 0) && (
                <p className="muted small" style={{ margin: '10px 0 0' }}>
                  {w.reservations > 0 && `${w.reservations} active ${w.reservations === 1 ? 'reservation' : 'reservations'}. `}
                  {w.pendingApprovals > 0 && `${w.pendingApprovals} ${w.pendingApprovals === 1 ? 'request' : 'requests'} waiting for approval.`}
                </p>
              )}
            </div>
          </Card>
        )}
        {u.reports.length > 0 && (
          <Card>
            <CardHead title="Direct reports" sub="Their team, for team-wide data scopes." />
            <div className="person-list">
              {u.reports.map((r) => (
                <Link key={r.id} to={`/users/${r.id}`}><UserAvatar name={r.name} /><span className="grow"><strong>{r.name}</strong></span></Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Role & permissions ──────────────────────────────────────────────────

function AccessTab({ u, access }: { u: Detail; access: UserAccess }) {
  const [onlyGranted, setOnlyGranted] = useState(true);
  const [editing, setEditing] = useState(false);
  const leadScope = access.lines.find((l) => l.permission === 'enquiry.view')?.effective ?? 'NONE';
  const granted = access.lines.filter((l) => l.effective !== 'NONE').length;
  return (
    <div className="role-layout">
      <div className="stack">
        <Card>
          <CardHead title="Effective permissions" sub={`${granted} of ${access.lines.length} permissions — what ${u.name.split(' ')[0]} can actually do, role and overrides combined.`}>
            <Toggle checked={onlyGranted} onChange={setOnlyGranted} label={<span className="small">Only what they can do</span>} />
          </CardHead>
          <div className="card-body">
            {!access.signInAllowed && <Alert tone="warn">This account cannot sign in, so none of these permissions can be used until it is reactivated.</Alert>}
            <EffectiveAccess lines={access.lines} onlyGranted={onlyGranted} />
          </div>
        </Card>
      </div>
      <aside className="role-side">
        <Card>
          <CardHead title="Role" />
          <div className="card-body stack-sm">
            <div className="role-name">
              <span className="role-icon"><ShieldCheck size={17} /></span>
              <span><strong>{access.role.name}</strong>{!access.role.active && <span className="ua-flag">Switched off</span>}</span>
            </div>
            {access.role.description && <p className="muted small" style={{ margin: 0 }}>{access.role.description}</p>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted">Data scope for leads</span>
              {leadScope === 'NONE' ? <span className="small faint">No lead access</span> : <ScopeChip scope={leadScope} />}
            </div>
            {leadScope !== 'NONE' && <p className="small muted" style={{ margin: 0 }}>{SCOPE_DESCRIPTION[leadScope]}</p>}
            <Link to={`/settings/roles/${access.role.id}`} className="small">View the {access.role.name} role →</Link>
          </div>
        </Card>
        <Card>
          <CardHead title="Individual overrides" sub="Exceptions for this person only.">
            {u.allowed.overrides && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing(true)}>{access.overrides.length ? 'Manage' : 'Add'}</Button>}
          </CardHead>
          <div className="card-body stack-sm">
            <div className="override-note"><AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} /><span>User-specific overrides take precedence over the role permission.</span></div>
            {access.overrides.length ? (
              <div className="override-list">
                {access.overrides.map((o) => <OverrideItem key={o.id} o={o} />)}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>None — {u.name.split(' ')[0]} has exactly the {access.role.name} role’s access.</p>
            )}
          </div>
        </Card>
      </aside>
      {editing && <OverrideEditor u={u} access={access} onClose={() => setEditing(false)} />}
    </div>
  );
}

function OverrideItem({ o }: { o: OverrideRow }) {
  const def = PERMISSION_CATALOG.find((d) => d.key === o.permission);
  return (
    <div className={`override-item ${o.expired ? 'expired' : ''}`}>
      <div>
        <strong className="small">{o.label}</strong>
        <div className="meta">
          {o.grantedBy ? `By ${o.grantedBy.name}, ${date(o.createdAt)}` : date(o.createdAt)}
          {o.expiresAt && ` · ${o.expired ? 'expired' : 'until'} ${date(o.expiresAt)}`}
          {o.reason && ` · ${o.reason}`}
        </div>
      </div>
      {o.scope === 'NONE' ? <span className="perm-state no">Removed</span> : def?.scopes ? <ScopeChip scope={o.scope} /> : <span className="perm-state yes">Allowed</span>}
    </div>
  );
}

interface Draft {
  permission: Permission;
  scope: PermissionScope;
  reason: string;
  expiresAt: string;
}

function OverrideEditor({ u, access, onClose }: { u: Detail; access: UserAccess; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Draft[]>(() => access.overrides.filter((o) => !o.expired).map((o) => ({ permission: o.permission as Permission, scope: o.scope, reason: o.reason ?? '', expiresAt: o.expiresAt?.slice(0, 10) ?? '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleOf = (p: Permission) => access.lines.find((l) => l.permission === p)?.role ?? 'NONE';
  const used = new Set(rows.map((r) => r.permission));
  const options = PERMISSION_GROUPS.flatMap((g) => PERMISSION_CATALOG.filter((d) => d.group === g.key && !used.has(d.key)).map((d) => ({ value: d.key, label: `${g.label} — ${d.label}` })));
  const update = (i: number, patch: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await put(`/admin/users/${u.id}/overrides`, { overrides: rows.map((r) => ({ permission: r.permission, scope: r.scope, reason: r.reason || null, expiresAt: r.expiresAt ? new Date(`${r.expiresAt}T23:59:59`).toISOString() : null })) });
      toast.success('Overrides saved.');
      invalidate(`users:${u.id}`, 'users:list');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Overrides for ${u.name}`} sub="Grant or remove one permission for this person without changing their role. Every change is recorded in the audit log." size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save overrides</Button></>}>
      <div className="override-note"><AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} /><span>User-specific overrides take precedence over the role permission. Prefer changing the role when several people need the same access.</span></div>
      {error && <Alert tone="error">{error}</Alert>}
      {rows.map((r, i) => {
        const def = PERMISSION_CATALOG.find((d) => d.key === r.permission)!;
        const role = roleOf(r.permission);
        return (
          <div key={r.permission} className="override-item" style={{ gridTemplateColumns: '1fr' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="small">{def.label}</strong>
              <Button size="xs" variant="ghost" icon={<Trash2 size={14} />} aria-label={`Remove the override on ${def.label}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
            </div>
            <div className="meta">Role gives: {role === 'NONE' ? 'not allowed' : def.scopes ? SCOPE_LABEL[role] : 'allowed'}</div>
            <div className="form-grid three" style={{ marginTop: 8 }}>
              <Field label="Override to">
                <Select value={r.scope} onChange={(e) => update(i, { scope: e.target.value as PermissionScope })} options={scopesFor(r.permission).map((sc) => ({ value: sc, label: sc === 'NONE' ? 'Not allowed' : def.scopes ? SCOPE_LABEL[sc] : 'Allowed' }))} />
              </Field>
              <Field label="Until" hint="Empty: until removed."><Input type="date" value={r.expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => update(i, { expiresAt: e.target.value })} /></Field>
              <Field label="Reason"><Input value={r.reason} onChange={(e) => update(i, { reason: e.target.value })} placeholder="Quarter-end export" /></Field>
            </div>
          </div>
        );
      })}
      <Field label="Add an override">
        <Select value="" onChange={(e) => {
          const p = e.target.value as Permission;
          if (!p) return;
          const role = roleOf(p);
          const def = PERMISSION_CATALOG.find((d) => d.key === p)!;
          setRows([...rows, { permission: p, scope: role === 'NONE' ? (def.scopes ? 'ASSIGNED' : 'ALL') : 'NONE', reason: '', expiresAt: '' }]);
        }} placeholder="Choose a permission…" options={options} />
      </Field>
    </Modal>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────

const SECURITY_ACTIONS = /^(auth\.|user\.(role|override|deactivate|suspend|reactivate|reset|totp|password|revoke))/;

function Feed({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="ua-feed">
      {rows.map((r) => (
        <div key={r.id} className="ua-feed-item">
          <span className={`dot ${SECURITY_ACTIONS.test(r.action) ? 'sec' : ''}`}>{r.action === 'auth.login' ? <LogIn size={14} /> : r.action === 'auth.logout' ? <LogOut size={14} /> : SECURITY_ACTIONS.test(r.action) ? <ShieldCheck size={14} /> : <Activity size={14} />}</span>
          <div style={{ minWidth: 0 }}>
            <div className="small"><strong>{r.actor.name}</strong> · {r.summary ?? r.action}</div>
            <div className="small faint">{r.action}{r.target ? ` · ${r.target}` : ''}{r.ip ? ` · ${r.ip}` : ''}</div>
          </div>
          <time dateTime={r.createdAt} title={dateTime(r.createdAt)}>{ago(r.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function ActivityTab({ id }: { id: string }) {
  const [about, setAbout] = useState<'all' | 'actions' | 'account'>('all');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery(`users:${id}:activity:${about}:${page}`, () => get<{ data: AuditRow[]; meta: { pages: number; total: number } }>(`/admin/users/${id}/activity?about=${about}&page=${page}`));
  return (
    <Card>
      <CardHead title="Activity" icon={<History size={18} />} sub="From the audit log: what they did, and what was done to their account.">
        <Segmented value={about} onChange={(v) => { setAbout(v); setPage(1); }} options={[{ value: 'all', label: 'All' }, { value: 'actions', label: 'Their actions' }, { value: 'account', label: 'Their account' }]} />
      </CardHead>
      {error ? <div className="card-body"><ErrorBox error={error} /></div> : !data ? <LoadingPage /> : data.data.length ? <Feed rows={data.data} /> : <Empty title="Nothing recorded yet" />}
      {data && data.meta.pages > 1 && <div className="table-foot"><span className="muted small">{data.meta.total} entries</span><Pagination page={page} pages={data.meta.pages} onChange={setPage} /></div>}
    </Card>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────

function SecurityTab({ u, self, onPassword }: { u: Detail; self: boolean; onPassword: (p: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data } = useQuery(`users:${u.id}:activity:account:1`, () => get<{ data: AuditRow[] }>(`/admin/users/${u.id}/activity?about=account`));
  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
  const act = async (title: string, body: string, path: string, done: string, danger = false) => {
    if (!(await confirm({ title, body, confirm: 'Continue', danger }))) return;
    try {
      const r = await post<{ temporaryPassword?: string }>(path);
      if (r.temporaryPassword) onPassword(r.temporaryPassword);
      else toast.success(done);
      invalidate(`users:${u.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const events = (data?.data ?? []).filter((r) => SECURITY_ACTIONS.test(r.action) && r.action !== 'auth.login' && r.action !== 'auth.logout');
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHead title="Sign-in security" icon={<KeyRound size={18} />} />
        <div className="card-body stack">
          <KV items={[
            ['Status', <StatusDot status={u.status} />],
            ['Two-factor sign-in', u.twoFactor ? <span className="perm-state yes">Enrolled</span> : <span className="perm-state no">Not set up</span>],
            ['Account lock', locked ? <span className="ua-flag">Locked until {dateTime(u.lockedUntil)}</span> : 'Not locked'],
            ['Last sign-in', u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'],
          ]} />
          {self ? (
            <Alert tone="info">Change your own password and two-factor sign-in under <Link to="/settings">Account & security</Link>.</Alert>
          ) : u.allowed.edit ? (
            <div className="row-wrap">
              <Button icon={<KeyRound size={15} />} onClick={() => void act(`Reset ${u.name}’s password?`, 'Their current password stops working and every session ends. You will see a temporary one to pass on.', `/admin/users/${u.id}/reset-password`, '')}>Reset password</Button>
              {u.twoFactor && <Button icon={<ShieldOff size={15} />} onClick={() => void act(`Reset two-factor for ${u.name}?`, 'Their authenticator stops working and they set it up again next time they sign in. Any open session ends.', `/admin/users/${u.id}/totp/reset`, `${u.name} can set up two-factor again.`, true)}>Reset two-factor</Button>}
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Your role cannot change this person’s sign-in.</p>
          )}
        </div>
      </Card>
      <Card>
        <CardHead title="Security & permission changes" sub="Role changes, overrides, status, passwords and two-factor." />
        {events.length ? <Feed rows={events} /> : <div className="card-body muted small">No security changes recorded.</div>}
      </Card>
    </div>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────

function SessionsTab({ u, self }: { u: Detail; self: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data } = useQuery(`users:${u.id}:activity:signins:1`, () => get<{ data: AuditRow[] }>(`/admin/users/${u.id}/activity?about=signins`));
  const signins = (data?.data ?? []).filter((r) => r.action === 'auth.login');
  const devices = [...new Map(signins.map((r) => [`${device(r.userAgent)}|${r.ip ?? ''}`, r])).values()].slice(0, 6);
  const revoke = async () => {
    if (!(await confirm({ title: self ? 'Sign out everywhere?' : `Sign ${u.name} out everywhere?`, body: self ? 'Every session ends, including this one.' : 'Every session they have open ends at once. They can sign in again.', confirm: 'Sign out everywhere', danger: true }))) return;
    try {
      await post(`/admin/users/${u.id}/revoke-sessions`);
      toast.success('Signed out of every session.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHead title="Sessions" icon={<Monitor size={18} />} sub="Sessions end after 60 idle minutes and always after 12 hours.">
          {(self || u.allowed.edit) && u.active && <Button size="sm" variant="danger" icon={<LogOut size={14} />} onClick={() => void revoke()}>Sign out everywhere</Button>}
        </CardHead>
        <div className="card-body stack">
          <KV items={[
            ['Last sign-in', u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'],
            ['Last activity', u.lastActiveAt ? `${ago(u.lastActiveAt)}` : 'Never'],
            ['Can sign in', u.active ? 'Yes' : 'No'],
          ]} />
          {devices.length > 0 && (
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>Recent devices</div>
              <div className="person-list" style={{ borderBottom: '1px solid var(--line-2)' }}>
                {devices.map((r) => (
                  <div key={r.id}><span className="role-icon"><Monitor size={15} /></span><span className="grow"><strong>{device(r.userAgent)}</strong><span>{r.ip ?? 'Unknown address'} · last {ago(r.createdAt)}</span></span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHead title="Sign-in history" />
        {data ? (data.data.length ? <Feed rows={data.data} /> : <div className="card-body muted small">No sign-ins recorded.</div>) : <LoadingPage />}
      </Card>
    </div>
  );
}
