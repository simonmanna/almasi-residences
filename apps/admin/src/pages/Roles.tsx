import { useState } from 'react';
import { Copy, Eye, MoreHorizontal, Pencil, Plus, Power, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { PERMISSIONS } from '@avida/types';
import { del, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate } from '../lib/query';
import { navigate } from '../lib/router';
import { useRoles, type RoleRow } from '../lib/access';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, ErrorBox, Field, Input, Menu, Modal, PageHead, Select, Skeleton, Textarea, useConfirm } from '../components/ui';

/** Roles & Permissions — the reusable bundles people are given. */
export default function Roles() {
  const { can } = useAuth();
  const { data: roles, error, refetch } = useRoles();
  const [creating, setCreating] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const manage = can('role.manage');

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      invalidate('roles', 'users');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const duplicate = (r: RoleRow) => run(async () => {
    const copy = await post<{ id: string }>(`/admin/roles/${r.id}/duplicate`);
    navigate(`/settings/roles/${copy.id}`);
  }, `Copied ${r.name}.`);

  const toggle = async (r: RoleRow) => {
    if (r.active) {
      if (r.users) return toast.error(`This role is currently assigned to ${r.users} active ${r.users === 1 ? 'user' : 'users'}. Give them another role first.`);
      if (!(await confirm({ title: `Switch off ${r.name}?`, body: 'Nobody can be given this role until it is switched on again.', confirm: 'Switch off', danger: true }))) return;
    }
    await run(() => post(`/admin/roles/${r.id}/${r.active ? 'deactivate' : 'activate'}`), r.active ? `${r.name} switched off.` : `${r.name} switched on.`);
  };

  const remove = async (r: RoleRow) => {
    const held = r.users + r.inactiveUsers;
    if (held) return toast.error(`This role is currently assigned to ${held} ${held === 1 ? 'user' : 'users'}. Reassign them before deleting it.`);
    if (!(await confirm({ title: `Delete ${r.name}?`, body: 'The role is removed permanently. The audit log keeps a record of what it allowed.', confirm: 'Delete role', danger: true, typeToConfirm: r.name }))) return;
    await run(() => del(`/admin/roles/${r.id}`), `${r.name} deleted.`);
  };

  return (
    <>
      <PageHead title="Roles & Permissions" sub="Reusable roles decide what people can see and do. Change a role and everyone holding it changes with it." crumbs={[{ label: 'Users & Access', to: '/users' }, { label: 'Roles & Permissions' }]}>
        {manage && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating('')}>Create Role</Button>}
      </PageHead>

      {!manage && <Alert tone="info">You can see roles; changing them needs the “Manage roles & permissions” permission.</Alert>}

      <Card>
        {error ? (
          <div className="card-body"><ErrorBox error={error} onRetry={refetch} /></div>
        ) : !roles ? (
          <div className="card-body stack-sm">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} h={46} />)}</div>
        ) : (
          <div className="table-wrap">
            <table className="table crm-cards ua-table">
              <caption className="sr-only">Roles, with how many people hold each and how many permissions it grants</caption>
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="hide-md">Description</th>
                  <th>Users</th>
                  <th>Permissions</th>
                  <th>Last updated</th>
                  <th>Status</th>
                  <th className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => navigate(`/settings/roles/${r.id}`)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/settings/roles/${r.id}`); }}>
                    <td data-label="Role">
                      <span className="role-name">
                        <span className={`role-icon ${r.system ? '' : 'custom'}`}>{r.system ? <ShieldCheck size={17} /> : <Sparkles size={16} />}</span>
                        <span>
                          <strong>{r.name}</strong>
                          <span className="muted small" style={{ display: 'block' }}>{r.system ? 'Built-in' : 'Custom'}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Description" className="hide-md"><div className="role-desc">{r.description}</div></td>
                    <td data-label="Users" className="nowrap">
                      <strong className="tabular">{r.users}</strong>
                      {r.inactiveUsers > 0 && <span className="muted small"> + {r.inactiveUsers} inactive</span>}
                    </td>
                    <td data-label="Permissions" className="nowrap tabular">{r.permissions} <span className="faint">/ {PERMISSIONS.length}</span></td>
                    <td data-label="Last updated" className="nowrap muted small">{ago(r.updatedAt)}{r.updatedBy ? ` · ${r.updatedBy.name}` : ''}</td>
                    <td data-label="Status">{r.active ? <span className="status-dot ACTIVE">Active</span> : <span className="status-dot INACTIVE">Switched off</span>}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <Menu trigger={(t) => <Button size="sm" variant="ghost" icon={<MoreHorizontal size={16} />} aria-label={`Actions for ${r.name}`} onClick={t} />}>
                        {(close) => (
                          <>
                            <button type="button" role="menuitem" onClick={() => { close(); navigate(`/settings/roles/${r.id}`); }}><Eye size={15} />View</button>
                            {manage && <button type="button" role="menuitem" onClick={() => { close(); navigate(`/settings/roles/${r.id}?edit=1`); }}><Pencil size={15} />Edit permissions</button>}
                            {manage && <button type="button" role="menuitem" onClick={() => { close(); void duplicate(r); }}><Copy size={15} />Duplicate</button>}
                            {manage && <button type="button" role="menuitem" className={r.active ? 'danger' : ''} onClick={() => { close(); void toggle(r); }}><Power size={15} />{r.active ? 'Deactivate' : 'Activate'}</button>}
                            {manage && !r.system && <><hr /><button type="button" role="menuitem" className="danger" onClick={() => { close(); void remove(r); }}><Trash2 size={15} />Delete</button></>}
                          </>
                        )}
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating !== null && roles && <CreateRole roles={roles} onClose={() => setCreating(null)} />}
    </>
  );
}

function CreateRole({ roles, onClose }: { roles: RoleRow[]; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: '', description: '', copyFromId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Create a role" sub="Start empty, or from an existing role and adjust. You can only give a role access you have yourself." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={d.name.trim().length < 2} onClick={async () => {
      setBusy(true);
      setError(null);
      try {
        const r = await post<{ id: string; name: string }>('/admin/roles', { name: d.name, description: d.description || null, copyFromId: d.copyFromId || undefined });
        toast.success(`${r.name} created. Now choose what it may do.`);
        invalidate('roles', 'users:facets');
        navigate(`/settings/roles/${r.id}?edit=1`);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }}>Create role</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Senior Sales Agent" autoFocus maxLength={60} /></Field>
      <Field label="Description" hint="One sentence a manager would understand."><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} maxLength={300} placeholder="Works assigned leads and can see the whole team’s pipeline." /></Field>
      <Field label="Start from"><Select value={d.copyFromId} onChange={(e) => setD({ ...d, copyFromId: e.target.value })} placeholder="No permissions (start empty)" options={roles.map((r) => ({ value: r.id, label: `${r.name} (${r.permissions} permissions)` }))} /></Field>
      <Badge tone="grey" plain>Custom roles can be deleted once nobody holds them.</Badge>
    </Modal>
  );
}
