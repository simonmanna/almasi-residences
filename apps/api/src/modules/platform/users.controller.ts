import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { EnquiryStatus, Prisma, UserStatus } from '@avida/db';
import {
  can,
  canSignIn,
  explainAccess,
  isPermission,
  normaliseScope,
  permissionName,
  SCOPE_LABEL,
  USER_STATUS_LABEL,
  type Grants,
  type Permission,
  type PermissionScope,
} from '@avida/types';
import { AccessService } from '../../common/access.service.js';
import { AuditService } from '../../common/audit.service.js';
import { pageOf, paged, rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { AuthService } from '../admin/auth.service.js';
import { actorOf, type Actor } from './actor.js';
import { CreateUserDto, DeactivateUserDto, OverridesDto, ReassignUserDto, UpdateUserDto } from './dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  department: true,
  jobTitle: true,
  status: true,
  active: true,
  lastLoginAt: true,
  lastActiveAt: true,
  createdAt: true,
  deactivatedAt: true,
  totpEnrolledAt: true,
  lockedUntil: true,
  roleId: true,
  managerId: true,
  role: { select: { id: true, key: true, name: true } },
  manager: { select: { id: true, name: true } },
  _count: { select: { overrides: true } },
} satisfies Prisma.AdminUserSelect;

type UserRow = Prisma.AdminUserGetPayload<{ select: typeof userSelect }>;

const view = ({ totpEnrolledAt, _count, ...u }: UserRow) => ({ ...u, twoFactor: totpEnrolledAt !== null, overrides: _count.overrides });

const CLOSED_LEADS: EnquiryStatus[] = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'];
const OPEN_DEALS = ['NEGOTIATION', 'RESERVED', 'CONTRACT'] as const;
const BOOKED = ['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] as const;
const DAY = 86_400_000;

/** A readable one-time password: 20 characters, no ambiguous letters. */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);

/**
 * §29 — users and access. Every rule here is the server's: the admin hides
 * what someone cannot do, but a request that gets past it meets the same
 * checks. In particular nobody changes their own role, status or overrides,
 * nobody manages a person with more access than they have, and nobody hands
 * out access they do not hold.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly access: AccessService,
  ) {}

  /** Names for assignee pickers — no emails, so any role may read it. */
  @Get('team')
  async team() {
    const rows = await this.prisma.client.adminUser.findMany({ where: { active: true }, select: { id: true, name: true, department: true, role: { select: { key: true, name: true } } }, orderBy: { name: 'asc' } });
    // Whether each person can work leads — for assignment pools, so the admin need not know role contents.
    const grants = await this.access.grantsForUsers(rows.map((r) => r.id));
    return rows.map(({ role, ...u }) => ({ ...u, role: role.key, roleName: role.name, worksLeads: can({ grants: grants.get(u.id) ?? {} }, 'enquiry.edit') }));
  }

  // ─── Reading ───────────────────────────────────────────────────────────

  /** Server-side search, filters, sorting and paging — the browser never holds the whole directory. */
  @Get('users')
  @RequirePermission('user.view')
  async users(@Query() q: Record<string, string | undefined>) {
    const p = pageOf(q.page, q.pageSize ?? '25', 100);
    const now = Date.now();
    const text = q.q?.trim();
    const and: Prisma.AdminUserWhereInput[] = [];
    if (text) and.push({ OR: [{ name: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }, { phone: { contains: text.replace(/\s+/g, '') } }, { jobTitle: { contains: text, mode: 'insensitive' } }] });
    if (q.roleId) and.push({ roleId: q.roleId });
    if (q.department) and.push(q.department === '—' ? { department: null } : { department: { equals: q.department, mode: 'insensitive' } });
    if (q.status) and.push({ status: { in: q.status.split(',').filter((s): s is UserStatus => s in USER_STATUS_LABEL) as UserStatus[] } });
    if (q.active === 'true') and.push({ active: true });
    if (q.active === 'false') and.push({ active: false });
    if (q.lastActive === 'never') and.push({ lastActiveAt: null });
    else if (q.lastActive === 'stale') and.push({ OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now - 30 * DAY) } }] });
    else if (q.lastActive && /^\d+d$/.test(q.lastActive)) and.push({ lastActiveAt: { gte: new Date(now - Number.parseInt(q.lastActive, 10) * DAY) } });
    if (q.createdFrom) and.push({ createdAt: { gte: new Date(q.createdFrom) } });
    if (q.createdTo) and.push({ createdAt: { lte: new Date(`${q.createdTo}T23:59:59.999Z`) } });
    const where: Prisma.AdminUserWhereInput = and.length ? { AND: and } : {};
    const dir: Prisma.SortOrder = q.dir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.AdminUserOrderByWithRelationInput[] =
      q.sort === 'createdAt' ? [{ createdAt: dir }] : q.sort === 'lastActive' ? [{ lastActiveAt: { sort: dir, nulls: 'last' } }] : q.sort === 'role' ? [{ role: { position: dir } }, { name: 'asc' }] : [{ name: dir }];
    const [rows, total, counts] = await Promise.all([
      this.prisma.client.adminUser.findMany({ where, select: userSelect, orderBy, skip: p.skip, take: p.take }),
      this.prisma.client.adminUser.count({ where }),
      this.prisma.client.adminUser.groupBy({ by: ['status'], _count: true }),
    ]);
    return { ...paged(rows.map(view), total, p), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
  }

  /** What the filters offer: departments in use, roles and possible managers. */
  @Get('users/facets')
  @RequirePermission('user.view')
  async facets() {
    const [departments, roles, managers] = await Promise.all([
      this.prisma.client.adminUser.groupBy({ by: ['department'], _count: true, orderBy: { department: 'asc' } }),
      this.prisma.client.role.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, key: true, name: true, description: true, active: true, system: true } }),
      this.prisma.client.adminUser.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { departments: departments.filter((d) => d.department).map((d) => ({ value: d.department!, count: d._count })), roles, managers };
  }

  @Get('users/:id')
  async user(@Param('id') id: string, @Req() req: AdminRequest) {
    this.assertCanRead(actorOf(req), id);
    const u = await this.prisma.client.adminUser.findUnique({ where: { id }, select: { ...userSelect, reports: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
    if (!u) throw new NotFoundException('No such user');
    const [workload, target] = await Promise.all([this.workloadOf(id), this.targetGrants(id)]);
    const actor = actorOf(req);
    const self = id === actor.id;
    const within = this.access.withinCheck(actor, target);
    return {
      ...view(u),
      reports: u.reports,
      workload,
      // What the viewer may do to this person — the same checks the write endpoints make.
      allowed: {
        edit: can(actor, 'user.edit') && (self || within),
        assignRole: can(actor, 'user.assign-role') && !self && within,
        deactivate: can(actor, 'user.deactivate') && !self && within,
        overrides: can(actor, 'role.manage') && !self && within,
      },
    };
  }

  /** Effective access: every permission with the role's value, any override, and the result. */
  @Get('users/:id/access')
  async userAccess(@Param('id') id: string, @Req() req?: AdminRequest) {
    if (req) this.assertCanRead(actorOf(req), id);
    const u = await this.prisma.client.adminUser.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, roleId: true, role: { select: { id: true, key: true, name: true, description: true, active: true, updatedAt: true } }, overrides: { select: { id: true, permission: true, scope: true, reason: true, expiresAt: true, createdAt: true, grantedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!u) throw new NotFoundException('No such user');
    const roleGrants = u.role.active ? await this.access.roleGrants(u.roleId, u.role.updatedAt) : {};
    const lines = explainAccess(roleGrants, u.overrides.map((o) => ({ permission: o.permission, scope: o.scope as PermissionScope, expiresAt: o.expiresAt })));
    return {
      role: { id: u.role.id, key: u.role.key, name: u.role.name, description: u.role.description, active: u.role.active },
      signInAllowed: canSignIn(u.status),
      lines,
      overrides: u.overrides.map((o) => ({ ...o, label: isPermission(o.permission) ? permissionName(o.permission) : o.permission, expired: Boolean(o.expiresAt && o.expiresAt < new Date()) })),
    };
  }

  /** What they did, and what was done to their account. */
  @Get('users/:id/activity')
  async activity(@Param('id') id: string, @Req() req: AdminRequest, @Query('page') page?: string, @Query('about') about?: string) {
    this.assertCanRead(actorOf(req), id);
    const p = pageOf(page, 30, 100);
    const where: Prisma.AdminAuditLogWhereInput =
      about === 'account' ? { entity: 'user', entityId: id }
      : about === 'actions' ? { actorId: id }
      : about === 'signins' ? { actorId: id, action: { in: ['auth.login', 'auth.logout'] } }
      : { OR: [{ actorId: id }, { entity: 'user', entityId: id }] };
    const [rows, total] = await Promise.all([
      this.prisma.client.adminAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, action: true, entity: true, entityId: true, target: true, summary: true, createdAt: true, ip: true, userAgent: true, actor: { select: { id: true, name: true } } } }),
      this.prisma.client.adminAuditLog.count({ where }),
    ]);
    return paged(rows, total, p);
  }

  /** Open work that would be orphaned by a deactivation. */
  @Get('users/:id/workload')
  @RequirePermission('user.view')
  workload(@Param('id') id: string) {
    return this.workloadOf(id);
  }

  // ─── Creating and editing ──────────────────────────────────────────────

  @Post('users')
  @RequirePermission('user.create')
  async create(@Body() dto: CreateUserDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const name = (dto.name ?? [dto.firstName, dto.lastName].filter(Boolean).join(' ')).trim();
    if (!name) throw new BadRequestException('Give the person a name.');
    const role = await this.roleFor(dto.roleId, dto.role);
    // Adding someone with a role hands out that role's access: it must sit within the creator's own.
    await this.assertAssignable(actor, role.id);
    if (dto.managerId) await this.assertUserExists(dto.managerId);
    const password = dto.password ?? temporaryPassword();
    const status: UserStatus = dto.status === 'ACTIVE' || dto.password ? 'ACTIVE' : 'INVITED';
    const user = await this.prisma.client.adminUser
      .create({
        data: { email: dto.email.toLowerCase().trim(), name, roleId: role.id, status, active: true, phone: clean(dto.phone), department: clean(dto.department), jobTitle: clean(dto.jobTitle), managerId: dto.managerId || null, passwordHash: await hash(password) },
        select: userSelect,
      })
      .catch((e) => rethrowPrisma(e, { unique: 'Someone already has an account with that email.' }));
    await this.audit.record({ actorId: actor.id, action: 'user.create', entity: 'user', entityId: user.id, target: user.email, summary: `Added ${user.name} as ${role.name}`, after: { role: role.key, status, department: user.department }, req });
    // Shown once. It is never stored in plain text and cannot be read back.
    return { user: view(user), temporaryPassword: dto.password ? null : password };
  }

  @Patch('users/:id')
  @RequirePermission('user.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.prisma.client.adminUser.findUnique({ where: { id }, select: userSelect });
    if (!before) throw new NotFoundException('No such user');
    const self = id === actor.id;
    if (!self) await this.assertManageable(actor, id);

    // Older clients change status through this endpoint.
    if (dto.active === false) return this.deactivate(id, {}, req);
    if (dto.active === true && !before.active) return this.reactivate(id, req);

    let role: { id: string; key: string; name: string } | null = null;
    if ((dto.roleId || dto.role) && (dto.roleId ?? '') !== before.roleId && dto.role !== before.role.key) {
      if (self) throw new ForbiddenException('You cannot change your own role.');
      if (!can(actor, 'user.assign-role')) throw new ForbiddenException('Your role does not allow this: assign roles.');
      role = await this.roleFor(dto.roleId, dto.role);
      await this.assertAssignable(actor, role.id);
    }
    if (dto.managerId !== undefined && dto.managerId !== null) {
      if (dto.managerId === id) throw new BadRequestException('Someone cannot report to themselves.');
      await this.assertUserExists(dto.managerId);
      if (await this.reportsTo(dto.managerId, id)) throw new BadRequestException('That would make a reporting loop.');
    }

    const data: Prisma.AdminUserUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: clean(dto.phone) } : {}),
      ...(dto.department !== undefined ? { department: clean(dto.department) } : {}),
      ...(dto.jobTitle !== undefined ? { jobTitle: clean(dto.jobTitle) } : {}),
      ...(dto.managerId !== undefined ? { managerId: dto.managerId || null } : {}),
      ...(role ? { roleId: role.id } : {}),
    };
    const user = await this.prisma.client.$transaction(async (tx) => {
      const u = await tx.adminUser.update({ where: { id }, data, select: userSelect });
      if (role) await this.access.assertRoleManagerRemains(tx);
      return u;
    });

    if (role) {
      await this.audit.record({ actorId: actor.id, action: 'user.role', entity: 'user', entityId: id, target: user.email, summary: `${user.name}: role ${before.role.name} → ${role.name}`, before: { role: before.role.key }, after: { role: role.key }, req });
    }
    const profileKeys = ['name', 'phone', 'department', 'jobTitle', 'managerId'] as const;
    const changed = profileKeys.filter((k) => dto[k] !== undefined && (before[k] ?? null) !== (user[k] ?? null));
    if (changed.length) {
      await this.audit.record({ actorId: actor.id, action: 'user.update', entity: 'user', entityId: id, target: user.email, summary: `${user.name}: ${changed.join(', ')} updated`, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, user[k]])), req });
    }
    return view(user);
  }

  // ─── Status ────────────────────────────────────────────────────────────

  /**
   * Deactivating or suspending stops sign-in at once (every session ends) and
   * keeps every record they touched. Their open work can be handed to someone
   * else in the same step.
   */
  @Post('users/:id/deactivate')
  @HttpCode(200)
  @RequirePermission('user.deactivate')
  async deactivate(@Param('id') id: string, @Body() dto: DeactivateUserDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id === actor.id) throw new ForbiddenException('You cannot deactivate yourself.');
    if (!can(actor, 'user.deactivate')) throw new ForbiddenException('Your role does not allow this: deactivate users.');
    await this.assertManageable(actor, id);
    const before = await this.prisma.client.adminUser.findUnique({ where: { id }, select: userSelect });
    if (!before) throw new NotFoundException('No such user');
    const status: UserStatus = dto.status ?? 'INACTIVE';
    if (dto.reassignToId) await this.assertReassignTarget(dto.reassignToId, id);
    const moved = await this.prisma.client.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id }, data: { status, active: false, deactivatedAt: new Date(), tokenVersion: { increment: 1 } } });
      await this.access.assertRoleManagerRemains(tx);
      return dto.reassignToId ? this.moveWork(tx, id, dto.reassignToId) : null;
    });
    await this.audit.record({ actorId: actor.id, action: status === 'SUSPENDED' ? 'user.suspend' : 'user.deactivate', entity: 'user', entityId: id, target: before.email, summary: `${status === 'SUSPENDED' ? 'Suspended' : 'Deactivated'} ${before.name}${dto.reason ? ` — ${dto.reason}` : ''}`, before: { status: before.status }, after: { status }, req });
    if (moved) await this.auditMove(actor, before, dto.reassignToId!, moved, req);
    return { user: view(await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id }, select: userSelect })), moved };
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  @RequirePermission('user.deactivate')
  async reactivate(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id === actor.id) throw new ForbiddenException('You cannot change your own status.');
    if (!can(actor, 'user.deactivate')) throw new ForbiddenException('Your role does not allow this: deactivate users.');
    await this.assertManageable(actor, id);
    const before = await this.prisma.client.adminUser.findUnique({ where: { id }, select: { ...userSelect, role: { select: { id: true, key: true, name: true, active: true } } } });
    if (!before) throw new NotFoundException('No such user');
    if (before.active) throw new ConflictException(`${before.name} is already active.`);
    if (!before.role.active) throw new ConflictException(`Their role, ${before.role.name}, is switched off. Give them another role first.`);
    const user = await this.prisma.client.adminUser.update({ where: { id }, data: { status: before.lastLoginAt ? 'ACTIVE' : 'INVITED', active: true, deactivatedAt: null, failedLoginCount: 0, lockedUntil: null }, select: userSelect });
    await this.audit.record({ actorId: actor.id, action: 'user.reactivate', entity: 'user', entityId: id, target: user.email, summary: `Reactivated ${user.name}`, before: { status: before.status }, after: { status: user.status }, req });
    return view(user);
  }

  /** Hand someone's open leads, tasks, deals, viewings and reservations to another person. Nothing is deleted. */
  @Post('users/:id/reassign')
  @HttpCode(200)
  @RequirePermission('user.deactivate')
  async reassign(@Param('id') id: string, @Body() dto: ReassignUserDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const from = await this.prisma.client.adminUser.findUnique({ where: { id }, select: userSelect });
    if (!from) throw new NotFoundException('No such user');
    await this.assertReassignTarget(dto.toUserId, id);
    const moved = await this.prisma.client.$transaction((tx) => this.moveWork(tx, id, dto.toUserId));
    await this.auditMove(actor, from, dto.toUserId, moved, req);
    return { moved };
  }

  /** "Sign out everywhere" for someone else — a lost laptop, a leaver. */
  @Post('users/:id/revoke-sessions')
  @HttpCode(200)
  @RequirePermission('user.edit')
  async revokeSessions(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id !== actor.id) await this.assertManageable(actor, id);
    const user = await this.prisma.client.adminUser.update({ where: { id }, data: { tokenVersion: { increment: 1 } }, select: { email: true, name: true } }).catch((e) => rethrowPrisma(e, { missing: 'No such user' }));
    await this.audit.record({ actorId: actor.id, action: 'user.revoke-sessions', entity: 'user', entityId: id, target: user.email, summary: `Signed ${user.name} out of every session`, req });
    return { ok: true };
  }

  /**
   * §24.8 — the lost-authenticator path. Clears the secret and the recovery
   * codes so the person can enrol again, and ends their sessions.
   */
  @Post('users/:id/totp/reset')
  @HttpCode(200)
  @RequirePermission('user.edit')
  async resetTotp(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    await this.assertManageable(actor, id);
    const user = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true } });
    await this.auth.resetTotpFor(id);
    await this.audit.record({ actorId: actor.id, action: 'user.totp-reset', entity: 'user', entityId: id, target: user.email, summary: `Reset two-factor authentication for ${user.name}`, req });
    return { ok: true };
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @RequirePermission('user.edit')
  async resetPassword(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id === actor.id) throw new BadRequestException('Change your own password under Settings.');
    await this.assertManageable(actor, id);
    const user = await this.prisma.client.adminUser.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
    if (!user) throw new NotFoundException('No such user');
    const password = temporaryPassword();
    // A new password also ends every session the old one opened.
    await this.prisma.client.adminUser.update({ where: { id }, data: { passwordHash: await hash(password), failedLoginCount: 0, lockedUntil: null, tokenVersion: { increment: 1 } } });
    await this.audit.record({ actorId: actor.id, action: 'user.reset-password', entity: 'user', entityId: id, target: user.email, summary: `Reset the password of ${user.name}`, req });
    return { temporaryPassword: password };
  }

  // ─── Overrides ─────────────────────────────────────────────────────────

  /**
   * Replaces a person's individual overrides. They take precedence over the
   * role, are shown apart from it, and can expire. Only someone who manages
   * roles may set them, never on themselves, and never beyond their own access.
   */
  @Put('users/:id/overrides')
  @RequirePermission('role.manage')
  async setOverrides(@Param('id') id: string, @Body() dto: OverridesDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id === actor.id) throw new ForbiddenException('You cannot change your own permissions.');
    await this.assertManageable(actor, id);
    const user = await this.prisma.client.adminUser.findUnique({ where: { id }, select: { id: true, email: true, name: true, overrides: { select: { permission: true, scope: true, reason: true, expiresAt: true } } } });
    if (!user) throw new NotFoundException('No such user');
    const seen = new Set<string>();
    const rows = dto.overrides.map((o) => {
      if (seen.has(o.permission)) throw new BadRequestException(`"${permissionName(o.permission as Permission)}" appears twice.`);
      seen.add(o.permission);
      const scope = normaliseScope(o.permission as Permission, o.scope as PermissionScope);
      const expiresAt = o.expiresAt ? new Date(o.expiresAt) : null;
      if (expiresAt && expiresAt < new Date()) throw new BadRequestException('An override cannot expire in the past.');
      return { permission: o.permission as Permission, scope, reason: clean(o.reason ?? null) ?? null, expiresAt };
    });
    // Granting (not revoking) must stay within the actor's own access.
    const granting: Grants = Object.fromEntries(rows.filter((r) => r.scope !== 'NONE').map((r) => [r.permission, r.scope]));
    this.access.assertWithin(actor, granting, 'grant this override');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
      if (rows.length) await tx.userPermissionOverride.createMany({ data: rows.map((r) => ({ ...r, userId: id, grantedById: actor.id })) });
      await this.access.assertRoleManagerRemains(tx);
    });
    const key = (o: { permission: string; scope: string; expiresAt?: Date | null }) => `${o.permission}:${o.scope}:${o.expiresAt?.toISOString() ?? ''}`;
    const was = new Map(user.overrides.map((o) => [o.permission, o]));
    const now = new Map<string, (typeof rows)[number]>(rows.map((o) => [o.permission, o]));
    const added = rows.filter((r) => !was.has(r.permission) || key(was.get(r.permission)!) !== key(r));
    const removed = user.overrides.filter((o) => !now.has(o.permission));
    for (const o of added) {
      await this.audit.record({ actorId: actor.id, action: 'user.override.set', entity: 'user', entityId: id, target: user.email, summary: `${user.name}: ${permissionName(o.permission)} → ${o.scope === 'NONE' ? 'not allowed' : SCOPE_LABEL[o.scope]} (override${o.expiresAt ? ` until ${o.expiresAt.toISOString().slice(0, 10)}` : ''})${o.reason ? ` — ${o.reason}` : ''}`, before: was.has(o.permission) ? { [o.permission]: was.get(o.permission)!.scope } : null, after: { [o.permission]: o.scope }, req });
    }
    for (const o of removed) {
      await this.audit.record({ actorId: actor.id, action: 'user.override.remove', entity: 'user', entityId: id, target: user.email, summary: `${user.name}: removed the override on ${isPermission(o.permission) ? permissionName(o.permission) : o.permission}`, before: { [o.permission]: o.scope }, after: null, req });
    }
    return this.userAccess(id);
  }

  // ─── Rules ─────────────────────────────────────────────────────────────

  /** Anyone may read their own profile, access and activity; anyone else's needs `user.view`. */
  private assertCanRead(actor: Actor, id: string) {
    if (id !== actor.id && !can(actor, 'user.view')) throw new ForbiddenException('Your role does not allow this: see users.');
  }

  private async roleFor(roleId?: string, key?: string) {
    if (!roleId && !key) throw new BadRequestException('Choose a role.');
    const role = await this.prisma.client.role.findFirst({ where: roleId ? { id: roleId } : { key }, select: { id: true, key: true, name: true, active: true } });
    if (!role) throw new BadRequestException('That role does not exist.');
    if (!role.active) throw new BadRequestException(`The ${role.name} role is switched off.`);
    return role;
  }

  /** Giving someone a role must not give them more than the person doing it has. */
  private async assertAssignable(actor: Actor, roleId: string) {
    const role = await this.prisma.client.role.findUniqueOrThrow({ where: { id: roleId }, select: { name: true, updatedAt: true } });
    this.access.assertWithin(actor, await this.access.roleGrants(roleId, role.updatedAt), `give someone the ${role.name} role`);
  }

  private async targetGrants(id: string): Promise<Grants> {
    return (await this.access.grantsForUsers([id])).get(id) ?? {};
  }

  /** Nobody manages (edits, resets, deactivates, re-roles) a person whose access goes beyond their own. */
  private async assertManageable(actor: Actor, id: string) {
    const target = await this.targetGrants(id);
    if (!this.access.withinCheck(actor, target)) {
      throw new ForbiddenException('This person has access you do not have yourself, so you cannot manage their account.');
    }
  }

  private async assertUserExists(id: string) {
    if (!(await this.prisma.client.adminUser.count({ where: { id } }))) throw new BadRequestException('That person does not exist.');
  }

  /** Does `id` (transitively) report to `managerOf`? Guards against loops in the reporting line. */
  private async reportsTo(id: string, managerOf: string): Promise<boolean> {
    let cursor: string | null = id;
    for (let i = 0; cursor && i < 50; i++) {
      if (cursor === managerOf) return true;
      cursor = (await this.prisma.client.adminUser.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null;
    }
    return false;
  }

  private async assertReassignTarget(toId: string, fromId: string) {
    if (toId === fromId) throw new BadRequestException('Choose someone else to take over.');
    const to = await this.prisma.client.adminUser.findUnique({ where: { id: toId }, select: { active: true } });
    if (!to?.active) throw new BadRequestException('The person taking over must have an active account.');
    if (!(await this.access.userCan(toId, 'enquiry.edit'))) throw new BadRequestException('The person taking over must be able to work leads.');
  }

  private async workloadOf(id: string) {
    const now = new Date();
    const [leads, tasks, deals, viewings, reservations, pending] = await Promise.all([
      this.prisma.client.enquiry.count({ where: { assignedToId: id, archivedAt: null, status: { notIn: CLOSED_LEADS } } }),
      this.prisma.client.leadTask.count({ where: { assignedToId: id, status: 'OPEN' } }),
      this.prisma.client.deal.count({ where: { agentId: id, archivedAt: null, status: { in: [...OPEN_DEALS] } } }),
      this.prisma.client.viewing.count({ where: { agentId: id, status: { in: [...BOOKED] }, OR: [{ scheduledAt: { gte: now } }, { scheduledAt: null }] } }),
      this.prisma.client.reservation.count({ where: { agentId: id, status: 'ACTIVE' } }),
      this.prisma.client.approvalRequest.count({ where: { requestedById: id, status: 'PENDING' } }),
    ]);
    return { leads, tasks, deals, viewings, reservations, pendingApprovals: pending, total: leads + tasks + deals + viewings + reservations };
  }

  /** Moves open work only: closed leads, done tasks and finished deals keep their history with the original person. */
  private async moveWork(tx: Prisma.TransactionClient, fromId: string, toId: string) {
    const now = new Date();
    const [leads, tasks, deals, viewings, reservations] = [
      await tx.enquiry.updateMany({ where: { assignedToId: fromId, archivedAt: null, status: { notIn: CLOSED_LEADS } }, data: { assignedToId: toId } }),
      await tx.leadTask.updateMany({ where: { assignedToId: fromId, status: 'OPEN' }, data: { assignedToId: toId } }),
      await tx.deal.updateMany({ where: { agentId: fromId, archivedAt: null, status: { in: [...OPEN_DEALS] } }, data: { agentId: toId } }),
      await tx.viewing.updateMany({ where: { agentId: fromId, status: { in: [...BOOKED] }, OR: [{ scheduledAt: { gte: now } }, { scheduledAt: null }] }, data: { agentId: toId } }),
      await tx.reservation.updateMany({ where: { agentId: fromId, status: 'ACTIVE' }, data: { agentId: toId } }),
    ];
    return { leads: leads.count, tasks: tasks.count, deals: deals.count, viewings: viewings.count, reservations: reservations.count };
  }

  private async auditMove(actor: Actor, from: { name: string; email: string }, toId: string, moved: Record<string, number>, req: AdminRequest) {
    const to = await this.prisma.client.adminUser.findUniqueOrThrow({ where: { id: toId }, select: { name: true } });
    const parts = Object.entries(moved).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    const fromUser = await this.prisma.client.adminUser.findUnique({ where: { email: from.email }, select: { id: true } });
    await this.audit.record({ actorId: actor.id, action: 'user.reassign', entity: 'user', entityId: fromUser?.id, target: from.email, summary: parts.length ? `Moved ${parts.join(', ')} from ${from.name} to ${to.name}` : `Nothing open to move from ${from.name}`, after: { toUserId: toId, ...moved }, rowCount: Object.values(moved).reduce((a, n) => a + n, 0), req });
  }
}
