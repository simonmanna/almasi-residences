import type { Metadata } from 'next';
import { copy, copyLines, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../components/layout/PageHero';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/enquire', { title: 'Enquire or book a viewing' });
}

export default async function EnquirePage() {
  const pages = await getPagesSafe();
  return (
    <main id="main">
      <PageHeader
        kicker={copy(pages, 'contact', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'contact', 'heroTitle')} />}
        lede={copy(pages, 'contact', 'heroLede')}
      />
      <EnquireSection id="enquire-form" source="enquire-page" />
      <SiteFooter />
    </main>
  );
}
