import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { Prisma } from '@avida/db';
import {
  ADMIN_ROLES,
  PERMISSION_LABEL,
  PERMISSIONS,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  ROLE_PERMISSIONS,
} from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';
import { CreateUserDto, UpdateUserDto } from './dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  totpEnrolledAt: true,
  lockedUntil: true,
} satisfies Prisma.AdminUserSelect;

/** A readable one-time password: 20 characters, no ambiguous letters. */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** §29 — users and roles. */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The permission matrix — any signed-in user may read it. */
  @Get('roles')
  roles() {
    return {
      roles: ADMIN_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r], permissions: ROLE_PERMISSIONS[r] })),
      permissions: PERMISSIONS.map((p) => ({ key: p, label: PERMISSION_LABEL[p] })),
    };
  }

  /** Names for assignee pickers — no emails, so any role may read it. */
  @Get('team')
  team() {
    return this.prisma.client.adminUser.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
  }

  @Get('users')
  @RequirePermission('user.manage')
  async users() {
    const rows = await this.prisma.client.adminUser.findMany({ select: userSelect, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return rows.map(({ totpEnrolledAt, ...u }) => ({ ...u, twoFactor: totpEnrolledAt !== null }));
  }

  @Post('users')
  @RequirePermission('user.manage')
  async create(@Body() dto: CreateUserDto, @Req() req: AdminRequest) {
    const password = dto.password ?? temporaryPassword();
    const user = await this.prisma.client.adminUser
      .create({
        data: { email: dto.email.toLowerCase(), name: dto.name, role: dto.role as Prisma.AdminUserCreateInput['role'], passwordHash: await hash(password) },
        select: userSelect,
      })
      .catch((e) => rethrowPrisma(e, { unique: 'Someone already has an account with that email.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'user.create', entity: 'user', entityId: user.id, target: user.email, summary: `Invited ${user.name} as ${ROLE_LABEL[user.role as keyof typeof ROLE_LABEL]}`, req });
    // Shown once. It is never stored in plain text and cannot be read back.
    return { user, temporaryPassword: dto.password ? null : password };
  }

  @Patch('users/:id')
  @RequirePermission('user.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.prisma.client.adminUser.findUnique({ where: { id }, select: userSelect });
    if (!before) throw new NotFoundException('No such user');
    if (id === actor.id && ((dto.role && dto.role !== before.role) || dto.active === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate yourself.');
    }
    const losingAdmin = before.role === 'SUPER_ADMIN' && before.active && ((dto.role && dto.role !== 'SUPER_ADMIN') || dto.active === false);
    if (losingAdmin) {
      const admins = await this.prisma.client.adminUser.count({ where: { role: 'SUPER_ADMIN', active: true } });
      if (admins <= 1) throw new ConflictException('This is the only active super admin. Make someone else a super admin first.');
    }
    const user = await this.prisma.client.adminUser.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role as Prisma.AdminUserUpdateInput['role'] } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: userSelect,
    });
    const parts = [
      dto.role && dto.role !== before.role ? `role ${ROLE_LABEL[before.role as keyof typeof ROLE_LABEL]} → ${ROLE_LABEL[dto.role as keyof typeof ROLE_LABEL]}` : null,
      dto.active !== undefined && dto.active !== before.active ? (dto.active ? 'reactivated' : 'deactivated') : null,
      dto.name && dto.name !== before.name ? 'name' : null,
    ].filter(Boolean);
    if (parts.length) {
      await this.audit.record({ actorId: actor.id, action: 'user.update', entity: 'user', entityId: id, target: user.email, summary: `${user.name}: ${parts.join(', ')}`, before: { role: before.role, active: before.active }, after: { role: user.role, active: user.active }, req });
    }
    return user;
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @RequirePermission('user.manage')
  async resetPassword(@Param('id') id: string, @Req() req: AdminRequest) {
    const user = await this.prisma.client.adminUser.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
    if (!user) throw new NotFoundException('No such user');
    const password = temporaryPassword();
    await this.prisma.client.adminUser.update({ where: { id }, data: { passwordHash: await hash(password), failedLoginCount: 0, lockedUntil: null } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'user.reset-password', entity: 'user', entityId: id, target: user.email, summary: `Reset the password of ${user.name}`, req });
    return { temporaryPassword: password };
  }
}
