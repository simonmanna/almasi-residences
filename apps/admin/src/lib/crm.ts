import { invalidate } from './query';

/** Shapes the CRM endpoints return. The API is the source of truth; these only describe it. */

export interface UnitCard {
  id: string;
  code: string;
  status: string;
  priceMinor: number;
  currency: string;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  floor: { id: string; label: string; displayName: string | null; level: number };
  typology: { id: string; name: string };
}

export interface Stage {
  id: string;
  label: string;
  category: string;
  color: string;
  position: number;
  probability: number;
  active: boolean;
}

export interface LeadRow {
  id: string;
  createdAt: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  countryIso: string | null;
  city: string | null;
  intent: string;
  status: string;
  stageId: string | null;
  stage: { id: string; label: string; color: string; category: string } | null;
  leadSource: string;
  campaign: { id: string; name: string } | null;
  score: number;
  temperature: string | null;
  effectiveTemperature: 'HOT' | 'WARM' | 'COLD';
  priority: string;
  tags: string[];
  assignedToId: string | null;
  assignedToName: string | null;
  followUpAt: string | null;
  contactedAt: string | null;
  lastContactAt: string | null;
  lastActivityAt: string | null;
  stageChangedAt: string;
  repeatCount: number;
  noteCount: number;
  openTaskCount: number;
  nextTask: { id: string; title: string; dueAt: string | null; type: string } | null;
  overdue: boolean;
  openViewing: { id: string; status: string; scheduledAt: string | null; requestedDate: string | null } | null;
  openDeal: { id: string; status: string; agreedPriceMinor: number | null; listPriceMinor: number } | null;
  buyer: { id: string; fullName: string } | null;
  units: UnitCard[];
  primaryUnit: UnitCard | null;
  primaryUnitId: string | null;
  typology: { id: string; name: string } | null;
  bedrooms: number | null;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  valueMinor: number;
}

export interface LeadList {
  data: LeadRow[];
  meta: { total: number; page: number; pageSize: number; pages: number };
  byStatus: Record<string, number>;
  overdue: number;
  mine: number;
  unassigned: number;
  new: number;
}

export interface Task {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: string | null;
  allDay: boolean;
  notes: string | null;
  completedAt: string | null;
  enquiryId: string | null;
  enquiry?: { id: string; name: string; phone: string | null; whatsapp: string | null; email: string | null; status: string; stage: { label: string; color: string } | null } | null;
  unit?: { id: string; code: string } | null;
  assignedTo?: { id: string; name: string } | null;
  assignedToId: string | null;
}

export interface Deal {
  id: string;
  status: string;
  listPriceMinor: number;
  agreedPriceMinor: number | null;
  discountMinor: number | null;
  reservationAmountMinor: number | null;
  currency: string;
  expectedCloseAt: string | null;
  contractSignedAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  lostNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  unit: UnitCard;
  agent: { id: string; name: string } | null;
  enquiry?: { id: string; name: string; phone: string | null; email: string | null; status: string } | null;
  buyer?: { id: string; fullName: string } | null;
  paymentPlan: { id: string; name: string } | null;
  paymentPlanId?: string | null;
  reservation?: { id: string; status: string; heldUntil: string; depositMinor: number | null; depositReceivedAt: string | null } | null;
}

export interface Activity {
  id: string;
  kind: string;
  body: string;
  direction: string | null;
  durationMin: number | null;
  pinned: boolean;
  createdAt: string;
  authorName: string;
  meta?: Record<string, unknown> | null;
}

export const LEAD_KEYS = ['enquiries', 'crm:', 'dashboard', 'sales-desk', 'viewings', 'reservations', 'search'];
/** Every screen that reads CRM data refetches after a write. */
export const refreshCrm = () => invalidate(...LEAD_KEYS);

export const whatsappUrl = (phone: string, text?: string) => `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** `2026-09-19T14:30` in the browser's zone, for datetime-local inputs. */
export function localDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** Quick due-date presets, in the browser's day. */
export function presetDue(kind: 'later' | 'tomorrow' | 'next-week' | 'in-3'): Date {
  const d = new Date();
  if (kind === 'later') {
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() + (kind === 'tomorrow' ? 1 : kind === 'in-3' ? 3 : 7));
  d.setHours(10, 0, 0, 0);
  return d;
}

/** "Today 14:30", "Tomorrow 10:00", "Mon 12 Oct", "3 days ago". */
export function relDay(value: string | Date | null | undefined, withTime = true): string {
  if (!value) return '—';
  const d = new Date(value);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const time = withTime ? ` ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d)}` : '';
  if (diff === 0) return `Today${time}`;
  if (diff === 1) return `Tomorrow${time}`;
  if (diff === -1) return `Yesterday${time}`;
  if (diff > 1 && diff < 7) return `${new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d)}${time}`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== start.getFullYear() ? { year: 'numeric' } : {}) }).format(d);
}

export const isPast = (value: string | null | undefined) => Boolean(value && new Date(value).getTime() < Date.now());
