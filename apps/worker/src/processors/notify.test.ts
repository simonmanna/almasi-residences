import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>>();
vi.mock('@avida/db', () => ({
  prisma: {
    notification: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.get(where.id)!;
        const next = { ...row, ...data, attempts: typeof data.attempts === 'number' ? data.attempts : (row.attempts as number) + 1 };
        rows.set(where.id, next);
        return next;
      }),
    },
  },
}));

const { deliverNotification } = await import('./notify.js');

describe('§15.1 notification delivery', () => {
  beforeEach(() => {
    rows.clear();
    rows.set('n1', { id: 'n1', status: 'QUEUED', attempts: 0, recipient: 'sales@example.invalid', subject: 'New enquiry', text: 'Body', replyTo: null });
  });

  it('marks a delivered email SENT, once', async () => {
    const send = vi.fn(async () => undefined);
    expect(await deliverNotification('n1', { send })).toBe('SENT');
    expect(rows.get('n1')!.status).toBe('SENT');
    expect(await deliverNotification('n1', { send })).toBe('SENT');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('records an unconfigured mailer as undelivered instead of dropping the lead alert', async () => {
    expect(await deliverNotification('n1', null)).toBe('SKIPPED');
    expect(rows.get('n1')!.status).toBe('SKIPPED');
    expect(String(rows.get('n1')!.lastError)).toContain('RESEND_API_KEY');
  });

  it('retries a failure, then gives up visibly', async () => {
    const send = vi.fn(async () => {
      throw new Error('provider down');
    });
    for (let i = 1; i < 6; i++) expect(await deliverNotification('n1', { send })).toBe('RETRY');
    expect(await deliverNotification('n1', { send })).toBe('FAILED');
    expect(rows.get('n1')!.status).toBe('FAILED');
    expect(rows.get('n1')!.lastError).toBe('provider down');
  });
});
