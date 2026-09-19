import { describe, expect, it } from 'vitest';
import { heroFilmSources, pickHeroFilm } from '../lib/hero-film';

const base = { dpr: 1, reducedMotion: false };

describe('pickHeroFilm', () => {
  it('keeps the poster for reduced motion, Save-Data and 2G', () => {
    expect(pickHeroFilm({ ...base, width: 1920, height: 1080, reducedMotion: true })).toBeNull();
    expect(pickHeroFilm({ ...base, width: 1920, height: 1080, saveData: true })).toBeNull();
    expect(pickHeroFilm({ ...base, width: 1920, height: 1080, effectiveType: '2g' })).toBeNull();
  });

  it('gives portrait phones the vertical cut', () => {
    expect(pickHeroFilm({ ...base, width: 390, height: 844, dpr: 3 })).toBe('mobile');
  });

  it('gives large or dense desktops 1440p unless the connection is slow', () => {
    expect(pickHeroFilm({ ...base, width: 2560, height: 1440 })).toBe('desktop1440');
    expect(pickHeroFilm({ ...base, width: 1440, height: 900, dpr: 2 })).toBe('desktop1440');
    expect(pickHeroFilm({ ...base, width: 2560, height: 1440, effectiveType: '3g' })).toBe('desktop1080');
    expect(pickHeroFilm({ ...base, width: 1366, height: 768 })).toBe('desktop1080');
  });

  it('builds versioned WebM + MP4 paths', () => {
    const s = heroFilmSources('mobile');
    expect(s.webm).toMatch(/^\/media\/hero\/v\d+\/.+\.webm$/);
    expect(s.mp4).toMatch(/\.mp4$/);
  });
});
