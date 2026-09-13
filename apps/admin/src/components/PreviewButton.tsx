import { Eye } from 'lucide-react';
import { useState } from 'react';
import { post } from '../lib/api';
import { useToast } from './Toast';
import { Button } from './ui';

/**
 * §40.2 — opens the real website page in preview: drafts and unpublished
 * records show, exactly as the page will render once published. The link is
 * signed by the API and lasts an hour.
 */
export function PreviewButton({ path, label = 'Preview', variant, size }: { path: string; label?: string; variant?: 'primary' | 'ghost' | 'default'; size?: 'sm' | 'xs' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon={<Eye size={15} />}
      variant={variant}
      size={size}
      busy={busy}
      onClick={async () => {
        // Opened synchronously so the browser does not treat it as a pop-up.
        const tab = window.open('about:blank', '_blank');
        setBusy(true);
        try {
          const { url } = await post<{ url: string }>('/admin/preview', { path });
          if (tab) tab.location.href = url;
          else window.location.href = url;
        } catch (e) {
          tab?.close();
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
