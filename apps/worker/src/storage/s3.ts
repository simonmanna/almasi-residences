import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * §3.1 — Cloudflare R2 in production, MinIO locally. Both speak S3, so one
 * client covers both; `R2_ENDPOINT` is what switches between them.
 *
 * §5.9 — originals live in a private bucket, derivatives in the public one.
 * Nothing here ever writes an original to the public bucket.
 */
const endpoint = process.env.R2_ENDPOINT;
const accountId = process.env.R2_ACCOUNT_ID;

export const PUBLIC_BUCKET = process.env.R2_BUCKET ?? 'avida-media';
export const ORIGINALS_BUCKET = process.env.R2_ORIGINALS_BUCKET ?? 'avida-originals';

export const s3 = new S3Client({
  region: process.env.R2_REGION ?? 'auto',
  endpoint: endpoint ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
  // MinIO serves path-style URLs; R2 accepts them too.
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export async function getObject(bucket: string, key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // §11 — derivative keys are content-addressed, so they are immutable and
      // can be cached for a year at the edge.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export async function exists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
