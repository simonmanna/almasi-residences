/**
 * §9 Phase 1 task 9 — the analytics events. Umami is cookieless, so there is no
 * consent gate (§3.1); adding any third-party pixel later reintroduces one
 * (§15 Q8), which is why the event surface is deliberately small and named.
 */
export type AnalyticsEvent =
  | 'unit_viewed'
  | 'unit_filtered'
  | 'schedule_calculated'
  | 'enquiry_started'
  | 'enquiry_submitted'
  | 'whatsapp_clicked'
  | 'time_state_changed'
  | 'ui_mode_switched';

type Props = Record<string, string | number | boolean | undefined>;

interface UmamiWindow extends Window {
  umami?: { track: (event: string, data?: Props) => void };
}

export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  const umami = (window as UmamiWindow).umami;
  if (umami) {
    umami.track(event, props);
    return;
  }
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics]', event, props);
  }
}
