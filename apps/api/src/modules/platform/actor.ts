import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { can, PERMISSION_LABEL, type Permission } from '@avida/types';
import type { AdminRequest } from '../admin/admin.guard.js';

export interface Actor {
  id: string;
  role: string;
  name: string;
}

export function actorOf(req: AdminRequest): Actor {
  return { id: req.admin!.userId, role: req.admin!.role, name: req.admin!.name };
}

/** For checks that depend on the body (e.g. a price inside a general edit). */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[permission].toLowerCase()}.`);
  }
}

/**
 * Removes `null` from fields whose column is NOT NULL, so clearing a required
 * field in a form is a 400 the person can read, not a database error.
 */
export function requireNonNull<T extends object>(dto: T, keys: (keyof T)[]): void {
  for (const k of keys) {
    if ((dto as Record<string, unknown>)[k as string] === null) {
      throw new BadRequestException(`"${String(k)}" cannot be empty.`);
    }
  }
}

export function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

/** Removes keys whose value is undefined, so Prisma leaves those columns alone. */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
