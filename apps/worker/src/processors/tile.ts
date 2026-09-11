import sharp from 'sharp';
import { getObject, ORIGINALS_BUCKET, PUBLIC_BUCKET, putObject } from '../storage/r2.js';

/**
 * §5.8 `media:tile` and §7.5 — equirectangular panorama to cube faces to tiles.
 *
 * Photo Sphere Viewer's cubemap adapter wants six faces; tiling them into three
 * levels lets the viewer show a recognisable scene in ~1s on 4G (§9 Phase 3
 * acceptance) by fetching only the level and direction it needs.
 */

const FACE_SIZE = 2048;
const LEVELS = [512, 1024, 2048] as const;
const TILE_SIZE = 512;
const PREVIEW = { width: 1024, height: 512 };

/** Order matters: PSV expects left, front, right, back, top, bottom. */
const FACES = ['left', 'front', 'right', 'back', 'top', 'bottom'] as const;
type Face = (typeof FACES)[number];

export interface TileManifest {
  faceSize: number;
  levels: { size: number; tileSize: number; prefix: string }[];
  previewKey: string;
  faces: readonly string[];
}

/**
 * Direction vector for a pixel on a cube face, in the orientation PSV uses.
 * (u, v) run -1..1 across the face.
 */
function faceVector(face: Face, u: number, v: number): [number, number, number] {
  switch (face) {
    case 'front': return [u, -v, 1];
    case 'back': return [-u, -v, -1];
    case 'left': return [-1, -v, u];
    case 'right': return [1, -v, -u];
    case 'top': return [u, 1, v];
    case 'bottom': return [u, -1, -v];
  }
}

/**
 * Reproject one cube face out of an equirectangular source.
 *
 * Written directly rather than shelled out to a panorama tool: the projection
 * is twenty lines, and a build dependency on a CLI that may not exist in the
 * deploy image is a worse trade than owning the arithmetic.
 */
async function renderFace(
  equirect: Buffer,
  srcWidth: number,
  srcHeight: number,
  face: Face,
  size: number,
): Promise<Buffer> {
  const { data: src } = await sharp(equirect, { failOn: 'none' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    const v = (2 * (y + 0.5)) / size - 1;
    for (let x = 0; x < size; x++) {
      const u = (2 * (x + 0.5)) / size - 1;
      const [dx, dy, dz] = faceVector(face, u, v);
      const len = Math.hypot(dx, dy, dz);

      // Direction → spherical → equirectangular pixel.
      const lon = Math.atan2(dx / len, dz / len);
      const lat = Math.asin(dy / len);
      const sx = Math.min(srcWidth - 1, Math.max(0, Math.floor(((lon / Math.PI + 1) / 2) * srcWidth)));
      const sy = Math.min(srcHeight - 1, Math.max(0, Math.floor(((0.5 - lat / Math.PI) * srcHeight))));

      const si = (sy * srcWidth + sx) * 3;
      const di = (y * size + x) * 3;
      out[di] = src[si] ?? 0;
      out[di + 1] = src[si + 1] ?? 0;
      out[di + 2] = src[si + 2] ?? 0;
    }
  }

  return sharp(out, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

export async function tilePanorama(sceneKey: string, originalKey: string): Promise<TileManifest> {
  const equirect = await getObject(ORIGINALS_BUCKET, originalKey);
  const meta = await sharp(equirect, { failOn: 'none' }).metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  if (srcWidth < srcHeight * 1.9) {
    throw new Error(
      `Panorama ${originalKey} is ${srcWidth}×${srcHeight}; an equirectangular source must be 2:1 (§7.5)`,
    );
  }

  // §6.6 — the preview is what makes the first second of a scene bearable on 4G.
  const preview = await sharp(equirect, { failOn: 'none' })
    .resize(PREVIEW.width, PREVIEW.height, { fit: 'fill' })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
  const previewKey = `${sceneKey}/preview.jpg`;
  await putObject(PUBLIC_BUCKET, previewKey, preview, 'image/jpeg');

  const levels: TileManifest['levels'] = [];

  for (const face of FACES) {
    const full = await renderFace(equirect, srcWidth, srcHeight, face, FACE_SIZE);

    for (const size of LEVELS) {
      const scaled =
        size === FACE_SIZE
          ? full
          : await sharp(full).resize(size, size).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

      const perSide = Math.max(1, size / TILE_SIZE);
      for (let ty = 0; ty < perSide; ty++) {
        for (let tx = 0; tx < perSide; tx++) {
          const tile = await sharp(scaled)
            .extract({
              left: tx * TILE_SIZE,
              top: ty * TILE_SIZE,
              width: Math.min(TILE_SIZE, size),
              height: Math.min(TILE_SIZE, size),
            })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();
          await putObject(
            PUBLIC_BUCKET,
            `${sceneKey}/${size}/${face}/${tx}_${ty}.jpg`,
            tile,
            'image/jpeg',
          );
        }
      }
    }
  }

  for (const size of LEVELS) {
    levels.push({ size, tileSize: TILE_SIZE, prefix: `${sceneKey}/${size}` });
  }

  return { faceSize: FACE_SIZE, levels, previewKey, faces: FACES };
}
