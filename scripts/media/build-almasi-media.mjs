#!/usr/bin/env node
/**
 * Builds the web renditions of the Almasi imagery and film.
 *
 *   node scripts/media/build-almasi-media.mjs <masters-dir>
 *
 * <masters-dir> holds one master per scene, named by scene id
 * (lib/media-manifest.ts lists them):
 *   street.png, lobby.png …      stills — PNG, JPEG or WebP, any size
 *   street.mp4 …                 optional motion for that scene
 *   street.reverse               optional empty flag: play that motion backwards
 *
 * Writes, all committed and served by Next:
 *   apps/web/public/media/almasi/<id>.jpg          ≤2560px progressive JPEG (next/image derives AVIF/WebP)
 *   apps/web/public/media/almasi/video/<id>-hd.mp4 1280px H.264, silent, faststart
 *   apps/web/public/media/almasi/video/<id>-sd.mp4  854px H.264 for phones and slow links
 *   apps/web/public/media/almasi/video/<id>-poster.jpg  the film's first frame
 *   apps/web/lib/media-data.json                   sizes, blur placeholders, video paths
 *   apps/web/app/opengraph-image.jpg               1200×630 share image
 *
 * Derived crops are declared in DERIVED, so every rendition rebuilds from the
 * masters alone. Video needs ffmpeg: FFMPEG_PATH, else `ffmpeg` on PATH, else
 * the worker's Docker image (`avida-worker`), which ships it.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const sharp = createRequire(join(ROOT, 'apps/worker/package.json'))('sharp');

const SRC = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(SRC)) {
  console.error('usage: node scripts/media/build-almasi-media.mjs <masters-dir>');
  process.exit(1);
}

const OUT = join(ROOT, 'apps/web/public/media/almasi');
const OUT_VIDEO = join(OUT, 'video');
const DATA = join(ROOT, 'apps/web/lib/media-data.json');
const OG = join(ROOT, 'apps/web/app/opengraph-image.jpg');
const MAX_W = 2560;

/** Crops cut from another scene's master, as fractions of that master. */
const DERIVED = {
  'ph-kitchen': { from: 'ph-living', crop: { left: 0.55, top: 0.14, width: 0.45, height: 0.62 } },
  'two-kitchen': { from: 'living-2br', crop: { left: 0.5, top: 0.1, width: 0.46, height: 0.62 } },
  view: { from: 'ph-terrace', crop: { left: 0.4, top: 0.06, width: 0.6, height: 0.6 } },
};

const STILL_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

mkdirSync(OUT_VIDEO, { recursive: true });

const files = readdirSync(SRC);
const stillOf = (id) => {
  const f = files.find((n) => STILL_EXT.has(extname(n).toLowerCase()) && n.slice(0, -extname(n).length) === id);
  return f ? join(SRC, f) : null;
};
const ids = [
  ...new Set(
    files
      .filter((n) => STILL_EXT.has(extname(n).toLowerCase()))
      .map((n) => n.slice(0, -extname(n).length)),
  ),
];

// ─── ffmpeg, wherever it lives ──────────────────────────────────────────
function haveBinary(bin) {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const LOCAL = process.env.FFMPEG_PATH || (haveBinary('ffmpeg') ? 'ffmpeg' : null);
const LOCAL_PROBE = process.env.FFPROBE_PATH || (haveBinary('ffprobe') ? 'ffprobe' : null);
const dockerPath = (p) => p.replace(/\\/g, '/');

/** Runs ffmpeg/ffprobe with /in = masters and /out = video output. */
function av(tool, args) {
  const local = tool === 'ffmpeg' ? LOCAL : LOCAL_PROBE;
  if (local) {
    const map = (a) => a.replace(/^\/in\//, `${SRC}/`).replace(/^\/out\//, `${OUT_VIDEO}/`);
    return execFileSync(local, args.map(map), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return execFileSync(
    'docker',
    [
      'run', '--rm',
      '-v', `${dockerPath(SRC)}:/in`,
      '-v', `${dockerPath(OUT_VIDEO)}:/out`,
      '--entrypoint', tool,
      'avida-worker',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

async function blurOf(input) {
  const buf = await sharp(input).resize(24).webp({ quality: 45 }).toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
}

async function writeStill(id, input) {
  const target = join(OUT, `${id}.jpg`);
  const info = await sharp(input)
    .resize({ width: MAX_W, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toFile(target);
  return { src: `/media/almasi/${id}.jpg`, width: info.width, height: info.height, blur: await blurOf(target) };
}

const data = {};

for (const id of ids) {
  data[id] = await writeStill(id, stillOf(id));
  console.log(`still  ${id.padEnd(12)} ${data[id].width}×${data[id].height}`);
}

for (const [id, { from, crop }] of Object.entries(DERIVED)) {
  const master = stillOf(from);
  if (!master) continue;
  const meta = await sharp(master).metadata();
  const region = {
    left: Math.round(meta.width * crop.left),
    top: Math.round(meta.height * crop.top),
    width: Math.round(meta.width * crop.width),
    height: Math.round(meta.height * crop.height),
  };
  const buffer = await sharp(master).extract(region).toBuffer();
  data[id] = await writeStill(id, buffer);
  console.log(`crop   ${id.padEnd(12)} ${data[id].width}×${data[id].height} from ${from}`);
}

for (const id of ids) {
  const clip = files.find((n) => n === `${id}.mp4`);
  if (!clip) continue;
  const reverse = files.includes(`${id}.reverse`);
  const chain = (w) => `${reverse ? 'reverse,' : ''}scale=${w}:-2:flags=lanczos,fps=24,format=yuv420p`;
  const common = ['-y', '-loglevel', 'error', '-i', `/in/${clip}`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-movflags', '+faststart'];
  av('ffmpeg', [...common, '-vf', chain(1280), '-crf', '23', '-profile:v', 'high', `/out/${id}-hd.mp4`]);
  av('ffmpeg', [...common, '-vf', chain(854), '-crf', '27', '-profile:v', 'main', `/out/${id}-sd.mp4`]);
  av('ffmpeg', ['-y', '-loglevel', 'error', '-i', `/out/${id}-hd.mp4`, '-frames:v', '1', '-q:v', '3', `/out/${id}-poster.jpg`]);
  const seconds = Number(
    av('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `/out/${id}-hd.mp4`]).trim(),
  );
  data[id].video = {
    hd: `/media/almasi/video/${id}-hd.mp4`,
    sd: `/media/almasi/video/${id}-sd.mp4`,
    poster: `/media/almasi/video/${id}-poster.jpg`,
    seconds: Math.round(seconds * 100) / 100,
  };
  console.log(`video  ${id.padEnd(12)} ${data[id].video.seconds}s${reverse ? ' (reversed)' : ''}`);
}

const street = stillOf('street');
if (street) {
  await sharp(street).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 84, mozjpeg: true }).toFile(OG);
  console.log('og     opengraph-image.jpg 1200×630');
}

const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(DATA, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`wrote  ${Object.keys(sorted).length} scenes to apps/web/lib/media-data.json`);
