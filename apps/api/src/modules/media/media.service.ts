import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { TIME_STATES } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';
import type { UploadUrlDto } from './media.dto.js';

/** §5.9 — a presigned URL expires in five minutes and accepts exactly one key. */
const PRESIGN_TTL_SECONDS = 300;

/** Matches the worker's queue names (hyphenated — BullMQ rejects colons). */
const QUEUE_VARIANTS = 'media-variants';
const QUEUE_DEPTH = 'media-depth';
const QUEUE_VIDEO = 'video-encode';

@Injectable()
export class MediaService {
  private readonly log = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly redis: IORedis | null;
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly prisma: PrismaService) {
    this.s3 = new S3Client({
      region: process.env.R2_REGION ?? 'auto',
      endpoint:
        process.env.R2_ENDPOINT ??
        (process.env.R2_ACCOUNT_ID
          ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
          : undefined),
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });

    const url = process.env.REDIS_URL;
    this.redis = url ? new IORedis(url, { maxRetriesPerRequest: null }) : null;
  }

  private queue(name: string): Queue | null {
    if (!this.redis) return null;
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis });
      this.queues.set(name, q);
    }
    return q;
  }

  /**
   * §5.4 — a presigned PUT plus the asset row it will fill. The URL is scoped
   * to one key, one content type and one maximum length (§5.9): a presigned URL
   * that accepts any key is an open bucket.
   */
  async createUploadUrl(dto: UploadUrlDto) {
    const set = await this.prisma.client.mediaSet.findFirst({
      where: { key: dto.mediaSetKey },
      select: { id: true, key: true },
    });
    if (!set) throw new NotFoundException(`No media set "${dto.mediaSetKey}"`);

    const extension = dto.filename.split('.').pop()?.toLowerCase() ?? 'bin';
    if (!/^[a-z0-9]{2,5}$/.test(extension)) {
      throw new BadRequestException('Unrecognised file extension');
    }

    // Originals are content-addressed by a random id, never by the uploaded
    // filename: a filename is attacker-controlled and can collide.
    const originalKey = `originals/${set.key}/${dto.timeState.toLowerCase()}/${randomUUID()}.${extension}`;

    const asset = await this.prisma.client.mediaAsset.upsert({
      where: {
        mediaSetId_timeState_role: {
          mediaSetId: set.id,
          timeState: dto.timeState as never,
          role: (dto.role ?? 'PRIMARY') as never,
        },
      },
      create: {
        mediaSetId: set.id,
        timeState: dto.timeState as never,
        role: (dto.role ?? 'PRIMARY') as never,
        originalKey,
        width: 0,
        height: 0,
        variants: {},
        thumbhash: '',
      },
      update: { originalKey, variants: {}, thumbhash: '' },
      select: { id: true },
    });

    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: process.env.R2_ORIGINALS_BUCKET ?? 'avida-originals',
        Key: originalKey,
        ContentType: dto.contentType,
        ContentLength: dto.contentLength,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    return { assetId: asset.id, originalKey, url, expiresInSeconds: PRESIGN_TTL_SECONDS };
  }

  /** §5.4 — called once the browser's PUT succeeds; enqueues the pipeline. */
  async completeUpload(assetId: string) {
    const asset = await this.prisma.client.mediaAsset.findUnique({
      where: { id: assetId },
      select: { id: true, originalKey: true, mediaSet: { select: { kind: true } } },
    });
    if (!asset) throw new NotFoundException(`No asset ${assetId}`);

    const payload = { assetId: asset.id, originalKey: asset.originalKey };
    const isVideo = /\.(mp4|mov)$/i.test(asset.originalKey);

    if (isVideo) {
      await this.queue(QUEUE_VIDEO)?.add('encode', payload);
    } else {
      await this.queue(QUEUE_VARIANTS)?.add('variants', payload);
      // §8.1 — only the exterior and aerial sets drive the parallax hero, so
      // only they need a depth map.
      if (asset.mediaSet.kind === 'EXTERIOR' || asset.mediaSet.kind === 'AERIAL') {
        await this.queue(QUEUE_DEPTH)?.add('depth', payload);
      }
    }

    if (!this.redis) {
      this.log.warn('REDIS_URL is not set; upload recorded but no processing was enqueued');
    }
    return { queued: this.redis !== null };
  }

  /**
   * §9 Phase 2 task 8 — the media board. Flags any set missing a required time
   * state so a gap is caught before launch rather than by a visitor (§4.3).
   */
  async board() {
    const sets = await this.prisma.client.mediaSet.findMany({
      include: { assets: { select: { timeState: true, thumbhash: true, depthKey: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const required = (kind: string) =>
      kind === 'EXTERIOR' || kind === 'AERIAL'
        ? TIME_STATES.map((s) => s.toUpperCase())
        : kind === 'INTERIOR'
          ? ['DAY', 'NIGHT']
          : ['DAY'];

    return sets.map((set) => {
      const have = new Set(set.assets.map((a) => a.timeState));
      const missing = required(set.kind).filter((s) => !have.has(s as never));
      return {
        id: set.id,
        key: set.key,
        label: set.label,
        kind: set.kind,
        present: [...have],
        missing,
        // A processed asset has a thumbhash; one that has only been uploaded does not.
        unprocessed: set.assets.filter((a) => !a.thumbhash).length,
        complete: missing.length === 0,
      };
    });
  }

  async jobs() {
    return this.prisma.client.mediaJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
