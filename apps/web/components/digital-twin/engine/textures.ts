import * as THREE from 'three';

/** Deterministic value noise, so every visit paints the same stone and timber. */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const grad = new Float32Array(256).map(() => rnd());
  const fade = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X0 = ((xi % period) + period) % period;
    const Y0 = ((yi % period) + period) % period;
    const X1 = (X0 + 1) % period;
    const Y1 = (Y0 + 1) % period;
    const v = (a: number, b: number) => grad[perm[perm[a & 255]! + (b & 255)]!]!;
    const u = fade(xf);
    const w = fade(yf);
    return (v(X0, Y0) * (1 - u) + v(X1, Y0) * u) * (1 - w) + (v(X0, Y1) * (1 - u) + v(X1, Y1) * u) * w;
  };
  /** Tileable fBm in [0, 1]. */
  return (x: number, y: number, period: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += n2(x * f, y * f, period * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

const noise = makeNoise(20260918);

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Paints a tileable noise field through a colour function. */
function field(size: number, period: number, paint: (n: number, x: number, y: number) => [number, number, number], octaves = 4) {
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise((x / size) * period, (y / size) * period, period, octaves);
      const [r, gg, b] = paint(n, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function plasterTexture() {
  return texture(
    field(256, 8, (n) => {
      const v = 226 + (n - 0.5) * 22;
      return [v + 4, v + 1, v - 4];
    }),
  );
}

export function grassTexture() {
  return texture(
    field(512, 16, (n, x, y) => {
      const fine = noise((x / 512) * 96, (y / 512) * 96, 96, 2);
      const t = n * 0.7 + fine * 0.3;
      return [mix(38, 92, t), mix(62, 118, t), mix(26, 48, t)];
    }, 5),
  );
}

/** Dappled foliage: clusters of lit and shaded leaves, tinted per tree. */
export function foliageTexture() {
  return texture(
    field(256, 24, (n, x, y) => {
      const fine = noise((x / 256) * 64, (y / 256) * 64, 64, 2);
      const t = Math.pow(n * 0.55 + fine * 0.45, 1.6);
      const v = 90 + t * 230;
      return [v * 0.92, v, v * 0.82];
    }, 3),
  );
}

export function asphaltTexture() {
  return texture(
    field(512, 32, (n, x, y) => {
      const grit = noise((x / 512) * 180, (y / 512) * 180, 180, 1);
      const v = 30 + n * 20 + grit * 14;
      return [v, v, v + 2];
    }, 3),
  );
}

/** Wet patches: dark where the road holds water, so reflections pool. */
export function puddleRoughness() {
  return texture(
    field(512, 6, (n) => {
      const v = n > 0.52 ? 30 : 150 + (0.52 - n) * 120;
      return [v, v, v];
    }, 4),
    [1, 1],
    false,
  );
}

export function pavingTexture(tint: [number, number, number] = [214, 205, 190]) {
  const size = 512;
  const c = field(size, 12, (n) => [tint[0] + (n - 0.5) * 26, tint[1] + (n - 0.5) * 26, tint[2] + (n - 0.5) * 24]);
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(70,60,50,0.35)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, (i * size) / 4);
    g.lineTo(size, (i * size) / 4);
    g.stroke();
  }
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i <= 2; i++) {
      const x = ((i + (r % 2) * 0.5) * size) / 2;
      g.beginPath();
      g.moveTo(x, (r * size) / 4);
      g.lineTo(x, ((r + 1) * size) / 4);
      g.stroke();
    }
  }
  return texture(c);
}

/** Planks along U. */
export function woodTexture(kind: 'oak' | 'walnut' | 'teak') {
  const base: Record<typeof kind, [number, number, number, number, number, number]> = {
    oak: [196, 158, 116, 150, 110, 74],
    walnut: [112, 74, 50, 66, 42, 28],
    teak: [168, 120, 80, 118, 80, 52],
  };
  const [r0, g0, b0, r1, g1, b1] = base[kind];
  const size = 512;
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  const planks = 6;
  for (let y = 0; y < size; y++) {
    const plank = Math.floor((y / size) * planks);
    const shift = ((plank * 0.37) % 1) * size;
    for (let x = 0; x < size; x++) {
      const u = (x + shift) % size;
      const grain = noise((u / size) * 3, (y / size) * 60 + plank * 7.3, 60, 3);
      const figure = Math.sin((y / size) * 180 + grain * 9 + plank) * 0.5 + 0.5;
      const t = grain * 0.6 + figure * 0.25 + ((plank * 13) % 5) * 0.03;
      const seam = (y * planks) % size < 3 || (u % (size / 1)) < 2 ? 0.55 : 1;
      const i = (y * size + x) * 4;
      img.data[i] = mix(r0, r1, t) * seam;
      img.data[i + 1] = mix(g0, g1, t) * seam;
      img.data[i + 2] = mix(b0, b1, t) * seam;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

/** Calacatta-like: warm white with soft grey and gold veins. */
export function marbleTexture(dark = false) {
  const size = dark ? 512 : 1024;
  return texture(
    field(size, 4, (n, x, y) => {
      const u = x / size;
      const v = y / size;
      const warp = noise(u * 3, v * 3, 4, 5) * (dark ? 2.2 : 0.8) + (dark ? 0 : noise(u * 16, v * 16, 3, 7) * 0.1);
      const vein = Math.abs(Math.sin((u * 1.1 + v * 0.8 + warp) * Math.PI * 1.6));
      const thin = Math.pow(1 - vein, 26);
      if (dark) {
        const base = 38 + n * 18;
        return [base + thin * 150, base + thin * 128, base + thin * 90];
      }
      // Soft grey primary veins, a finer secondary network and a faint halo: Calacatta, not a map.
      const warp2 = noise(u * 7 + 3, v * 7, 3, 9);
      const fine = Math.pow(1 - Math.abs(Math.sin((v * 1.3 - u * 0.7 + warp2 * 0.7) * Math.PI * 3.1)), 40) * 0.5;
      const halo = Math.pow(1 - vein, 5) * 0.22;
      const base = 241 - n * 10;
      const d = thin * 72 + fine * 44 + halo * 30;
      return [base - d * 0.8, base - d * 0.86, base - d * 0.96];
    }, 5),
  );
}

export function fabricTexture(rgb: [number, number, number]) {
  return texture(
    field(256, 64, (n, x, y) => {
      const weave = ((x + y) % 4 < 2 ? 1 : 0.96) * (0.9 + n * 0.2);
      return [rgb[0] * weave, rgb[1] * weave, rgb[2] * weave];
    }, 2),
  );
}

/** A tangent-space normal map from noise: the pool's ripples and soft stone relief. */
export function normalFromNoise(period: number, strength: number, size = 256) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) h[y * size + x] = noise((x / size) * period, (y / size) * period, period, 4);
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)]!;
      const r = h[y * size + ((x + 1) % size)]!;
      const u = h[((y - 1 + size) % size) * size + x]!;
      const d = h[((y + 1) % size) * size + x]!;
      const nx = (l - r) * strength;
      const ny = (u - d) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c, [1, 1], false);
}

/**
 * What a passer-by sees through a lit window: a warm ceiling wash, sheer
 * curtains, a pendant and furniture silhouettes. Four variants break up the grid.
 */
export function interiorCardTexture(variant: number) {
  const W = 256;
  const H = 256;
  const { c, g } = canvas(W, H);
  const hue = [
    ['#FFD9A8', '#E9A968', '#7A4A2A'],
    ['#FFE3BD', '#D9A06A', '#6B4630'],
    ['#FFD2A0', '#CE8E52', '#5A3A24'],
    ['#FFF0D8', '#E6BD8C', '#826048'],
  ][variant % 4]!;
  const back = g.createLinearGradient(0, 0, 0, H);
  back.addColorStop(0, hue[0]!);
  back.addColorStop(0.55, hue[1]!);
  back.addColorStop(1, hue[2]!);
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);
  // Downlight pools on the back wall.
  for (let i = 0; i < 3; i++) {
    const x = (i + 0.5) * (W / 3) + (variant * 17) % 20;
    const rg = g.createRadialGradient(x, 30, 2, x, 70, 90);
    rg.addColorStop(0, 'rgba(255,248,230,0.95)');
    rg.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }
  // Furniture silhouettes.
  g.fillStyle = 'rgba(60,38,24,0.55)';
  if (variant % 2 === 0) {
    g.fillRect(40, 180, 150, 40);
    g.fillRect(34, 160, 20, 60);
    g.fillRect(176, 160, 20, 60);
  } else {
    g.fillRect(70, 170, 110, 12);
    g.fillRect(80, 182, 8, 44);
    g.fillRect(162, 182, 8, 44);
    g.beginPath();
    g.arc(200, 120, 18, 0, Math.PI * 2);
    g.fill();
  }
  // A plant.
  g.fillStyle = 'rgba(40,60,30,0.7)';
  g.beginPath();
  g.ellipse(variant % 2 ? 36 : 220, 170, 18, 38, 0, 0, Math.PI * 2);
  g.fill();
  // Sheer curtains gathered at each side.
  for (const side of [0, 1]) {
    const x0 = side ? W - 60 - variant * 6 : 0;
    const cw = 60 + variant * 6;
    for (let x = 0; x < cw; x += 4) {
      const a = 0.28 + 0.2 * Math.sin((x / cw) * Math.PI * 6);
      g.fillStyle = `rgba(255,246,228,${a.toFixed(3)})`;
      g.fillRect(x0 + x, 0, 3, H);
    }
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The rooftop name, in brass on walnut, as in the renders. */
export function signTexture(text: string) {
  const { c, g } = canvas(1024, 160);
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, '#4A3222');
  bg.addColorStop(1, '#2E1E14');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = 'rgba(232,196,140,0.55)';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 1004, 140);
  g.font = '600 86px Gambetta, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,190,110,0.9)';
  g.shadowBlur = 18;
  const grad = g.createLinearGradient(0, 40, 0, 120);
  grad.addColorStop(0, '#FFE7B8');
  grad.addColorStop(1, '#D8A860');
  g.fillStyle = grad;
  g.fillText(text, 512, 86);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A soft radial sprite: wall-washes under downlights, city lights, garden glow. */
export function glowTexture(inner = 'rgba(255,236,200,1)', outer = 'rgba(255,200,140,0)') {
  const { c, g } = canvas(128);
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, inner);
  rg.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  rg.addColorStop(1, outer);
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A downlight's scallop on a wall: bright at the top, fading in a cone. */
export function scallopTexture() {
  const { c, g } = canvas(128, 256);
  for (let y = 0; y < 256; y++) {
    const t = y / 256;
    const width = 12 + t * 70;
    const a = Math.pow(1 - t, 1.6) * 0.9;
    const rg = g.createLinearGradient(64 - width, 0, 64 + width, 0);
    rg.addColorStop(0, 'rgba(255,214,160,0)');
    rg.addColorStop(0.5, `rgba(255,222,176,${a.toFixed(3)})`);
    rg.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = rg;
    g.fillRect(0, y, 128, 1);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Artwork for the residence walls: warm abstract fields. */
export function artTexture(seed: number) {
  const { c, g } = canvas(256, 320);
  const palettes = [
    ['#E9DCC6', '#C48A5A', '#6E4B35', '#2F3B35'],
    ['#EDE6DA', '#9DA792', '#C9A77C', '#3A342E'],
    ['#F1E9DC', '#B96F4A', '#DDB88A', '#42382F'],
  ];
  const p = palettes[seed % palettes.length]!;
  g.fillStyle = p[0]!;
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = p[1 + (i % 3)]!;
    g.globalAlpha = 0.75;
    g.beginPath();
    g.ellipse(60 + ((seed * 37 + i * 53) % 150), 60 + ((seed * 29 + i * 71) % 200), 30 + i * 12, 50 + ((i * 17) % 40), i, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return texture(c);
}
