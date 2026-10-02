import { AlertTriangle, CheckCircle2, ExternalLink, Gauge, ListChecks, RefreshCw } from 'lucide-react';
import { SEO_ISSUE_LABELS, type SeoIssue, type SeoIssueKind } from '@avida/types';
import { get } from '../lib/api';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { SITE_URL } from '../lib/site';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, LoadingPage, PageHead, Stat } from '../components/ui';

interface AuditReport {
  score: number;
  counts: {
    pages: number;
    staticRoutes: number;
    residences: number;
    types: number;
    locationPages: number;
    posts: number;
    images: number;
    missingAltText: number;
    redirects: number;
    withMetadata: number;
  };
  ready: Record<string, boolean>;
  issues: SeoIssue[];
}

const READY_LABELS: Record<string, string> = {
  sitemap: 'sitemap.xml',
  robots: 'robots.txt',
  structuredData: 'Structured data',
  siteTitle: 'Site-wide title',
  siteDescription: 'Site-wide description',
  searchConsole: 'Search Console',
  analytics: 'Analytics',
  organization: 'Organization details',
};

/** Where an issue of each kind is fixed. */
const FIX_AT: Partial<Record<SeoIssueKind, { to: string; label: string }>> = {
  'missing-title': { to: '/seo', label: 'Page metadata' },
  'missing-description': { to: '/seo', label: 'Page metadata' },
  'title-too-long': { to: '/seo', label: 'Page metadata' },
  'description-too-long': { to: '/seo', label: 'Page metadata' },
  'duplicate-title': { to: '/seo', label: 'Page metadata' },
  'duplicate-description': { to: '/seo', label: 'Page metadata' },
  'missing-og-image': { to: '/seo', label: 'Page metadata' },
  'missing-alt-text': { to: '/media', label: 'Images' },
  'missing-transcript': { to: '/film', label: 'Film' },
  'redirect-loop': { to: '/seo/redirects', label: 'Redirects' },
  'redirect-hides-page': { to: '/seo/redirects', label: 'Redirects' },
};

const scoreTone = (score: number) => (score >= 90 ? 'green' : score >= 70 ? 'amber' : 'red');

/**
 * Website → SEO health. What search engines can and cannot read, computed from
 * the database: no crawl, no third-party account, and nothing here is a
 * prediction of ranking — only of technical completeness.
 */
export default function SeoHealth() {
  const { data, error, refetch } = useQuery('seo:audit', () => get<AuditReport>('/admin/seo/audit'));
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const errors = data.issues.filter((i) => i.severity === 'error');
  const warnings = data.issues.filter((i) => i.severity === 'warning');

  return (
    <>
      <PageHead title="SEO health" sub="What search engines can read, and what is still missing" crumbs={[{ label: 'Website' }, { label: 'SEO health' }]}>
        <Button icon={<RefreshCw size={15} />} onClick={() => refetch()}>
          Re-check
        </Button>
        <a className="btn" href={`${SITE_URL}/sitemap.xml`} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> View the sitemap
        </a>
      </PageHead>

      <div className="grid-4">
        <Stat label="Health score" value={`${data.score}/100`} tone={scoreTone(data.score)} icon={<Gauge size={18} />} />
        <Stat label="Pages" value={data.counts.pages} icon={<ListChecks size={18} />} />
        <Stat label="Problems" value={errors.length} tone={errors.length ? 'red' : 'green'} icon={<AlertTriangle size={18} />} />
        <Stat label="Warnings" value={warnings.length} tone={warnings.length ? 'amber' : 'green'} icon={<ListChecks size={18} />} />
      </div>

      <Card>
        <CardHead title="What is in place" icon={<CheckCircle2 size={18} />} sub="Technical foundations, and the accounts connected" />
        <div className="card-body">
          <ul className="row" style={{ flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
            {Object.entries(data.ready).map(([key, ok]) => (
              <li key={key}>
                <Badge tone={ok ? 'green' : 'amber'} plain>
                  {ok ? '✓' : '—'} {READY_LABELS[key] ?? key}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 12 }}>
            {data.counts.residences} residences · {data.counts.types} types · {data.counts.locationPages} location pages · {data.counts.posts} articles ·{' '}
            {data.counts.redirects} redirects · {data.counts.missingAltText} of {data.counts.images} images without alt text
          </p>
        </div>
      </Card>

      <Card>
        <CardHead title="What to fix" sub={`${errors.length} problems, ${warnings.length} warnings`} icon={<AlertTriangle size={18} />} />
        {data.issues.length === 0 ? (
          <Empty title="Nothing to fix" icon={<CheckCircle2 size={32} />}>
            Every page has a title and a description, no two pages claim the same words, and every redirect arrives somewhere.
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Page</th>
                  <th>Detail</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.issues.slice(0, 200).map((issue, i) => {
                  const fix = FIX_AT[issue.kind];
                  return (
                    <tr key={`${issue.kind}-${issue.path}-${i}`}>
                      <td>
                        <Badge tone={issue.severity === 'error' ? 'red' : 'amber'} plain>
                          {SEO_ISSUE_LABELS[issue.kind]}
                        </Badge>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--navy)' }}>{issue.label}</strong>
                        <span className="muted small"> {issue.path}</span>
                      </td>
                      <td className="muted small">{issue.detail ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {fix && (
                          <Link to={fix.to} className="btn sm">
                            {fix.label}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
