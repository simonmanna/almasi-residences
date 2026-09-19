import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, KeyRound, MoreHorizontal, Pencil, Search, ShieldCheck, UserCheck, UserPlus, UserRoundX, UsersRound } from 'lucide-react';
import { USER_STATUS_LABEL, USER_STATUSES, type UserStatusValue } from '@avida/types';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, date } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link, navigate, useDebounced, useSearchState } from '../lib/router';
import { useFacets, type UserPage, type UserRow } from '../lib/access';
import { DeactivateModal, OneTimePassword, StatusDot, UserAvatar, UserFormModal } from '../components/access';
import { useToast } from '../components/Toast';
import { Button, Card, Empty, ErrorBox, Menu, PageHead, Pagination, Select, Skeleton, useConfirm } from '../components/ui';

const LAST_ACTIVE = [
  { value: '1d', label: 'Active today' },
  { value: '7d', label: 'Active this week' },
  { value: '30d', label: 'Active this month' },
  { value: 'stale', label: 'Not active for 30+ days' },
  { value: 'never', label: 'Never signed in' },
];

const CREATED = [
  { value: '30', label: 'Added in the last 30 days' },
  { value: '90', label: 'Added in the last 90 days' },
  { value: '365', label: 'Added this year' },
];

function lastActive(u: UserRow) {
  if (!u.lastActiveAt) return <span className="ua-empty-cell">Never</span>;
  const d = new Date(u.lastActiveAt);
  const today = new Date().toDateString() === d.toDateString();
  return <span title={d.toLocaleString()}>{today ? `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ago(d)}</span>;
}

/** §29 — Users & access: who can use the admin, with what role, and whether they still can. */
export default function Users() {
  const { user: me, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState({ page: '1', sort: 'name', dir: 'asc' });
  const [text, setText] = useState(s.q ?? '');
  const q = useDebounced(text, 300);
  useEffect(() => {
    if ((s.q ?? '') !== q) set({ q, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const createdFrom = s.created ? new Date(Date.now() - Number(s.created) * 86_400_000).toISOString().slice(0, 10) : undefined;
  const params = qs({ q: s.q, roleId: s.role, department: s.dept, status: s.status, lastActive: s.active, createdFrom, sort: s.sort, dir: s.dir, page: s.page, pageSize: 25 });
  const { data, error, refetch } = useQuery(`users:list${params}`, () => get<UserPage>(`/admin/users${params}`));
  const { data: facets } = useFacets();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [stopping, setStopping] = useState<UserRow | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const filtered = Boolean(s.q || s.role || s.dept || s.status || s.active || s.created);
  const sortBy = (key: string) => set({ sort: key, dir: s.sort === key && s.dir === 'asc' ? 'desc' : key === 'name' ? 'asc' : 'desc' });
  const SortHead = ({ k, children }: { k: string; children: string }) => (
    <th aria-sort={s.sort === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort" onClick={() => sortBy(k)}>
        {children}
        {s.sort === k && (s.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const reactivate = async (u: UserRow) => {
    if (!(await confirm({ title: `Reactivate ${u.name}?`, body: `They can sign in again with the ${u.role.name} role.`, confirm: 'Reactivate' }))) return;
    try {
      await post(`/admin/users/${u.id}/reactivate`);
      toast.success(`${u.name} can sign in again.`);
      invalidate('users', 'team', 'roles');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const resetPassword = async (u: UserRow) => {
    if (!(await confirm({ title: `Reset ${u.name}’s password?`, body: 'Their current password stops working and every session they have open ends. You will see a temporary one to pass on.', confirm: 'Reset password' }))) return;
    try {
      const r = await post<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`);
      setSecret({ email: u.email, password: r.temporaryPassword });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);

  return (
    <>
      <PageHead title="Users & Access" sub="Manage users, roles, permissions and access to your real-estate management system.">
        <Link to="/settings/roles" className="btn" aria-label="Roles & Permissions"><ShieldCheck size={16} />Roles & Permissions</Link>
        {can('user.create') && <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>Add User</Button>}
      </PageHead>

      <Card>
        <div className="ua-status-tabs" role="group" aria-label="Filter by status">
          <button type="button" aria-pressed={!s.status} onClick={() => set({ status: null, page: 1 })}>All<span className="count">{total || ''}</span></button>
          {USER_STATUSES.map((st) => (
            <button key={st} type="button" aria-pressed={s.status === st} onClick={() => set({ status: st, page: 1 })}>
              {USER_STATUS_LABEL[st]}
              <span className="count">{counts[st] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ua-toolbar">
          <label className="ua-search">
            <Search size={15} />
            <span className="sr-only">Search users</span>
            <input className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, email or phone…" />
          </label>
          <Select className="sm" aria-label="Role" value={s.role ?? ''} onChange={(e) => set({ role: e.target.value, page: 1 })} placeholder="Any role" options={(facets?.roles ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          <Select className="sm" aria-label="Department" value={s.dept ?? ''} onChange={(e) => set({ dept: e.target.value, page: 1 })} placeholder="Any department" options={[...(facets?.departments ?? []).map((d) => ({ value: d.value, label: `${d.value} (${d.count})` })), { value: '—', label: 'No department' }]} />
          <Select className="sm" aria-label="Last active" value={s.active ?? ''} onChange={(e) => set({ active: e.target.value, page: 1 })} placeholder="Any activity" options={LAST_ACTIVE} />
          <Select className="sm" aria-label="Created" value={s.created ?? ''} onChange={(e) => set({ created: e.target.value, page: 1 })} placeholder="Any date added" options={CREATED} />
          {filtered && <Button size="sm" variant="ghost" onClick={() => { setText(''); set({ q: null, role: null, dept: null, status: null, active: null, created: null, page: 1 }); }}>Clear</Button>}
          <span className="ua-count" aria-live="polite">{data ? `${data.meta.total} ${data.meta.total === 1 ? 'person' : 'people'}` : ''}</span>
        </div>

        {error ? (
          <div className="card-body"><ErrorBox error={error} onRetry={refetch} /></div>
        ) : !data ? (
          <div className="card-body stack-sm">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={38} />)}</div>
        ) : !data.data.length ? (
          <Empty title={filtered ? 'Nobody matches these filters' : 'No users yet'} icon={<UsersRound size={22} />} action={filtered ? <Button onClick={() => { setText(''); set({ q: null, role: null, dept: null, status: null, active: null, created: null, page: 1 }); }}>Clear filters</Button> : undefined}>
            {filtered ? 'Try a different search or fewer filters.' : 'Add the first person who will use the admin.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table crm-cards ua-table">
              <caption className="sr-only">Users, sortable by name, last activity and date added</caption>
              <thead>
                <tr>
                  <SortHead k="name">User</SortHead>
                  <th>Role</th>
                  <th className="hide-md">Department</th>
                  <th>Status</th>
                  <SortHead k="lastActive">Last active</SortHead>
                  <SortHead k="createdAt">Created</SortHead>
                  <th className="actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} tabIndex={0} onClick={() => navigate(`/users/${u.id}`)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/users/${u.id}`); }} aria-label={`${u.name}, ${u.role.name}, ${USER_STATUS_LABEL[u.status]}`}>
                      <td data-label="User">
                        <div className="ua-person">
                          <UserAvatar name={u.name} off={!u.active} />
                          <span style={{ minWidth: 0 }}>
                            <strong>
                              {u.name}
                              {self && <span className="muted small" style={{ display: 'inline', fontWeight: 400 }}> (you)</span>}
                            </strong>
                            <span className="muted">{u.email}</span>
                          </span>
                        </div>
                      </td>
                      <td data-label="Role">
                        <span className="ua-role">
                          <strong>
                            {u.role.name}
                            {u.overrides > 0 && <span className="ua-flag sky" title="Has individual permission overrides">+{u.overrides}</span>}
                          </strong>
                          {u.jobTitle && <span>{u.jobTitle}</span>}
                        </span>
                      </td>
                      <td data-label="Department" className="hide-md">{u.department ?? <span className="ua-empty-cell">—</span>}</td>
                      <td data-label="Status">
                        <StatusDot status={u.status} />
                        {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <span className="ua-flag">Locked</span>}
                      </td>
                      <td data-label="Last active" className="nowrap">{lastActive(u)}</td>
                      <td data-label="Created" className="nowrap muted">{date(u.createdAt)}</td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <Menu trigger={(toggle) => <Button size="sm" variant="ghost" icon={<MoreHorizontal size={16} />} aria-label={`Actions for ${u.name}`} onClick={toggle} />}>
                          {(close) => (
                            <>
                              <button type="button" role="menuitem" onClick={() => { close(); navigate(`/users/${u.id}`); }}><UsersRound size={15} />View profile</button>
                              {can('user.edit') && <button type="button" role="menuitem" onClick={() => { close(); setEditing(u); }}><Pencil size={15} />Edit</button>}
                              <button type="button" role="menuitem" onClick={() => { close(); navigate(`/users/${u.id}?tab=access`); }}><ShieldCheck size={15} />Manage access</button>
                              {can('user.edit') && !self && <button type="button" role="menuitem" onClick={() => { close(); void resetPassword(u); }}><KeyRound size={15} />Reset password</button>}
                              {can('user.deactivate') && !self && (
                                <>
                                  <hr />
                                  {u.active ? (
                                    <button type="button" role="menuitem" className="danger" onClick={() => { close(); setStopping(u); }}><UserRoundX size={15} />Deactivate</button>
                                  ) : (
                                    <button type="button" role="menuitem" onClick={() => { close(); void reactivate(u); }}><UserCheck size={15} />Reactivate</button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.meta.pages > 1 && (
          <div className="table-foot">
            <span className="muted small">Page {data.meta.page} of {data.meta.pages}</span>
            <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p }, { replace: false })} />
          </div>
        )}
      </Card>

      {adding && <UserFormModal onClose={() => setAdding(false)} onSaved={(r) => { setAdding(false); if (r.temporaryPassword) setSecret({ email: r.user.email, password: r.temporaryPassword }); }} />}
      {editing && <UserFormModal user={editing} self={editing.id === me?.id} canAssignRole={can('user.assign-role')} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
      {stopping && <DeactivateModal user={stopping} onClose={() => setStopping(null)} onDone={() => setStopping(null)} />}
      {secret && <OneTimePassword email={secret.email} password={secret.password} onClose={() => setSecret(null)} />}
    </>
  );
}
