import { useEffect, useMemo, useState } from 'react';
import { Copy, Lock, Pencil, Power, Search, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { SCOPE_DESCRIPTION, type Grants } from '@avida/types';
import { get, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link, navigate, useSearchState } from '../lib/router';
import type { RoleDetail as Detail } from '../lib/access';
import { PermissionEditor, ScopeChip, StatusDot, UserAvatar } from '../components/access';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, Modal, PageHead, Textarea, useConfirm } from '../components/ui';

const same = (a: Grants, b: Grants) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k as keyof Grants] === b[k as keyof Grants]);
};

export default function RoleDetail({ params }: { params: Record<string, string> }) {
  const id = params.id!;
  const { can, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState();
  const { data: role, error, refetch } = useQuery(`roles:${id}`, () => get<Detail>(`/admin/roles/${id}`));
  const [draft, setDraft] = useState<Grants | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  useEffect(() => {
    if (role) setDraft({ ...role.grants });
  }, [role]);
  const dirty = useMemo(() => Boolean(role && draft && !same(role.grants, draft)), [role, draft]);
  const changes = useMemo(() => {
    if (!role || !draft) return 0;
    const keys = new Set([...Object.keys(role.grants), ...Object.keys(draft)]);
    return [...keys].filter((k) => role.grants[k as keyof Grants] !== draft[k as keyof Grants]).length;
  }, [role, draft]);

  // Leaving with unsaved permission changes loses them; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!role || !draft) return <LoadingPage />;

  const editable = role.editable && can('role.manage');
  const active = role.users.filter((u) => u.active);

  const save = async () => {
    if (active.length && !(await confirm({ title: `Update ${role.name}?`, body: `${changes} ${changes === 1 ? 'change applies' : 'changes apply'} to ${active.length} ${active.length === 1 ? 'person' : 'people'} on their next click. The change is recorded in the audit log.`, confirm: 'Save permissions' }))) return;
    setBusy(true);
    try {
      await put(`/admin/roles/${id}/permissions`, { grants: Object.entries(draft).map(([permission, scope]) => ({ permission, scope })) });
      toast.success(`${role.name} updated.`);
      invalidate('roles', 'users');
      void refresh();
      if (s.edit) set({ edit: null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    try {
      const copy = await post<{ id: string }>(`/admin/roles/${id}/duplicate`);
      invalidate('roles');
      navigate(`/settings/roles/${copy.id}?edit=1`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const togglePower = async () => {
    if (role.active && active.length) return toast.error(`This role is currently assigned to ${active.length} active ${active.length === 1 ? 'user' : 'users'}. Give them another role first.`);
    if (role.active && !(await confirm({ title: `Switch off ${role.name}?`, body: 'Nobody can be given this role while it is off.', confirm: 'Switch off', danger: true }))) return;
    try {
      await post(`/admin/roles/${id}/${role.active ? 'deactivate' : 'activate'}`);
      invalidate('roles');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const leads = draft['enquiry.view'];

  return (
    <>
      <PageHead
        title={<span className="row" style={{ gap: 10 }}>{role.name}{!role.active && <span className="status-dot INACTIVE" style={{ fontSize: 13 }}>Switched off</span>}</span>}
        sub={role.description ?? undefined}
        crumbs={[{ label: 'Users & Access', to: '/users' }, { label: 'Roles & Permissions', to: '/settings/roles' }, { label: role.name }]}
      >
        {editable && <Button icon={<Pencil size={15} />} onClick={() => setEditingMeta(true)}>Edit role</Button>}
        {can('role.manage') && <Button icon={<Copy size={15} />} onClick={() => void duplicate()}>Duplicate</Button>}
        {editable && <Button variant={role.active ? 'danger' : 'default'} icon={<Power size={15} />} onClick={() => void togglePower()}>{role.active ? 'Deactivate' : 'Activate'}</Button>}
      </PageHead>

      {!editable && (
        <Alert tone="info" icon={<Lock size={16} />}>
          {can('role.manage') ? 'This role includes access you do not have yourself, so you can view it but not change it.' : 'Read-only: changing roles needs the “Manage roles & permissions” permission.'}
        </Alert>
      )}

      <div className="role-layout">
        <Card>
          <CardHead title="Permissions" sub="Grouped by business area. Data permissions choose which records; actions are simply allowed or not.">
            <label className="ua-search" style={{ maxWidth: 240 }}>
              <Search size={15} />
              <span className="sr-only">Find a permission</span>
              <input className="input sm" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a permission…" />
            </label>
          </CardHead>
          <div className="card-body">
            <PermissionEditor grants={draft} baseline={role.grants} onChange={setDraft} disabled={!editable} filter={filter} />
            {dirty && (
              <div className="save-bar" role="region" aria-label="Unsaved changes">
                <span><strong>{changes}</strong> unsaved {changes === 1 ? 'change' : 'changes'}{active.length ? ` · affects ${active.length} ${active.length === 1 ? 'person' : 'people'}` : ''}</span>
                <span className="spacer" />
                <Button size="sm" onClick={() => setDraft({ ...role.grants })}>Discard</Button>
                <Button size="sm" variant="primary" busy={busy} onClick={() => void save()}>Save permissions</Button>
              </div>
            )}
          </div>
        </Card>

        <aside className="role-side">
          <Card>
            <CardHead title="Summary" />
            <div className="card-body stack-sm">
              <div className="role-name">
                <span className={`role-icon ${role.system ? '' : 'custom'}`}>{role.system ? <ShieldCheck size={17} /> : <Sparkles size={16} />}</span>
                <span><strong>{active.length} {active.length === 1 ? 'user' : 'users'}</strong><span className="muted small" style={{ display: 'block' }}>{Object.keys(draft).length} permissions · {role.system ? 'built-in role' : 'custom role'}</span></span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">Leads they can see</span>
                {leads ? <ScopeChip scope={leads} /> : <span className="small faint">None</span>}
              </div>
              {leads && <p className="small muted" style={{ margin: 0 }}>{SCOPE_DESCRIPTION[leads]}</p>}
              <p className="small faint" style={{ margin: 0 }}>Updated {ago(role.updatedAt)}{role.updatedBy ? ` by ${role.updatedBy.name}` : ''}</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Users with this role" icon={<UsersRound size={17} />}>
              <Link to={`/users?role=${role.id}`} className="small">Open in Users</Link>
            </CardHead>
            {role.users.length ? (
              <div className="person-list">
                {role.users.slice(0, 12).map((u) => (
                  <Link key={u.id} to={`/users/${u.id}`}>
                    <UserAvatar name={u.name} off={!u.active} />
                    <span className="grow"><strong>{u.name}</strong><span>{u.jobTitle ?? u.department ?? u.email}</span></span>
                    <StatusDot status={u.status} />
                  </Link>
                ))}
                {role.users.length > 12 && <Link to={`/users?role=${role.id}`} className="small">and {role.users.length - 12} more…</Link>}
              </div>
            ) : (
              <div className="card-body muted small">Nobody holds this role yet.</div>
            )}
          </Card>
        </aside>
      </div>

      {editingMeta && <RoleMetaModal role={role} onClose={() => setEditingMeta(false)} />}
    </>
  );
}

function RoleMetaModal({ role, onClose }: { role: Detail; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: role.name, description: role.description ?? '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Edit ${role.name}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={d.name.trim().length < 2} onClick={async () => {
      setBusy(true);
      try {
        await patch(`/admin/roles/${role.id}`, { name: d.name, description: d.description || null });
        toast.success('Saved.');
        invalidate('roles', 'users');
        onClose();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    }}>Save</Button></>}>
      <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={60} autoFocus /></Field>
      <Field label="Description" hint="Shown when someone chooses a role for a person."><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={3} maxLength={300} /></Field>
    </Modal>
  );
}
