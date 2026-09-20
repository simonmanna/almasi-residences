import { useEffect, useState } from 'react';
import { BarChart3, Building2, ExternalLink, Save, Search } from 'lucide-react';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, PageHead, Select } from '../components/ui';

interface Integrations {
  gscVerification: string | null;
  bingVerification: string | null;
  ga4MeasurementId: string | null;
  gtmContainerId: string | null;
  organizationName: string | null;
  organizationType: string;
  sameAs: string[];
}

const ORG_TYPES = [
  { value: 'Organization', label: 'Organisation' },
  { value: 'RealEstateAgent', label: 'Real-estate agent' },
  { value: 'Corporation', label: 'Corporation' },
  { value: 'LocalBusiness', label: 'Local business' },
];

/**
 * Website → Search & analytics. The accounts the website should announce
 * itself to, and who it says publishes it.
 *
 * Nothing here is a secret: a verification token is a meta tag in the page and
 * a measurement id ships in its script. They are kept in the admin so
 * connecting an account never needs a developer or a deploy.
 */
export default function SeoAccounts() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('seo:integrations', () => get<Integrations>('/admin/seo/integrations'));
  const [d, setD] = useState<Integrations | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setD(data);
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data || !d) return <LoadingPage />;
  const dirty = JSON.stringify(d) !== JSON.stringify(data);

  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/seo/integrations', {
        gscVerification: d.gscVerification?.trim() || null,
        bingVerification: d.bingVerification?.trim() || null,
        ga4MeasurementId: d.ga4MeasurementId?.trim() || null,
        gtmContainerId: d.gtmContainerId?.trim() || null,
        organizationName: d.organizationName?.trim() || null,
        organizationType: d.organizationType,
        sameAs: d.sameAs.map((s) => s.trim()).filter(Boolean),
      });
      toast.success('Saved. The website picks it up straight away.');
      invalidate('seo');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Search & analytics" sub="The accounts the website announces itself to" crumbs={[{ label: 'Website' }, { label: 'Search & analytics' }]}>
        {editable && (
          <Button variant="primary" icon={<Save size={15} />} busy={busy} disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
        )}
      </PageHead>

      <Card pad>
        <CardHead title="Search engines" icon={<Search size={18} />} sub="Verification, so each can confirm the site is yours" />
        <Alert tone="info">
          In Search Console choose the <strong>HTML tag</strong> method and paste only the content value here — the website prints the tag itself.{' '}
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
            Open Search Console <ExternalLink size={12} />
          </a>
        </Alert>
        <Field label="Google Search Console verification" hint="The content value of the google-site-verification tag.">
          <Input value={d.gscVerification ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, gscVerification: e.target.value })} placeholder="abc123…" />
        </Field>
        <Field label="Bing Webmaster Tools verification" hint="The content value of the msvalidate.01 tag.">
          <Input value={d.bingVerification ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, bingVerification: e.target.value })} />
        </Field>
        <p className="muted small">
          The sitemap to submit is <code>{SITE_URL}/sitemap.xml</code>.
        </p>
      </Card>

      <Card pad>
        <CardHead title="Analytics" icon={<BarChart3 size={18} />} sub="Google Analytics 4 and Tag Manager" />
        <Alert tone="warn">
          The site already measures its own funnel first-party, without cookies. Adding Google Analytics sends visitor data to Google and may need a consent
          notice where your visitors live — leave these empty if you do not need it.
        </Alert>
        <Field label="GA4 measurement id" hint="Looks like G-XXXXXXX. Empty loads no Google script at all.">
          <Input value={d.ga4MeasurementId ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, ga4MeasurementId: e.target.value.toUpperCase() })} placeholder="G-XXXXXXX" />
        </Field>
        <Field label="Tag Manager container id" hint="Looks like GTM-XXXXXX.">
          <Input value={d.gtmContainerId ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, gtmContainerId: e.target.value.toUpperCase() })} placeholder="GTM-XXXXXX" />
        </Field>
      </Card>

      <Card pad>
        <CardHead title="Who publishes the site" icon={<Building2 size={18} />} sub="Printed as Organization structured data on every page" />
        <Field label="Legal name" hint="Empty uses the property's name.">
          <Input value={d.organizationName ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, organizationName: e.target.value })} />
        </Field>
        <Field label="Kind">
          <Select value={d.organizationType} disabled={!editable} onChange={(e) => setD({ ...d, organizationType: e.target.value })} options={ORG_TYPES} />
        </Field>
        <Field label="Confirming profiles" hint="One address per line: the company's own pages elsewhere (LinkedIn, Instagram, a registry entry). Only pages you control.">
          <textarea
            className="textarea"
            rows={4}
            disabled={!editable}
            value={d.sameAs.join('\n')}
            onChange={(e) => setD({ ...d, sameAs: e.target.value.split('\n') })}
            placeholder={'https://www.linkedin.com/company/…\nhttps://www.instagram.com/…'}
          />
        </Field>
      </Card>
    </>
  );
}
