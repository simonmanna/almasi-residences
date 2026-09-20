import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy, getFilm, getPagesSafe, getVideos } from '../../lib/api';
import { videoJsonLd } from '../../lib/seo';
import { pageMetadata } from '../../lib/page-metadata';
import { FilmPlayer } from '../../components/film/FilmPlayer';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/film', { title: 'The film' });
}

/** The film is a library file with chapters, edited in the admin (roadmap item 23). */
export default async function FilmPage() {
  const [film, pages, videos] = await Promise.all([getFilm().catch(() => null), getPagesSafe(), getVideos().catch(() => [])]);
  if (!film) notFound();
  // §SEO — a VideoObject with the transcript the admin wrote: the only text a
  // search engine can read on a page that is otherwise a film.
  const jsonLd = videos.filter((v) => v.video).map((v) => videoJsonLd(v));
  return (
    <main id="main" data-ground="night" data-nav-ground="night">
      {jsonLd.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <h1 className="visually-hidden">{film.label}</h1>
      <FilmPlayer film={film} caption={copy(pages, 'film', 'caption')} downloadLabel={copy(pages, 'film', 'downloadLabel')} />
      <SiteFooter />
    </main>
  );
}
