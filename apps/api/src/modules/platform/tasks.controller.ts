import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { LeadNoteKind, Prisma, TaskType } from '@avida/db';
import { can, TASK_TYPE_LABEL, type TaskTypeValue } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, type Actor } from './actor.js';
import { CompleteTaskDto, CreateTaskDto, UpdateTaskDto } from './crm.dto.js';

const include = {
  enquiry: { select: { id: true, name: true, phone: true, whatsapp: true, email: true, status: true, stage: { select: { label: true, color: true } } } },
  unit: { select: { id: true, code: true } },
  deal: { select: { id: true, status: true } },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.LeadTaskInclude;

/** Which activity kind completing a task of this type records. */
const LOG_KIND: Partial<Record<TaskTypeValue, LeadNoteKind>> = { CALL: 'CALL', WHATSAPP: 'WHATSAPP', EMAIL: 'EMAIL', SMS: 'SMS', MEETING: 'MEETING', SEND_BROCHURE: 'DOCUMENT', SEND_FLOOR_PLAN: 'DOCUMENT', SEND_QUOTATION: 'DOCUMENT', SEND_PAYMENT_PLAN: 'DOCUMENT' };

/**
 * The follow-up system. Every task has an owner and (usually) a due date; a
 * lead's next follow-up is its earliest open task, kept in step here. Agents
 * see their own tasks and the tasks on leads they can see; managers see all.
 */
@Controller('admin/crm/tasks')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class TasksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
  ) {}

  private scope(actor: Actor): Prisma.LeadTaskWhereInput {
    if (can(actor.role, 'enquiry.view-all')) return {};
    return { OR: [{ assignedToId: actor.id }, { createdById: actor.id }, { enquiry: this.crm.leadScope(actor) }] };
  }

  @Get()
  async list(@Req() req: AdminRequest, @Query('assignee') assignee?: string, @Query('status') status?: string, @Query('enquiryId') enquiryId?: string, @Query('type') type?: string, @Query('range') range?: string) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const who: Prisma.LeadTaskWhereInput = assignee === 'all' && can(actor.role, 'enquiry.view-all') ? {} : assignee && assignee !== 'me' && assignee !== 'all' ? { assignedToId: assignee === 'none' ? null : assignee } : enquiryId ? {} : { assignedToId: actor.id };
    const where: Prisma.LeadTaskWhereInput = {
      AND: [
        { developmentId },
        this.scope(actor),
        who,
        status === 'done' ? { status: 'DONE', completedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } } : status === 'all' ? {} : { status: 'OPEN' },
        enquiryId ? { enquiryId } : {},
        type ? { type: type as TaskType } : {},
        range === 'overdue' ? { dueAt: { lt: now } } : range === 'today' ? { dueAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } } : range === 'week' ? { dueAt: { lt: new Date(dayStart.getTime() + 7 * 86_400_000) } } : {},
      ],
    };
    const openMine: Prisma.LeadTaskWhereInput = { developmentId, status: 'OPEN', assignedToId: assignee && assignee !== 'me' && assignee !== 'all' ? assignee : assignee === 'all' ? undefined : actor.id };
    const [rows, overdue, today, upcoming, undated] = await Promise.all([
      this.prisma.client.leadTask.findMany({ where, include, orderBy: status === 'done' ? [{ completedAt: 'desc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }], take: 500 }),
      this.prisma.client.leadTask.count({ where: { AND: [openMine, this.scope(actor), { dueAt: { lt: now } }] } }),
      this.prisma.client.leadTask.count({ where: { AND: [openMine, this.scope(actor), { dueAt: { gte: now, lt: new Date(dayStart.getTime() + 86_400_000) } }] } }),
      this.prisma.client.leadTask.count({ where: { AND: [openMine, this.scope(actor), { dueAt: { gte: new Date(dayStart.getTime() + 86_400_000) } }] } }),
      this.prisma.client.leadTask.count({ where: { AND: [openMine, this.scope(actor), { dueAt: null }] } }),
    ]);
    return { data: rows, counts: { overdue, today, upcoming, undated } };
  }

  @Post()
  @RequirePermission('enquiry.edit')
  async create(@Body() dto: CreateTaskDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const lead = dto.enquiryId ? await this.lead(dto.enquiryId, actor) : null;
    const assignedToId = await this.assignee(actor, dto.assignedToId, lead?.assignedToId ?? null);
    await this.assertRefs(developmentId, dto);
    const task = await this.prisma.client.$transaction(async (tx) => {
      const t = await tx.leadTask.create({
        data: {
          developmentId,
          enquiryId: lead?.id ?? null,
          title: dto.title.trim(),
          type: (dto.type as TaskType) ?? 'FOLLOW_UP',
          priority: (dto.priority as Prisma.LeadTaskCreateInput['priority']) ?? 'NORMAL',
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          allDay: dto.allDay ?? false,
          remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
          assignedToId,
          createdById: actor.id,
          unitId: dto.unitId ?? null,
          dealId: dto.dealId ?? null,
          notes: dto.notes ?? null,
        },
        include,
      });
      if (lead) {
        await this.crm.logActivity(tx, lead.id, 'TASK', `Task: ${t.title}${t.dueAt ? ` — due ${t.dueAt.toISOString().slice(0, 16).replace('T', ' ')}` : ''}${t.assignedTo && t.assignedTo.id !== actor.id ? ` · ${t.assignedTo.name}` : ''}`, actor.id, { meta: { taskId: t.id } });
        await this.crm.syncFollowUp(tx, lead.id);
      }
      return t;
    });
    if (assignedToId && assignedToId !== actor.id) await this.crm.notify([assignedToId], { kind: 'task.assigned', title: `New task: ${task.title}`, body: lead ? `On ${lead.name}, from ${actor.name}.` : `From ${actor.name}.`, link: lead ? `/crm/leads/${lead.id}` : '/crm/tasks', enquiryId: lead?.id }, actor.id);
    return task;
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.owned(id, actor);
    const assignedToId = dto.assignedToId !== undefined ? await this.assignee(actor, dto.assignedToId, before.assignedToId) : undefined;
    await this.assertRefs(before.developmentId, dto);
    const reopening = dto.status === 'OPEN' && before.status !== 'OPEN';
    const task = await this.prisma.client.$transaction(async (tx) => {
      const t = await tx.leadTask.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type as TaskType } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority as Prisma.LeadTaskUpdateInput['priority'] } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
          ...(dto.remindAt !== undefined ? { remindAt: dto.remindAt ? new Date(dto.remindAt) : null } : {}),
          ...(assignedToId !== undefined ? { assignedToId } : {}),
          ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
          ...(dto.dealId !== undefined ? { dealId: dto.dealId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status !== undefined ? { status: dto.status as Prisma.LeadTaskUpdateInput['status'], ...(dto.status === 'OPEN' ? { completedAt: null, completedById: null } : { completedAt: new Date(), completedById: actor.id }) } : {}),
        },
        include,
      });
      if (t.enquiryId) {
        if (reopening) await this.crm.logActivity(tx, t.enquiryId, 'TASK', `Reopened task: ${t.title}`, actor.id, { meta: { taskId: t.id } });
        if (dto.status === 'CANCELLED' && before.status === 'OPEN') await this.crm.logActivity(tx, t.enquiryId, 'TASK', `Cancelled task: ${t.title}`, actor.id, { meta: { taskId: t.id } });
        await this.crm.syncFollowUp(tx, t.enquiryId);
      }
      return t;
    });
    if (assignedToId && assignedToId !== before.assignedToId) await this.crm.notify([assignedToId], { kind: 'task.assigned', title: `Task for you: ${task.title}`, body: `From ${actor.name}.`, link: task.enquiryId ? `/crm/leads/${task.enquiryId}` : '/crm/tasks', enquiryId: task.enquiryId }, actor.id);
    return task;
  }

  /** Done — optionally with what happened (logged on the lead) and the next action (a new task). */
  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('enquiry.edit')
  async complete(@Param('id') id: string, @Body() dto: CompleteTaskDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const t = await this.owned(id, actor);
    if (t.status !== 'OPEN') throw new BadRequestException('This task is already closed.');
    const next = await this.prisma.client.$transaction(async (tx) => {
      await tx.leadTask.update({ where: { id }, data: { status: 'DONE', completedAt: new Date(), completedById: actor.id } });
      let created = null;
      if (t.enquiryId) {
        const kind = (dto.logAs as LeadNoteKind | undefined) ?? LOG_KIND[t.type as TaskTypeValue] ?? 'TASK';
        const touch = kind !== 'TASK' && kind !== 'NOTE';
        await this.crm.logActivity(tx, t.enquiryId, kind, dto.outcome?.trim() ? `${t.title} — ${dto.outcome.trim()}` : `Done: ${t.title}`, actor.id, { direction: touch ? 'OUT' : null, meta: { taskId: t.id } });
        if (touch) {
          const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: t.enquiryId } });
          if (!lead.contactedAt) await tx.enquiry.update({ where: { id: lead.id }, data: { contactedAt: new Date() } });
          if (lead.status === 'NEW') await this.crm.moveLead(tx, lead, { status: 'CONTACTED' }, actor.id, { forwardOnly: true });
        }
        if (dto.next) {
          created = await tx.leadTask.create({
            data: {
              developmentId: t.developmentId,
              enquiryId: t.enquiryId,
              title: dto.next.title.trim(),
              type: (dto.next.type as TaskType) ?? 'FOLLOW_UP',
              dueAt: dto.next.dueAt ? new Date(dto.next.dueAt) : null,
              allDay: dto.next.allDay ?? false,
              assignedToId: t.assignedToId ?? actor.id,
              createdById: actor.id,
              unitId: t.unitId,
              dealId: t.dealId,
            },
          });
          await this.crm.logActivity(tx, t.enquiryId, 'TASK', `Next: ${created.title}${created.dueAt ? ` — due ${created.dueAt.toISOString().slice(0, 16).replace('T', ' ')}` : ''}`, actor.id, { meta: { taskId: created.id } });
        }
        await this.crm.syncFollowUp(tx, t.enquiryId);
      }
      return created;
    });
    if (t.enquiryId) await this.crm.rescore(t.enquiryId);
    return { ok: true, next };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async owned(id: string, actor: Actor) {
    const t = await this.prisma.client.leadTask.findFirst({ where: { AND: [{ id, developmentId: await this.dev.id() }, this.scope(actor)] } });
    if (!t) throw new NotFoundException('No such task');
    return t;
  }

  private async lead(id: string, actor: Actor) {
    const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id, developmentId: await this.dev.id(), archivedAt: null }, this.crm.leadScope(actor)] }, select: { id: true, name: true, assignedToId: true } });
    if (!lead) throw new NotFoundException('No such lead, or it belongs to another agent.');
    return lead;
  }

  /** A task goes to the lead's owner by default; giving one to someone else needs `enquiry.assign`. */
  private async assignee(actor: Actor, requested: string | null | undefined, fallback: string | null): Promise<string | null> {
    const target = requested === undefined ? (fallback ?? actor.id) : requested;
    if (target && target !== actor.id && target !== fallback && !can(actor.role, 'enquiry.assign')) {
      throw new ForbiddenException('Only a sales manager can give tasks to other people.');
    }
    if (target) {
      const u = await this.prisma.client.adminUser.findUnique({ where: { id: target }, select: { active: true } });
      if (!u?.active) throw new BadRequestException('That team member does not exist or is inactive.');
    }
    return target;
  }

  private async assertRefs(developmentId: string, dto: { unitId?: string | null; dealId?: string | null }) {
    if (dto.unitId && !(await this.prisma.client.unit.count({ where: { id: dto.unitId, developmentId } }))) throw new BadRequestException('That residence does not exist.');
    if (dto.dealId && !(await this.prisma.client.deal.count({ where: { id: dto.dealId, developmentId } }))) throw new BadRequestException('That deal does not exist.');
  }

  static label(type: string) {
    return TASK_TYPE_LABEL[type as TaskTypeValue] ?? type;
  }
}
