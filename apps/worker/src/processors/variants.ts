import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { getObject, ORIGINALS_BUCKET, PUBLIC_BUCKET, putObject, exists } from '../storage/r2.js';

/**
 * §5.8 `media:variants` — AVIF and WebP at six widths, plus a thumbhash and the
 * dominant colour.
 *
 * §5.8 also requires idempotence: derivative keys are derived from the original
 * key and the width, so re-running a job overwrites identical bytes rather than
 * producing a second set.
 */

/** §6.6 — the hero budget is 180KB at 1440w, which quality 50 AVIF meets. */
export const WIDTHS = [400, 800, 1200, 1600, 2000, 2400] as const;
const AVIF_QUALITY = 50;
const WEBP_QUALITY = 74;

export interface VariantResult {
  variants: { avif: Record<number, string>; webp: Record<number, string> };
  thumbhash: string;
  dominantHex: string;
  width: number;
  height: number;
}

function derivativeKey(originalKey: string, width: number, ext: string): string {
  const stem = originalKey.replace(/\.[^.]+$/, '');
  return `${stem}/${width}.${ext}`;
}

export async function buildVariants(
  originalKey: string,
  opts: { force?: boolean } = {},
): Promise<VariantResult> {
  const input = await getObject(ORIGINALS_BUCKET, originalKey);
  const image = sharp(input, { failOn: 'none' });
  const meta = await image.metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;

  const variants: VariantResult['variants'] = { avif: {}, webp: {} };

  for (const width of WIDTHS) {
    // Never upscale: a 400px "2400w" variant is a bigger file that looks worse.
    if (sourceWidth > 0 && width > sourceWidth) continue;

    for (const [format, quality, ext] of [
      ['avif', AVIF_QUALITY, 'avif'],
      ['webp', WEBP_QUALITY, 'webp'],
    ] as const) {
      const key = derivativeKey(originalKey, width, ext);
      variants[format][width] = key;

      if (!opts.force && (await exists(PUBLIC_BUCKET, key))) continue;

      const buffer = await sharp(input, { failOn: 'none' })
        .resize({ width, withoutEnlargement: true })
        .toFormat(format, { quality })
        .toBuffer();
      await putObject(PUBLIC_BUCKET, key, buffer, `image/${format}`);
    }
  }

  // Thumbhash wants a small RGBA raster — at most 100px on the long edge.
  const { data, info } = await sharp(input, { failOn: 'none' })
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hash = rgbaToThumbHash(info.width, info.height, data);

  const stats = await sharp(input, { failOn: 'none' }).stats();
  const { r, g, b } = stats.dominant;
  const dominantHex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

  return {
    variants,
    thumbhash: Buffer.from(hash).toString('base64'),
    dominantHex,
    width: sourceWidth,
    height: sourceHeight,
  };
}
