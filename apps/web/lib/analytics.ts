import type { AnalyticsEventName } from '@avida/types';

/**
 * Roadmap item 40 — the website's funnel, measured first-party.
 *
 * Before this, every track() call went to `window.umami`, a script no page ever
 * loaded, so nothing was measured. Events now go to the API (/api/v1/events),
 * batched and sent with sendBeacon so a visitor leaving the page is not lost.
 *
 * Cookieless: a random id in sessionStorage identifies the tab's visit, nothing
 * else. No consent banner is needed and no third party sees the traffic.
 */
export type AnalyticsEvent = AnalyticsEventName;

type Props = Record<string, string | number | boolean | undefined>;

interface Queued {
  name: AnalyticsEvent;
  path: string;
  residence?: string;
  props?: Record<string, string | number | boolean>;
}

const ENDPOINT = '/api/v1/events';
const FLUSH_MS = 4000;
const MAX_BATCH = 25;

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('almasi:sid');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
      sessionStorage.setItem('almasi:sid', id);
    }
    return id;
  } catch {
    return 'no-storage-session';
  }
}

/** Where the visit came from, captured on its first page and kept for the session. */
function attribution(): { referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string } {
  try {
    const saved = sessionStorage.getItem('almasi:attr');
    if (saved) return JSON.parse(saved) as ReturnType<typeof attribution>;
    const p = new URLSearchParams(window.location.search);
    const external = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : undefined;
    const attr = { referrer: external, utmSource: p.get('utm_source') ?? undefined, utmMedium: p.get('utm_medium') ?? undefined, utmCampaign: p.get('utm_campaign') ?? undefined };
    sessionStorage.setItem('almasi:attr', JSON.stringify(attr));
    return attr;
  } catch {
    return {};
  }
}

function flush(useBeacon = false) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ sessionId: sessionId(), events: batch, ...attribution() });
  const sent = useBeacon && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
  if (!sent) {
    void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {
      /* measurement never interrupts a visitor */
    });
  }
  if (queue.length) flush(useBeacon);
}

function install() {
  if (installed) return;
  installed = true;
  // A visitor closing the tab or switching away: send what is waiting.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
}

export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  // Previews show drafts to the team; they are not visits.
  if (document.cookie.includes('__prerender_bypass')) return;
  install();
  const { residence, ...rest } = props;
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>;
  queue.push({ name: event, path: window.location.pathname, ...(typeof residence === 'string' ? { residence: residence.replace(/\s+/g, '-') } : {}), ...(Object.keys(clean).length ? { props: clean } : {}) });
  if (process.env.NODE_ENV === 'development') console.debug('[analytics]', event, props);
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}
