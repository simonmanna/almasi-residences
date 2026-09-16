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
const GROUNDS = ['stone', 'night'];
const STATUS_TOKENS = [
  '--status-available',
  '--status-reserved',
  '--status-sold',
  '--status-unavailable',
];

describe('colour tokens', () => {
  it('authors both grounds', () => {
    expect(Object.keys(grounds).sort()).toEqual([...GROUNDS].sort());
  });

  it.each(GROUNDS)('%s defines every token the other ground does', (ground) => {
    expect(Object.keys(grounds[ground]!).sort()).toEqual(Object.keys(grounds.stone!).sort());
  });
});

describe('contrast floor — 4.5:1 for text', () => {
  it.each(GROUNDS)('%s: ink on every surface', (ground) => {
    const t = grounds[ground]!;
    for (const surface of ['--surface', '--surface-raised', '--surface-sunk']) {
      expect(contrastRatio(t['--ink']!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Muted ink carries captions, unit attributes and meta, so it is held to the
  // body-text floor rather than the large-text allowance.
  it.each(GROUNDS)('%s: muted ink on surface and sunk surface', (ground) => {
    const t = grounds[ground]!;
    expect(contrastRatio(t['--ink-muted']!, t['--surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['--ink-muted']!, t['--surface-sunk']!)).toBeGreaterThanOrEqual(4.5);
  });

  // The accent sets small links and labels, so it must read as text too.
  it.each(GROUNDS)('%s: accent is text-safe on surface', (ground) => {
    const t = grounds[ground]!;
    expect(contrastRatio(t['--accent']!, t['--surface']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast floor — 3:1 for interface furniture', () => {
  // Status is carried by fill treatment as well as colour, but each status
  // colour is still a meaningful UI component under WCAG 1.4.11.
  it.each(GROUNDS)('%s: every status colour against surface', (ground) => {
    const t = grounds[ground]!;
    for (const token of STATUS_TOKENS) {
      expect(contrastRatio(t[token]!, t['--surface']!)).toBeGreaterThanOrEqual(3);
    }
  });

  // Contrast against the ground is not enough: four statuses that each clear
  // 3:1 can still be four browns nobody can tell apart, which is what the
  // audit found. Separation is perceptual, so it is measured perceptually.
  it.each(GROUNDS)('%s: every status colour is distinguishable from the others', (ground) => {
    const t = grounds[ground]!;
    for (let i = 0; i < STATUS_TOKENS.length; i++) {
      for (let j = i + 1; j < STATUS_TOKENS.length; j++) {
        const [a, b] = [STATUS_TOKENS[i]!, STATUS_TOKENS[j]!];
        expect(deltaE(t[a]!, t[b]!), `${a} and ${b} read as the same colour`).toBeGreaterThanOrEqual(22);
      }
    }
  });

  // --line is a decorative hairline (WCAG exempts it); it still has to be seen.
  it.each(GROUNDS)('%s: line is visible against surface', (ground) => {
    const t = grounds[ground]!;
    expect(contrastRatio(t['--line']!, t['--surface']!)).toBeGreaterThanOrEqual(1.3);
  });
});
