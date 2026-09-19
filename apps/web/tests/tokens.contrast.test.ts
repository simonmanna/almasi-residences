/**
 * Risk R5 — the palette is fixed by hand and the contrast floor is not
 * negotiable, so the two are checked against each other on every run. A bad
 * pair costs one edit here instead of an accessibility failure after launch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE, parseTokenBlocks } from './contrast';

const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8');
const grounds = parseTokenBlocks(css, 'data-ground');
const GROUNDS = ['stone', 'quiet', 'night'];

// Visitor themes override the material tokens of each ground; status and map
// colours inherit, so each theme x ground is checked as the merged palette.
const themeCss = readFileSync(resolve(__dirname, '../styles/themes.css'), 'utf8');
const THEMES = ['blue', 'sky'];
const themed: Record<string, Record<string, string>> = {};
for (const m of themeCss.matchAll(/\[data-theme="(\w+)"\] \[data-ground="(\w+)"\]\s*\{([^}]*)\}/g)) {
  const vars: Record<string, string> = {};
  for (const v of m[3]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[v[1]!] = v[2]!.trim();
  themed[`${m[1]}/${m[2]}`] = { ...grounds[m[2]!]!, ...vars };
}
const palettes: Record<string, Record<string, string>> = { ...grounds, ...themed };
const PALETTES = Object.keys(palettes);
const STATUS_TOKENS = [
  '--status-available',
  '--status-reserved',
  '--status-sold',
  '--status-unavailable',
];
// The map's landmark categories. Seven colours cannot hold the status
// palette's DE 22 and stay inside a warm stone palette, so the floor here is
// 18 -- which is affordable because a pin never carries meaning by colour
// alone: it is named on hover, in its card and in the list beside the map.
const CATEGORY_TOKENS = [
  '--cat-business',
  '--cat-shopping',
  '--cat-health',
  '--cat-school',
  '--cat-airport',
  '--cat-leisure',
  '--cat-embassy',
];

describe('colour tokens', () => {
  it('authors both grounds', () => {
    expect(Object.keys(grounds).sort()).toEqual([...GROUNDS].sort());
  });

  it('authors every theme on both grounds', () => {
    expect(Object.keys(themed).sort()).toEqual(THEMES.flatMap((t) => GROUNDS.map((g) => `${t}/${g}`)).sort());
  });

  it.each(GROUNDS)('%s defines every token the other ground does', (ground) => {
    expect(Object.keys(grounds[ground]!).sort()).toEqual(Object.keys(grounds.stone!).sort());
  });
});

describe('contrast floor — 4.5:1 for text', () => {
  it.each(PALETTES)('%s: ink on every surface', (ground) => {
    const t = palettes[ground]!;
    for (const surface of ['--surface', '--surface-raised', '--surface-sunk']) {
      expect(contrastRatio(t['--ink']!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Muted ink carries captions, unit attributes and meta, so it is held to the
  // body-text floor rather than the large-text allowance.
  it.each(PALETTES)('%s: muted ink on surface and sunk surface', (ground) => {
    const t = palettes[ground]!;
    expect(contrastRatio(t['--ink-muted']!, t['--surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['--ink-muted']!, t['--surface-sunk']!)).toBeGreaterThanOrEqual(4.5);
  });

  // The accent sets small links and labels, so it must read as text too.
  it.each(PALETTES)('%s: accent is text-safe on surface', (ground) => {
    const t = palettes[ground]!;
    expect(contrastRatio(t['--accent']!, t['--surface']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast floor — 3:1 for interface furniture', () => {
  // Status is carried by fill treatment as well as colour, but each status
  // colour is still a meaningful UI component under WCAG 1.4.11.
  it.each(PALETTES)('%s: every status colour against surface', (ground) => {
    const t = palettes[ground]!;
    for (const token of STATUS_TOKENS) {
      expect(contrastRatio(t[token]!, t['--surface']!)).toBeGreaterThanOrEqual(3);
    }
  });

  // Contrast against the ground is not enough: four statuses that each clear
  // 3:1 can still be four browns nobody can tell apart, which is what the
  // audit found. Separation is perceptual, so it is measured perceptually.
  it.each(PALETTES)('%s: every status colour is distinguishable from the others', (ground) => {
    const t = palettes[ground]!;
    for (let i = 0; i < STATUS_TOKENS.length; i++) {
      for (let j = i + 1; j < STATUS_TOKENS.length; j++) {
        const [a, b] = [STATUS_TOKENS[i]!, STATUS_TOKENS[j]!];
        expect(deltaE(t[a]!, t[b]!), `${a} and ${b} read as the same colour`).toBeGreaterThanOrEqual(22);
      }
    }
  });

  // A pin is a control on the map's own paper, not on the page's surface.
  it.each(PALETTES)('%s: every landmark category against the map ground', (ground) => {
    const t = palettes[ground]!;
    for (const token of CATEGORY_TOKENS) {
      expect(contrastRatio(t[token]!, t['--map-ground']!), `${token} on the map`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(PALETTES)('%s: every landmark category is distinguishable from the others', (ground) => {
    const t = palettes[ground]!;
    for (let i = 0; i < CATEGORY_TOKENS.length; i++) {
      for (let j = i + 1; j < CATEGORY_TOKENS.length; j++) {
        const [a, b] = [CATEGORY_TOKENS[i]!, CATEGORY_TOKENS[j]!];
        expect(deltaE(t[a]!, t[b]!), `${a} and ${b} read as the same colour`).toBeGreaterThanOrEqual(18);
      }
    }
  });

  // --line is a decorative hairline (WCAG exempts it); it still has to be seen.
  it.each(PALETTES)('%s: line is visible against surface', (ground) => {
    const t = palettes[ground]!;
    expect(contrastRatio(t['--line']!, t['--surface']!)).toBeGreaterThanOrEqual(1.3);
  });
});

// Cards carry their own small palette (Wooden's walnut panels sit on pale oak),
// so their text is checked against the card, not the page.
const cardBlock = (src: string, selector: string) => {
  const at = src.indexOf(selector);
  const body = src.slice(src.indexOf('{', at) + 1, src.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--card-[\w-]+):\s*([^;]+);/g)].map((v) => [v[1]!, v[2]!.trim()]));
};
const cards: Record<string, Record<string, string>> = {
  // Wooden is the base: its card tokens live once, in tokens.css's system block.
  wooden: Object.fromEntries([...css.matchAll(/(--card-[\w-]+):\s*([^;]+);/g)].map((v) => [v[1]!, v[2]!.trim()])),
  blue: cardBlock(themeCss, ':root[data-theme="blue"] {'),
  sky: cardBlock(themeCss, ':root[data-theme="sky"] {'),
};

describe('card palettes', () => {
  it.each(Object.keys(cards))('%s: card ink, muted ink and accent read on the card', (theme) => {
    const c = cards[theme]!;
    expect(c['--card-surface'], 'card surface is authored').toMatch(/^#/);
    expect(contrastRatio(c['--card-ink']!, c['--card-surface']!)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(c['--card-muted']!, c['--card-surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c['--card-accent']!, c['--card-surface']!)).toBeGreaterThanOrEqual(4.5);
  });
});
