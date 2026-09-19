/**
 * The CRM's shared vocabulary: where leads come from, how warm they are, what
 * they want, the tasks and deals that move them, and the transparent lead
 * score. The API validates against these lists and computes the score with
 * the same function the admin uses to explain it.
 */

// ─── Lead sources ────────────────────────────────────────────────────────

export const LEAD_SOURCES = [
  'WEBSITE',
  'WHATSAPP',
  'FACEBOOK',
  'INSTAGRAM',
  'GOOGLE',
  'PROPERTY_PORTAL',
  'REFERRAL',
  'WALK_IN',
  'PHONE',
  'EMAIL',
  'CAMPAIGN',
  'AGENT',
  'OTHER',
] as const;
export type LeadSourceValue = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABEL: Record<LeadSourceValue, string> = {
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  GOOGLE: 'Google',
  PROPERTY_PORTAL: 'Property portal',
  REFERRAL: 'Referral',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  EMAIL: 'Email',
  CAMPAIGN: 'Campaign',
  AGENT: 'Sales agent',
  OTHER: 'Other',
};

/** A website lead's channel, read from its UTM tags and referrer. Plain visits stay WEBSITE. */
export function leadSourceFromUtm(utmSource?: string | null, utmMedium?: string | null, referrer?: string | null): LeadSourceValue {
  const s = `${utmSource ?? ''} ${referrer ?? ''}`.toLowerCase();
  if (/facebook|fb\.|meta/.test(s)) return 'FACEBOOK';
  if (/instagram|ig\b/.test(s)) return 'INSTAGRAM';
  if (/whatsapp|wa\.me/.test(s)) return 'WHATSAPP';
  if (/google|gclid/.test(s)) return 'GOOGLE';
  if (/propertypro|property24|jiji|portal|lamudi|buyrentkenya/.test(s)) return 'PROPERTY_PORTAL';
  if ((utmMedium ?? '').toLowerCase() === 'referral') return 'REFERRAL';
  if (utmSource && /email|newsletter|mailchimp/.test(utmSource.toLowerCase())) return 'EMAIL';
  return 'WEBSITE';
}

// ─── Qualification ───────────────────────────────────────────────────────

export const LEAD_TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
export type LeadTemperatureValue = (typeof LEAD_TEMPERATURES)[number];
export const TEMPERATURE_LABEL: Record<LeadTemperatureValue, string> = { HOT: 'Hot', WARM: 'Warm', COLD: 'Cold' };
export const TEMPERATURE_TONE: Record<LeadTemperatureValue, string> = { HOT: 'red', WARM: 'orange', COLD: 'blue' };

export const CONTACT_METHODS = ['PHONE', 'WHATSAPP', 'EMAIL', 'SMS'] as const;
export const CONTACT_METHOD_LABEL: Record<(typeof CONTACT_METHODS)[number], string> = { PHONE: 'Phone call', WHATSAPP: 'WhatsApp', EMAIL: 'Email', SMS: 'SMS' };

export const LEAD_PURPOSES = ['OWN_USE', 'INVESTMENT', 'OTHER'] as const;
export const LEAD_PURPOSE_LABEL: Record<(typeof LEAD_PURPOSES)[number], string> = { OWN_USE: 'Own use', INVESTMENT: 'Investment', OTHER: 'Other' };

export const PURCHASE_TIMELINES = ['IMMEDIATE', 'WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_12_MONTHS', 'OVER_12_MONTHS', 'UNDECIDED'] as const;
export type PurchaseTimelineValue = (typeof PURCHASE_TIMELINES)[number];
export const PURCHASE_TIMELINE_LABEL: Record<PurchaseTimelineValue, string> = {
  IMMEDIATE: 'Immediately',
  WITHIN_3_MONTHS: 'Within 3 months',
  WITHIN_6_MONTHS: 'Within 6 months',
  WITHIN_12_MONTHS: 'Within 12 months',
  OVER_12_MONTHS: 'More than a year',
  UNDECIDED: 'Undecided',
};

export const CRM_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type CrmPriorityValue = (typeof CRM_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<CrmPriorityValue, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };
export const PRIORITY_TONE: Record<CrmPriorityValue, string> = { LOW: 'grey', NORMAL: 'sky', HIGH: 'orange', URGENT: 'red' };

// ─── Tasks ───────────────────────────────────────────────────────────────

export const TASK_TYPES = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'MEETING',
  'FOLLOW_UP',
  'SEND_BROCHURE',
  'SEND_FLOOR_PLAN',
  'SEND_QUOTATION',
  'SEND_PAYMENT_PLAN',
  'SCHEDULE_VIEWING',
  'POST_VIEWING',
  'PAYMENT',
  'OTHER',
] as const;
export type TaskTypeValue = (typeof TASK_TYPES)[number];
export const TASK_TYPE_LABEL: Record<TaskTypeValue, string> = {
  CALL: 'Call customer',
  WHATSAPP: 'WhatsApp customer',
  EMAIL: 'Email customer',
  SMS: 'Text customer',
  MEETING: 'Meeting',
  FOLLOW_UP: 'Follow up',
  SEND_BROCHURE: 'Send brochure',
  SEND_FLOOR_PLAN: 'Send floor plan',
  SEND_QUOTATION: 'Send quotation',
  SEND_PAYMENT_PLAN: 'Discuss payment plan',
  SCHEDULE_VIEWING: 'Schedule viewing',
  POST_VIEWING: 'Follow up after viewing',
  PAYMENT: 'Chase payment',
  OTHER: 'Other',
};
export const TASK_STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;

/**
 * Which bucket a task's due date puts it in, in the viewer's local day. An
 * all-day task is stored due at the end of its day, so it is never overdue
 * before the day is over.
 */
export function taskBucket(dueAt: string | Date | null, now: Date = new Date()): 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'someday' {
  if (!dueAt) return 'someday';
  const due = new Date(dueAt).getTime();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const tomorrow = start.getTime() + 86_400_000;
  if (due < now.getTime()) return 'overdue';
  if (due < tomorrow) return 'today';
  if (due < tomorrow + 86_400_000) return 'tomorrow';
  return 'upcoming';
}

// ─── Deals ───────────────────────────────────────────────────────────────

export const DEAL_STATUSES = ['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD', 'LOST', 'CANCELLED'] as const;
export type DealStatusValue = (typeof DEAL_STATUSES)[number];
export const DEAL_STATUS_LABEL: Record<DealStatusValue, string> = {
  NEGOTIATION: 'Negotiation',
  RESERVED: 'Reserved',
  CONTRACT: 'Contract',
  SOLD: 'Closed / sold',
  LOST: 'Lost',
  CANCELLED: 'Cancelled',
};
export const DEAL_STATUS_TONE: Record<DealStatusValue, string> = { NEGOTIATION: 'orange', RESERVED: 'indigo', CONTRACT: 'teal', SOLD: 'green', LOST: 'grey', CANCELLED: 'grey' };
export const OPEN_DEAL_STATUSES = ['NEGOTIATION', 'RESERVED', 'CONTRACT'] as const;
/** The lead stage category a deal's progress puts its lead in. */
export const DEAL_LEAD_STAGE: Partial<Record<DealStatusValue, string>> = { NEGOTIATION: 'NEGOTIATION', RESERVED: 'RESERVED', CONTRACT: 'CONTRACT', SOLD: 'SOLD' };

// ─── Documents ───────────────────────────────────────────────────────────

export const DOCUMENT_KINDS = ['BROCHURE', 'FLOOR_PLAN', 'PAYMENT_PLAN', 'QUOTATION', 'AGREEMENT', 'ID_DOCUMENT', 'RECEIPT', 'OTHER'] as const;
export const DOCUMENT_KIND_LABEL: Record<(typeof DOCUMENT_KINDS)[number], string> = {
  BROCHURE: 'Brochure',
  FLOOR_PLAN: 'Floor plan',
  PAYMENT_PLAN: 'Payment plan',
  QUOTATION: 'Quotation',
  AGREEMENT: 'Agreement',
  ID_DOCUMENT: 'ID / KYC document',
  RECEIPT: 'Receipt',
  OTHER: 'Other',
};

// ─── Assignment ──────────────────────────────────────────────────────────

export const ASSIGNMENT_MODES = ['MANUAL', 'ROUND_ROBIN', 'LEAST_LOADED'] as const;
export const ASSIGNMENT_MODE_LABEL: Record<(typeof ASSIGNMENT_MODES)[number], string> = {
  MANUAL: 'Manual — a manager assigns each lead',
  ROUND_ROBIN: 'Round robin — new leads rotate through the team',
  LEAST_LOADED: 'Least loaded — the agent with the fewest open leads',
};

/** The tones a pipeline stage may use (they exist in the admin palette). */
export const CRM_TONES = ['blue', 'sky', 'teal', 'indigo', 'purple', 'orange', 'amber', 'green', 'red', 'grey'] as const;

// ─── Lead scoring ────────────────────────────────────────────────────────

export const SCORING_RULES = [
  { key: 'BUDGET_MATCH', label: 'Budget covers the residence', points: 20 },
  { key: 'BUDGET_CONFIRMED', label: 'Budget confirmed', points: 10 },
  { key: 'RESIDENCE_SELECTED', label: 'Specific residence selected', points: 15 },
  { key: 'REQUIREMENTS', label: 'Requirements captured', points: 5 },
  { key: 'VIEWING_BOOKED', label: 'Viewing booked', points: 15 },
  { key: 'VIEWING_COMPLETED', label: 'Viewing completed', points: 10 },
  { key: 'RESPONSIVE', label: 'Responsive — two-way contact in the last 14 days', points: 10 },
  { key: 'TIMELINE_SOON', label: 'Buying within 3 months', points: 10 },
  { key: 'TIMELINE_MID', label: 'Buying within 6 months', points: 5 },
  { key: 'NO_FINANCING', label: 'No financing needed', points: 5 },
  { key: 'DECISION_MAKER', label: 'Decision maker identified', points: 5 },
  { key: 'REPEAT_INTEREST', label: 'Asked more than once', points: 5 },
  { key: 'WARM_SOURCE', label: 'Referral or walk-in', points: 5 },
  { key: 'OPEN_DEAL', label: 'Deal in progress', points: 10 },
  { key: 'STALE', label: 'No activity for 30 days', points: -15 },
] as const;
export type ScoringRuleKey = (typeof SCORING_RULES)[number]['key'];
export interface ScoringRuleSetting {
  key: ScoringRuleKey;
  points: number;
  enabled: boolean;
}

export interface ScoreFacts {
  budgetMaxMinor: number | null;
  /** The price of the residence they want (primary, else the cheapest they asked about). */
  targetPriceMinor: number | null;
  budgetConfirmed: boolean;
  hasResidence: boolean;
  hasRequirements: boolean;
  viewingBooked: boolean;
  viewingCompleted: boolean;
  /** An inbound message, or a logged two-way call/meeting, in the last 14 days. */
  responsive: boolean;
  timeline: string | null;
  financingRequired: boolean | null;
  decisionMaker: string | null;
  repeatCount: number;
  leadSource: string;
  openDeal: boolean;
  lastActivityAt: Date | string | null;
  createdAt: Date | string;
}

export interface ScoreBreakdown {
  score: number;
  items: { key: ScoringRuleKey; label: string; points: number }[];
}

/** Merges saved settings over the defaults, so a new rule appears with its default points. */
export function scoringRules(settings?: ScoringRuleSetting[] | null) {
  return SCORING_RULES.map((r) => {
    const s = settings?.find((x) => x.key === r.key);
    return { key: r.key, label: r.label, points: s ? s.points : r.points, enabled: s ? s.enabled : true };
  });
}

/**
 * The lead score, with every point explained. Nothing here is a guess: each
 * line is a fact the sales team recorded or the system observed.
 */
export function computeLeadScore(f: ScoreFacts, settings?: ScoringRuleSetting[] | null, now: Date = new Date()): ScoreBreakdown {
  const last = new Date(f.lastActivityAt ?? f.createdAt).getTime();
  const hits: Record<ScoringRuleKey, boolean> = {
    BUDGET_MATCH: f.budgetMaxMinor !== null && f.targetPriceMinor !== null && f.budgetMaxMinor >= f.targetPriceMinor * 0.95,
    BUDGET_CONFIRMED: f.budgetConfirmed,
    RESIDENCE_SELECTED: f.hasResidence,
    REQUIREMENTS: f.hasRequirements,
    VIEWING_BOOKED: f.viewingBooked || f.viewingCompleted,
    VIEWING_COMPLETED: f.viewingCompleted,
    RESPONSIVE: f.responsive,
    TIMELINE_SOON: f.timeline === 'IMMEDIATE' || f.timeline === 'WITHIN_3_MONTHS',
    TIMELINE_MID: f.timeline === 'WITHIN_6_MONTHS',
    NO_FINANCING: f.financingRequired === false,
    DECISION_MAKER: Boolean(f.decisionMaker?.trim()),
    REPEAT_INTEREST: f.repeatCount > 0,
    WARM_SOURCE: f.leadSource === 'REFERRAL' || f.leadSource === 'WALK_IN',
    OPEN_DEAL: f.openDeal,
    STALE: now.getTime() - last > 30 * 86_400_000,
  };
  const items = scoringRules(settings)
    .filter((r) => r.enabled && r.points !== 0 && hits[r.key])
    .map((r) => ({ key: r.key, label: r.label, points: r.points }));
  const score = Math.max(0, Math.min(100, items.reduce((a, i) => a + i.points, 0)));
  return { score, items };
}

export function temperatureFor(score: number, override: string | null | undefined, thresholds: { hot: number; warm: number } = { hot: 70, warm: 40 }): LeadTemperatureValue {
  if (override === 'HOT' || override === 'WARM' || override === 'COLD') return override;
  return score >= thresholds.hot ? 'HOT' : score >= thresholds.warm ? 'WARM' : 'COLD';
}
