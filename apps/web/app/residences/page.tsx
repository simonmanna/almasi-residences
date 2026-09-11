import type { Metadata } from 'next';
import { filterFromSearch } from '../../lib/residences';
import { ResidenceExplorer } from '../../components/residences/ResidenceExplorer';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const metadata: Metadata = {
  title: 'Residences — apartments and penthouses for sale in Kimihurura',
  description:
    'Every residence at Almasi, Kimihurura, with live availability: one- and two-bedroom apartments from 65 m² and three penthouses up to 390 m². Filter by type, floor, size, price and status.',
  alternates: { canonical: '/residences' },
};

export default async function ResidencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filter, sort } = filterFromSearch(await searchParams);
  return (
    <main id="main">
      <ResidenceExplorer initialFilter={filter} initialSort={sort} />
      <SiteFooter />
    </main>
  );
}
