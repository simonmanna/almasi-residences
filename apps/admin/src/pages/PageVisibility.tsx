import { ExternalLink, Signpost } from 'lucide-react';
import { PAGE_VISIBILITY } from '@avida/types';
import { SITE_URL } from '../lib/site';
import { SectionSettings } from '../components/SectionSettings';
import { Alert, PageHead } from '../components/ui';

/** Website → Pages and navigation — which pages the website offers at all. */
export default function PageVisibility() {
  return (
    <>
      <PageHead
        title="Pages and navigation"
        sub="Switch a page off to take it out of the navigation and off the website."
        crumbs={[{ label: 'Website' }, { label: 'Pages and navigation' }]}
      >
        <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View the website</a>
      </PageHead>
      <Alert tone="info">
        A page switched off loses its link in the top navigation and the menu, drops out of the sitemap, and its address answers “page not found”. Its content is kept and comes back whole when you switch it on again.
      </Alert>
      <SectionSettings
        pageKey="pageVisibility"
        title="Pages"
        icon={<Signpost size={18} />}
        fields={PAGE_VISIBILITY.map((p) => ({
          key: p.key,
          label: p.label,
          type: 'boolean' as const,
          on: `Live at ${p.path}`,
          off: `Hidden — ${p.path} answers “page not found”`,
          hint: p.inNav ? undefined : 'This page has no link in the top navigation.',
        }))}
      />
    </>
  );
}
