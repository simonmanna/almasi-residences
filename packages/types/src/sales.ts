/**
 * Roadmap phase 3 — the sales engine's shared vocabulary: the lead pipeline,
 * viewings, reservations, notifications and the analytics funnel. The API
 * validates against these lists, the admin renders them, the website emits the
 * events.
 */

// ─── Lead pipeline (§40.3) ───────────────────────────────────────────────

export const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_SCHEDULED', 'VIEWED', 'INTERESTED', 'RESERVED', 'SOLD'] as const;
export const EXIT_STAGES = ['LOST', 'SPAM'] as const;

export const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  VIEWING_SCHEDULED: 'Viewing scheduled',
  VIEWED: 'Viewed',
  INTERESTED: 'Interested',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  LOST: 'Lost',
  SPAM: 'Spam',
};

export const LOST_REASONS = ['PRICE', 'LOCATION', 'TIMING', 'CHOSE_COMPETITOR', 'FINANCING', 'NO_RESPONSE', 'OTHER'] as const;
export type LostReasonValue = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABEL: Record<LostReasonValue, string> = {
  PRICE: 'Price',
  LOCATION: 'Location',
  TIMING: 'Timing',
  CHOSE_COMPETITOR: 'Chose a competitor',
  FINANCING: 'Financing',
  NO_RESPONSE: 'Stopped responding',
  OTHER: 'Other',
};

export const LEAD_NOTE_KINDS = ['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING'] as const;
export const LEAD_NOTE_LABEL: Record<string, string> = { NOTE: 'Note', CALL: 'Call', EMAIL: 'Email', WHATSAPP: 'WhatsApp', MEETING: 'Meeting', STATUS: 'Stage change', SYSTEM: 'System' };

/** A new lead should hear back within this many hours (the "first response" promise). */
export const FIRST_RESPONSE_HOURS = 24;

/** A repeat submission from the same address within this window joins the first lead (§15.6). */
export const ENQUIRY_DEDUP_HOURS = 24;

/** Is a lead overdue: no first response in time, or a follow-up date that has passed? */
export function isLeadOverdue(
  lead: { status: string; createdAt: string | Date; contactedAt: string | Date | null; followUpAt: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (lead.status === 'LOST' || lead.status === 'SPAM' || lead.status === 'SOLD') return false;
  if (lead.followUpAt && new Date(lead.followUpAt).getTime() < now.getTime()) return true;
  if (!lead.contactedAt && lead.status === 'NEW') {
    return now.getTime() - new Date(lead.createdAt).getTime() > FIRST_RESPONSE_HOURS * 3_600_000;
  }
  return false;
}

// ─── Viewings (§15.2) ────────────────────────────────────────────────────

export const VIEWING_STATUSES = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const;
export type ViewingStatusValue = (typeof VIEWING_STATUSES)[number];
export const VIEWING_STATUS_LABEL: Record<ViewingStatusValue, string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
};

/** The times a visitor may ask for. The sales team confirms an exact time. */
export const VIEWING_SLOTS = [
  { key: 'MORNING', label: 'Morning (9–12)' },
  { key: 'AFTERNOON', label: 'Afternoon (12–4)' },
  { key: 'EVENING', label: 'Late afternoon (4–6)' },
] as const;
export type ViewingSlotKey = (typeof VIEWING_SLOTS)[number]['key'];

/** How long before a confirmed viewing the reminder goes out. */
export const VIEWING_REMINDER_HOURS = 24;

// ─── Reservations ────────────────────────────────────────────────────────

export const RESERVATION_STATUSES = ['ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED'] as const;
export const RESERVATION_STATUS_LABEL: Record<(typeof RESERVATION_STATUSES)[number], string> = {
  ACTIVE: 'Held',
  CONVERTED: 'Converted to sale',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};
export const DEFAULT_HOLD_DAYS = 14;
/** The agent is warned this long before a hold lapses. */
export const RESERVATION_WARNING_HOURS = 48;

// ─── Notifications (§15.1) ───────────────────────────────────────────────

export const NOTIFICATION_KIND_LABEL: Record<string, string> = {
  ENQUIRY_ALERT: 'New enquiry alert',
  ENQUIRY_ACKNOWLEDGEMENT: 'Enquiry acknowledgement',
  VIEWING_REQUESTED: 'Viewing request alert',
  VIEWING_CONFIRMATION: 'Viewing confirmation',
  VIEWING_REMINDER: 'Viewing reminder',
  LEADS_DIGEST: 'Daily leads digest',
  RESERVATION_EXPIRING: 'Reservation expiring',
};

/** Delivery attempts before a notification is marked failed and shown to a person. */
export const NOTIFICATION_MAX_ATTEMPTS = 6;

// ─── Analytics (§40.4) ───────────────────────────────────────────────────

export const ANALYTICS_EVENTS = [
  'page_view',
  'development_viewed',
  'residence_viewed',
  'gallery_opened',
  'floor_plan_viewed',
  'payment_plan_viewed',
  'brochure_downloaded',
  'compare_added',
  'favorite_added',
  'phone_clicked',
  'whatsapp_clicked',
  'email_clicked',
  'enquiry_started',
  'enquiry_submitted',
  'viewing_started',
  'viewing_requested',
  'filter_applied',
  'tour_started',
  'film_played',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Events that mean "this visitor wants to talk to sales" — the conversion side of the funnel. */
export const CONVERSION_EVENTS: readonly AnalyticsEventName[] = ['enquiry_submitted', 'viewing_requested', 'phone_clicked', 'whatsapp_clicked', 'email_clicked'];

export const ANALYTICS_EVENT_LABEL: Record<AnalyticsEventName, string> = {
  page_view: 'Page views',
  development_viewed: 'Homepage views',
  residence_viewed: 'Residence views',
  gallery_opened: 'Gallery opened',
  floor_plan_viewed: 'Floor plan viewed',
  payment_plan_viewed: 'Payment plan viewed',
  brochure_downloaded: 'Brochure downloads',
  compare_added: 'Added to compare',
  favorite_added: 'Saved',
  phone_clicked: 'Phone taps',
  whatsapp_clicked: 'WhatsApp taps',
  email_clicked: 'Email taps',
  enquiry_started: 'Enquiry forms opened',
  enquiry_submitted: 'Enquiries sent',
  viewing_started: 'Viewing forms opened',
  viewing_requested: 'Viewings requested',
  filter_applied: 'Filters used',
  tour_started: 'Tours started',
  film_played: 'Film plays',
};
