import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, getDevelopment, getTour } from '../../../../lib/api';
import { TourPage } from '../../../../components/tour/TourPage';
import { SiteFooter } from '../../../../components/sections/Content';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const tour = await getTour(slug);
    return {
      title: tour.name,
      description: `A 360° walk through the ${tour.typology?.name.toLowerCase() ?? 'apartment'}.`,
      alternates: { canonical: `/tour/${slug}` },
    };
  } catch {
    return { title: 'Virtual tour' };
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let tour;
  try {
    tour = await getTour(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const dev = await getDevelopment();

  return (
    <main className="page">
      <h1 className="display">{tour.name}</h1>
      <TourPage tour={tour} />
      <SiteFooter dev={dev} />
    </main>
  );
}
