/**
 * Roadmap phase 3 — the sales engine's shared vocabulary: the lead pipeline,
 * viewings, reservations, notifications and the analytics funnel. The API
 * validates against these lists, the admin renders them, the website emits the
 * events.
 */

// ─── Lead pipeline (§40.3) ───────────────────────────────────────────────

/**
 * The system categories every pipeline stage maps to, in journey order. The
 * columns an admin sees are configurable (PipelineStage); these are what the
 * automation, reports and inventory rules read.
 */
export const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPERTY_INTEREST', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'] as const;
/** Parked, or out of the journey. ON_HOLD is still open; the rest are closed. */
export const EXIT_STAGES = ['ON_HOLD', 'LOST', 'DISQUALIFIED', 'SPAM'] as const;
/** A lead in one of these needs no follow-up and counts as no one's workload. */
export const CLOSED_STAGES = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'] as const;
export const isClosedStage = (status: string) => (CLOSED_STAGES as readonly string[]).includes(status);

export const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPERTY_INTEREST: 'Property interest',
  VIEWING_SCHEDULED: 'Viewing scheduled',
  VIEWED: 'Viewing completed',
  NEGOTIATION: 'Negotiation',
  RESERVED: 'Reserved',
  CONTRACT: 'Contract / documentation',
  SOLD: 'Sold',
  ON_HOLD: 'On hold',
  LOST: 'Lost / not interested',
  DISQUALIFIED: 'Disqualified',
  SPAM: 'Spam',
};

/** Where a lead sits in the journey, for "never move backwards" automation. */
export const stageRank = (status: string) => (PIPELINE_STAGES as readonly string[]).indexOf(status);

/** The pipeline a new property starts with. Admins rename, recolour, reorder and extend it. */
export const DEFAULT_PIPELINE: { label: string; category: string; color: string; probability: number }[] = [
  { label: 'New', category: 'NEW', color: 'blue', probability: 5 },
  { label: 'Contacted', category: 'CONTACTED', color: 'sky', probability: 10 },
  { label: 'Qualified', category: 'QUALIFIED', color: 'teal', probability: 20 },
  { label: 'Property interest', category: 'PROPERTY_INTEREST', color: 'indigo', probability: 30 },
  { label: 'Viewing scheduled', category: 'VIEWING_SCHEDULED', color: 'purple', probability: 40 },
  { label: 'Viewing completed', category: 'VIEWED', color: 'purple', probability: 50 },
  { label: 'Negotiation', category: 'NEGOTIATION', color: 'orange', probability: 65 },
  { label: 'Reserved', category: 'RESERVED', color: 'amber', probability: 80 },
  { label: 'Contract / documentation', category: 'CONTRACT', color: 'teal', probability: 90 },
  { label: 'Sold', category: 'SOLD', color: 'green', probability: 100 },
  { label: 'On hold', category: 'ON_HOLD', color: 'grey', probability: 10 },
  { label: 'Lost / not interested', category: 'LOST', color: 'grey', probability: 0 },
  { label: 'Disqualified', category: 'DISQUALIFIED', color: 'red', probability: 0 },
];

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

/** The activities a person logs by hand. The rest are written by the system. */
export const LEAD_NOTE_KINDS = ['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'MEETING'] as const;
export const LEAD_NOTE_LABEL: Record<string, string> = {
  NOTE: 'Note',
  CALL: 'Call',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  MEETING: 'Meeting',
  VIEWING: 'Viewing',
  DOCUMENT: 'Document',
  TASK: 'Task',
  ASSIGNMENT: 'Assignment',
  RESERVATION: 'Reservation',
  DEAL: 'Deal',
  STATUS: 'Stage change',
  SYSTEM: 'System',
};

/** A new lead should hear back within this many hours (the "first response" promise). */
export const FIRST_RESPONSE_HOURS = 24;

/** A repeat submission from the same address within this window joins the first lead (§15.6). */
export const ENQUIRY_DEDUP_HOURS = 24;

/** Is a lead overdue: no first response in time, or a follow-up date that has passed? */
export function isLeadOverdue(
  lead: { status: string; createdAt: string | Date; contactedAt: string | Date | null; followUpAt: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (isClosedStage(lead.status) || lead.status === 'ON_HOLD') return false;
  if (lead.followUpAt && new Date(lead.followUpAt).getTime() < now.getTime()) return true;
  if (!lead.contactedAt && lead.status === 'NEW') {
    return now.getTime() - new Date(lead.createdAt).getTime() > FIRST_RESPONSE_HOURS * 3_600_000;
  }
  return false;
}

// ─── Viewings (§15.2) ────────────────────────────────────────────────────

export const VIEWING_STATUSES = ['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const;
export type ViewingStatusValue = (typeof VIEWING_STATUSES)[number];
export const VIEWING_STATUS_LABEL: Record<ViewingStatusValue, string> = {
  REQUESTED: 'Requested',
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'Rescheduled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
};
/** A viewing with a time on the calendar that has not happened yet. */
export const BOOKED_VIEWING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] as const;
export const isBookedViewing = (status: string) => (BOOKED_VIEWING_STATUSES as readonly string[]).includes(status);

export const VIEWING_INTERESTS = ['VERY_INTERESTED', 'INTERESTED', 'NEEDS_FOLLOW_UP', 'NOT_INTERESTED', 'WANTS_ANOTHER'] as const;
export const VIEWING_INTEREST_LABEL: Record<(typeof VIEWING_INTERESTS)[number], string> = {
  VERY_INTERESTED: 'Very interested',
  INTERESTED: 'Interested',
  NEEDS_FOLLOW_UP: 'Needs follow-up',
  NOT_INTERESTED: 'Not interested',
  WANTS_ANOTHER: 'Wants another property',
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
