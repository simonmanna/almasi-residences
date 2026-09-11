import type { Metadata } from 'next';
import { FilmPlayer } from '../../components/film/FilmPlayer';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const metadata: Metadata = {
  title: 'The film',
  description:
    'Almasi Residences, Kimihurura, in under a minute: from the air over Kigali to the entrance, the reception, the pool, a residence and the penthouse roof terrace.',
  alternates: { canonical: '/film' },
};

export default function FilmPage() {
  return (
    <main id="main" data-ground="night" data-nav-ground="night">
      <h1 className="visually-hidden">The Almasi Residences film</h1>
      <FilmPlayer />
      <SiteFooter />
    </main>
  );
}
