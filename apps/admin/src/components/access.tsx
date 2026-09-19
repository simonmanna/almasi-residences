import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, Copy, X } from 'lucide-react';
import {
  DEPARTMENTS,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  SCOPE_DESCRIPTION,
  SCOPE_LABEL,
  scopesFor,
  USER_STATUS_LABEL,
  type AccessLine,
  type Grants,
  type Permission,
  type PermissionGroupKey,
  type PermissionScope,
  type UserStatusValue,
} from '@avida/types';
import { get, patch, post } from '../lib/api';
import { initials } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { useFacets, type UserRow, type Workload } from '../lib/access';
import { useToast } from './Toast';
import { Alert, Button, Field, Input, Modal, Select, Toggle } from './ui';

// ─── Small pieces ──────────────────────────────────────────────────────────

export function StatusDot({ status }: { status: UserStatusValue }) {
  return <span className={`status-dot ${status}`}>{USER_STATUS_LABEL[status] ?? status}</span>;
}

export function UserAvatar({ name, off, size }: { name: string; off?: boolean; size?: 'lg' }) {
  return (
    <span className={`ua-avatar ${off ? 'off' : ''} ${size ?? ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ScopeChip({ scope }: { scope: PermissionScope }) {
  return (
    <span className={`scope-chip ${scope}`} title={SCOPE_DESCRIPTION[scope]}>
      {SCOPE_LABEL[scope]}
    </span>
  );
}

/** ✓ Allowed / ✕ Not allowed, with the reach of a data permission. */
export function PermState({ scope, scoped }: { scope: PermissionScope; scoped: boolean }) {
  if (scope === 'NONE') {
    return (
      <span className="perm-state no">
        <span className="ic"><X size={12} strokeWidth={2.6} /></span>
        Not allowed
      </span>
    );
  }
  return (
    <span className="perm-state yes">
      <span className="ic"><Check size={12} strokeWidth={2.8} /></span>
      {scoped ? <ScopeChip scope={scope} /> : 'Allowed'}
    </span>
  );
}

/** Collapsible permission group. Open state is per group, so a long list stays scannable. */
function Group({ title, description, tally, total, open, onToggle, children }: { title: string; description: string; tally: number; total: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = `perm-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="perm-group" data-open={open}>
      <button type="button" className="perm-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <ChevronRight size={16} className="chev" />
        <span>
          <h3>{title}</h3>
          <p>{description}</p>
        </span>
        <span className="perm-tally">{tally} of {total}</span>
        <span className="perm-bar" aria-hidden="true"><i style={{ width: `${total ? (tally / total) * 100 : 0}%` }} /></span>
      </button>
      {open && <div className="perm-rows" id={id}>{children}</div>}
    </section>
  );
}

const groupsWith = <T extends { group: PermissionGroupKey }>(rows: readonly T[]) =>
  PERMISSION_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.key) })).filter((g) => g.rows.length > 0);

// ─── Read-only effective access ───────────────────────────────────────────

/**
 * A person's effective access, grouped by business area. Overrides are
 * marked where they apply, so the source of every value is visible.
 */
export function EffectiveAccess({ lines, onlyGranted }: { lines: AccessLine[]; onlyGranted?: boolean }) {
  const groups = useMemo(() => groupsWith(lines), [lines]);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.slice(0, 3).map((g) => [g.key, true])));
  return (
    <div className="perm-groups">
      {groups.map((g) => {
        const rows = onlyGranted ? g.rows.filter((r) => r.effective !== 'NONE' || r.source === 'override') : g.rows;
        const tally = g.rows.filter((r) => r.effective !== 'NONE').length;
        if (!rows.length) return null;
        return (
          <Group key={g.key} title={g.label} description={g.description} tally={tally} total={g.rows.length} open={Boolean(open[g.key])} onToggle={() => setOpen({ ...open, [g.key]: !open[g.key] })}>
            {rows.map((l) => (
              <div key={l.permission} className={`perm-row ${l.effective === 'NONE' ? 'denied' : ''}`}>
                <div>
                  <div className="label">
                    {l.label}
                    {l.source === 'override' && <span className="source-chip" title={`Role: ${l.role === 'NONE' ? 'not allowed' : SCOPE_LABEL[l.role]}`}>Override</span>}
                  </div>
                  <div className="desc">
                    {l.effective !== 'NONE' && l.scoped ? SCOPE_DESCRIPTION[l.effective] : l.description}
                    {l.source === 'override' && ` Role gives: ${l.role === 'NONE' ? 'not allowed' : SCOPE_LABEL[l.role].toLowerCase()}.`}
                  </div>
                </div>
                <PermState scope={l.effective} scoped={l.scoped} />
              </div>
            ))}
          </Group>
        );
      })}
    </div>
  );
}

// ─── Editing a role's permissions ─────────────────────────────────────────

/** The control each permission needs: a scope picker for data permissions, a switch for actions. */
export function ScopeControl({ permission, value, onChange, disabled, label }: { permission: Permission; value: PermissionScope; onChange: (s: PermissionScope) => void; disabled?: boolean; label: string }) {
  const def = PERMISSION_CATALOG.find((d) => d.key === permission)!;
  if (!def.scopes) {
    return <Toggle checked={value !== 'NONE'} disabled={disabled} onChange={(v) => onChange(v ? 'ALL' : 'NONE')} label={<span className="sr-only">{label}: {value !== 'NONE' ? 'allowed' : 'not allowed'}</span>} />;
  }
  return (
    <Select
      className="sm scope-select"
      aria-label={`${label}: which records`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PermissionScope)}
      options={scopesFor(permission).map((s) => ({ value: s, label: s === 'NONE' ? 'None' : SCOPE_LABEL[s] }))}
    />
  );
}

export function PermissionEditor({ grants, baseline, onChange, disabled, filter }: { grants: Grants; baseline?: Grants; onChange: (g: Grants) => void; disabled?: boolean; filter?: string }) {
  const q = filter?.trim().toLowerCase();
  const defs = q ? PERMISSION_CATALOG.filter((d) => `${d.label} ${d.description}`.toLowerCase().includes(q)) : PERMISSION_CATALOG;
  const groups = groupsWith(defs);
  const [open, setOpen] = useState<Record<string, boolean>>({ crm: true, deals: true });
  const set = (p: Permission, s: PermissionScope) => {
    const next = { ...grants };
    if (s === 'NONE') delete next[p];
    else next[p] = s;
    onChange(next);
  };
  return (
    <div className="perm-groups">
      {groups.map((g) => {
        const tally = g.rows.filter((d) => grants[d.key]).length;
        const isOpen = Boolean(q) || Boolean(open[g.key]);
        return (
          <Group key={g.key} title={g.label} description={g.description} tally={tally} total={g.rows.length} open={isOpen} onToggle={() => setOpen({ ...open, [g.key]: !open[g.key] })}>
            {g.rows.map((d) => {
              const value = grants[d.key] ?? 'NONE';
              const changed = baseline !== undefined && (baseline[d.key] ?? 'NONE') !== value;
              return (
                <div key={d.key} className={`perm-row ${value === 'NONE' ? 'denied' : ''} ${changed ? 'changed' : ''}`}>
                  <div>
                    <div className="label">
                      {d.label}
                      {d.sensitive && <span className="sensitive">Sensitive</span>}
                    </div>
                    <div className="desc">{d.scopes && value !== 'NONE' ? SCOPE_DESCRIPTION[value] : d.description}</div>
                  </div>
                  <ScopeControl permission={d.key} value={value} onChange={(s) => set(d.key, s)} disabled={disabled} label={d.label} />
                </div>
              );
            })}
          </Group>
        );
      })}
      {!groups.length && <p className="muted small">No permission matches “{filter}”.</p>}
    </div>
  );
}

// ─── One-time password ────────────────────────────────────────────────────

/** Shown once: a temporary password cannot be read back later. */
export function OneTimePassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Temporary password" sub={`Give this to ${email} by a private channel. It is shown once.`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="row">
        <code style={{ flex: 1, fontSize: 18, padding: '12px 14px', background: 'var(--sky-50)', borderRadius: 10, letterSpacing: '.04em' }}>{password}</code>
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => { void navigator.clipboard.writeText(password); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <Alert tone="warn">They should change it under Account & security after signing in. In production, two-factor sign-in must also be set up.</Alert>
    </Modal>
  );
}

// ─── Add / edit a user ────────────────────────────────────────────────────

interface UserForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  roleId: string;
  managerId: string;
  status: 'ACTIVE' | 'INVITED';
}

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
};

/**
 * Add or edit a person. The role list shows every active role with its
 * description; the API refuses a role with more access than the editor has,
 * and refuses anyone changing their own role.
 */
export function UserFormModal({ user, self, canAssignRole = true, onClose, onSaved }: { user?: UserRow; self?: boolean; canAssignRole?: boolean; onClose: () => void; onSaved: (r: { user: UserRow; temporaryPassword?: string | null }) => void }) {
  const toast = useToast();
  const { data: facets } = useFacets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<UserForm>(() => ({
    ...(user ? splitName(user.name) : { firstName: '', lastName: '' }),
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    department: user?.department ?? '',
    jobTitle: user?.jobTitle ?? '',
    roleId: user?.roleId ?? '',
    managerId: user?.managerId ?? '',
    status: 'INVITED',
  }));
  const roles = (facets?.roles ?? []).filter((r) => r.active || r.id === user?.roleId);
  const role = roles.find((r) => r.id === d.roleId);
  const departments = [...new Set([...DEPARTMENTS, ...(facets?.departments.map((x) => x.value) ?? [])])].sort();
  const valid = d.firstName.trim() && /.+@.+\..+/.test(d.email) && d.roleId;
  const roleLocked = Boolean(user && (self || !canAssignRole));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const name = `${d.firstName.trim()} ${d.lastName.trim()}`.trim();
    const common = { name, phone: d.phone || null, department: d.department || null, jobTitle: d.jobTitle || null, managerId: d.managerId || null };
    try {
      if (user) {
        const body = { ...common, ...(!roleLocked && d.roleId !== user.roleId ? { roleId: d.roleId } : {}) };
        const saved = await patch<UserRow>(`/admin/users/${user.id}`, body);
        toast.success('Saved.');
        onSaved({ user: saved });
      } else {
        const r = await post<{ user: UserRow; temporaryPassword: string | null }>('/admin/users', { ...common, email: d.email, roleId: d.roleId, status: d.status });
        toast.success(`${r.user.name} added.`);
        onSaved(r);
      }
      invalidate('users', 'team', 'roles');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `Edit ${user.name}` : 'Add a user'}
      sub={user ? 'Profile and role. Status and permissions are managed separately.' : 'They receive a temporary password and choose their own after signing in.'}
      size="lg"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!valid} onClick={() => void submit()}>{user ? 'Save changes' : 'Add user'}</Button></>}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="form-grid">
        <Field label="First name"><Input value={d.firstName} onChange={(e) => setD({ ...d, firstName: e.target.value })} autoFocus autoComplete="off" /></Field>
        <Field label="Last name"><Input value={d.lastName} onChange={(e) => setD({ ...d, lastName: e.target.value })} autoComplete="off" /></Field>
        <Field label="Email" hint={user ? 'The sign-in address cannot be changed here.' : undefined}><Input type="email" value={d.email} disabled={Boolean(user)} onChange={(e) => setD({ ...d, email: e.target.value })} autoComplete="off" /></Field>
        <Field label="Phone"><Input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+250 7…" /></Field>
        <Field label="Department">
          <Input list="ua-departments" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} placeholder="Sales" />
          <datalist id="ua-departments">{departments.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Job title"><Input value={d.jobTitle} onChange={(e) => setD({ ...d, jobTitle: e.target.value })} placeholder="Senior sales consultant" /></Field>
        <Field label="Role" hint={roleLocked ? (self ? 'You cannot change your own role.' : 'Your role does not allow assigning roles.') : role?.description ?? 'What they may do. You can fine-tune one person later with an override.'}>
          <Select value={d.roleId} disabled={roleLocked} onChange={(e) => setD({ ...d, roleId: e.target.value })} placeholder="Choose a role" options={roles.map((r) => ({ value: r.id, label: r.active ? r.name : `${r.name} (switched off)` }))} />
        </Field>
        <Field label="Reports to" hint="Their manager. A team-wide scope covers a manager and their direct reports.">
          <Select value={d.managerId} onChange={(e) => setD({ ...d, managerId: e.target.value })} placeholder="Nobody" options={(facets?.managers ?? []).filter((m) => m.id !== user?.id).map((m) => ({ value: m.id, label: m.name }))} />
        </Field>
        {!user && (
          <Field label="Status" hint={d.status === 'INVITED' ? 'Shown as invited until their first sign-in.' : 'Active straight away.'}>
            <Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as UserForm['status'] })} options={[{ value: 'INVITED', label: 'Invited' }, { value: 'ACTIVE', label: 'Active' }]} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ─── Deactivate, with a look at their open work first ─────────────────────

const WORK: [keyof Workload, string][] = [
  ['leads', 'open leads'],
  ['tasks', 'open tasks'],
  ['deals', 'active deals'],
  ['viewings', 'upcoming viewings'],
  ['reservations', 'active reservations'],
];

export function DeactivateModal({ user, onClose, onDone }: { user: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: work } = useQuery(`users:${user.id}:workload`, () => get<Workload>(`/admin/users/${user.id}/workload`));
  const { data: team } = useTeam();
  const [status, setStatus] = useState<'INACTIVE' | 'SUSPENDED'>('INACTIVE');
  const [reassignTo, setReassignTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const open = work ? WORK.filter(([k]) => work[k] > 0) : [];

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ moved: Record<string, number> | null }>(`/admin/users/${user.id}/deactivate`, { status, reason: reason || undefined, reassignToId: reassignTo || undefined });
      const moved = r.moved ? Object.values(r.moved).reduce((a, n) => a + n, 0) : 0;
      toast.success(`${user.name} ${status === 'SUSPENDED' ? 'suspended' : 'deactivated'}${moved ? ` · ${moved} records reassigned` : ''}.`);
      invalidate('users', 'team', 'roles');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Deactivate ${user.name}?`} sub="They are signed out at once and cannot sign in. Their history — leads, activities, deals, audit entries — is kept." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} disabled={!work} onClick={() => void submit()}>{status === 'SUSPENDED' ? 'Suspend' : 'Deactivate'}</Button></>}>
      <Field label="What kind of stop?">
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} options={[{ value: 'INACTIVE', label: 'Deactivate — they have left or no longer need access' }, { value: 'SUSPENDED', label: 'Suspend — temporarily, e.g. during an investigation' }]} />
      </Field>
      {work && open.length > 0 && (
        <div className="override-note" role="status">
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <strong>{user.name} still owns {open.map(([k, label]) => `${work[k]} ${label}`).join(', ')}.</strong>
            <div>Nothing is deleted, but nobody will be working them. Reassign active records now, or later from their profile.</div>
          </div>
        </div>
      )}
      {work && open.length > 0 && (
        <Field label="Reassign active records to" hint="Moves open leads, tasks, deals, upcoming viewings and active reservations. Closed work stays with them.">
          <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} placeholder="Don’t reassign now" options={(team ?? []).filter((t) => t.id !== user.id).map((t) => ({ value: t.id, label: `${t.name}${t.roleName ? ` · ${t.roleName}` : ''}` }))} />
        </Field>
      )}
      {work && !open.length && <Alert tone="success">No open leads, tasks, deals or viewings — nothing will be left unattended.</Alert>}
      <Field label="Reason" hint="Recorded in the audit log."><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Left the company" /></Field>
    </Modal>
  );
}

export function ReassignModal({ user, onClose, onDone }: { user: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: team } = useTeam();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Reassign ${user.name}’s active records`} sub="Open leads, tasks, deals, upcoming viewings and active reservations move to the person you choose. History stays attributed to them." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!to} onClick={async () => {
      setBusy(true);
      try {
        const r = await post<{ moved: Record<string, number> }>(`/admin/users/${user.id}/reassign`, { toUserId: to });
        const n = Object.values(r.moved).reduce((a, x) => a + x, 0);
        toast.success(n ? `${n} records reassigned.` : 'Nothing open to reassign.');
        invalidate('users', 'team');
        onDone();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    }}>Reassign</Button></>}>
      <Field label="Give them to"><Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="Choose a person" options={(team ?? []).filter((t) => t.id !== user.id).map((t) => ({ value: t.id, label: `${t.name}${t.roleName ? ` · ${t.roleName}` : ''}` }))} /></Field>
    </Modal>
  );
}
