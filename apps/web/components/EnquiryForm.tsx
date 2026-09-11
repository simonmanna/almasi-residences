'use client';

import { useState } from 'react';
import { ENQUIRY_INTENTS, INTENT_LABEL, isProbablyEmail, type EnquiryIntent } from '@avida/types';
import { track } from '../lib/analytics';

interface SelectedUnit {
  id: string;
  code: string;
}

/**
 * §5.7 / §9 task 5 — the enquiry form. Turnstile, phone normalisation and the
 * WhatsApp link are the server's job; this collects, validates cheaply, and
 * hands back the deep link the API builds.
 */
export function EnquiryForm({
  units = [],
  source = 'section',
  onClearUnits,
}: {
  units?: SelectedUnit[];
  source?: string;
  onClearUnits?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '');
    if (!isProbablyEmail(email)) {
      setFieldError('That email address does not look right.');
      return;
    }
    setFieldError(null);
    setState('sending');

    const params = new URLSearchParams(window.location.search);
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

    try {
      const res = await fetch(`${api}/api/v1/enquiry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email,
          phone: String(form.get('phone') ?? ''),
          message: String(form.get('message') ?? '') || undefined,
          intent: String(form.get('intent') ?? 'INFORMATION'),
          unitIds: units.map((u) => u.id),
          source,
          company: String(form.get('company') ?? ''), // §5.7 honeypot
          utm: {
            source: params.get('utm_source') ?? undefined,
            medium: params.get('utm_medium') ?? undefined,
            campaign: params.get('utm_campaign') ?? undefined,
          },
          referrer: document.referrer || undefined,
          landingPath: window.location.pathname,
        }),
      });

      const json = (await res.json()) as { whatsappUrl?: string | null; detail?: string };
      if (!res.ok) {
        setState('error');
        setMessage(json.detail ?? 'Something went wrong. Please try again.');
        return;
      }
      setWhatsappUrl(json.whatsappUrl ?? null);
      setState('sent');
      track('enquiry_submitted', { source, units: units.length });
    } catch {
      setState('error');
      setMessage('We could not reach the server. Please try again in a moment.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="enquiry-sent" role="status">
        <h3 className="head">Thank you. The sales team has your enquiry.</h3>
        <p className="prose">
          Someone will be in touch within one working day. If you would rather talk now:
        </p>
        {whatsappUrl && (
          <a
            className="button"
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => track('whatsapp_clicked', { source })}
          >
            Continue on WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <form className="enquiry-form" onSubmit={submit} noValidate>
      {units.length > 0 && (
        <p className="enquiry-units">
          About{' '}
          <strong>
            {units.length === 1 ? `unit ${units[0]!.code}` : `${units.length} units`}
          </strong>
          {units.length > 1 && ` (${units.map((u) => u.code).join(', ')})`}
          {onClearUnits && (
            <button type="button" className="button-quiet" onClick={onClearUnits}>
              Clear
            </button>
          )}
        </p>
      )}

      <div className="field">
        <label htmlFor="enq-name">Your name</label>
        <input id="enq-name" name="name" required autoComplete="name" minLength={2} />
      </div>

      <div className="field">
        <label htmlFor="enq-email">Email</label>
        <input id="enq-email" name="email" type="email" required autoComplete="email" />
        {fieldError && (
          <p className="field-error" role="alert">
            {fieldError}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="enq-phone">Phone</label>
        <input
          id="enq-phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+250 788 123 456"
        />
        <p className="field-hint">Include the country code if you are outside Rwanda.</p>
      </div>

      <div className="field">
        <label htmlFor="enq-intent">What would you like to do?</label>
        <select id="enq-intent" name="intent" defaultValue="VIEWING">
          {ENQUIRY_INTENTS.map((i: EnquiryIntent) => (
            <option key={i} value={i}>
              {INTENT_LABEL[i]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="enq-message">Anything else? (optional)</label>
        <textarea id="enq-message" name="message" rows={4} />
      </div>

      {/* §5.7 step 2 — honeypot. Hidden from people, not from bots. */}
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="enq-company">Company</label>
        <input id="enq-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {state === 'error' && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}

      <button type="submit" className="button" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending' : 'Request a viewing'}
      </button>

      <p className="note">
        We use your details to answer this enquiry and keep them for 24 months. We never sell
        them.
      </p>
    </form>
  );
}
