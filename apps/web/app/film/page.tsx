import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy, getFilm, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { FilmPlayer } from '../../components/film/FilmPlayer';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/film', { title: 'The film' });
}

/** The film is a library file with chapters, edited in the admin (roadmap item 23). */
export default async function FilmPage() {
  const [film, pages] = await Promise.all([getFilm().catch(() => null), getPagesSafe()]);
  if (!film) notFound();
  return (
    <main id="main" data-ground="night" data-nav-ground="night">
      <h1 className="visually-hidden">{film.label}</h1>
      <FilmPlayer film={film} caption={copy(pages, 'film', 'caption')} downloadLabel={copy(pages, 'film', 'downloadLabel')} />
      <SiteFooter />
    </main>
  );
}
