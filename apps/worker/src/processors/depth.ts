import sharp from 'sharp';
import { getObject, ORIGINALS_BUCKET, PUBLIC_BUCKET, putObject } from '../storage/r2.js';

/**
 * §5.8 `media:depth` and §7.4.
 *
 * §7.4 is explicit about the order of preference: a Blender Z-depth pass
 * exported alongside the beauty render is dramatically better than an inferred
 * depth map. So this processor prefers a supplied pass and only falls back to
 * inference.
 *
 * The inference path needs Depth Anything V2 as ONNX at DEPTH_MODEL_PATH. When
 * that is not configured, the job reports `skipped` rather than inventing a
 * depth map — a fabricated one produces a parallax that misrepresents the
 * building's geometry, which §13 forbids. The hero then falls back to a flat
 * image, which §8.1 already specifies as the degradation path.
 */

export type DepthOutcome =
  | { status: 'supplied'; depthKey: string }
  | { status: 'inferred'; depthKey: string }
  | { status: 'skipped'; reason: string };

/** A supplied pass is expected next to the original, as `<stem>.depth.png`. */
export function suppliedDepthKey(originalKey: string): string {
  return `${originalKey.replace(/\.[^.]+$/, '')}.depth.png`;
}

export function depthDerivativeKey(originalKey: string): string {
  return `${originalKey.replace(/\.[^.]+$/, '')}/depth.png`;
}

export async function buildDepthMap(originalKey: string): Promise<DepthOutcome> {
  const outKey = depthDerivativeKey(originalKey);

  // 1. Preferred: the render team supplied a Z-depth pass.
  try {
    const supplied = await getObject(ORIGINALS_BUCKET, suppliedDepthKey(originalKey));
    // Normalise to 8-bit greyscale at half the beauty resolution (§7.4).
    const normalised = await sharp(supplied, { failOn: 'none' })
      .greyscale()
      .normalise()
      .png({ compressionLevel: 9 })
      .toBuffer();
    await putObject(PUBLIC_BUCKET, outKey, normalised, 'image/png');
    return { status: 'supplied', depthKey: outKey };
  } catch {
    // No supplied pass — fall through to inference.
  }

  // 2. Fallback: Depth Anything V2, when a model is configured.
  const modelPath = process.env.DEPTH_MODEL_PATH;
  if (!modelPath) {
    return {
      status: 'skipped',
      reason:
        'No Z-depth pass supplied and DEPTH_MODEL_PATH is not set. The hero will render flat (§8.1).',
    };
  }

  const { inferDepth } = await import('./depth-onnx.js');
  const source = await getObject(ORIGINALS_BUCKET, originalKey);
  const png = await inferDepth(source, modelPath);
  await putObject(PUBLIC_BUCKET, outKey, png, 'image/png');
  return { status: 'inferred', depthKey: outKey };
}
