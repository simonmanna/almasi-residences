import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ensureRoles } from '@avida/db';
import {
  can,
  DEFAULT_ROLES,
  effectiveGrants,
  exceeding,
  isPermission,
  permissionName,
  type Grants,
  type OverrideGrant,
  type Permission,
  type PermissionScope,
} from '@avida/types';
import { PrismaService } from './prisma.service.js';

/**
 * Who is asking, as far as authorisation cares: their effective grants, and —
 * only when one of their grants is scoped to a team or department — the ids of
 * the people that scope covers.
 */
export interface Principal {
  id: string;
  roleId: string;
  role: string;
  roleName: string;
  grants: Grants;
  teamIds: string[];
  departmentIds: string[];
}

/** What the guard loads for every request, in one query. */
export const principalSelect = {
  id: true,
  name: true,
  active: true,
  status: true,
  tokenVersion: true,
  lastActiveAt: true,
  department: true,
  managerId: true,
  roleId: true,
  role: { select: { key: true, name: true, active: true, updatedAt: true } },
  overrides: { select: { permission: true, scope: true, expiresAt: true } },
} as const;

/** Refresh `lastActiveAt` at most this often per user. */
const ACTIVITY_WRITE_MS = 5 * 60 * 1000;

/**
 * Resolves roles and overrides into effective access. The single place the
 * database's roles become a `Grants` map; every guard, controller and scope
 * filter reads the result rather than the tables.
 */
@Injectable()
export class AccessService implements OnModuleInit {
  private readonly log = new Logger(AccessService.name);
  /** roleId → grants, tagged with the role's updatedAt so an edit is never served stale. */
  private readonly roles = new Map<string, { version: number; grants: Grants }>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await ensureRoles(this.prisma.client, DEFAULT_ROLES);
    } catch (e) {
      // A database that is not migrated yet must not stop the API booting its health check.
      this.log.error(`Could not write the default roles: ${(e as Error).message}`);
    }
  }

  /** A role's grants. Cached per role version: saving a role bumps its updatedAt. */
  async roleGrants(roleId: string, updatedAt: Date): Promise<Grants> {
    const hit = this.roles.get(roleId);
    if (hit && hit.version === updatedAt.getTime()) return hit.grants;
    const rows = await this.prisma.client.rolePermission.findMany({ where: { roleId }, select: { permission: true, scope: true } });
    const grants: Grants = {};
    for (const r of rows) if (isPermission(r.permission) && r.scope !== 'NONE') grants[r.permission] = r.scope as PermissionScope;
    this.roles.set(roleId, { version: updatedAt.getTime(), grants });
    return grants;
  }

  /**
   * Effective grants for a user row loaded with `principalSelect`. An inactive
   * role grants nothing; overrides still apply on top of nothing.
   */
  async grantsOf(user: { roleId: string; role: { active: boolean; updatedAt: Date }; overrides: OverrideGrant[] }): Promise<Grants> {
    const base = user.role.active ? await this.roleGrants(user.roleId, user.role.updatedAt) : {};
    return effectiveGrants(base, user.overrides);
  }

  /** Builds the principal for a user row; resolves team and department only when a grant needs them. */
  async principal(user: { id: string; department: string | null; managerId: string | null; roleId: string; role: { key: string; name: string; active: boolean; updatedAt: Date }; overrides: OverrideGrant[] }): Promise<Principal> {
    const grants = await this.grantsOf(user);
    const needsTeam = Object.values(grants).some((s) => s === 'TEAM');
    const needsDept = Object.values(grants).some((s) => s === 'DEPARTMENT');
    const [teamIds, departmentIds] = await Promise.all([
      needsTeam ? this.teamOf(user) : Promise.resolve([]),
      needsDept && user.department ? this.departmentOf(user.department) : Promise.resolve([]),
    ]);
    return { id: user.id, roleId: user.roleId, role: user.role.key, roleName: user.role.name, grants, teamIds, departmentIds };
  }

  /** A team is a manager and their direct reports: the people who report to me, and those who share my manager. */
  async teamOf(user: { id: string; managerId: string | null }): Promise<string[]> {
    const rows = await this.prisma.client.adminUser.findMany({
      where: { OR: [{ managerId: user.id }, ...(user.managerId ? [{ managerId: user.managerId }, { id: user.managerId }] : [])] },
      select: { id: true },
    });
    return rows.map((r) => r.id).filter((id) => id !== user.id);
  }

  async departmentOf(department: string): Promise<string[]> {
    const rows = await this.prisma.client.adminUser.findMany({ where: { department: { equals: department, mode: 'insensitive' } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** Throttled "last seen" stamp; never blocks or fails the request. */
  touch(userId: string, lastActiveAt: Date | null): void {
    if (lastActiveAt && Date.now() - lastActiveAt.getTime() < ACTIVITY_WRITE_MS) return;
    void this.prisma.client.adminUser
      .update({ where: { id: userId }, data: { lastActiveAt: new Date() }, select: { id: true } })
      .catch(() => undefined);
  }

  /** Effective grants for other people — assignment pools, "can this person work leads?". Two queries for any number. */
  async grantsForUsers(ids: string[]): Promise<Map<string, Grants>> {
    if (!ids.length) return new Map();
    const users = await this.prisma.client.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, roleId: true, role: { select: { active: true, updatedAt: true } }, overrides: { select: { permission: true, scope: true, expiresAt: true } } } });
    const out = new Map<string, Grants>();
    for (const u of users) out.set(u.id, await this.grantsOf(u));
    return out;
  }

  async userCan(userId: string, p: Permission): Promise<boolean> {
    const g = (await this.grantsForUsers([userId])).get(userId);
    return can(g ? { grants: g } : null, p);
  }

  /** Active users that hold a permission, for pickers and pools. */
  async activeUsersWith(p: Permission, among?: string[]): Promise<string[]> {
    const users = await this.prisma.client.adminUser.findMany({ where: { active: true, ...(among ? { id: { in: among } } : {}) }, select: { id: true } });
    const grants = await this.grantsForUsers(users.map((u) => u.id));
    return users.filter((u) => can({ grants: grants.get(u.id) ?? {} }, p)).map((u) => u.id);
  }

  /** Whether `target` sits entirely within the actor's own access. */
  withinCheck(actor: { grants: Grants }, target: Grants): boolean {
    return exceeding(target, actor.grants).length === 0;
  }

  /**
   * No one hands out more than they hold. Refuses when `wanted` goes beyond the
   * actor's own grants, naming what is out of reach.
   */
  assertWithin(actor: { grants: Grants }, wanted: Grants, what: string): void {
    const over = exceeding(wanted, actor.grants);
    if (over.length) {
      const names = over.slice(0, 3).map((p) => permissionName(p).toLowerCase()).join(', ');
      throw new ForbiddenException(`You cannot ${what}: it includes access you do not have yourself (${names}${over.length > 3 ? ` and ${over.length - 3} more` : ''}).`);
    }
  }

  /**
   * The platform must always keep someone who can manage roles. Call inside
   * the transaction that might remove the last one, after the change.
   */
  async assertRoleManagerRemains(tx: Pick<PrismaService['client'], 'adminUser' | 'rolePermission' | 'userPermissionOverride' | 'role'>): Promise<void> {
    const users = await tx.adminUser.findMany({ where: { active: true }, select: { id: true, roleId: true, role: { select: { active: true } }, overrides: { where: { permission: 'role.manage' }, select: { permission: true, scope: true, expiresAt: true } } } });
    const roleIds = [...new Set(users.map((u) => u.roleId))];
    const holding = new Set((await tx.rolePermission.findMany({ where: { roleId: { in: roleIds }, permission: 'role.manage', scope: { not: 'NONE' } }, select: { roleId: true } })).map((r) => r.roleId));
    const ok = users.some((u) => {
      const base: Grants = u.role.active && holding.has(u.roleId) ? { 'role.manage': 'ALL' } : {};
      return can({ grants: effectiveGrants(base, u.overrides) }, 'role.manage');
    });
    if (!ok) throw new ForbiddenException('This would leave nobody able to manage roles and permissions. Give someone else that access first.');
  }

  forget(roleId?: string): void {
    if (roleId) this.roles.delete(roleId);
    else this.roles.clear();
  }
}
