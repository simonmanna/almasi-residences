import { describe, expect, it } from 'vitest';
import { resolveUiMode } from './ui-mode.js';

describe('resolveUiMode', () => {
  it('prefers the query param, for stakeholder demo links', () => {
    expect(resolveUiMode({ param: 'single', cookie: 'multi', envDefault: 'multi' })).toBe('single');
  });
  it('falls back to the cookie set by the in-site switch', () => {
    expect(resolveUiMode({ param: null, cookie: 'single', envDefault: 'multi' })).toBe('single');
  });
  it('then the env default', () => {
    expect(resolveUiMode({ envDefault: 'single' })).toBe('single');
  });
  it('defaults to multi — the SEO default', () => {
    expect(resolveUiMode({})).toBe('multi');
    expect(resolveUiMode({ param: 'nonsense', cookie: 'garbage', envDefault: '' })).toBe('multi');
  });
});
