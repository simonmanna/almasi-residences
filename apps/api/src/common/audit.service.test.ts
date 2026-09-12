import { describe, expect, it, vi } from 'vitest';
import { AuditService, diff } from './audit.service.js';
import type { PrismaService } from './prisma.service.js';

/**
 * The audit log records that something changed and who changed it. For a
 * private note or a client's identity that is the whole record — copying the
 * value in turned the log into a second, less guarded copy of the data.
 */
function serviceWithSpy() {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { client: { adminAuditLog: { create } } } as unknown as PrismaService;
  return { service: new AuditService(prisma), create };
}

const written = (create: ReturnType<typeof vi.fn>) => create.mock.calls[0]![0].data;

describe('AuditService redaction', () => {
  it('keeps the key but not the value of a private field', async () => {
    const { service, create } = serviceWithSpy();
    await service.record({
      actorId: 'a',
      action: 'residence.update',
      before: { notes: 'Buyer is nervous about the view', priceMinor: 100 },
      after: { notes: 'Buyer signed', priceMinor: 120 },
    });

    const data = written(create);
    expect(data.before).toEqual({ notes: '[redacted]', priceMinor: 100 });
    expect(data.after).toEqual({ notes: '[redacted]', priceMinor: 120 });
  });

  it('redacts identities and contact details wherever they appear', async () => {
    const { service, create } = serviceWithSpy();
    await service.record({
      actorId: 'a',
      action: 'parking.delete',
      before: { code: 'B-12', residentId: 'res_1', notes: 'keys with security', sizeSqm: 12.5 },
    });

    const data = written(create);
    expect(data.before).toEqual({ code: 'B-12', residentId: '[redacted]', notes: '[redacted]', sizeSqm: 12.5 });
  });

  it('reaches into nested objects and arrays', async () => {
    const { service, create } = serviceWithSpy();
    await service.record({
      actorId: 'a',
      action: 'buyer.update',
      after: { buyer: { fullName: 'Jane', email: 'jane@example.invalid' }, interests: [{ unitId: 'u1', internalNote: 'hot' }] },
    });

    const data = written(create);
    expect(data.after.buyer).toEqual({ fullName: 'Jane', email: '[redacted]' });
    expect(data.after.interests[0]).toEqual({ unitId: 'u1', internalNote: '[redacted]' });
  });

  it('leaves a null private field as null rather than claiming there was something', async () => {
    const { service, create } = serviceWithSpy();
    await service.record({ actorId: 'a', action: 'residence.update', before: { notes: null }, after: { notes: 'x' } });

    const data = written(create);
    expect(data.before).toEqual({ notes: null });
    expect(data.after).toEqual({ notes: '[redacted]' });
  });

  it('never lets a failed write fail the action it was recording', async () => {
    const create = vi.fn().mockRejectedValue(new Error('database is on fire'));
    const prisma = { client: { adminAuditLog: { create } } } as unknown as PrismaService;
    await expect(new AuditService(prisma).record({ actorId: 'a', action: 'x' })).resolves.toBeUndefined();
  });
});

describe('diff', () => {
  it('returns only the keys that actually changed', () => {
    const result = diff({ a: 1, b: 'x', c: true }, { a: 1, b: 'y' });
    expect(result.keys).toEqual(['b']);
    expect(result.before).toEqual({ b: 'x' });
    expect(result.after).toEqual({ b: 'y' });
  });

  it('ignores undefined fields, so a partial update is not a change to null', () => {
    const result = diff({ a: 1, b: 'x' }, { a: undefined, b: 'x' });
    expect(result.keys).toEqual([]);
  });

  it('treats null and absent as the same value', () => {
    const result = diff({ a: null } as Record<string, unknown>, { a: null });
    expect(result.keys).toEqual([]);
  });
});
