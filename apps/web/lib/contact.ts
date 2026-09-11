/**
 * Sales contact channels. Each is configured by environment and simply absent
 * when unset — a channel is never faked. Callers fall back to the enquiry form,
 * which always works because it goes through the API.
 */

const clean = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null);

export const SALES = {
  whatsapp: clean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  phone: clean(process.env.NEXT_PUBLIC_SALES_PHONE),
  email: clean(process.env.NEXT_PUBLIC_SALES_EMAIL),
} as const;

export const DEVELOPMENT_NAME = 'Almasi Residences';
export const ADDRESS_LINES = ['KG 15 Ave, Kimihurura', 'Kigali, Rwanda'] as const;

/** `https://wa.me/…` with a first line already written, or null when WhatsApp is not configured. */
export function whatsappHref(subject?: { label: string; typeText: string; areaSqm: number }): string | null {
  if (!SALES.whatsapp) return null;
  const about = subject
    ? `residence ${subject.label} (${subject.typeText.toLowerCase()}, ${subject.areaSqm} m²)`
    : 'a residence';
  const text = `Hello, I'm interested in ${about} at ${DEVELOPMENT_NAME}.`;
  return `https://wa.me/${SALES.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
}

export function telHref(): string | null {
  return SALES.phone ? `tel:${SALES.phone.replace(/[^\d+]/g, '')}` : null;
}

export function mailtoHref(subject = `Enquiry — ${DEVELOPMENT_NAME}`): string | null {
  return SALES.email ? `mailto:${SALES.email}?subject=${encodeURIComponent(subject)}` : null;
}
