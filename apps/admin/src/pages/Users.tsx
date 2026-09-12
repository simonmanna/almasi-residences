import { useState } from 'react';
import { Check, Copy, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { ADMIN_ROLES, ROLE_LABEL, type AdminRole } from '@avida/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, initials } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, Modal, PageHead, Select, Toggle, useConfirm } from '../components/ui';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  lockedUntil: string | null;
  twoFactor: boolean;
}

interface Roles {
  roles: { key: AdminRole; label: string; description: string; permissions: string[] }[];
  permissions: { key: string; label: string }[];
}

/** Shown once: a temporary password cannot be read back later. */
function OneTimePassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Temporary password" sub={`Give this to ${email} by a private channel. It is shown once.`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="row">
        <code style={{ flex: 1, fontSize: 18, padding: '12px 14px', background: 'var(--sky-50)', borderRadius: 10, letterSpacing: '.04em' }}>{password}</code>
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => { void navigator.clipboard.writeText(password); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <Alert tone="warn">They should change it under Settings after signing in. In production, two-factor sign-in must also be set up (apps/api/scripts/create-admin.mjs).</Alert>
    </Modal>
  );
}

/** §29 — who can use the admin, and what each role may do. */
export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: users, error } = useQuery('users', () => get<UserRow[]>('/admin/users'));
  const { data: roles } = useQuery('roles', () => get<Roles>('/admin/roles'));
  const [inviting, setInviting] = useState(false);
  const [d, setD] = useState({ email: '', name: '', role: 'VIEWER' as AdminRole });
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!users) return <LoadingPage />;

  const update = async (u: UserRow, body: Partial<UserRow>) => {
    try {
      await patch(`/admin/users/${u.id}`, body);
      toast.success('Saved.');
      invalidate('users', 'team');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Users & roles" sub={`${users.filter((u) => u.active).length} active accounts`}>
        <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setInviting(true)}>Add user</Button>
      </PageHead>
      <Card>
        <div className="table-wrap" style={{ padding: 14 }}>
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Two-factor</th><th>Last sign-in</th><th className="actions" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><span className="row"><span className="avatar sm">{initials(u.name)}</span><span><span className="cell-strong">{u.name}</span>{u.id === me?.id && <span className="muted small"> (you)</span>}<div className="muted small">{u.email}</div></span></span></td>
                  <td><Select className="sm" style={{ width: 'auto' }} value={u.role} disabled={u.id === me?.id} onChange={async (e) => { if (await confirm({ title: `Make ${u.name} a ${ROLE_LABEL[e.target.value as AdminRole].toLowerCase()}?`, body: roles?.roles.find((r) => r.key === e.target.value)?.description, confirm: 'Change role' })) void update(u, { role: e.target.value as AdminRole }); }} options={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></td>
                  <td><Toggle checked={u.active} disabled={u.id === me?.id} onChange={async (v) => { if (v || (await confirm({ title: `Deactivate ${u.name}?`, body: 'They are signed out at once and cannot sign in until reactivated. Their history is kept.', confirm: 'Deactivate', danger: true }))) void update(u, { active: v }); }} label={u.active ? 'Active' : 'Deactivated'} />{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="orange" plain>Locked</Badge>}</td>
                  <td>{u.twoFactor ? <Badge tone="green" plain>Enrolled</Badge> : <Badge tone="grey" plain>Not set up</Badge>}</td>
                  <td className="muted small">{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</td>
                  <td className="actions">
                    <Button size="sm" icon={<KeyRound size={14} />} onClick={async () => {
                      if (!(await confirm({ title: `Reset ${u.name}'s password?`, body: 'Their current password stops working. You will see a temporary one to pass on.', confirm: 'Reset password' }))) return;
                      try {
                        const r = await post<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`);
                        setSecret({ email: u.email, password: r.temporaryPassword });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}>Reset password</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {roles && (
        <Card>
          <CardHead title="What each role can do" icon={<ShieldCheck size={18} />} sub="Enforced by the server on every request; the admin only hides what a role cannot use." />
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th>Permission</th>{roles.roles.map((r) => <th key={r.key} style={{ textAlign: 'center' }} title={r.description}>{r.label}</th>)}</tr></thead>
              <tbody>
                {roles.permissions.map((p) => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    {roles.roles.map((r) => (
                      <td key={r.key} style={{ textAlign: 'center' }}>{r.permissions.includes(p.key) ? <Check size={16} color="var(--green)" aria-label="Allowed" /> : <span className="faint" aria-label="Not allowed">—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {inviting && (
        <Modal title="Add a user" sub="They receive a temporary password to change after signing in." onClose={() => setInviting(false)} footer={<><Button onClick={() => setInviting(false)}>Cancel</Button><Button variant="primary" disabled={!d.email.includes('@') || !d.name.trim()} onClick={async () => {
          try {
            const r = await post<{ user: UserRow; temporaryPassword: string | null }>('/admin/users', d);
            invalidate('users', 'team');
            setInviting(false);
            if (r.temporaryPassword) setSecret({ email: r.user.email, password: r.temporaryPassword });
            setD({ email: '', name: '', role: 'VIEWER' });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}>Add user</Button></>}>
          <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
          <Field label="Email"><Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
          <Field label="Role" hint={roles?.roles.find((r) => r.key === d.role)?.description}><Select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as AdminRole })} options={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
        </Modal>
      )}
      {secret && <OneTimePassword email={secret.email} password={secret.password} onClose={() => setSecret(null)} />}
    </>
  );
}
