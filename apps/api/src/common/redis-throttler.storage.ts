import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Rate-limit counters in Redis rather than in each process's memory.
 *
 * The in-memory default resets on every deploy and counts separately in each
 * instance, so "five sign-in attempts per fifteen minutes" became five per
 * instance per deploy — which is not a limit. Written against ioredis directly
 * rather than adding a dependency for forty lines of Lua.
 *
 * Units follow @nestjs/throttler 6: `ttl` and `blockDuration` arrive in
 * milliseconds, `timeToExpire` and `timeToBlockExpire` are returned in seconds.
 */
const SCRIPT = `
local hitKey, blockKey = KEYS[1], KEYS[2]
local ttl, limit, blockMs = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])

local blocked = redis.call('PTTL', blockKey)
if blocked > 0 then
  return { limit + 1, 0, 1, blocked }
end

local hits = redis.call('INCR', hitKey)
local pttl = redis.call('PTTL', hitKey)
if hits == 1 or pttl < 0 then
  redis.call('PEXPIRE', hitKey, ttl)
  pttl = ttl
end

if hits > limit then
  if blockMs > 0 then
    redis.call('SET', blockKey, 1, 'PX', blockMs)
    return { hits, pttl, 1, blockMs }
  end
  return { hits, pttl, 1, pttl }
end

return { hits, pttl, 0, 0 }
`;

const toSeconds = (ms: number) => Math.ceil(ms / 1000);

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;
    const [totalHits, expireMs, blocked, blockExpireMs] = (await this.redis.eval(
      SCRIPT,
      2,
      hitKey,
      blockKey,
      String(ttl),
      String(limit),
      String(blockDuration),
    )) as [number, number, number, number];

    return {
      totalHits,
      timeToExpire: toSeconds(expireMs),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(blockExpireMs),
    };
  }
}
