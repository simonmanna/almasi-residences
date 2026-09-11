import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatArea, formatMoney, STATUS_LABEL } from '@avida/types';
import { ApiError, getDevelopment, getTypologies, getTypology } from '../../../../lib/api';
import { CgiDisclaimer } from '../../../../components/CgiDisclaimer';
import { SiteFooter } from '../../../../components/sections/Content';
import { typologyJsonLd } from '../../../../lib/seo';

export const revalidate = 3600;

/** §9 task 8 — per-typology pages are what rank, so they are pre-rendered. */
export async function generateStaticParams() {
  const typologies = await getTypologies();
  return typologies.map((t) => ({ typology: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ typology: string }>;
}): Promise<Metadata> {
  const { typology } = await params;
  try {
    const [t, dev] = await Promise.all([getTypology(typology), getDevelopment()]);
    const from =
      t.summary.priceMinorFrom !== null
        ? ` from ${formatMoney({ amountMinor: t.summary.priceMinorFrom, currency: dev.currency })}`
        : '';
    return {
      title: `${t.name} — ${dev.name}`,
      description: `${t.name}, ${formatArea(t.areaSqmMin)} to ${formatArea(t.areaSqmMax)}${from}.`,
      alternates: { canonical: `/residences/${t.slug}` },
    };
  } catch {
    return { title: 'Residence' };
  }
}

export default async function TypologyPage({
  params,
}: {
  params: Promise<{ typology: string }>;
}) {
  const { typology } = await params;
  let data;
  try {
    data = await getTypology(typology);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const dev = await getDevelopment();

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(typologyJsonLd(data, dev)) }}
      />
      <h1 className="display">{data.name}</h1>
      <p className="lead">
        {data.bedrooms === 0 ? 'One room' : `${data.bedrooms} bedrooms`},{' '}
        {formatArea(data.areaSqmMin)} to {formatArea(data.areaSqmMax)}.
      </p>
      {data.descriptionMd && <p className="prose">{data.descriptionMd}</p>}
      <CgiDisclaimer className="disclaimer" />

      <h2 className="head">Units of this type</h2>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Unit</th>
            <th scope="col">Floor</th>
            <th scope="col">Facing</th>
            <th scope="col" className="align-right">
              Area
            </th>
            <th scope="col" className="align-right">
              Price
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.units.map((u) => (
            <tr key={u.id}>
              <th scope="row" data-numeric>
                {u.code}
              </th>
              <td data-numeric>{(u as { floor?: { label: string } }).floor?.label ?? '—'}</td>
              <td>{u.orientation}</td>
              <td data-numeric className="align-right">
                {formatArea(u.areaSqm)}
              </td>
              <td data-numeric className="align-right">
                {u.status === 'AVAILABLE'
                  ? formatMoney({ amountMinor: u.priceMinor, currency: u.currency })
                  : '—'}
              </td>
              <td>{STATUS_LABEL[u.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SiteFooter dev={dev} />
    </main>
  );
}
