import { describe, expect, it } from 'vitest';
import { MAX_SYNC_ATTEMPTS, nextDelayMs } from './revalidate.service.js';

describe('website sync retry', () => {
  it('backs off exponentially and caps at ten minutes', () => {
    expect(nextDelayMs(1)).toBe(10_000);
    expect(nextDelayMs(2)).toBe(20_000);
    expect(nextDelayMs(MAX_SYNC_ATTEMPTS + 10)).toBe(600_000);
  });
});
