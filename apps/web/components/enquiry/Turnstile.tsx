'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

/**
 * §5.7 step 1 — the Cloudflare Turnstile widget.
 *
 * The API rejects an enquiry whose token is missing once TURNSTILE_SECRET_KEY
 * is set, so the form must always send one in production. Without a site key
 * configured the widget renders nothing and the API's "unverified but accepted"
 * path applies, which is what local development and the e2e suite rely on.
 */

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onloadTurnstileCallback?: () => void;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without an API'));
    });
    script.addEventListener('error', () => reject(new Error('Turnstile script blocked')));
    if (!existing) {
      script.src = SRC;
      script.async = true;
      document.head.append(script);
    }
  });
  return loader;
}

export interface TurnstileHandle {
  reset: () => void;
}

export function Turnstile({
  siteKey,
  onToken,
  onUnavailable,
  ref,
}: {
  siteKey: string;
  /** A fresh token, or null when it expired and the visitor must solve it again. */
  onToken: (token: string | null) => void;
  /** Cloudflare could not be reached; the form submits unverified rather than trapping the visitor. */
  onUnavailable: () => void;
  ref?: Ref<TurnstileHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  // Effects must not see a stale callback after a re-render.
  const handlers = useRef({ onToken, onUnavailable });
  handlers.current = { onToken, onUnavailable };

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widget.current && window.turnstile) {
        window.turnstile.reset(widget.current);
        handlers.current.onToken(null);
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !host.current || widget.current) return;
        widget.current = api.render(host.current, {
          sitekey: siteKey,
          theme: 'auto',
          action: 'enquiry',
          callback: (token: string) => handlers.current.onToken(token),
          'expired-callback': () => handlers.current.onToken(null),
          'timeout-callback': () => handlers.current.onToken(null),
          'error-callback': () => handlers.current.onUnavailable(),
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onUnavailable();
      });

    return () => {
      cancelled = true;
      const id = widget.current;
      widget.current = null;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);

  return <div ref={host} className="turnstile" />;
}
