import { RefreshCw, TriangleAlert } from 'lucide-react';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from './Toast';
import { Alert, Button } from './ui';

interface SyncHealth {
  configured: boolean;
  retrying: number;
  failed: number;
  lastDeliveredAt: string | null;
  lastError: string | null;
}

/**
 * §3.4 — is the website keeping up with the admin? Every change is recorded
 * and retried until it lands; this says so when it has not, instead of the
 * change silently never reaching the site.
 */
export function WebsiteSync() {
  const { can } = useAuth();
  const toast = useToast();
  const { data } = useQuery(can('content.view') ? 'website-sync' : null, () => get<SyncHealth>('/admin/website/sync'));
  if (!data) return null;
  if (!data.configured) {
    return <Alert tone="warn" icon={<TriangleAlert size={18} />}>Website refresh is not configured (WEB_REVALIDATE_URL / REVALIDATE_SECRET). Changes reach the site only when its cache expires.</Alert>;
  }
  if (!data.failed && !data.retrying) return null;
  return (
    <Alert tone={data.failed ? 'error' : 'warn'} icon={<TriangleAlert size={18} />}>
      <span className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <span>
          {data.failed ? `${data.failed} change${data.failed === 1 ? '' : 's'} could not reach the website.` : `${data.retrying} change${data.retrying === 1 ? ' is' : 's are'} waiting to reach the website and will retry automatically.`}
          {data.lastError ? ` Last error: ${data.lastError}.` : ''}
          {data.lastDeliveredAt ? ` Last delivered ${ago(data.lastDeliveredAt)}.` : ''}
        </span>
        {can('content.edit') && (
          <Button size="sm" icon={<RefreshCw size={14} />} onClick={async () => {
            const r = await post<{ retried: number }>('/admin/website/sync/retry');
            toast.success(r.retried ? `Retrying ${r.retried} change${r.retried === 1 ? '' : 's'}.` : 'Retrying now.');
            invalidate('website-sync');
          }}>
            Retry now
          </Button>
        )}
      </span>
    </Alert>
  );
}
