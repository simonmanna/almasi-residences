import { formatMoney } from './format.js';
import { STAGE_LABEL, VIEWING_SLOTS } from './sales.js';

declare const process: { env: Record<string, string | undefined> };

/**
 * The words of every email the platform sends. Plain text: it reads well in any
 * client, survives forwarding, and never trips a spam filter for its markup.
 * Kept here, apart from the logic, so the sales team can review them in one place.
 */

const SITE = () => (process.env.WEB_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = () => (process.env.ADMIN_PUBLIC_URL || 'http://localhost:3002').replace(/\/$/, '');

const when = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: process.env.SALES_TIMEZONE || 'Africa/Kigali' }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
const slotLabel = (slot: string | null | undefined) => VIEWING_SLOTS.find((s) => s.key === slot)?.label ?? slot ?? '';

interface LeadUnit {
  code: string;
  priceMinor: number;
  currency: string;
  typologyName: string;
  status: string;
}

export function emailEnquiryAlert(p: {
  developmentName: string;
  enquiryId: string;
  name: string;
  email: string;
  phone: string;
  intent: string;
  message?: string | null;
  units: LeadUnit[];
  source?: string | null;
  repeat?: boolean;
  viewing?: { date: Date | null; slot: string | null } | null;
}) {
  const codes = p.units.map((u) => u.code).join(', ');
  const subject = `${p.repeat ? 'Repeat enquiry' : p.viewing ? 'Viewing request' : 'New enquiry'} — ${codes || p.developmentName} — ${p.name}`;
  const text = [
    p.repeat ? `${p.name} has asked again. It was added to their existing lead rather than creating a second one.` : `A new lead from the website.`,
    '',
    `Name: ${p.name}`,
    `Email: ${p.email}`,
    `Phone: ${p.phone}`,
    `Asked for: ${p.intent.toLowerCase()}`,
    ...(p.viewing ? [`Preferred viewing: ${p.viewing.date ? day(p.viewing.date) : 'any day'}${p.viewing.slot ? `, ${slotLabel(p.viewing.slot)}` : ''}`] : []),
    ...p.units.map((u) => `Residence ${u.code} — ${u.typologyName} — ${formatMoney({ amountMinor: u.priceMinor, currency: u.currency })} (${u.status.toLowerCase()})`),
    ...(p.source ? [`From: ${p.source}`] : []),
    ...(p.message ? ['', 'Message:', p.message] : []),
    '',
    `Open the lead: ${ADMIN()}/enquiries?open=${p.enquiryId}`,
    `Reply within one working day — the website promises it.`,
  ].join('\n');
  return { subject, text };
}

export function emailEnquiryAcknowledgement(p: { developmentName: string; firstName: string; residenceCodes: string[]; viewing: boolean; phone: string | null; whatsapp: string | null }) {
  const subject = p.viewing ? `Your viewing request — ${p.developmentName}` : `Thank you for your enquiry — ${p.developmentName}`;
  const text = [
    `Dear ${p.firstName},`,
    '',
    p.viewing
      ? `Thank you for asking to see ${p.residenceCodes.length ? `residence ${p.residenceCodes.join(', ')}` : p.developmentName}. The sales team will reply within one working day to confirm a time with you.`
      : `Thank you for your interest in ${p.residenceCodes.length ? `residence ${p.residenceCodes.join(', ')} at ` : ''}${p.developmentName}. The sales team will reply within one working day.`,
    '',
    ...(p.phone || p.whatsapp ? ['If you would rather talk now:', ...(p.phone ? [`Phone: ${p.phone}`] : []), ...(p.whatsapp ? [`WhatsApp: ${p.whatsapp}`] : []), ''] : []),
    `Meanwhile, every residence and its live availability: ${SITE()}/residences`,
    '',
    `The ${p.developmentName} sales team`,
    '',
    'You are receiving this because you sent an enquiry on our website. We keep your details only to answer it, for up to 24 months.',
  ].join('\n');
  return { subject, text };
}

export function emailViewingConfirmation(p: { developmentName: string; firstName: string; at: Date; durationMinutes: number; location: string | null; agentName: string | null; residenceCodes: string[]; phone: string | null }) {
  return {
    subject: `Your viewing is confirmed — ${when(p.at)}`,
    text: [
      `Dear ${p.firstName},`,
      '',
      `Your private viewing at ${p.developmentName} is confirmed.`,
      '',
      `When: ${when(p.at)} (about ${p.durationMinutes} minutes)`,
      ...(p.location ? [`Where: ${p.location}`] : []),
      ...(p.residenceCodes.length ? [`Residences: ${p.residenceCodes.join(', ')}`] : []),
      ...(p.agentName ? [`You will be met by ${p.agentName}.`] : []),
      '',
      p.phone ? `If you need to change the time, call or message ${p.phone}.` : 'If you need to change the time, reply to this email.',
      '',
      `The ${p.developmentName} sales team`,
    ].join('\n'),
  };
}

export function emailViewingReminder(p: { developmentName: string; firstName: string; at: Date; location: string | null; phone: string | null }) {
  return {
    subject: `Reminder: your viewing tomorrow — ${p.developmentName}`,
    text: [
      `Dear ${p.firstName},`,
      '',
      `A reminder of your viewing at ${p.developmentName}: ${when(p.at)}.`,
      ...(p.location ? [`Where: ${p.location}`] : []),
      '',
      p.phone ? `Running late or need to change? Call or message ${p.phone}.` : 'Need to change? Reply to this email.',
      '',
      `We look forward to meeting you.`,
    ].join('\n'),
  };
}

export function emailLeadsDigest(p: { developmentName: string; uncontacted: { name: string; createdAt: Date; units: string }[]; overdue: { name: string; followUpAt: Date | null; status: string }[]; viewingsToday: { name: string; at: Date; agent: string | null }[] }) {
  const lines = [
    `Good morning. The ${p.developmentName} sales desk today:`,
    '',
    `${p.uncontacted.length} new lead${p.uncontacted.length === 1 ? '' : 's'} not yet contacted`,
    ...p.uncontacted.slice(0, 20).map((l) => `  • ${l.name}${l.units ? ` (${l.units})` : ''} — waiting since ${day(l.createdAt)}`),
    '',
    `${p.overdue.length} follow-up${p.overdue.length === 1 ? '' : 's'} overdue`,
    ...p.overdue.slice(0, 20).map((l) => `  • ${l.name} — ${STAGE_LABEL[l.status] ?? l.status}${l.followUpAt ? `, due ${day(l.followUpAt)}` : ''}`),
    '',
    `${p.viewingsToday.length} viewing${p.viewingsToday.length === 1 ? '' : 's'} today`,
    ...p.viewingsToday.map((v) => `  • ${when(v.at)} — ${v.name}${v.agent ? ` with ${v.agent}` : ''}`),
    '',
    `Open the enquiries: ${ADMIN()}/enquiries`,
  ];
  return { subject: `Sales desk — ${p.uncontacted.length} new, ${p.overdue.length} overdue, ${p.viewingsToday.length} viewings`, text: lines.join('\n') };
}

export function emailReservationExpiring(p: { developmentName: string; code: string; heldUntil: Date; buyerName: string | null; reservationId: string }) {
  return {
    subject: `Hold on ${p.code} lapses ${when(p.heldUntil)}`,
    text: [
      `The reservation of residence ${p.code}${p.buyerName ? ` for ${p.buyerName}` : ''} lapses ${when(p.heldUntil)}.`,
      'When it lapses the residence returns to sale automatically and the website shows it as available.',
      '',
      `Extend it, record the deposit or convert it: ${ADMIN()}/reservations?open=${p.reservationId}`,
    ].join('\n'),
  };
}
