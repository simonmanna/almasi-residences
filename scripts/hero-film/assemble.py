"""Assemble the hero film from generated shots into web + master deliverables.

  uv run --with imageio-ffmpeg python scripts/hero-film/assemble.py [--master] [--src DIR --out DIR (dry run)]

Reads scripts/hero-film/shots.json and the clips in media-src/hero-film/
({desktop,mobile}/NN.mp4, one per shot id). Each shot is trimmed, graded,
joined with short dissolves, and the tail is dissolved into the head so the
loop point is invisible. Writes versioned files to apps/web/public/media/hero/vN
(immutable cache: bump "version" in shots.json on every change) and switches
the site on via apps/web/lib/hero-film.json.
"""
import json, subprocess, sys, shutil, tempfile
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
FF = imageio_ffmpeg.get_ffmpeg_exe()
CFG = json.loads((ROOT / 'scripts/hero-film/shots.json').read_text())
ARGS = dict(zip(sys.argv[1::2], sys.argv[2::2]))
SRC = Path(ARGS.get('--src', ROOT / 'media-src/hero-film'))
DRY = '--out' in ARGS
OUT = Path(ARGS['--out']) if DRY else ROOT / f"apps/web/public/media/hero/v{CFG['version']}"
FPS = 24  # the generated shots' native rate; resampling to 30 would judder
D, LD = CFG['dissolve'], CFG['loopDissolve']


def run(*a):
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', *map(str, a)], check=True)


def build(kind, w, h, tmp):
    """Normalise, trim and dissolve the shots; return a lossless intermediate."""
    clips = []
    for s in CFG['shots']:
        src = SRC / kind / f"{s['id']:02d}.mp4"
        if not src.exists() and kind == 'mobile':
            src = SRC / 'desktop' / f"{s['id']:02d}.mp4"  # fall back to a centred crop
        out = tmp / f"{kind}_{s['id']:02d}.mkv"
        vf = (f"trim={s['in']}:{s['out']},setpts=PTS-STARTPTS,fps={FPS},"
              f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},{CFG['grade']},format=yuv420p")
        run('-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', out)
        clips.append((out, s['out'] - s['in']))
    # chain dissolves
    inputs, parts, t, prev = [], [], 0., '0:v'
    for i, (c, _) in enumerate(clips):
        inputs += ['-i', c]
    for i in range(1, len(clips)):
        t += clips[i - 1][1] - D
        lab = f'x{i}'
        parts.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={D}:offset={t:.3f}[{lab}]')
        prev = lab
    total = t + clips[-1][1]
    seq = tmp / f'{kind}_seq.mkv'
    run(*inputs, '-filter_complex', ';'.join(parts), '-map', f'[{prev}]', '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', seq)
    # seamless loop: body = [LD, total-LD], then tail dissolved into head
    loop = tmp / f'{kind}_loop.mkv'
    fc = (f'[0:v]split=3[a][b][c];'
          f'[a]trim=0:{LD},setpts=PTS-STARTPTS,fps={FPS}[head];'
          f'[b]trim={LD}:{total - LD:.3f},setpts=PTS-STARTPTS,fps={FPS}[body];'
          f'[c]trim={total - LD:.3f}:{total:.3f},setpts=PTS-STARTPTS,fps={FPS}[tail];'
          f'[tail][head]xfade=transition=fade:duration={LD - 1 / FPS:.3f}:offset=0[seam];'
          f'[body][seam]concat=n=2:v=1[out]')
    run('-i', seq, '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', loop)
    return loop


def encode(src, name, w, h, crf_vp9, crf_x264, cap):
    run('-i', src, '-an', '-vf', f'scale={w}:{h}:flags=lanczos', '-c:v', 'libvpx-vp9', '-crf', crf_vp9, '-b:v', '0', '-maxrate', cap, '-bufsize', cap,
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', FPS * 2, '-pix_fmt', 'yuv420p', OUT / f'{name}.webm')
    run('-i', src, '-an', '-vf', f'scale={w}:{h}:flags=lanczos', '-c:v', 'libx264', '-crf', crf_x264, '-maxrate', cap, '-bufsize', cap, '-preset', 'slow',
        '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', FPS * 2, '-movflags', '+faststart', OUT / f'{name}.mp4')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    try:
        desk = build('desktop', 2560, 1440, tmp)
        encode(desk, 'hero-1440', 2560, 1440, 35, 24, '4M')
        encode(desk, 'hero-1080', 1920, 1080, 36, 25, '2.5M')
        mob = build('mobile', 1080, 1920, tmp)
        encode(mob, 'hero-mobile', 1080, 1920, 38, 26, '1.8M')
        # poster: a frame of the chosen shot, so the swap to video is gentle
        at = sum(s['out'] - s['in'] - D for s in CFG['shots'][:CFG['posterShot'] - 1]) + CFG['posterAt'] - LD
        for name, src in (('poster', desk), ('poster-mobile', mob)):
            run('-ss', f'{at:.2f}', '-i', src, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', OUT / f'{name}.webp')
            run('-ss', f'{at:.2f}', '-i', src, '-frames:v', '1', '-q:v', '3', OUT / f'{name}.jpg')
        if '--master' in sys.argv and not DRY:
            # AI shots are 1080p sources: the 4K/60 master is an interpolated upscale for editing and big screens.
            master = ROOT / 'media-src/hero-film/almasi-hero-master-2160p60.mp4'
            run('-i', desk, '-an', '-vf', 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1,scale=3840:2160:flags=lanczos',
                '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', master)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if DRY:
        for f in sorted(OUT.iterdir()):
            print(f'{f.name:24s} {f.stat().st_size / 1e6:6.2f} MB')
        return
    manifest = ROOT / 'apps/web/lib/hero-film.json'
    m = json.loads(manifest.read_text())
    m.update(enabled=True, base=f"/media/hero/v{CFG['version']}", poster=f"/media/hero/v{CFG['version']}/poster.webp")
    manifest.write_text(json.dumps(m, indent=2) + '\n')
    for f in sorted(OUT.iterdir()):
        print(f'{f.name:24s} {f.stat().st_size / 1e6:6.2f} MB')


if __name__ == '__main__':
    main()
