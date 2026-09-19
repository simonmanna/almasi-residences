import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './admin.js';
import {
  can,
  DEFAULT_ROLE,
  DEFAULT_ROLES,
  effectiveGrants,
  exceeding,
  explainAccess,
  normaliseScope,
  PERMISSION_CATALOG,
  PERMISSION_DEF,
  scopeOf,
} from './access.js';

const grants = (key: string) => DEFAULT_ROLE(key)!.grants;

describe('the permission catalog', () => {
  it('describes every permission exactly once', () => {
    expect(PERMISSION_CATALOG.map((d) => d.key).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives every permission a business-readable label and description', () => {
    for (const d of PERMISSION_CATALOG) {
      expect(d.label, d.key).not.toMatch(/\./);
      expect(d.description.length, d.key).toBeGreaterThan(10);
    }
  });

  it('only grants default roles permissions that exist, at scopes they allow', () => {
    for (const r of DEFAULT_ROLES) {
      for (const [p, s] of Object.entries(r.grants)) {
        expect(PERMISSION_DEF[p as keyof typeof PERMISSION_DEF], `${r.key}: ${p}`).toBeDefined();
        expect(normaliseScope(p as never, s)).toBe(s);
      }
    }
  });
});

describe('default roles', () => {
  it('keeps the system administrator able to recover the platform', () => {
    const admin = { grants: grants('SUPER_ADMIN') };
    for (const p of PERMISSIONS) expect(can(admin, p), p).toBe(true);
  });

  it('lets a sales agent work assigned leads but not manage users, roles, exports or approvals', () => {
    const agent = { grants: grants('SALES_AGENT') };
    expect(scopeOf(agent, 'enquiry.view')).toBe('ASSIGNED');
    expect(can(agent, 'enquiry.edit')).toBe(true);
    expect(can(agent, 'enquiry.view', 'ALL')).toBe(false);
    for (const p of ['user.view', 'user.create', 'role.manage', 'enquiry.export', 'deal.price', 'deal.close', 'reservation.edit', 'settings.edit', 'enquiry.archive'] as const) {
      expect(can(agent, p), p).toBe(false);
    }
  });

  it('keeps the owner out of system configuration', () => {
    const owner = { grants: grants('OWNER') };
    expect(can(owner, 'enquiry.view', 'ALL')).toBe(true);
    expect(can(owner, 'audit.view')).toBe(true);
    for (const p of ['role.manage', 'user.create', 'settings.edit', 'crm.configure'] as const) expect(can(owner, p), p).toBe(false);
  });

  it('keeps marketing away from negotiations and money', () => {
    const m = { grants: grants('MARKETING') };
    for (const p of ['deal.edit', 'deal.price', 'finance.view', 'reservation.edit'] as const) expect(can(m, p), p).toBe(false);
  });

  it('makes the viewer read-only', () => {
    const v = { grants: grants('VIEWER') };
    const writes = PERMISSIONS.filter((p) => !p.endsWith('.view'));
    for (const p of writes) expect(can(v, p), p).toBe(false);
  });
});

describe('effective access', () => {
  const role = grants('SALES_AGENT');

  it('applies an override that widens a permission', () => {
    const eff = effectiveGrants(role, [{ permission: 'enquiry.export', scope: 'ALL' }]);
    expect(eff['enquiry.export']).toBe('ALL');
  });

  it('applies an override that revokes a permission', () => {
    const eff = effectiveGrants(role, [{ permission: 'buyer.edit', scope: 'NONE' }]);
    expect(eff['buyer.edit']).toBeUndefined();
  });

  it('ignores an expired override', () => {
    const eff = effectiveGrants(role, [{ permission: 'enquiry.export', scope: 'ALL', expiresAt: new Date(Date.now() - 1000) }]);
    expect(eff['enquiry.export']).toBeUndefined();
  });

  it('ignores unknown permissions rather than trusting them', () => {
    const eff = effectiveGrants(role, [{ permission: 'root.everything', scope: 'ALL' }]);
    expect(Object.keys(eff)).not.toContain('root.everything');
  });

  it('explains where each effective value comes from', () => {
    const lines = explainAccess(role, [{ permission: 'enquiry.export', scope: 'ALL' }]);
    const exp = lines.find((l) => l.permission === 'enquiry.export')!;
    expect(exp).toMatchObject({ role: 'NONE', override: 'ALL', effective: 'ALL', source: 'override' });
    const view = lines.find((l) => l.permission === 'enquiry.view')!;
    expect(view).toMatchObject({ role: 'ASSIGNED', override: null, effective: 'ASSIGNED', source: 'role' });
  });
});

describe('escalation', () => {
  it('flags grants wider than the holder’s own', () => {
    expect(exceeding(grants('SALES_MANAGER'), grants('SALES_AGENT'))).toContain('enquiry.view');
    expect(exceeding(grants('SALES_AGENT'), grants('SALES_MANAGER'))).toEqual([]);
    expect(exceeding({ 'enquiry.view': 'TEAM' }, { 'enquiry.view': 'ASSIGNED' })).toEqual(['enquiry.view']);
  });
});
