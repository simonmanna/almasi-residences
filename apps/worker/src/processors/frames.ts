import sharp from 'sharp';
import { getObject, ORIGINALS_BUCKET, PUBLIC_BUCKET, putObject } from '../storage/r2.js';

/**
 * §5.8 `media:frames` and §7.6 — the scroll-driven sequences.
 *
 * Three AVIF ladders (mobile, tablet, desktop) plus a manifest. §6.6 caps the
 * mobile ladder at 2.5MB for a full loop, which for 120 frames means roughly
 * 20KB a frame: quality 55 at 480w lands there.
 */

export const FRAME_LADDERS = [
  { name: 'mobile', width: 480 },
  { name: 'tablet', width: 960 },
  { name: 'desktop', width: 1440 },
] as const;

const AVIF_QUALITY = 55;

export interface FrameManifest {
  frameCount: number;
  ladders: { name: string; width: number; prefix: string; bytes: number }[];
  loopable: boolean;
}

export async function buildFrameLadders(
  sequenceKey: string,
  frameKeys: string[],
): Promise<FrameManifest> {
  const ladders: FrameManifest['ladders'] = [];

  for (const ladder of FRAME_LADDERS) {
    const prefix = `${sequenceKey}/${ladder.name}`;
    let bytes = 0;

    for (const [index, frameKey] of frameKeys.entries()) {
      const source = await getObject(ORIGINALS_BUCKET, frameKey);
      const avif = await sharp(source, { failOn: 'none' })
        .resize({ width: ladder.width, withoutEnlargement: true })
        .avif({ quality: AVIF_QUALITY })
        .toBuffer();
      bytes += avif.byteLength;
      // Zero-padded so a lexical listing is also frame order.
      const name = String(index).padStart(4, '0');
      await putObject(PUBLIC_BUCKET, `${prefix}/${name}.avif`, avif, 'image/avif');
    }

    ladders.push({ name: ladder.name, width: ladder.width, prefix, bytes });
  }

  const manifest: FrameManifest = {
    frameCount: frameKeys.length,
    ladders,
    // §7.6 — a full orbit returns to its start, so the player can loop it.
    loopable: true,
  };

  await putObject(
    PUBLIC_BUCKET,
    `${sequenceKey}/manifest.json`,
    Buffer.from(JSON.stringify(manifest, null, 2)),
    'application/json',
  );

  const mobile = ladders.find((l) => l.name === 'mobile');
  if (mobile && mobile.bytes > 2.5 * 1024 * 1024) {
    // §6.6 is a budget, not a suggestion. Warn loudly rather than silently
    // shipping a sequence that costs a mobile visitor 4MB.
    console.warn(
      `[frames] ${sequenceKey} mobile ladder is ${(mobile.bytes / 1024 / 1024).toFixed(1)}MB, ` +
        'over the 2.5MB budget in §6.6',
    );
  }

  return manifest;
}
