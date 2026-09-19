import Redis from 'ioredis';
import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { AdminApi, apiUrl } from './admin-api';

/**
 * Users, roles & permissions, end to end, through the API only — so a
 * control that exists in the admin UI but not on the server fails here.
 *
 * Owner (the seeded system administrator) creates a sales manager and two
 * agents, three leads split between the agents, and then checks who sees and
 * changes what; deactivates an agent and reassigns their work; and reads the
 * audit trail back.
 */

const PASSWORD = 'e2e-access-password-123';

async function clearSignInThrottle() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys('throttle:*');
    if (keys.length) await redis.del(...keys);
  } catch {
    // Without Redis the limiter is per-process.
  } finally {
    redis.disconnect();
  }
}

/** A signed-in client for an account created by this test. */
class Session {
  private constructor(private readonly ctx: APIRequestContext, private readonly csrf: string) {}

  static async signIn(email: string, password = PASSWORD): Promise<Session> {
    const ctx = await request.newContext();
    const res = await ctx.post(apiUrl('/admin/auth/login'), { data: { email, password } });
    expect(res.ok(), `sign-in ${email} -> ${res.status()} ${await res.text()}`).toBeTruthy();
    const csrf = (await ctx.storageState()).cookies.find((c) => c.name === 'avida_csrf')?.value ?? '';
    return new Session(ctx, decodeURIComponent(csrf));
  }

  async call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, data?: unknown) {
    const res = await this.ctx.fetch(apiUrl(path), { method, data, headers: method === 'GET' ? {} : { 'x-csrf-token': this.csrf } });
    return { status: res.status(), body: (await res.json().catch(() => null)) as any };
  }

  dispose() {
    return this.ctx.dispose();
  }
}

test.describe('users, roles and permissions', () => {
  test('scopes, role management, approvals, deactivation and audit', async () => {
    test.setTimeout(120_000);
    await clearSignInThrottle();
    const owner = await AdminApi.as('owner');
    const stamp = Date.now();
    const email = (who: string) => `e2e-${who}-${stamp}@example.invalid`;

    const facets = await owner.get<{ roles: { id: string; key: string }[] }>('/admin/users/facets');
    const roleId = (key: string) => facets.roles.find((r) => r.key === key)!.id;

    // ── People ──
    const create = async (who: string, role: string, managerId?: string) =>
      (await owner.post<{ user: { id: string; status: string } }>('/admin/users', { firstName: `E2E ${who}`, lastName: String(stamp), email: email(who), roleId: roleId(role), password: PASSWORD, department: 'Sales', ...(managerId ? { managerId } : {}) })).user;
    const manager = await create('manager', 'SALES_MANAGER');
    const agentA = await create('agent-a', 'SALES_AGENT', manager.id);
    const agentB = await create('agent-b', 'SALES_AGENT', manager.id);
    expect(agentA.status).toBe('ACTIVE');

    // ── Leads: A and C to agent A, B to agent B ──
    const lead = async (label: string, assignedToId: string) =>
      (await owner.post<{ id: string }>('/admin/enquiries', { name: `E2E Lead ${label} ${stamp}`, phone: `+2507${String(stamp).slice(-7)}${label.charCodeAt(0)}`, assignedToId, force: true })).id;
    const leadA = await lead('A', agentA.id);
    const leadB = await lead('B', agentB.id);
    const leadC = await lead('C', agentA.id);
    const q = `/admin/enquiries?q=${stamp}&pageSize=50`;
    const ids = (r: { body: { data: { id: string }[] } }) => r.body.data.map((l) => l.id).sort();

    await clearSignInThrottle();
    const a = await Session.signIn(email('agent-a'));
    const m = await Session.signIn(email('manager'));
    const b = await Session.signIn(email('agent-b'));

    try {
      // ── Data scopes, enforced by the API ──
      expect(ids(await a.call('GET', q))).toEqual([leadA, leadC].sort());
      expect((await a.call('GET', `/admin/enquiries/${leadB}`)).status, 'agent A opened agent B’s lead').toBe(404);
      expect((await a.call('PATCH', `/admin/enquiries/${leadB}`, { city: 'hijack' })).status, 'agent A edited agent B’s lead').toBe(404);
      expect((await a.call('POST', `/admin/enquiries/${leadB}/archive`)).status).toBe(403);
      expect(ids(await m.call('GET', q))).toEqual([leadA, leadB, leadC].sort());
      expect(ids({ body: await owner.get(q) })).toEqual([leadA, leadB, leadC].sort());

      // ── Agents cannot reach user or role management ──
      expect((await a.call('GET', '/admin/users')).status).toBe(403);
      expect((await a.call('POST', '/admin/users', { name: 'X', email: email('x'), roleId: roleId('SUPER_ADMIN') })).status).toBe(403);
      expect((await a.call('PUT', `/admin/roles/${roleId('SALES_AGENT')}/permissions`, { grants: [{ permission: 'user.view', scope: 'ALL' }] })).status).toBe(403);
      expect((await a.call('PUT', `/admin/users/${agentA.id}/overrides`, { overrides: [{ permission: 'enquiry.view', scope: 'ALL' }] })).status).toBe(403);
      expect((await a.call('PATCH', `/admin/users/${agentA.id}`, { roleId: roleId('SUPER_ADMIN') })).status).toBe(403);

      // ── A manager cannot change the system administrator's permissions ──
      expect((await m.call('PUT', `/admin/roles/${roleId('SUPER_ADMIN')}/permissions`, { grants: [] })).status).toBe(403);
      expect((await m.call('PATCH', `/admin/users/${agentB.id}`, { roleId: roleId('SUPER_ADMIN') })).status).toBe(403);

      // ── Overrides take precedence over the role, and are audited ──
      expect((await b.call('GET', '/admin/enquiries/export.csv')).status).toBe(403);
      await owner.put(`/admin/users/${agentB.id}/overrides`, { overrides: [{ permission: 'enquiry.export', scope: 'ALL', reason: 'e2e' }] });
      expect((await b.call('GET', '/admin/enquiries/export.csv')).status, 'override did not take effect').toBe(200);
      const access = await owner.get<{ lines: { permission: string; source: string; effective: string }[] }>(`/admin/users/${agentB.id}/access`);
      expect(access.lines.find((l) => l.permission === 'enquiry.export')).toMatchObject({ source: 'override', effective: 'ALL' });
      await owner.put(`/admin/users/${agentB.id}/overrides`, { overrides: [] });
      expect((await b.call('GET', '/admin/enquiries/export.csv')).status).toBe(403);

      // ── Discount approval: the agent asks, cannot approve it, the manager does ──
      const residences = await owner.get<{ data: { id: string; status: string }[] }>('/admin/residences?pageSize=100');
      const unit = residences.data.find((r) => r.status === 'AVAILABLE')!;
      const deal = await a.call('POST', '/admin/crm/deals', { enquiryId: leadA, unitId: unit.id });
      expect(deal.status, JSON.stringify(deal.body)).toBe(201);
      const list = deal.body.listPriceMinor as number;
      expect((await a.call('PATCH', `/admin/crm/deals/${deal.body.id}`, { agreedPriceMinor: list - 1_000_000 })).status, 'agent set a discount directly').toBe(403);
      const ask = await a.call('POST', `/admin/crm/deals/${deal.body.id}/approvals`, { operation: 'update', fields: { agreedPriceMinor: list - 1_000_000 }, note: 'e2e' });
      expect(ask.status, JSON.stringify(ask.body)).toBe(201);
      expect(ask.body.kind).toBe('DISCOUNT');
      expect((await a.call('POST', `/admin/crm/deals/approvals/${ask.body.id}/decide`, { decision: 'approve' })).status, 'agent approved own request').toBe(403);
      const approved = await m.call('POST', `/admin/crm/deals/approvals/${ask.body.id}/decide`, { decision: 'approve' });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      expect((await owner.get<{ agreedPriceMinor: number }>(`/admin/crm/deals/${deal.body.id}`)).agreedPriceMinor).toBe(list - 1_000_000);
      expect((await m.call('POST', `/admin/crm/deals/approvals/${ask.body.id}/decide`, { decision: 'approve' })).status, 'approved twice').toBe(409);
      await owner.post(`/admin/crm/deals/${deal.body.id}/action`, { action: 'cancel', note: 'e2e cleanup' });

      // ── Roles: create, edit, and refuse to delete while held ──
      const role = await owner.post<{ id: string }>('/admin/roles', { name: `E2E Team Lead ${stamp}`, copyFromId: roleId('SALES_AGENT') });
      await owner.put(`/admin/roles/${role.id}/permissions`, { grants: [{ permission: 'enquiry.view', scope: 'TEAM' }, { permission: 'enquiry.edit', scope: 'ASSIGNED' }] });
      await owner.patch(`/admin/users/${agentB.id}`, { roleId: role.id });
      // Team scope: agent B now sees their teammate A's leads, but still cannot edit them.
      expect(ids(await b.call('GET', q))).toEqual([leadA, leadB, leadC].sort());
      expect((await b.call('PATCH', `/admin/enquiries/${leadA}`, { city: 'x' })).status).toBe(404);
      const refused = await owner.raw().delete(apiUrl(`/admin/roles/${role.id}`), { headers: owner.headers });
      expect(refused.status(), 'deleted a role that is still assigned').toBe(409);
      expect(await refused.text()).toContain('currently assigned to 1 user');
      await owner.patch(`/admin/users/${agentB.id}`, { roleId: roleId('SALES_AGENT') });
      await owner.del(`/admin/roles/${role.id}`);
      expect((await owner.raw().delete(apiUrl(`/admin/roles/${roleId('VIEWER')}`), { headers: owner.headers })).status(), 'deleted a built-in role').toBe(403);

      // ── Deactivation: sign-in stops, records stay, work is reassigned ──
      const workload = await owner.get<{ leads: number }>(`/admin/users/${agentA.id}/workload`);
      expect(workload.leads).toBeGreaterThanOrEqual(2);
      await owner.post(`/admin/users/${agentA.id}/deactivate`, { reason: 'e2e' });
      expect((await a.call('GET', '/admin/me')).status, 'a deactivated session still works').toBe(401);
      await clearSignInThrottle();
      const again = await (await request.newContext()).post(apiUrl('/admin/auth/login'), { data: { email: email('agent-a'), password: PASSWORD } });
      expect(again.status(), 'a deactivated user signed in').toBe(401);
      for (const id of [leadA, leadC]) expect((await owner.get<{ id: string; assignedToId: string }>(`/admin/enquiries/${id}`)).assignedToId).toBe(agentA.id);
      const moved = await owner.post<{ moved: { leads: number } }>(`/admin/users/${agentA.id}/reassign`, { toUserId: agentB.id });
      expect(moved.moved.leads).toBeGreaterThanOrEqual(2);
      for (const id of [leadA, leadC]) expect((await owner.get<{ assignedToId: string }>(`/admin/enquiries/${id}`)).assignedToId).toBe(agentB.id);

      // ── The audit log has every change ──
      const audit = async (entityId: string) => (await owner.get<{ data: { action: string }[] }>(`/admin/audit?entityId=${entityId}&pageSize=100`)).data.map((r) => r.action);
      expect(await audit(agentA.id)).toEqual(expect.arrayContaining(['user.create', 'user.deactivate', 'user.reassign']));
      expect(await audit(agentB.id)).toEqual(expect.arrayContaining(['user.override.set', 'user.override.remove', 'user.role']));
      expect(await audit(role.id)).toEqual(expect.arrayContaining(['role.create', 'role.permissions', 'role.delete']));
      expect(await audit(deal.body.id)).toEqual(expect.arrayContaining(['approval.request', 'approval.approve', 'deal.price']));

      // Tidy: the other test accounts stop working too.
      for (const u of [agentB, manager]) await owner.post(`/admin/users/${u.id}/deactivate`, { reason: 'e2e cleanup' });
    } finally {
      await Promise.all([a.dispose(), m.dispose(), b.dispose(), owner.dispose()]);
    }
  });

  test('unauthenticated requests are refused', async () => {
    const anon = await request.newContext();
    try {
      for (const path of ['/admin/users', '/admin/roles', '/admin/permissions', '/admin/me']) {
        expect((await anon.get(apiUrl(path))).status(), path).toBe(401);
      }
    } finally {
      await anon.dispose();
    }
  });
});
