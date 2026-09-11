import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getObject, ORIGINALS_BUCKET, PUBLIC_BUCKET, putObject } from '../storage/r2.js';

const run = promisify(execFile);

/**
 * §5.8 `video:encode` — an HLS ladder plus an MP4 fallback and a poster (§7.3).
 *
 * fluent-ffmpeg is not used: it shells out to the same binary but adds a layer
 * that makes failures harder to read. This calls ffmpeg directly and surfaces
 * its stderr, which is what an operator actually needs when an encode fails.
 */

const LADDER = [
  { height: 1080, bitrate: '5000k', maxrate: '5350k', bufsize: '7500k' },
  { height: 720, bitrate: '2800k', maxrate: '2996k', bufsize: '4200k' },
  { height: 480, bitrate: '1400k', maxrate: '1498k', bufsize: '2100k' },
] as const;

export interface VideoResult {
  hlsKey: string;
  mp4Key: string;
  posterKey: string;
  durationSec: number;
}

function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

function ffprobePath(): string {
  return process.env.FFPROBE_PATH ?? 'ffprobe';
}

export async function assertFfmpegAvailable(): Promise<void> {
  try {
    await run(ffmpegPath(), ['-version']);
  } catch {
    throw new Error(
      `ffmpeg not found at "${ffmpegPath()}". Install it or set FFMPEG_PATH; ` +
        'video encoding cannot run without it.',
    );
  }
}

export async function encodeVideo(originalKey: string): Promise<VideoResult> {
  await assertFfmpegAvailable();

  const dir = await mkdtemp(join(tmpdir(), 'avida-video-'));
  try {
    const source = join(dir, 'source');
    await writeFile(source, await getObject(ORIGINALS_BUCKET, originalKey));

    const { stdout } = await run(ffprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      source,
    ]);
    const durationSec = Number.parseFloat(stdout.trim()) || 0;

    const stem = originalKey.replace(/\.[^.]+$/, '');
    const outDir = join(dir, 'out');

    // One pass produces every rung plus the master playlist.
    const args: string[] = ['-y', '-i', source];
    const varStreamMap: string[] = [];
    LADDER.forEach((rung, i) => {
      args.push(
        '-map', '0:v:0',
        `-c:v:${i}`, 'libx264',
        `-b:v:${i}`, rung.bitrate,
        `-maxrate:v:${i}`, rung.maxrate,
        `-bufsize:v:${i}`, rung.bufsize,
        `-vf:v:${i}`, `scale=-2:${rung.height}`,
      );
      varStreamMap.push(`v:${i}`);
    });
    args.push(
      '-preset', 'medium',
      '-g', '48',
      '-keyint_min', '48',
      '-sc_threshold', '0',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', join(outDir, 'stream_%v_%03d.ts'),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', varStreamMap.join(' '),
      join(outDir, 'stream_%v.m3u8'),
    );

    await run('mkdir', ['-p', outDir]);
    await run(ffmpegPath(), args, { maxBuffer: 32 * 1024 * 1024 });

    for (const file of await readdir(outDir)) {
      const body = await readFile(join(outDir, file));
      const type = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
      await putObject(PUBLIC_BUCKET, `${stem}/hls/${file}`, body, type);
    }

    // §8.1 — the MP4 fallback for anything that cannot play HLS.
    const mp4 = join(dir, 'fallback.mp4');
    await run(
      ffmpegPath(),
      ['-y', '-i', source, '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
       '-vf', 'scale=-2:720', '-movflags', '+faststart', mp4],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const mp4Key = `${stem}/fallback.mp4`;
    await putObject(PUBLIC_BUCKET, mp4Key, await readFile(mp4), 'video/mp4');

    // §7.3 — a WebP poster, so the player has something before the first byte
    // of video arrives.
    const poster = join(dir, 'poster.webp');
    await run(ffmpegPath(), ['-y', '-i', source, '-frames:v', '1', '-vf', 'scale=-2:720', poster]);
    const posterKey = `${stem}/poster.webp`;
    await putObject(PUBLIC_BUCKET, posterKey, await readFile(poster), 'image/webp');

    return { hlsKey: `${stem}/hls/master.m3u8`, mp4Key, posterKey, durationSec };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
