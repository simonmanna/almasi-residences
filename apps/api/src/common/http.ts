import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@avida/db';

/** §44 — every list is paginated server-side. */
export interface Page {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageOf(page?: string | number, pageSize?: string | number, max = 200): Page {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(max, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

export function paged<T>(data: T[], total: number, page: Page) {
  return { data, meta: { total, page: page.page, pageSize: page.pageSize, pages: Math.max(1, Math.ceil(total / page.pageSize)) } };
}

export function csvList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function numberOrUndefined(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException(`"${value}" is not a number`);
  return n;
}

export function boolOrUndefined(value?: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
}

/**
 * Turns a Prisma constraint error into the message a person can act on. Every
 * other error is rethrown untouched, so a real bug still reaches the 500 log.
 */
export function rethrowPrisma(error: unknown, messages: { unique?: string; missing?: string; restrict?: string } = {}): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ConflictException(messages.unique ?? 'That value is already in use.');
    if (error.code === 'P2025') throw new NotFoundException(messages.missing ?? 'That record no longer exists.');
    if (error.code === 'P2003' || error.code === 'P2014') {
      throw new ConflictException(messages.restrict ?? 'Other records still depend on this one.');
    }
  }
  throw error;
}

/** `$125,000` from minor units. For audit lines, not for display in a locale. */
export function money(minor: number | null | undefined, currency = 'USD'): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
}
