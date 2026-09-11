#!/usr/bin/env node
/**
 * Renders the Almasi film: the scene clips cut together with crossfades, a
 * title card at each end and a caption on every shot — one MP4 the site plays
 * and the sales team can send.
 *
 *   node scripts/media/render-almasi-film.mjs <fonts-dir>
 *
 * Reads the HD renditions written by build-almasi-media.mjs, so run that first.
 * <fonts-dir> must hold InstrumentSerif-Regular.ttf, InstrumentSerif-Italic.ttf
 * and InstrumentSans-Regular.ttf (OFL; ffmpeg's drawtext needs TTF, and the
 * site's own faces ship only as WOFF2).
 *
 * Writes apps/web/public/media/almasi/video/almasi-film-{hd,sd}.mp4, a poster,
 * and apps/web/lib/film-data.json (duration and chapter times for the player).
 * Needs ffmpeg with drawtext and xfade: FFMPEG_PATH, `ffmpeg` on PATH, or the
 * worker's Docker image.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FONTS = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(FONTS, 'InstrumentSerif-Regular.ttf'))) {
  console.error('usage: node scripts/media/render-almasi-film.mjs <fonts-dir-with-Instrument-TTFs>');
  process.exit(1);
}

const VIDEO = join(ROOT, 'apps/web/public/media/almasi/video');
const WORK = join(VIDEO, '.film-work');
const DATA = join(ROOT, 'apps/web/lib/film-data.json');
const FADE = 0.8;
const W = 1280;
const H = 720;

/** The cut, in order. Every clip here must exist as <scene>-hd.mp4. */
const SHOTS = [
  { scene: 'aerial', title: 'Kimihurura', place: 'Above Kigali' },
  { scene: 'street', title: 'Almasi Residences', place: 'KG 15 Ave' },
  { scene: 'arrival', title: 'The entrance', place: 'Ground floor' },
  { scene: 'lobby', title: 'Reception', place: 'Ground floor' },
  { scene: 'pool', title: 'The pool deck', place: 'Level 1' },
  { scene: 'one-living', title: 'A residence', place: 'Level 2' },
  { scene: 'living-2br', title: 'Space to live', place: 'Two bedroom' },
  { scene: 'ph-living', title: 'The penthouse', place: 'Level 4' },
  { scene: 'ph-bedroom', title: 'The master suite', place: 'Level 4' },
  { scene: 'ph-terrace', title: 'Your view of Kigali', place: 'The roof' },
];

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
for (const f of ['InstrumentSerif-Regular.ttf', 'InstrumentSerif-Italic.ttf', 'InstrumentSans-Regular.ttf']) {
  copyFileSync(join(FONTS, f), join(WORK, f));
}

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

/** /v = the video renditions, /w = the scratch directory (fonts, text files, segments). */
function av(tool, args) {
  const local = tool === 'ffmpeg' ? LOCAL : LOCAL_PROBE;
  if (local) {
    const map = (a) => a.replaceAll('/v/', `${dockerPath(VIDEO)}/`).replaceAll('/w/', `${dockerPath(WORK)}/`);
    return execFileSync(local, args.map(map), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return execFileSync(
    'docker',
    ['run', '--rm', '-v', `${dockerPath(VIDEO)}:/v`, '-v', `${dockerPath(WORK)}:/w`, '--entrypoint', tool, 'avida-worker', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

const duration = (file) =>
  Number(av('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());

let textId = 0;
/** drawtext reads its words from a file, so no text ever needs filter escaping. */
function text(content, { font, size, x, y, alpha = 1, from = 0, to = 999 }) {
  const file = `t${textId++}.txt`;
  writeFileSync(join(WORK, file), content);
  const fade = `if(lt(t,${from}),0,if(lt(t,${from + 0.6}),(t-${from})/0.6,if(lt(t,${to - 0.6}),1,if(lt(t,${to}),(${to}-t)/0.6,0))))`;
  return `drawtext=fontfile=/w/${font}:textfile=/w/${file}:fontsize=${size}:fontcolor=0xEFEBE3:x=${x}:y=${y}:alpha='${alpha}*${fade}'`;
}

const common = ['-an', '-r', '24', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16'];

// ─── Title cards ────────────────────────────────────────────────────────
function card(name, seconds, filters) {
  av('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=0x0C0D0B:s=${W}x${H}:r=24:d=${seconds}`,
    '-vf', filters.join(','),
    ...common, `/w/${name}.mp4`,
  ]);
  return { file: `/w/${name}.mp4`, seconds };
}

const opening = card('opening', 4.2, [
  text('Almasi Residences', { font: 'InstrumentSerif-Regular.ttf', size: 76, x: '(w-text_w)/2', y: '(h-text_h)/2-24', from: 0.5, to: 4.2 }),
  text('Kimihurura, Kigali', { font: 'InstrumentSans-Regular.ttf', size: 22, x: '(w-text_w)/2', y: '(h/2)+44', alpha: 0.7, from: 1.1, to: 4.2 }),
]);

const closing = card('closing', 6.4, [
  text('Almasi Residences', { font: 'InstrumentSerif-Regular.ttf', size: 76, x: '(w-text_w)/2', y: '(h-text_h)/2-40', from: 0.6, to: 6.4 }),
  text('Kimihurura, Kigali', { font: 'InstrumentSans-Regular.ttf', size: 22, x: '(w-text_w)/2', y: '(h/2)+28', alpha: 0.7, from: 1.0, to: 6.4 }),
  text('Private residences. Distinctly Kigali.', { font: 'InstrumentSerif-Italic.ttf', size: 34, x: '(w-text_w)/2', y: '(h/2)+96', from: 2.0, to: 6.4 }),
]);

// ─── Shots, each with its caption ───────────────────────────────────────
const shots = SHOTS.map((s, i) => {
  const src = `/v/${s.scene}-hd.mp4`;
  const seconds = duration(src);
  const out = `/w/shot${i}.mp4`;
  av('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      // A soft floor of shade under the words, the way a film grades a lower third.
      `drawbox=x=0:y=ih*0.62:w=iw:h=ih*0.38:color=0x0C0D0B@0.35:t=fill`,
      text(s.place, { font: 'InstrumentSans-Regular.ttf', size: 20, x: 64, y: 'h-150', alpha: 0.75, from: 0.5, to: seconds - 0.2 }),
      text(s.title, { font: 'InstrumentSerif-Regular.ttf', size: 54, x: 64, y: 'h-118', from: 0.7, to: seconds - 0.2 }),
    ].join(','),
    ...common, out,
  ]);
  return { ...s, file: out, seconds };
});

// ─── The cut ────────────────────────────────────────────────────────────
const parts = [opening, ...shots, closing];
const inputs = parts.flatMap((p) => ['-i', p.file]);
// xfade insists on identical timebase, rate, format and aspect on both sides.
const norm = parts.map((_, i) => `[${i}:v]settb=AVTB,fps=24,format=yuv420p,setsar=1[n${i}]`);
const chain = [];
let offset = 0;
let last = '[n0]';
const starts = [0];
for (let i = 1; i < parts.length; i++) {
  offset += parts[i - 1].seconds - FADE;
  starts.push(offset);
  const label = i === parts.length - 1 ? '[out]' : `[x${i}]`;
  chain.push(`${last}[n${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label}`);
  last = label;
}
const total = offset + parts.at(-1).seconds;

av('ffmpeg', [
  '-y', '-loglevel', 'error', ...inputs,
  '-filter_complex', [...norm, ...chain].join(';'),
  '-map', '[out]', '-an', '-r', '24', '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-profile:v', 'high', '-movflags', '+faststart',
  '/v/almasi-film-hd.mp4',
]);
av('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', '/v/almasi-film-hd.mp4',
  '-vf', 'scale=854:-2:flags=lanczos', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'main', '-movflags', '+faststart',
  '/v/almasi-film-sd.mp4',
]);
av('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(starts[2] + 2), '-i', '/v/almasi-film-hd.mp4', '-frames:v', '1', '-q:v', '3', '/v/almasi-film-poster.jpg']);

const chapters = shots.map((s, i) => ({ t: Math.round(starts[i + 1] * 100) / 100, title: s.title, place: s.place, scene: s.scene }));
writeFileSync(
  DATA,
  `${JSON.stringify(
    {
      duration: Math.round(total * 100) / 100,
      hd: '/media/almasi/video/almasi-film-hd.mp4',
      sd: '/media/almasi/video/almasi-film-sd.mp4',
      poster: '/media/almasi/video/almasi-film-poster.jpg',
      chapters,
    },
    null,
    2,
  )}\n`,
);
rmSync(WORK, { recursive: true, force: true });
console.log(`film  ${total.toFixed(1)}s, ${chapters.length} chapters → apps/web/public/media/almasi/video/almasi-film-hd.mp4`);
console.log(`fileSize ${(Number(readFileSync(DATA).length))} bytes of chapter data written`);
