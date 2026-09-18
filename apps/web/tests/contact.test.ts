import { describe, expect, it } from 'vitest';
import { contactFrom, whatsappHref } from '../lib/contact';

describe('WhatsApp contact configuration', () => {
  it('preserves the admin launcher visibility setting', () => {
    expect(
      contactFrom({ whatsapp: '+250 788 123 456', whatsappIconVisible: false }).whatsappIconVisible,
    ).toBe(false);
  });

  it('builds a WhatsApp deep link from the configured number', () => {
    const contact = contactFrom({ whatsapp: '+250 788 123 456' }, 'Almasi');
    expect(whatsappHref(contact)).toMatch(/^https:\/\/wa\.me\/250788123456\?text=/);
  });
});
