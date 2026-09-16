/**
 * WCAG 2.1 relative luminance and contrast ratio. Small enough to own rather
 * than take a dependency for, and the token test is the only consumer.
 */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parses `[data-time="dusk"] { --surface: #2E3038; ... }` blocks out of a stylesheet. */
export function parseTokenStates(css: string): Record<string, Record<string, string>> {
  return parseTokenBlocks(css, 'data-time');
}

/** Parses `[<attribute>="name"] { --token: value; ... }` blocks out of a stylesheet. */
export function parseTokenBlocks(css: string, attribute: string): Record<string, Record<string, string>> {
  const states: Record<string, Record<string, string>> = {};
  const blockRe = new RegExp(`\\[${attribute}="(\\w+)"\\]\\s*\\{([^}]*)\\}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const [, state, body] = m;
    const vars: Record<string, string> = {};
    const varRe = /(--[\w-]+):\s*([^;]+);/g;
    let v: RegExpExecArray | null;
    while ((v = varRe.exec(body!)) !== null) vars[v[1]!] = v[2]!.trim();
    states[state!] = vars;
  }
  return states;
}

/**
 * CIE L*a*b* of a hex colour. Contrast ratio compares lightness only, so it
 * reports two colours of the same lightness and opposite hue as identical —
 * which is exactly how four status colours drifted into being indistinguishable.
 */
export function lab(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((v) => channel(v));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
  const y = f(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
  const z = f((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Perceptual distance (ΔE*ab). Under about 22 two swatches read as one. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
