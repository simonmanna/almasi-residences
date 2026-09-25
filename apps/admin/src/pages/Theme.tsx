import { useEffect, useState } from 'react';
import { Check, ExternalLink, Palette, Save } from 'lucide-react';
import { SITE_THEMES, type SiteTheme } from '@avida/types';
import { get, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, LoadingPage, PageHead } from '../components/ui';

/**
 * Website → Theme.
 *
 * The look of the public website. Stored on the property record (§4) beside the
 * contact numbers; the website writes it onto every page before first paint.
 * Visitors cannot change it — there is no switcher on the public site.
 */
const THEMES: Record<SiteTheme, { label: string; note: string; ground: string; accent: string; night: string }> = {
  wooden: { label: 'Wooden', note: 'Mahogany and brass — warm, crafted, residential', ground: '#F2E6D6', accent: '#DBA858', night: '#3C1A07' },
  blue: { label: 'Blue', note: 'Architectural night — deep, calm, cinematic', ground: '#11202E', accent: '#8ECDF4', night: '#0A1520' },
  sky: { label: 'Sky Blue', note: 'Bright contemporary daylight — fresh and airy', ground: '#F4F9FE', accent: '#1D6DB0', night: '#173656' },
};

const isTheme = (v: unknown): v is SiteTheme => SITE_THEMES.includes(v as SiteTheme);

export default function ThemeSettings() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('property.edit');
  // The same query key as Property overview and WhatsApp: one record, one cache entry.
  const { data, error, refetch } = useQuery('property', () => get<{ siteTheme: string }>('/admin/property'));
  const saved: SiteTheme = isTheme(data?.siteTheme) ? data.siteTheme : 'wooden';
  const [choice, setChoice] = useState<SiteTheme>(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setChoice(saved), [saved]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const dirty = choice !== saved;
  const save = async () => {
    setBusy(true);
    try {
      await patch('/admin/property', { siteTheme: choice });
      toast.success(`${THEMES[choice].label} is now the website's theme.`);
      invalidate('property', 'dashboard');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Theme"
        sub="Choose the look every visitor sees on the public website."
        crumbs={[{ label: 'Website' }, { label: 'Theme' }]}
      >
        <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
        {editable && (
          <>
            {dirty && <Button variant="ghost" onClick={() => setChoice(saved)}>Discard</Button>}
            <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Save theme</Button>
          </>
        )}
      </PageHead>
      {!editable && <Alert tone="info">Your role can see the website's theme but not change it.</Alert>}

      <Card>
        <CardHead
          title="Website theme"
          icon={<Palette size={18} />}
          sub="One look for the whole site: colours, type and the navigation. Saved, it goes live on the website straight away."
        />
        <div className="card-body theme-grid" role="radiogroup" aria-label="Website theme">
          {SITE_THEMES.map((id) => {
            const t = THEMES[id];
            const selected = choice === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!editable}
                className="theme-option"
                onClick={() => setChoice(id)}
              >
                <span className="theme-preview">
                  <img src={`${SITE_URL}/themes/${id}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  {selected && <span className="theme-check"><Check size={15} /></span>}
                </span>
                <span className="theme-meta">
                  <span className="theme-swatches" aria-hidden="true">
                    {[t.ground, t.accent, t.night].map((c) => <i key={c} style={{ background: c }} />)}
                  </span>
                  <strong>{t.label}{id === saved && <span className="theme-live">Live</span>}</strong>
                  <small>{t.note}</small>
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}
