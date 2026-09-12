/**
 * Sales contact channels. The admin sets them on Property overview (D-33) and
 * the API sends them with the development; the NEXT_PUBLIC_* environment
 * values stand in only until it does. A channel that is not set is simply
 * absent — never faked — and callers fall back to the enquiry form, which
 * always works because it goes through the API.
 */

export interface Contact {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  socials: Record<string, string>;
}

const clean = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null);

export const DEVELOPMENT_NAME = 'Almasi Residences';
const DEFAULT_ADDRESS = ['KG 15 Ave, Kimihurura', 'Kigali, Rwanda'];

/** The API's contact record, with the environment as a fallback for each empty channel. */
export function contactFrom(api?: Partial<Contact> | null): Contact {
  return {
    phone: clean(api?.phone) ?? clean(process.env.NEXT_PUBLIC_SALES_PHONE),
    email: clean(api?.email) ?? clean(process.env.NEXT_PUBLIC_SALES_EMAIL),
    whatsapp: clean(api?.whatsapp) ?? clean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
    officeAddress: clean(api?.officeAddress),
    officeHours: clean(api?.officeHours),
    socials: Object.fromEntries(Object.entries(api?.socials ?? {}).filter(([, v]) => clean(v))),
  };
}

/** "KG 15 Ave, Kimihurura, Kigali, Rwanda" → two lines for an <address>. */
export function addressLines(c: Contact): string[] {
  if (!c.officeAddress) return DEFAULT_ADDRESS;
  const parts = c.officeAddress.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return [parts.join(', ')];
  const cut = Math.ceil(parts.length / 2);
  return [parts.slice(0, cut).join(', '), parts.slice(cut).join(', ')];
}

/** `https://wa.me/…` with a first line already written, or null when WhatsApp is not configured. */
export function whatsappHref(c: Contact, subject?: { label: string; typeText: string; areaSqm: number }): string | null {
  if (!c.whatsapp) return null;
  const about = subject
    ? `residence ${subject.label} (${subject.typeText.toLowerCase()}, ${subject.areaSqm} m²)`
    : 'a residence';
  const text = `Hello, I'm interested in ${about} at ${DEVELOPMENT_NAME}.`;
  return `https://wa.me/${c.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
}

export function telHref(c: Contact): string | null {
  return c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : null;
}

export function mailtoHref(c: Contact, subject = `Enquiry — ${DEVELOPMENT_NAME}`): string | null {
  return c.email ? `mailto:${c.email}?subject=${encodeURIComponent(subject)}` : null;
}
