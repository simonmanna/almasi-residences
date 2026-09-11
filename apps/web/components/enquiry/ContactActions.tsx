'use client';

import type { ReactNode } from 'react';
import { mailtoHref, telHref, whatsappHref } from '../../lib/contact';
import { track } from '../../lib/analytics';
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
  const wa = whatsappHref(whatsappSubject);
  const tel = telHref();

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
      {wa ? (
        <a
          className="btn btn--ghost"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('whatsapp_clicked', { source })}
        >
          WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => open({ residence, channel: 'whatsapp', source })}
        >
          WhatsApp
        </button>
      )}
      {tel ? (
        <a className="btn btn--ghost" href={tel}>
          Call
        </a>
      ) : (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => open({ residence, channel: 'phone', source })}
        >
          Call
        </button>
      )}
    </div>
  );
}

export function emailHrefOrNull(): string | null {
  return mailtoHref();
}
