'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { INTENT_LABEL, isProbablyEmail, VIEWING_SLOTS, type EnquiryIntent } from '@avida/types';
import { track } from '../../lib/analytics';
import styles from './EnquiryForm.module.css';

export type ContactChannel = 'email' | 'phone' | 'whatsapp';

const CHANNEL_TEXT: Record<ContactChannel, string> = {
  email: 'Email',
  phone: 'A phone call',
  whatsapp: 'WhatsApp',
};

const INTENTS: EnquiryIntent[] = ['VIEWING', 'INFORMATION', 'RESERVATION', 'BROKER'];

type Field = 'name' | 'email' | 'phone';
type Errors = Partial<Record<Field, string>>;

export interface EnquiryResidence {
  id: string;
  label: string;
  summary: string;
}

function validate(fd: FormData): Errors {
  const errors: Errors = {};
  if (String(fd.get('name') ?? '').trim().length < 2) errors.name = 'Please tell us your name.';
  if (!isProbablyEmail(String(fd.get('email') ?? ''))) errors.email = 'That email address does not look right.';
  if (String(fd.get('phone') ?? '').replace(/\D/g, '').length < 7) {
    errors.phone = 'Please add a number we can reach you on, with the country code.';
  }
  return errors;
}

/**
 * §5.7 — the enquiry form. It validates cheaply and posts to the API (through
 * the same-origin rewrite); phone normalisation, the honeypot verdict and the
 * WhatsApp hand-off are the server's job.
 */
export function EnquiryForm({
  residence,
  intent = 'VIEWING',
  channel = 'email',
  source = 'form',
  reportStart = true,
  onDone,
}: {
  residence?: EnquiryResidence;
  intent?: EnquiryIntent;
  channel?: ContactChannel;
  source?: string;
  /** False inside the enquiry sheet, which reports the start when it opens. */
  reportStart?: boolean;
  onDone?: () => void;
}) {
  const uid = useId();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [chosen, setChosen] = useState<EnquiryIntent>(intent);
  const [viewingDay, setViewingDay] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  // Without a start event there is no abandonment rate, and the forms sitting
  // in the page — /enquire, the residence page — are where most people begin.
  const started = useRef(false);
  const reportStarted = () => {
    if (started.current || !reportStart) return;
    started.current = true;
    track(chosen === 'VIEWING' ? 'viewing_started' : 'enquiry_started', {
      source,
      residence: residence?.label,
    });
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const found = validate(fd);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    setState('sending');
    setServerError(null);
    const name = String(fd.get('name')).trim();
    const preferred = (fd.get('channel') as ContactChannel | null) ?? channel;
    const note = String(fd.get('message') ?? '').trim();
    const chosenIntent = (fd.get('intent') as EnquiryIntent | null) ?? intent;
    const params = new URLSearchParams(window.location.search);

    try {
      const res = await fetch('/api/v1/enquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email: String(fd.get('email')).trim(),
          phone: String(fd.get('phone')).trim(),
          message: [note, `Preferred contact: ${CHANNEL_TEXT[preferred]}.`].filter(Boolean).join('\n\n'),
          intent: chosenIntent,
          ...(chosenIntent === 'VIEWING' && fd.get('viewingDate') ? { viewingDate: String(fd.get('viewingDate')) } : {}),
          ...(chosenIntent === 'VIEWING' && fd.get('viewingSlot') ? { viewingSlot: String(fd.get('viewingSlot')) } : {}),
          unitIds: residence ? [residence.id] : [],
          source,
          company: String(fd.get('company') ?? ''), // §5.7 honeypot
          utm: {
            source: params.get('utm_source') ?? undefined,
            medium: params.get('utm_medium') ?? undefined,
            campaign: params.get('utm_campaign') ?? undefined,
          },
          referrer: document.referrer ? document.referrer.slice(0, 500) : undefined,
          landingPath: window.location.pathname.slice(0, 500),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { whatsappUrl?: string | null; detail?: string };
      if (!res.ok) {
        setState('error');
        setServerError(json.detail ?? 'Something went wrong on our side. Please try again.');
        return;
      }
      setFirstName(name.split(/\s+/)[0] ?? name);
      setWhatsappUrl(json.whatsappUrl ?? null);
      setState('sent');
      track(chosenIntent === 'VIEWING' ? 'viewing_requested' : 'enquiry_submitted', { source, residence: residence?.label, intent: chosenIntent });
    } catch {
      setState('error');
      setServerError('We could not reach the sales team just now. Please try again in a moment.');
    }
  }

  if (state === 'sent') {
    return (
      <div className={styles.sent} role="status">
        <p className="h3">Thank you, {firstName}.</p>
        <p className="body muted">
          {chosen === 'VIEWING'
            ? `We have your viewing request${residence ? ` for ${residence.label}` : ''}${viewingDay ? ` for ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${viewingDay}T12:00:00Z`))}` : ''}. The sales team will confirm a time within one working day, and a confirmation email follows.`
            : `The sales team has your enquiry${residence ? ` about ${residence.label}` : ''} and will be in touch within one working day. A copy is on its way to your inbox.`}
        </p>
        <div className={styles.actions}>
          {whatsappUrl && (
            <a
              className="btn btn--solid"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('whatsapp_clicked', { source })}
            >
              Continue on WhatsApp
            </a>
          )}
          {onDone && (
            <button type="button" className="btn btn--ghost" onClick={onDone}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const field = (name: Field) => ({
    id: `${uid}-${name}`,
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${uid}-${name}-error` : undefined,
  });

  const submitLabel = residence
    ? `Enquire about ${residence.label}`
    : chosen === 'VIEWING'
      ? 'Request a viewing'
      : 'Send enquiry';

  return (
    <form className={styles.form} onSubmit={submit} onFocusCapture={reportStarted} noValidate>
      <fieldset className={styles.group}>
        <legend className="field-label">I would like to</legend>
        <div className={styles.segments}>
          {INTENTS.map((i) => (
            <label key={i} className={styles.segment}>
              <input type="radio" name="intent" value={i} defaultChecked={i === intent} onChange={() => setChosen(i)} />
              <span>{INTENT_LABEL[i]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {chosen === 'VIEWING' && (
        <div className={styles.row}>
          <div className="field">
            <label htmlFor={`${uid}-day`}>Preferred day</label>
            <input id={`${uid}-day`} name="viewingDate" type="date" min={today} value={viewingDay} onChange={(e) => setViewingDay(e.target.value)} />
            <p className="field-hint">The sales team confirms an exact time.</p>
          </div>
          <fieldset className={styles.group}>
            <legend className="field-label">Time of day</legend>
            <div className={styles.segments}>
              {VIEWING_SLOTS.map((s, n) => (
                <label key={s.key} className={styles.segment}>
                  <input type="radio" name="viewingSlot" value={s.key} defaultChecked={n === 0} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${uid}-name`}>Full name</label>
        <input {...field('name')} autoComplete="name" required />
        {errors.name && (
          <p id={`${uid}-name-error`} className="field-error">
            {errors.name}
          </p>
        )}
      </div>

      <div className={styles.row}>
        <div className="field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input {...field('email')} type="email" autoComplete="email" inputMode="email" required />
          {errors.email && (
            <p id={`${uid}-email-error`} className="field-error">
              {errors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-phone`}>Phone</label>
          <input {...field('phone')} type="tel" autoComplete="tel" placeholder="+250 788 123 456" required />
          {errors.phone ? (
            <p id={`${uid}-phone-error`} className="field-error">
              {errors.phone}
            </p>
          ) : (
            <p className="field-hint">With the country code if you are outside Rwanda.</p>
          )}
        </div>
      </div>

      <fieldset className={styles.group}>
        <legend className="field-label">Reach me by</legend>
        <div className={styles.segments}>
          {(Object.keys(CHANNEL_TEXT) as ContactChannel[]).map((c) => (
            <label key={c} className={styles.segment}>
              <input type="radio" name="channel" value={c} defaultChecked={c === channel} />
              <span>{CHANNEL_TEXT[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${uid}-message`}>Anything we should know? (optional)</label>
        <textarea id={`${uid}-message`} name="message" rows={3} maxLength={1800} />
      </div>

      {/* §5.7 — honeypot. Hidden from people, visible to bots. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor={`${uid}-company`}>Company</label>
        <input id={`${uid}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {state === 'error' && serverError && (
        <p className="field-error" role="alert">
          {serverError}
        </p>
      )}

      <button type="submit" className="btn btn--solid btn--block" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending' : submitLabel}
      </button>

      <p className="caption">
        We use your details only to answer this enquiry and keep them for 24 months. We never sell
        them. <a className="link-line" href="/privacy">How we handle your details</a>.
      </p>
    </form>
  );
}
