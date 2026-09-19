import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { can, PERMISSION_LABEL, type Grants, type Permission } from '@avida/types';
import type { AdminRequest } from '../admin/admin.guard.js';

/**
 * The signed-in person as controllers see them. `grants` is their effective
 * access, resolved by AdminGuard on this request; `can(actor, p)` reads it.
 * Never built from anything the client sent.
 */
export interface Actor {
  id: string;
  /** Role key, e.g. "SALES_AGENT". Display and logging only — decisions read `grants`. */
  role: string;
  name: string;
  grants: Grants;
  teamIds: string[];
  departmentIds: string[];
}

export function actorOf(req: AdminRequest): Actor {
  const a = req.admin!;
  return { id: a.userId, role: a.role, name: a.name, grants: a.grants, teamIds: a.teamIds, departmentIds: a.departmentIds };
}

/** For checks that depend on the body (e.g. a price inside a general edit). */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
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

/**
 * §40.2 / §49 — putting marketing content live, or taking it down, needs
 * `content.publish`; saving a draft needs only the right to edit. Returns the
 * columns to write: the flag plus who published it and when.
 *
 * On create, a role that may not publish gets a draft rather than a refusal.
 */
export function publishStamp(actor: Actor, published: boolean | undefined, creating = false): { published?: boolean; publishedAt?: Date | null; publishedById?: string | null; unpublishedAt?: Date | null } {
  const allowed = can(actor, 'content.publish');
  if (published === undefined) {
    if (!creating) return {};
    return allowed ? { published: true, publishedAt: new Date(), publishedById: actor.id } : { published: false };
  }
  if (!allowed) {
    if (creating) return { published: false };
    throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL['content.publish'].toLowerCase()}.`);
  }
  return published ? { published: true, publishedAt: new Date(), publishedById: actor.id, unpublishedAt: null } : { published: false, unpublishedAt: new Date() };
}
