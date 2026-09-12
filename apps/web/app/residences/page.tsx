import type { Metadata } from 'next';
import { getInventory } from '../../lib/api';
import { filterFromSearch, summarise, toResidences, TYPE_TEXT, typesPresent } from '../../lib/residences';
import { ResidenceExplorer } from '../../components/residences/ResidenceExplorer';
import { SiteFooter } from '../../components/layout/SiteFooter';

/** The description is counted from the inventory, so it follows every residence the admin adds or sells. */
export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = {
    title: 'Residences — apartments and penthouses for sale in Kimihurura',
    alternates: { canonical: '/residences' },
  };
  try {
    const residences = toResidences(await getInventory());
    const summary = summarise(residences);
    const groups = typesPresent(summary)
      .map((t) => `${summary.byType[t].total} ${t === 'penthouse' ? 'penthouses' : TYPE_TEXT[t].toLowerCase()}`)
      .join(', ');
    const sizes = residences.map((r) => r.areaSqm);
    return {
      ...base,
      description: `Every residence at Almasi, Kimihurura, with live availability: ${groups}, from ${Math.min(...sizes)} to ${Math.max(...sizes)} m². ${summary.available} available now. Filter by type, floor, size, price and status.`,
    };
  } catch {
    return { ...base, description: 'Every residence at Almasi, Kimihurura, with live availability. Filter by type, floor, size, price and status.' };
  }
}

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
