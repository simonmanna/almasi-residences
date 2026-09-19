import film from './hero-film.json';

export const heroFilm = film;

export type HeroFilmVariant = 'desktop1440' | 'desktop1080' | 'mobile';

export interface ViewingConditions {
  width: number;
  height: number;
  dpr: number;
  reducedMotion: boolean;
  saveData?: boolean;
  effectiveType?: string;
}

/** Which cut of the film this screen and connection should get, or none (poster only). */
export function pickHeroFilm(c: ViewingConditions): HeroFilmVariant | null {
  if (c.reducedMotion || c.saveData) return null;
  if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return null;
  if (c.height > c.width * 1.05 && c.width <= 900) return 'mobile';
  const px = Math.max(c.width, c.height) * Math.min(c.dpr, 2);
  return px > 2000 && c.effectiveType !== '3g' ? 'desktop1440' : 'desktop1080';
}

export function heroFilmSources(variant: HeroFilmVariant) {
  const name = `${film.base}/${film.sources[variant]}`;
  return { webm: `${name}.webm`, mp4: `${name}.mp4` };
}
