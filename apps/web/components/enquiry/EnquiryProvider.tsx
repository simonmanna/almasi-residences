'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EnquiryIntent } from '@avida/types';
import { track } from '../../lib/analytics';
import { useContact } from '../providers/ContactProvider';
import { useLenis } from '../layout/SmoothScroll';
import { EnquiryForm, type ContactChannel, type EnquiryResidence } from './EnquiryForm';
import styles from './EnquiryDialog.module.css';

export interface EnquiryRequest {
  residence?: EnquiryResidence;
  intent?: EnquiryIntent;
  channel?: ContactChannel;
  source?: string;
}

interface EnquiryApi {
  open: (request?: EnquiryRequest) => void;
  close: () => void;
}

const EnquiryContext = createContext<EnquiryApi | null>(null);

export function useEnquiry(): EnquiryApi {
  const api = useContext(EnquiryContext);
  if (!api) throw new Error('useEnquiry must be used inside <EnquiryProvider>');
  return api;
}

/**
 * One enquiry sheet for the whole site. A native <dialog> gives the focus
 * trap, Escape, an inert page behind and focus return for free — the things a
 * hand-rolled modal most often gets wrong.
 */
export function EnquiryProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<EnquiryRequest | null>(null);
  const [session, setSession] = useState(0);
  const lenis = useLenis();
  const contact = useContact();

  const open = useCallback((next: EnquiryRequest = {}) => {
    setRequest(next);
    setSession((n) => n + 1);
    track(next.intent === 'VIEWING' ? 'viewing_started' : 'enquiry_started', { source: next.source, residence: next.residence?.label });
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !request) return;
    if (!dialog.open) dialog.showModal();
    lenis?.stop();
  }, [request, session, lenis]);

  const api = useMemo(() => ({ open, close }), [open, close]);

  const title = request?.residence
    ? `Enquire about ${request.residence.label}`
    : request?.intent === 'VIEWING'
      ? 'Book a viewing'
      : 'Enquire';

  return (
    <EnquiryContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="enquiry-title"
        data-ground="stone"
        onClose={() => {
          setRequest(null);
          lenis?.start();
        }}
        onClick={(e) => {
          // A click on the dialog itself (not the sheet) is a click on the backdrop.
          if (e.target === e.currentTarget) close();
        }}
      >
        {request && (
          <div className={styles.sheet} data-lenis-prevent>
            <header className={styles.head}>
              {contact.developmentName && <p className="mark muted">{contact.developmentName}</p>}
              <h2 id="enquiry-title" className="h3">
                {title}
              </h2>
              {request.residence && <p className={styles.residence}>{request.residence.summary}</p>}
              <button type="button" className={styles.close} onClick={close} aria-label="Close">
                <span aria-hidden="true" />
              </button>
            </header>
            <EnquiryForm
              key={session}
              residence={request.residence}
              intent={request.intent}
              channel={request.channel}
              source={request.source ?? 'dialog'}
              // Opening the sheet already reported the start.
              reportStart={false}
              onDone={close}
            />
          </div>
        )}
      </dialog>
    </EnquiryContext.Provider>
  );
}
