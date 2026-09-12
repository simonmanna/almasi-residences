import { Injectable, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Prisma } from '@avida/db';
import { PrismaService } from './prisma.service.js';

export interface AuditEntry {
  actorId: string;
  /** "residence.price", "floor.delete", "media.upload"… */
  action: string;
  entity?: string;
  entityId?: string;
  /** A human handle for the record: "A1", "Floor 2". */
  target?: string;
  /** One line a person can read: "Price $120,000 → $125,000". */
  summary?: string;
  before?: unknown;
  after?: unknown;
  rowCount?: number;
  req?: FastifyRequest;
}

/**
 * §28 / §5.9 — one row per consequential admin action. Writing the log never
 * fails the action it records: a lost audit row is logged loudly instead.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.client.adminAuditLog.create({
        data: {
          actorId: e.actorId,
          action: e.action,
          entity: e.entity ?? null,
          entityId: e.entityId ?? null,
          target: e.target ?? null,
          summary: e.summary ?? null,
          before: json(e.before),
          after: json(e.after),
          rowCount: e.rowCount ?? 1,
          ip: e.req?.ip ?? null,
          userAgent: e.req?.headers['user-agent']?.slice(0, 300) ?? null,
        },
      });
    } catch (error) {
      this.log.error(`Audit write failed for ${e.action} ${e.entityId ?? ''}: ${(error as Error).message}`);
    }
  }
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * The fields of `after` whose value differs from `before`, as before/after
 * pairs — so a log row shows what changed, not the whole record twice.
 */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T>; keys: (keyof T)[] } {
  const keys = (Object.keys(after) as (keyof T)[]).filter(
    (k) => after[k] !== undefined && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
  );
  const pick = (src: Partial<T>) => Object.fromEntries(keys.map((k) => [k, src[k] ?? null])) as Partial<T>;
  return { before: pick(before), after: pick(after), keys };
}
