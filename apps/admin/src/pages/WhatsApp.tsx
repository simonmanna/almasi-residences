import { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Phone, Save } from 'lucide-react';
import { get, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, PageHead, Toggle } from '../components/ui';

/**
 * Website → WhatsApp & Telephone.
 *
 * Two numbers and one switch. They are not stored here: the website reads them
 * from the property record (§4), which is why the footer, the enquiry panel,
 * every residence page and the floating button all change together the moment
 * this screen is saved. Property overview no longer edits these three fields.
 */
interface ContactSettings {
  name: string;
  contactPhone: string | null;
  whatsappNumber: string | null;
  whatsappIconVisible: boolean;
}

/** The whole of this screen's business. Nothing else is sent to the API. */
const OWNED = ['contactPhone', 'whatsappNumber', 'whatsappIconVisible'] as const;

export default function WhatsAppSettings() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('property.edit');
  // The same query key as Property overview: one record, one cache entry.
  const { data, error, refetch } = useQuery('property', () => get<ContactSettings>('/admin/property'));
  const [d, setD] = useState<ContactSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setD(data);
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!d || !data) return <LoadingPage />;

  const set = <K extends keyof ContactSettings>(k: K, v: ContactSettings[K]) => setD({ ...d, [k]: v });
  const dirty = OWNED.some((k) => JSON.stringify(d[k]) !== JSON.stringify(data[k]));
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(
        OWNED.filter((k) => JSON.stringify(d[k]) !== JSON.stringify(data[k])).map((k) => {
          const v = d[k];
          // An emptied number is a decision, not a blank: it takes the link off the site.
          return [k, typeof v === 'string' && v.trim() === '' ? null : v];
        }),
      );
      await patch('/admin/property', body);
      toast.success('Saved. The website updates straight away.');
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
        title="WhatsApp & Telephone"
        sub="The numbers a buyer reaches the sales team on, across every page of the website."
        crumbs={[{ label: 'Website' }, { label: 'WhatsApp & Telephone' }]}
      >
        <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
        {editable && (
          <>
            {dirty && <Button variant="ghost" onClick={() => setD(data)}>Discard</Button>}
            <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
          </>
        )}
      </PageHead>
      {!editable && <Alert tone="info">Your role can read these numbers but not change them.</Alert>}

      <Card>
        <CardHead
          title="The numbers"
          icon={<Phone size={18} />}
          sub="Written with the country code, exactly as it should be dialled. They appear in the footer, the enquiry panel and on every residence page."
        />
        <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0 }} className="card-body form-grid">
          <Field label="Telephone" hint="The number the site dials. Left empty, no telephone link is shown anywhere.">
            <Input value={d.contactPhone ?? ''} inputMode="tel" placeholder="+250 788 000 000" onChange={(e) => set('contactPhone', e.target.value)} />
          </Field>
          <Field label="WhatsApp number" hint="Where a buyer's message lands. Left empty, the WhatsApp links and the button below come off the site.">
            <Input value={d.whatsappNumber ?? ''} inputMode="tel" placeholder="+250 788 000 000" onChange={(e) => set('whatsappNumber', e.target.value)} />
          </Field>
          <p className="small" style={{ gridColumn: '1 / -1' }}>
            The email address, the sales office and the social links are edited under Property → Overview.
          </p>
        </fieldset>
      </Card>

      <Card>
        <CardHead
          title="The WhatsApp button"
          icon={<MessageCircle size={18} />}
          sub="The floating shortcut that follows a visitor from page to page, always one tap from a message."
        />
        <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0 }} className="card-body stack">
          <Field label="Show it on the website" hint="Off hides the floating button. The WhatsApp number above still appears in the footer and the enquiry sections.">
            <Toggle
              checked={d.whatsappIconVisible}
              onChange={(v) => set('whatsappIconVisible', v)}
              label={d.whatsappIconVisible ? 'Visible on every page' : 'Hidden from the website'}
            />
          </Field>
          {d.whatsappIconVisible && !d.whatsappNumber && (
            <Alert tone="warn">No WhatsApp number is set, so the button has nowhere to send a message. Add one above, or turn the button off.</Alert>
          )}
        </fieldset>
      </Card>
    </>
  );
}
