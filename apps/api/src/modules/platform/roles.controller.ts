import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { PermissionScope as DbScope } from '@avida/db';
import {
  normaliseScope,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_SCOPES,
  permissionName,
  SCOPE_DESCRIPTION,
  SCOPE_LABEL,
  type Grants,
  type Permission,
  type PermissionScope,
} from '@avida/types';
import { AccessService } from '../../common/access.service.js';
import { AuditService } from '../../common/audit.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, type Actor } from './actor.js';
import { CreateRoleDto, RoleDto, RolePermissionsDto } from './dto.js';

const slug = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

const scopeText = (s: PermissionScope | undefined) => (!s || s === 'NONE' ? 'none' : SCOPE_LABEL[s].toLowerCase());

/**
 * Roles & permissions. A role is a reusable bundle of grants; people get
 * access by holding a role. Only `role.manage` changes roles, and nobody can
 * create or edit a role — including their own — into more than they hold, or
 * edit a role that already holds more than they do.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** The catalog: groups, permissions with plain-language labels, and what each scope means. Static; any signed-in user. */
  @Get('permissions')
  catalog() {
    return {
      groups: PERMISSION_GROUPS,
      permissions: PERMISSION_CATALOG,
      scopes: PERMISSION_SCOPES.map((s) => ({ key: s, label: SCOPE_LABEL[s], description: SCOPE_DESCRIPTION[s] })),
    };
  }

  @Get('roles')
  @RequirePermission('user.view')
  async roles() {
    const [roles, users, perms] = await Promise.all([
      this.prisma.client.role.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.client.adminUser.groupBy({ by: ['roleId', 'active'], _count: true }),
      this.prisma.client.rolePermission.groupBy({ by: ['roleId'], where: { scope: { not: 'NONE' } }, _count: true }),
    ]);
    const editors = await this.editors(roles.map((r) => r.updatedById));
    return roles.map((r) => ({
      ...r,
      users: users.filter((u) => u.roleId === r.id && u.active).reduce((a, u) => a + u._count, 0),
      inactiveUsers: users.filter((u) => u.roleId === r.id && !u.active).reduce((a, u) => a + u._count, 0),
      permissions: perms.find((p) => p.roleId === r.id)?._count ?? 0,
      updatedBy: r.updatedById ? (editors.get(r.updatedById) ?? null) : null,
    }));
  }

  @Get('roles/:id')
  @RequirePermission('user.view')
  async role(@Param('id') id: string, @Req() req: AdminRequest) {
    const role = await this.prisma.client.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true, scope: true } },
        users: { select: { id: true, name: true, email: true, status: true, active: true, department: true, jobTitle: true, lastActiveAt: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] },
      },
    });
    if (!role) throw new NotFoundException('No such role');
    const actor = actorOf(req);
    const grants = this.grantsOf(role.permissions);
    const editors = await this.editors([role.updatedById]);
    return {
      ...role,
      grants,
      updatedBy: role.updatedById ? (editors.get(role.updatedById) ?? null) : null,
      // Can the viewer change this role at all? The PUT makes the same checks.
      editable: this.canManage(actor) && this.access.withinCheck(actor, grants),
    };
  }

  @Post('roles')
  @RequirePermission('role.manage')
  async create(@Body() dto: CreateRoleDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    let grants: Grants = {};
    if (dto.copyFromId) {
      const source = await this.prisma.client.role.findUnique({ where: { id: dto.copyFromId }, include: { permissions: true } });
      if (!source) throw new BadRequestException('The role to copy does not exist.');
      grants = this.grantsOf(source.permissions);
      this.access.assertWithin(actor, grants, `copy ${source.name}`);
    }
    const role = await this.prisma.client.role
      .create({
        data: {
          key: `CUSTOM_${slug(dto.name) || 'ROLE'}_${randomBytes(3).toString('hex').toUpperCase()}`,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          system: false,
          position: 500,
          updatedById: actor.id,
          permissions: { create: Object.entries(grants).map(([permission, scope]) => ({ permission, scope: scope as DbScope })) },
        },
      })
      .catch((e) => rethrowPrisma(e));
    await this.audit.record({ actorId: actor.id, action: 'role.create', entity: 'role', entityId: role.id, target: role.name, summary: `Created the role ${role.name}${dto.copyFromId ? ` (${Object.keys(grants).length} permissions copied)` : ''}`, after: { name: role.name, grants }, req });
    return role;
  }

  @Post('roles/:id/duplicate')
  @RequirePermission('role.manage')
  async duplicate(@Param('id') id: string, @Req() req: AdminRequest) {
    const source = await this.prisma.client.role.findUnique({ where: { id }, select: { name: true, description: true } });
    if (!source) throw new NotFoundException('No such role');
    return this.create({ name: `${source.name} (copy)`.slice(0, 60), description: source.description, copyFromId: id }, req);
  }

  @Patch('roles/:id')
  @RequirePermission('role.manage')
  async update(@Param('id') id: string, @Body() dto: RoleDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.loadEditable(actor, id);
    const role = await this.prisma.client.role.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}), updatedById: actor.id },
    });
    const changed = (['name', 'description'] as const).filter((k) => dto[k] !== undefined && (before[k] ?? null) !== (role[k] ?? null));
    if (changed.length) {
      await this.audit.record({ actorId: actor.id, action: 'role.update', entity: 'role', entityId: id, target: role.name, summary: `Role ${before.name}: ${changed.join(' and ')} changed`, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, role[k]])), req });
    }
    return role;
  }

  /** Replaces a role's permissions. Takes effect on everyone holding the role on their next request. */
  @Put('roles/:id/permissions')
  @RequirePermission('role.manage')
  async setPermissions(@Param('id') id: string, @Body() dto: RolePermissionsDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const role = await this.loadEditable(actor, id);
    const before = this.grantsOf(role.permissions);
    const after: Grants = {};
    for (const g of dto.grants) {
      const scope = normaliseScope(g.permission as Permission, g.scope as PermissionScope);
      if (scope !== 'NONE') after[g.permission as Permission] = scope;
    }
    this.access.assertWithin(actor, after, `give the ${role.name} role this access`);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const rows = Object.entries(after).map(([permission, scope]) => ({ roleId: id, permission, scope: scope as DbScope }));
      if (rows.length) await tx.rolePermission.createMany({ data: rows });
      // Bumps updatedAt, which is what invalidates every cached copy of this role's grants.
      await tx.role.update({ where: { id }, data: { updatedById: actor.id } });
      await this.access.assertRoleManagerRemains(tx);
    });
    this.access.forget(id);

    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])] as Permission[];
    const changes = keys.filter((k) => before[k] !== after[k]);
    if (changes.length) {
      const lines = changes.map((k) => `${permissionName(k)}: ${scopeText(before[k])} → ${scopeText(after[k])}`);
      await this.audit.record({
        actorId: actor.id,
        action: 'role.permissions',
        entity: 'role',
        entityId: id,
        target: role.name,
        summary: `${role.name}: ${lines.slice(0, 4).join('; ')}${lines.length > 4 ? `; and ${lines.length - 4} more` : ''}`,
        before: Object.fromEntries(changes.map((k) => [k, before[k] ?? 'NONE'])),
        after: Object.fromEntries(changes.map((k) => [k, after[k] ?? 'NONE'])),
        rowCount: changes.length,
        req,
      });
    }
    return this.role(id, req);
  }

  @Post('roles/:id/deactivate')
  @HttpCode(200)
  @RequirePermission('role.manage')
  async deactivate(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const role = await this.loadEditable(actor, id);
    const users = await this.prisma.client.adminUser.count({ where: { roleId: id, active: true } });
    if (users) throw new ConflictException(`This role is currently assigned to ${users} active ${users === 1 ? 'user' : 'users'}. Give them another role first.`);
    await this.prisma.client.role.update({ where: { id }, data: { active: false, updatedById: actor.id } });
    await this.audit.record({ actorId: actor.id, action: 'role.deactivate', entity: 'role', entityId: id, target: role.name, summary: `Switched off the role ${role.name}`, before: { active: true }, after: { active: false }, req });
    return { ok: true };
  }

  @Post('roles/:id/activate')
  @HttpCode(200)
  @RequirePermission('role.manage')
  async activate(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const role = await this.loadEditable(actor, id);
    await this.prisma.client.role.update({ where: { id }, data: { active: true, updatedById: actor.id } });
    await this.audit.record({ actorId: actor.id, action: 'role.activate', entity: 'role', entityId: id, target: role.name, summary: `Switched on the role ${role.name}`, before: { active: false }, after: { active: true }, req });
    return { ok: true };
  }

  /** Custom roles only, and only once nobody — active or not — holds them. */
  @Delete('roles/:id')
  @RequirePermission('role.manage')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const role = await this.loadEditable(actor, id);
    if (role.system) throw new ForbiddenException(`${role.name} is a built-in role. Switch it off instead.`);
    const [active, all] = await Promise.all([this.prisma.client.adminUser.count({ where: { roleId: id, active: true } }), this.prisma.client.adminUser.count({ where: { roleId: id } })]);
    if (all) throw new ConflictException(`This role is currently assigned to ${all} ${all === 1 ? 'user' : 'users'}${active !== all ? ` (${active} active)` : ''}. Give them another role before deleting it.`);
    await this.prisma.client.role.delete({ where: { id } }).catch((e) => rethrowPrisma(e, { restrict: 'People still hold this role.' }));
    this.access.forget(id);
    await this.audit.record({ actorId: actor.id, action: 'role.delete', entity: 'role', entityId: id, target: role.name, summary: `Deleted the role ${role.name}`, before: { name: role.name, grants: this.grantsOf(role.permissions) }, req });
    return { ok: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private canManage(actor: Actor) {
    return actor.grants['role.manage'] !== undefined;
  }

  /** A role the actor may change: it exists, and it does not already hold more than they do. */
  private async loadEditable(actor: Actor, id: string) {
    const role = await this.prisma.client.role.findUnique({ where: { id }, include: { permissions: { select: { permission: true, scope: true } } } });
    if (!role) throw new NotFoundException('No such role');
    this.access.assertWithin(actor, this.grantsOf(role.permissions), `change the ${role.name} role`);
    return role;
  }

  private grantsOf(rows: { permission: string; scope: string }[]): Grants {
    const out: Grants = {};
    for (const r of rows) if (r.scope !== 'NONE' && PERMISSION_CATALOG.some((d) => d.key === r.permission)) out[r.permission as Permission] = r.scope as PermissionScope;
    return out;
  }

  private async editors(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = wanted.length ? await this.prisma.client.adminUser.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } }) : [];
    return new Map(rows.map((r) => [r.id, r]));
  }
}
