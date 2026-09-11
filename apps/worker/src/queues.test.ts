import { describe, expect, it } from 'vitest';
import { QUEUES } from './queues.js';

describe('§5.8 queue topology', () => {
  it('declares every queue the spec lists', () => {
    expect(Object.values(QUEUES).map((q) => q.specName).sort()).toEqual([
      'geo:distance',
      'media:depth',
      'media:frames',
      'media:tile',
      'media:variants',
      'notify:email',
      'pii:purge',
      'video:encode',
    ]);
  });

  it('uses wire names BullMQ accepts', () => {
    // BullMQ 5 throws "Queue name cannot contain :" at construction, which is a
    // crash on boot rather than a type error. Catch it here instead.
    for (const q of Object.values(QUEUES)) {
      expect(q.name).not.toContain(':');
      expect(q.name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
