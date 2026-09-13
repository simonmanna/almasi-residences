import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { IMAGE_WIDTHS, UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES, type MediaKindValue } from '@avida/types';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'model/gltf-binary': 'glb',
};

export const CONTENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION).map(([mime, ext]) => [ext, mime]),
);

/** Raster formats sharp can resize. SVG and GIF are stored as uploaded. */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface StoredFile {
  kind: MediaKindValue;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  variants: Record<string, string> | null;
  blurDataUrl: string | null;
  dominantHex: string | null;
}

/** The shape every API response uses for a media row. */
export interface MediaView {
  id: string;
  kind: string;
  collection: string;
  category: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  published: boolean;
  isCover: boolean;
  sortOrder: number;
  provenance: string;
  focusX: number | null;
  focusY: number | null;
  url: string;
  originalUrl: string;
  thumbUrl: string;
  srcSet: string | null;
  blurDataUrl: string | null;
  dominantHex: string | null;
  unitId: string | null;
  floorId: string | null;
  amenityId: string | null;
  roomId: string | null;
  typologyId: string | null;
  createdAt: Date;
}

type MediaRow = {
  id: string;
  kind: string;
  collection: string;
  category: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  variants: unknown;
  blurDataUrl: string | null;
  dominantHex: string | null;
  published: boolean;
  isCover: boolean;
  sortOrder: number;
  provenance?: string;
  focusX?: number | null;
  focusY?: number | null;
  unitId: string | null;
  floorId: string | null;
  amenityId: string | null;
  roomId: string | null;
  typologyId: string | null;
  createdAt: Date;
};

/**
 * §33 — every upload is validated, stored once as the original, and — for a
 * raster image — rendered to WebP at a ladder of widths plus a tiny blur
 * placeholder, so no page ever downloads the original. Storage is the local
 * disk by default (STORAGE_DRIVER=local, under MEDIA_STORAGE_DIR) and R2 in
 * production (STORAGE_DRIVER=s3). Rows keep keys, never URLs: the URL is
 * computed here, so moving storage does not rewrite the database.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly driver = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
  readonly root = resolve(process.env.MEDIA_STORAGE_DIR || resolve(process.cwd(), '../../storage/media'));
  private s3: S3Client | null = null;

  private client(): S3Client {
    this.s3 ??= new S3Client({
      region: process.env.R2_REGION ?? 'auto',
      endpoint:
        process.env.R2_ENDPOINT ??
        (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined),
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
    return this.s3;
  }

  /** Validates, stores and (for rasters) renders an upload. Throws 400 on anything unacceptable. */
  async store(buffer: Buffer, mimeType: string): Promise<StoredFile> {
    const kind = UPLOAD_MIME_TYPES[mimeType];
    if (!kind) throw new BadRequestException(`Files of type ${mimeType || 'unknown'} cannot be uploaded.`);
    if (buffer.length === 0) throw new BadRequestException('The file is empty.');
    if (buffer.length > UPLOAD_MAX_BYTES[kind]) {
      throw new BadRequestException(`That file is larger than the ${Math.round(UPLOAD_MAX_BYTES[kind] / 1048576)} MB limit.`);
    }
    this.assertSignature(buffer, mimeType);

    const now = new Date();
    const base = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    const storageKey = `${base}/original.${EXTENSION[mimeType]}`;

    let width: number | null = null;
    let height: number | null = null;
    let variants: Record<string, string> | null = null;
    let blurDataUrl: string | null = null;
    let dominantHex: string | null = null;

    if (RESIZABLE.has(mimeType)) {
      // .rotate() honours EXIF orientation, so a phone photo is upright everywhere.
      const image = sharp(buffer, { failOn: 'error' }).rotate();
      const meta = await image.metadata().catch(() => {
        throw new BadRequestException('That image could not be read. Is the file damaged?');
      });
      const upright = (meta.orientation ?? 1) >= 5;
      width = (upright ? meta.height : meta.width) ?? null;
      height = (upright ? meta.width : meta.height) ?? null;

      variants = {};
      // Every ladder width narrower than the image, plus the image's own width
      // when it is under the top of the ladder — never an enlargement.
      const full = width ?? IMAGE_WIDTHS[2];
      const widths: number[] = IMAGE_WIDTHS.filter((w) => w < full);
      if (full <= IMAGE_WIDTHS.at(-1)!) widths.push(full);
      for (const w of widths) {
        const out = await sharp(buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        const key = `${base}/w${w}.webp`;
        await this.put(key, out, 'image/webp');
        variants[String(w)] = key;
      }
      const blur = await sharp(buffer).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
      blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;
      const { dominant } = await sharp(buffer).stats();
      dominantHex = `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }

    await this.put(storageKey, buffer, mimeType);
    return { kind, storageKey, mimeType, sizeBytes: buffer.length, width, height, variants, blurDataUrl, dominantHex };
  }

  /** Every key a media row owns: the original and each rendition. */
  keysOf(row: { storageKey: string; variants: unknown; posterKey?: string | null }): string[] {
    const variantKeys = row.variants && typeof row.variants === 'object' ? Object.values(row.variants as Record<string, string>) : [];
    return [row.storageKey, ...variantKeys, ...(row.posterKey ? [row.posterKey] : [])];
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        if (this.driver === 's3') {
          await this.client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
        } else {
          await rm(this.localPath(key), { force: true });
        }
      } catch (error) {
        // A leftover file costs disk, not correctness; the row is already gone.
        this.log.warn(`Could not delete ${key}: ${(error as Error).message}`);
      }
    }
  }

  publicUrl(key: string): string {
    if (this.driver === 's3') return `${(process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`;
    return `/api/v1/files/${key}`;
  }

  present(m: MediaRow): MediaView {
    const variants = (m.variants && typeof m.variants === 'object' ? m.variants : {}) as Record<string, string>;
    const widths = Object.keys(variants).map(Number).sort((a, b) => a - b);
    const pick = (max: number) => {
      const fit = widths.filter((w) => w <= max);
      const w = fit.at(-1) ?? widths[0];
      return w !== undefined ? this.publicUrl(variants[String(w)]!) : this.publicUrl(m.storageKey);
    };
    return {
      id: m.id,
      kind: m.kind,
      collection: m.collection,
      category: m.category,
      title: m.title,
      caption: m.caption,
      altText: m.altText,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      width: m.width,
      height: m.height,
      published: m.published,
      isCover: m.isCover,
      sortOrder: m.sortOrder,
      provenance: m.provenance ?? 'PHOTOGRAPH',
      focusX: m.focusX ?? null,
      focusY: m.focusY ?? null,
      url: pick(1600),
      originalUrl: this.publicUrl(m.storageKey),
      thumbUrl: pick(400),
      srcSet: widths.length ? widths.map((w) => `${this.publicUrl(variants[String(w)]!)} ${w}w`).join(', ') : null,
      blurDataUrl: m.blurDataUrl,
      dominantHex: m.dominantHex,
      unitId: m.unitId,
      floorId: m.floorId,
      amenityId: m.amenityId,
      roomId: m.roomId,
      typologyId: m.typologyId,
      createdAt: m.createdAt,
    };
  }

  /** Local driver only: the file on disk for a key, refusing anything outside the root. */
  localPath(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new BadRequestException('Invalid file path');
    return path;
  }

  async openLocal(key: string): Promise<{ stream: ReadStream; size: number } | null> {
    if (this.driver !== 'local') return null;
    const path = this.localPath(key);
    try {
      const s = await stat(path);
      if (!s.isFile()) return null;
      return { stream: createReadStream(path), size: s.size };
    } catch {
      return null;
    }
  }

  private async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.driver === 's3') {
      await this.client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  /**
   * §45 — the declared type is the browser's guess. Check the file's own
   * leading bytes, so a script renamed to .jpg is refused rather than stored.
   */
  private assertSignature(buf: Buffer, mimeType: string): void {
    const hex = buf.subarray(0, 12).toString('hex');
    const ascii = buf.subarray(0, 512).toString('latin1');
    const ok: Record<string, () => boolean> = {
      'image/jpeg': () => hex.startsWith('ffd8ff'),
      'image/png': () => hex.startsWith('89504e47'),
      'image/gif': () => ascii.startsWith('GIF8'),
      'image/webp': () => ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP',
      'image/avif': () => ascii.slice(4, 12).startsWith('ftyp'),
      'image/svg+xml': () => /<svg[\s>]/i.test(ascii) || /<\?xml/i.test(ascii),
      'video/mp4': () => ascii.slice(4, 8) === 'ftyp',
      'video/quicktime': () => ascii.slice(4, 8) === 'ftyp' || ascii.slice(4, 8) === 'moov',
      'video/webm': () => hex.startsWith('1a45dfa3'),
      'application/pdf': () => ascii.startsWith('%PDF'),
      'model/gltf-binary': () => ascii.startsWith('glTF'),
    };
    if (!ok[mimeType]?.()) {
      throw new BadRequestException('The file’s contents do not match its type.');
    }
  }
}
