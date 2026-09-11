/** §5.7 — the enquiry contract, shared by the form, the API and the tests. */

export const ENQUIRY_INTENTS = ['INFORMATION', 'VIEWING', 'RESERVATION', 'BROKER'] as const;
export type EnquiryIntent = (typeof ENQUIRY_INTENTS)[number];

export const INTENT_LABEL: Record<EnquiryIntent, string> = {
  INFORMATION: 'Send me details',
  VIEWING: 'Arrange a viewing',
  RESERVATION: 'Discuss a reservation',
  BROKER: 'I represent a buyer',
};

export interface EnquiryInput {
  name: string;
  email: string;
  phone: string;
  message?: string;
  intent: EnquiryIntent;
  unitIds: string[];
  source?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  referrer?: string;
  landingPath?: string;
  turnstileToken?: string;
  /** §5.7 step 2 — honeypot. A real visitor never fills this. */
  company?: string;
}

/**
 * §5.7 step 6 — the WhatsApp deep link. Built here rather than in the API so
 * the client can show the exact text before the visitor commits, and so it is
 * testable without a database.
 */
export function buildWhatsAppUrl(input: {
  phoneE164: string;
  developmentName: string;
  visitorName: string;
  units: { code: string; typologyName: string; areaSqm: number }[];
}): string {
  const digits = input.phoneE164.replace(/[^\d]/g, '');
  const unit = input.units[0];
  const subject = unit
    ? `unit ${unit.code} (${unit.typologyName.toLowerCase()}, ${unit.areaSqm}m²)`
    : 'the development';
  const text =
    `Hello, I'm interested in ${subject} at ${input.developmentName}. ` +
    `My name is ${input.visitorName}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Trivial shape check shared by client and server; the server also validates with class-validator. */
export function isProbablyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
