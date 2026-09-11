// Loads the repo-root .env before anything reads process.env (DECISIONS D-03).
import '@avida/db/env';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { Prisma, prisma } from '@avida/db';
import { DEFAULT_JOB_OPTIONS, QUEUES } from './queues.js';
import { buildDepthMap } from './processors/depth.js';
import { buildFrameLadders } from './processors/frames.js';
import { tilePanorama } from './processors/tile.js';
import { buildVariants } from './processors/variants.js';
import { encodeVideo } from './processors/video.js';
import { purgeExpiredEnquiries } from './processors/pii-purge.js';

const log = pino({ name: 'worker' });

/**
 * §5.8 — every job is idempotent: derivative keys are derived from the input
 * key, so re-running writes identical bytes rather than a second set. Failures
 * retry three times with exponential backoff and then land on the admin jobs
 * board as a MediaJob row.
 */

interface MediaJobData {
  /** The MediaAsset (or PanoramaAsset / FrameSequence) this job belongs to. */
  assetId: string;
  originalKey: string;
  /** Frame sequences only. */
  frameKeys?: string[];
  sceneKey?: string;
}

async function recordJob(
  queue: string,
  assetId: string,
  status: 'RUNNING' | 'DONE' | 'FAILED',
  detail?: string,
) {
  await prisma.mediaJob
    .upsert({
      where: { id: `${queue}:${assetId}` },
      create: {
        id: `${queue}:${assetId}`,
        kind: queue,
        refType: queue.split('-')[0] ?? queue,
        refId: assetId,
        status,
        error: detail ?? null,
      },
      update: { status, error: detail ?? null },
    })
    .catch((e: Error) => log.warn({ err: e.message }, 'could not record job state'));
}

function register<T extends MediaJobData>(
  connection: IORedis,
  queue: { name: string; concurrency: number },
  handler: (job: Job<T>) => Promise<unknown>,
): Worker<T> {
  const worker = new Worker<T>(
    queue.name,
    async (job) => {
      await recordJob(queue.name, job.data.assetId, 'RUNNING');
      const result = await handler(job);
      await recordJob(queue.name, job.data.assetId, 'DONE');
      return result;
    },
    { connection, concurrency: queue.concurrency },
  );

  worker.on('failed', (job, err) => {
    log.error({ queue: queue.name, jobId: job?.id, err: err.message }, 'job failed');
    if (job) void recordJob(queue.name, job.data.assetId, 'FAILED', err.message);
  });
  worker.on('completed', (job) => log.info({ queue: queue.name, jobId: job.id }, 'job completed'));

  return worker;
}

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required');

  const connection = new IORedis(url, { maxRetriesPerRequest: null });
  const queues = Object.values(QUEUES).map(
    (q) => new Queue(q.name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  );

  const workers = [
    // §5.8 media:variants — AVIF/WebP at six widths, thumbhash, dominant colour.
    register(connection, QUEUES.mediaVariants, async (job) => {
      const result = await buildVariants(job.data.originalKey);
      await prisma.mediaAsset.update({
        where: { id: job.data.assetId },
        data: {
          variants: result.variants as unknown as Prisma.InputJsonValue,
          thumbhash: result.thumbhash,
          dominantHex: result.dominantHex,
          width: result.width,
          height: result.height,
        },
      });
      return result;
    }),

    // §5.8 media:depth — supplied Z-depth preferred, inference as fallback.
    register(connection, QUEUES.mediaDepth, async (job) => {
      const outcome = await buildDepthMap(job.data.originalKey);
      if (outcome.status === 'skipped') {
        log.warn({ assetId: job.data.assetId, reason: outcome.reason }, 'depth map skipped');
        return outcome;
      }
      await prisma.mediaAsset.update({
        where: { id: job.data.assetId },
        data: { depthKey: outcome.depthKey },
      });
      return outcome;
    }),

    // §5.8 media:tile — equirect to cube faces to three tile levels.
    register(connection, QUEUES.mediaTile, async (job) => {
      const manifest = await tilePanorama(job.data.sceneKey ?? job.data.assetId, job.data.originalKey);
      await prisma.panoramaAsset.update({
        where: { id: job.data.assetId },
        // Prisma's Json input wants an index signature; these manifests are
        // plain data, so the cast is safe and keeps the interfaces documented.
        data: { tiles: manifest as unknown as Prisma.InputJsonValue, previewKey: manifest.previewKey },
      });
      return manifest;
    }),

    // §5.8 media:frames — three AVIF ladders plus a manifest.
    register(connection, QUEUES.mediaFrames, async (job) => {
      const manifest = await buildFrameLadders(job.data.assetId, job.data.frameKeys ?? []);
      await prisma.frameSequence.update({
        where: { id: job.data.assetId },
        data: {
          frameCount: manifest.frameCount,
          ladders: manifest as unknown as Prisma.InputJsonValue,
          loopable: manifest.loopable,
        },
      });
      return manifest;
    }),

    // §5.8 video:encode — HLS ladder, MP4 fallback, poster.
    register(connection, QUEUES.videoEncode, async (job) => {
      const result = await encodeVideo(job.data.originalKey);
      await prisma.videoAsset.update({
        where: { id: job.data.assetId },
        data: {
          hlsKey: result.hlsKey,
          mp4Key: result.mp4Key,
          posterKey: result.posterKey,
          durationSec: result.durationSec,
        },
      });
      return result;
    }),
  ];

  // §5.9 — nightly PII purge. Scheduled rather than triggered: the retention
  // clock does not depend on anyone doing anything.
  const purgeQueue = queues.find((q) => q.name === QUEUES.piiPurge.name)!;
  await purgeQueue.upsertJobScheduler(
    'nightly-purge',
    { pattern: '0 3 * * *' },
    { name: 'purge', data: {} },
  );
  workers.push(
    new Worker(
      QUEUES.piiPurge.name,
      async () => {
        const deleted = await purgeExpiredEnquiries();
        // §5.9 — log the count, never the rows.
        log.info({ deleted }, 'purged enquiries past their retention window');
        return { deleted };
      },
      { connection, concurrency: 1 },
    ) as unknown as Worker<MediaJobData>,
  );

  log.info({ queues: queues.map((q) => q.name) }, 'worker ready with processors registered');

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(queues.map((q) => q.close()));
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  // pino serialises a bare Error to {} unless it is given the message.
  const e = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
  log.error(e, 'worker failed to start');
  process.exit(1);
});
