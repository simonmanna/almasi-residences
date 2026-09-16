'use client';

import type { ReactNode } from 'react';
import { mailtoHref, telHref, whatsappHref, type Contact } from '../../lib/contact';
import { useContact } from '../providers/ContactProvider';
import type { EnquiryResidence } from './EnquiryForm';
import { useEnquiry, type EnquiryRequest } from './EnquiryProvider';

/** Opens the enquiry sheet. The one client island most server components need. */
export function EnquireButton({
  children,
  className = 'btn btn--solid',
  request,
}: {
  children: ReactNode;
  className?: string;
  request?: EnquiryRequest;
}) {
  const { open } = useEnquiry();
  return (
    <button type="button" className={className} onClick={() => open(request)}>
      {children}
    </button>
  );
}

/**
 * The four ways to reach the sales team about one residence. WhatsApp and Call
 * use the configured numbers; when a number is not configured the button falls
 * back to the enquiry sheet with that channel pre-selected — never a fake number.
 */
export function ContactActions({
  residence,
  whatsappSubject,
  source,
  layout = 'row',
}: {
  residence?: EnquiryResidence;
  whatsappSubject?: { label: string; typeText: string; areaSqm: number };
  source: string;
  layout?: 'row' | 'stack';
}) {
  const { open } = useEnquiry();
  const contact = useContact();
  const wa = whatsappHref(contact, whatsappSubject);
  const tel = telHref(contact);

  return (
    <div className={`contact-actions contact-actions--${layout}`}>
      <button
        type="button"
        className="btn btn--solid"
        onClick={() => open({ residence, intent: 'INFORMATION', source })}
      >
        {residence ? `Enquire about ${residence.label}` : 'Enquire'}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => open({ residence, intent: 'VIEWING', source })}
      >
        Book a viewing
      </button>
      {/* One primary, one secondary. The direct channels stay available but
          stop competing with them for the same glance. */}
      <p className="contact-actions__channels">
        <span aria-hidden="true">or</span>
        {wa ? (
          <a className="link-line" href={wa} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        ) : (
          <button
            type="button"
            className="link-line"
            onClick={() => open({ residence, channel: 'whatsapp', source })}
          >
            WhatsApp
          </button>
        )}
        {tel ? (
          <a className="link-line" href={tel}>
            Call
          </a>
        ) : (
          <button
            type="button"
            className="link-line"
            onClick={() => open({ residence, channel: 'phone', source })}
          >
            Call
          </button>
        )}
      </p>
    </div>
  );
}

export function emailHrefOrNull(contact: Contact): string | null {
  return mailtoHref(contact);
}
