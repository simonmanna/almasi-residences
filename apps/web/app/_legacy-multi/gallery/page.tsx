import type { Metadata } from 'next';
import { getDevelopment } from '../../../lib/api';
import { Gallery } from '../../../components/Gallery';
import { SiteFooter } from '../../../components/sections/Content';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'The building at four times of day, inside and out.',
  alternates: { canonical: '/gallery' },
};

export default async function GalleryPage() {
  const dev = await getDevelopment();
  return (
    <main className="page">
      <h1 className="display">Gallery</h1>
      <Gallery sets={dev.mediaSets} />
      <SiteFooter dev={dev} />
    </main>
  );
}
