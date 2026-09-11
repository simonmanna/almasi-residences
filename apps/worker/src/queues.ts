/**
 * §5.8 — the queue definitions. Phase 0 declares them so the topology is fixed
 * and visible; the processors land in Phase 2, and each one must be idempotent
 * (re-running a job produces the same keys).
 *
 * The spec writes these names with a colon (`media:variants`). BullMQ 5 rejects
 * a colon in a queue name — it is the separator in its own Redis key scheme —
 * so the wire name uses a hyphen and `specName` keeps the spec's identity for
 * cross-referencing.
 */
export const QUEUES = {
  mediaVariants: { name: 'media-variants', specName: 'media:variants', concurrency: 4 },
  mediaDepth: { name: 'media-depth', specName: 'media:depth', concurrency: 1 },
  mediaTile: { name: 'media-tile', specName: 'media:tile', concurrency: 2 },
  mediaFrames: { name: 'media-frames', specName: 'media:frames', concurrency: 2 },
  videoEncode: { name: 'video-encode', specName: 'video:encode', concurrency: 1 },
  notifyEmail: { name: 'notify-email', specName: 'notify:email', concurrency: 10 },
  geoDistance: { name: 'geo-distance', specName: 'geo:distance', concurrency: 1 },
  /** §5.9 — nightly hard delete of enquiries past their 24-month retention. */
  piiPurge: { name: 'pii-purge', specName: 'pii:purge', concurrency: 1 },
} as const;

export type QueueKey = keyof typeof QUEUES;

/** §5.8 — three retries with exponential backoff, then the admin jobs board. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: false,
};
