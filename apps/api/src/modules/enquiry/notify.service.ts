import { Injectable, Logger } from '@nestjs/common';
import { formatMoney } from '@avida/types';

interface EnquiryNotification {
  enquiryId: string;
  name: string;
  email: string;
  phone: string;
  intent: string;
  message?: string;
  developmentName: string;
  units: { code: string; priceMinor: number; currency: string; typologyName: string }[];
}

@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);

  /**
   * §5.7 step 5 — email the sales team, with the unit codes and prices in the
   * subject line so the inbox is triageable without opening anything.
   *
   * Phase 2 moves this onto the `notify-email` queue. Until then it is a direct
   * call that never throws into the request path: the enquiry is already
   * persisted by the time this runs (§6.7 — a lead is never lost to a mail
   * failure).
   */
  async enquiryReceived(n: EnquiryNotification): Promise<void> {
    const codes = n.units.map((u) => u.code).join(', ');
    const subject = codes
      ? `Enquiry — ${codes} — ${n.name}`
      : `Enquiry — ${n.developmentName} — ${n.name}`;

    const lines = [
      `Intent: ${n.intent}`,
      `Name: ${n.name}`,
      `Email: ${n.email}`,
      `Phone: ${n.phone}`,
      ...n.units.map(
        (u) =>
          `Unit ${u.code} — ${u.typologyName} — ${formatMoney({ amountMinor: u.priceMinor, currency: u.currency })}`,
      ),
      n.message ? `\nMessage:\n${n.message}` : '',
    ].filter(Boolean);

    const recipients = (process.env.ENQUIRY_NOTIFY_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey || recipients.length === 0) {
      // Not configured yet. Log the fact, never the contents — §5.9 forbids PII
      // in logs, and this body is entirely PII.
      this.log.warn(`Enquiry ${n.enquiryId} not emailed: Resend or recipients not configured`);
      return;
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: process.env.ENQUIRY_FROM_EMAIL ?? 'enquiries@example.invalid',
        to: recipients,
        subject,
        text: lines.join('\n'),
        replyTo: n.email,
      });
      this.log.log(`Enquiry ${n.enquiryId} notification sent to ${recipients.length} recipients`);
    } catch (error) {
      this.log.error(`Enquiry ${n.enquiryId} notification failed: ${(error as Error).message}`);
    }
  }
}
