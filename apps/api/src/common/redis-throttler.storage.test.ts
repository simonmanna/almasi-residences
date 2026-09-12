import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

/**
 * @nestjs/throttler takes milliseconds and returns seconds. Getting that
 * backwards would make every limit either a thousand times too strict or a
 * thousand times too loose, and nothing would obviously break — so it is
 * pinned here.
 */
function storageReturning(reply: [number, number, number, number]) {
  const evalFn = vi.fn().mockResolvedValue(reply);
  const redis = { eval: evalFn } as unknown as Redis;
  return { storage: new RedisThrottlerStorage(redis), evalFn };
}

describe('RedisThrottlerStorage', () => {
  it('reports hits under the limit as not blocked, with the window in seconds', async () => {
    const { storage } = storageReturning([3, 45_000, 0, 0]);
    const record = await storage.increment('1.2.3.4', 60_000, 120, 0, 'default');
    expect(record).toEqual({ totalHits: 3, timeToExpire: 45, isBlocked: false, timeToBlockExpire: 0 });
  });

  it('reports a blocked caller with the block window in seconds', async () => {
    const { storage } = storageReturning([6, 800_000, 1, 890_000]);
    const record = await storage.increment('1.2.3.4', 900_000, 5, 900_000, 'default');
    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(890);
  });

  it('rounds a part-second up, so a limit never expires early', async () => {
    const { storage } = storageReturning([1, 1, 0, 0]);
    const record = await storage.increment('k', 60_000, 10, 0, 'default');
    expect(record.timeToExpire).toBe(1);
  });

  it('namespaces keys by throttler so the sign-in limit is separate from the global one', async () => {
    const { storage, evalFn } = storageReturning([1, 1000, 0, 0]);
    await storage.increment('1.2.3.4', 900_000, 5, 0, 'login');
    const [, keyCount, hitKey, blockKey, ttl, limit, block] = evalFn.mock.calls[0]!;
    expect(keyCount).toBe(2);
    expect(hitKey).toBe('throttle:login:1.2.3.4');
    expect(blockKey).toBe('throttle:login:1.2.3.4:blocked');
    // Milliseconds go to Redis untouched.
    expect(ttl).toBe('900000');
    expect(limit).toBe('5');
    expect(block).toBe('0');
  });
});
