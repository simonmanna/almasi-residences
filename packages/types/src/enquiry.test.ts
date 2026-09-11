import { describe, expect, it } from 'vitest';
import { buildWhatsAppUrl, isProbablyEmail } from './enquiry.js';

describe('§5.7 WhatsApp deep link', () => {
  const base = {
    phoneE164: '+250788123456',
    developmentName: 'Kivu Ridge',
    visitorName: 'Aline',
    units: [{ code: '8B', typologyName: 'Two bedroom corner', areaSqm: 142 }],
  };

  it('pre-fills the unit and the visitor’s name', () => {
    const url = buildWhatsAppUrl(base);
    expect(url.startsWith('https://wa.me/250788123456?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]!);
    expect(text).toBe(
      "Hello, I'm interested in unit 8B (two bedroom corner, 142m²) at Kivu Ridge. My name is Aline.",
    );
  });

  it('strips punctuation from the number — wa.me takes digits only', () => {
    expect(buildWhatsAppUrl({ ...base, phoneE164: '+250 788-123 456' })).toContain(
      'wa.me/250788123456',
    );
  });

  it('falls back to the development when no unit is selected', () => {
    const text = decodeURIComponent(buildWhatsAppUrl({ ...base, units: [] }).split('text=')[1]!);
    expect(text).toContain('interested in the development at Kivu Ridge');
  });

  it('encodes characters that would otherwise break the URL', () => {
    const url = buildWhatsAppUrl({ ...base, visitorName: 'Jean & Marie' });
    expect(url).not.toContain('&M');
    expect(decodeURIComponent(url.split('text=')[1]!)).toContain('Jean & Marie');
  });
});

describe('isProbablyEmail', () => {
  it('accepts ordinary addresses and rejects obvious rubbish', () => {
    expect(isProbablyEmail('a@b.co')).toBe(true);
    expect(isProbablyEmail('no-at-sign')).toBe(false);
    expect(isProbablyEmail('a@b')).toBe(false);
    expect(isProbablyEmail('a b@c.com')).toBe(false);
  });
});
