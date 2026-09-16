import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { formatMoney, formatPercent, formatQuarter, provenanceNote } from '@avida/types';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { PublicService } from './public.service.js';

const INK = '#1b1c19';
const MUTED = '#6d6a63';
const STONE = '#efebe3';
const ACCENT = '#9a7b4f';
const LINE = '#d9d3c7';

const A4 = { w: 595.28, h: 841.89 };
const M = 48;

const STATUS: Record<string, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold', unavailable: 'Not available' };

/**
 * Roadmap item 49 — a residence brochure generated on request from live data.
 *
 * Nothing in it is typed by hand or cached: the price, status, areas, rooms,
 * plan, specification and payment schedule are read at the moment of download,
 * so a brochure can never quote a price the admin has changed or offer a
 * residence that has sold. A sold or reserved residence prints its status and no
 * price — the same rule the website follows.
 */
@Injectable()
export class BrochureService {
  private readonly log = new Logger(BrochureService.name);

  constructor(
    private readonly publicService: PublicService,
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
  ) {}

  async residence(code: string): Promise<{ filename: string; pdf: Buffer }> {
    const r = await this.publicService.residence(code);
    const developmentId = await this.dev.id();
    const d = await this.prisma.client.development.findUniqueOrThrow({
      where: { id: developmentId },
      select: { name: true, tagline: true, city: true, addressLine: true, handoverDate: true, contactPhone: true, contactEmail: true, whatsappNumber: true, developerName: true, architect: true },
    });

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${d.name} — Residence ${r.label}`, Author: d.name, Subject: 'Residence brochure' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // ── Page 1: the opening ──────────────────────────────────────────────
    const heroH = 430;
    const hero = await this.jpeg(r.images[0]?.id);
    doc.rect(0, 0, A4.w, heroH).fill(INK);
    if (hero) doc.image(hero, 0, 0, { cover: [A4.w, heroH], align: 'center', valign: 'center' });
    doc.rect(0, heroH - 150, A4.w, 150).fillOpacity(0.55).fill('#000').fillOpacity(1);
    doc.fillColor(STONE).font('Helvetica').fontSize(9).text(d.name.toUpperCase(), M, 40, { characterSpacing: 2.5 });
    doc.font('Times-Roman').fontSize(54).fillColor('#ffffff').text(`Residence ${r.label}`, M, heroH - 128, { width: A4.w - M * 2 });
    doc.font('Helvetica').fontSize(12).fillColor(STONE).text(`${r.type.name} · ${r.floor.label}${d.city ? ` · ${d.city}` : ''}`, M, heroH - 56);
    if (r.images[0]?.note) doc.fontSize(7).fillColor(STONE).text(r.images[0].note, A4.w - M - 200, heroH - 20, { width: 200, align: 'right' });

    let y = heroH + 36;
    // Status and price, exactly as the website states them.
    doc.roundedRect(M, y, 108, 24, 12).fill(r.status === 'available' ? ACCENT : LINE);
    doc.fillColor(r.status === 'available' ? '#fff' : INK).font('Helvetica-Bold').fontSize(9).text(STATUS[r.status] ?? r.status, M, y + 8, { width: 108, align: 'center' });
    doc.fillColor(INK).font('Times-Roman').fontSize(28).text(r.priceMinor !== null ? formatMoney({ amountMinor: r.priceMinor, currency: r.currency }) : 'Price on request', M + 128, y - 4);
    if (r.listPriceMinor) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`List price ${formatMoney({ amountMinor: r.listPriceMinor, currency: r.currency })}`, M + 128, y + 28);
    y += 64;

    // Key facts in a four-column band.
    const facts: [string, string][] = [
      ['Total area', `${r.areaSqm} m²`],
      ['Bedrooms', String(r.bedrooms)],
      ['Bathrooms', String(r.bathrooms)],
      ['Floor', r.floor.label],
      ...(r.interiorSqm ? ([['Interior', `${r.interiorSqm} m²`]] as [string, string][]) : []),
      ...(r.balconySqm ? ([['Balcony', `${r.balconySqm} m²`]] as [string, string][]) : []),
      ...(r.terraceSqm ? ([['Terrace', `${r.terraceSqm} m²`]] as [string, string][]) : []),
      ...(r.parkingIncluded ? ([['Parking', `${r.parkingIncluded} bay${r.parkingIncluded === 1 ? '' : 's'}`]] as [string, string][]) : []),
    ];
    const colW = (A4.w - M * 2) / 4;
    doc.moveTo(M, y).lineTo(A4.w - M, y).lineWidth(0.5).strokeColor(LINE).stroke();
    facts.slice(0, 8).forEach(([label, value], i) => {
      const cx = M + (i % 4) * colW;
      const cy = y + 14 + Math.floor(i / 4) * 52;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), cx, cy, { characterSpacing: 1.2, width: colW - 8 });
      doc.font('Times-Roman').fontSize(17).fillColor(INK).text(value, cx, cy + 14, { width: colW - 8 });
    });
    y += 14 + Math.ceil(Math.min(8, facts.length) / 4) * 52;
    doc.moveTo(M, y).lineTo(A4.w - M, y).strokeColor(LINE).stroke();
    y += 22;

    const description = r.shortDescription ?? r.description ?? r.type.description;
    if (description) {
      doc.font('Times-Roman').fontSize(12.5).fillColor(INK).text(description.replace(/\s+/g, ' ').trim(), M, y, { width: A4.w - M * 2, lineGap: 3, height: A4.h - y - 70, ellipsis: true });
    }
    this.footer(doc, d.name, 1);

    // ── Page 2: the plan and the rooms ───────────────────────────────────
    doc.addPage();
    y = M;
    this.heading(doc, 'The plan', y);
    y += 40;
    const placed = r.rooms.filter((room) => room.planX != null && room.planY != null && room.planW && room.planH);
    if (placed.length) {
      const minX = Math.min(...placed.map((p) => p.planX!));
      const minY = Math.min(...placed.map((p) => p.planY!));
      const maxX = Math.max(...placed.map((p) => p.planX! + p.planW!));
      const maxY = Math.max(...placed.map((p) => p.planY! + p.planH!));
      const boxW = A4.w - M * 2;
      const scale = Math.min(boxW / (maxX - minX), 300 / (maxY - minY));
      const ox = M + (boxW - (maxX - minX) * scale) / 2;
      for (const p of placed) {
        const x = ox + (p.planX! - minX) * scale;
        const py = y + (p.planY! - minY) * scale;
        const w = p.planW! * scale;
        const h = p.planH! * scale;
        doc.rect(x, py, w, h).lineWidth(1).fillAndStroke(p.planOpen ? '#f6f3ec' : '#ffffff', INK);
        doc.font('Helvetica').fontSize(Math.max(6, Math.min(9, w / 9))).fillColor(INK).text(p.name, x + 3, py + h / 2 - 4, { width: w - 6, align: 'center', lineBreak: false, ellipsis: true });
      }
      y += (maxY - minY) * scale + 14;
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('Indicative layout, not to scale. The architect’s dimensioned plan is available from the sales team.', M, y);
      y += 28;
    }
    if (r.rooms.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('ROOMS', M, y, { characterSpacing: 1.5 });
      y += 16;
      for (const room of r.rooms) {
        doc.font('Helvetica').fontSize(10).fillColor(INK).text(room.name, M, y, { width: 300 });
        if (room.areaSqm != null) doc.text(`${room.areaSqm} m²`, A4.w - M - 100, y, { width: 100, align: 'right' });
        y += 16;
        doc.moveTo(M, y - 3).lineTo(A4.w - M, y - 3).lineWidth(0.3).strokeColor(LINE).stroke();
        if (y > A4.h - 120) break;
      }
    }
    this.footer(doc, d.name, 2);

    // ── Page 3: specification, payment, contact ──────────────────────────
    doc.addPage();
    y = M;
    if (r.specifications?.length) {
      this.heading(doc, 'Specification', y);
      y += 40;
      for (const s of r.specifications) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(s.label, M, y, { width: 120 });
        const h = doc.font('Helvetica').fontSize(9.5).heightOfString(s.value, { width: A4.w - M * 2 - 140 });
        doc.fillColor(INK).text(s.value, M + 140, y, { width: A4.w - M * 2 - 140 });
        y += Math.max(16, h + 8);
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('The specification is indicative and confirmed in the sale contract.', M, y + 2);
      y += 36;
    }
    if (r.paymentPlan?.milestones.length) {
      this.heading(doc, 'Payment plan', y);
      y += 40;
      for (const m of r.paymentPlan.milestones) {
        doc.font('Times-Roman').fontSize(18).fillColor(ACCENT).text(formatPercent(m.percent), M, y - 3, { width: 80 });
        doc.font('Helvetica').fontSize(10).fillColor(INK).text(m.label, M + 90, y, { width: 260 });
        if (r.priceMinor !== null) doc.text(formatMoney({ amountMinor: Math.round((r.priceMinor * m.percent) / 100), currency: r.currency }), A4.w - M - 140, y, { width: 140, align: 'right' });
        y += 26;
      }
      if (d.handoverDate) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Planned handover ${formatQuarter(d.handoverDate)}.`, M, y + 4);
        y += 24;
      }
      y += 16;
    }

    // The contact panel, anchored to the foot of the page.
    const panelY = A4.h - 210;
    doc.rect(0, panelY, A4.w, 210).fill(INK);
    doc.font('Times-Roman').fontSize(26).fillColor('#ffffff').text(r.status === 'available' ? 'Arrange a private viewing.' : 'Talk to the sales team.', M, panelY + 36);
    const lines = [d.contactPhone && `Telephone  ${d.contactPhone}`, d.whatsappNumber && `WhatsApp  ${d.whatsappNumber}`, d.contactEmail && `Email  ${d.contactEmail}`, d.addressLine].filter(Boolean) as string[];
    doc.font('Helvetica').fontSize(10).fillColor(STONE).text(lines.join('\n'), M, panelY + 86, { lineGap: 5 });
    const credits = [d.developerName && `Developer: ${d.developerName}`, d.architect && `Architect: ${d.architect}`].filter(Boolean).join('   ');
    doc.fontSize(7).fillColor('#a8a298').text(`${credits ? `${credits}   ` : ''}Generated ${new Date().toISOString().slice(0, 10)} from live availability. Prices and availability change; the sale contract is the authority.${r.images[0] ? ` ${provenanceNote(r.images[0].provenance)}` : ''}`, M, A4.h - 36, { width: A4.w - M * 2 });

    doc.end();
    return { filename: `${d.name.replace(/[^A-Za-z0-9]+/g, '-')}-Residence-${r.label.replace(/\s+/g, '-')}.pdf`, pdf: await done };
  }

  /**
   * A shortlist, side by side. A buyer abroad compares two or three residences
   * with family before committing, and until now the only way to do that was a
   * screenshot. Same rule as the single brochure: read live, and never print a
   * price for a residence that is not on sale.
   */
  async shortlist(codes: string[]): Promise<{ filename: string; pdf: Buffer }> {
    const picked = codes.slice(0, 3);
    const residences = await Promise.all(picked.map((c) => this.publicService.residence(c)));
    const developmentId = await this.dev.id();
    const d = await this.prisma.client.development.findUniqueOrThrow({
      where: { id: developmentId },
      select: { name: true, city: true, addressLine: true, handoverDate: true, contactPhone: true, contactEmail: true, whatsappNumber: true, developerName: true },
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: { Title: `${d.name} — shortlist`, Author: d.name, Subject: 'Residence comparison' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const W = A4.h;
    const H = A4.w;
    doc.rect(0, 0, W, H).fill(STONE);

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(d.name.toUpperCase(), M, 38, { characterSpacing: 2.5 });
    doc.fillColor(INK).font('Times-Roman').fontSize(30).text('Your shortlist', M, 56);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `${residences.length} residence${residences.length === 1 ? '' : 's'} in ${d.city}, compared on ${new Date().toISOString().slice(0, 10)}.`,
        M,
        96,
      );

    const top = 130;
    const gap = 18;
    const colW = (W - M * 2 - gap * (residences.length - 1)) / residences.length;
    const imageH = 150;

    const rows: { label: string; value: (r: (typeof residences)[number]) => string }[] = [
      { label: 'Type', value: (r) => r.type?.name ?? '—' },
      { label: 'Floor', value: (r) => r.floor?.label ?? '—' },
      { label: 'Interior', value: (r) => (r.areaSqm ? `${r.areaSqm} m²` : '—') },
      { label: 'Balcony', value: (r) => (r.balconySqm ? `${r.balconySqm} m²` : '—') },
      { label: 'Bedrooms', value: (r) => String(r.bedrooms ?? '—') },
      { label: 'Bathrooms', value: (r) => (r.bathrooms === null || r.bathrooms === undefined ? '—' : String(r.bathrooms)) },
      { label: 'Parking', value: (r) => (r.parkingIncluded ? String(r.parkingIncluded) : '—') },
      { label: 'Availability', value: (r) => STATUS[r.status] ?? r.status },
      {
        label: 'Price',
        value: (r) =>
          r.status === 'available' && r.priceMinor !== null
            ? formatMoney({ amountMinor: r.priceMinor, currency: r.currency })
            : 'On request',
      },
    ];

    for (const [i, r] of residences.entries()) {
      const x = M + i * (colW + gap);
      const image = await this.jpeg(r.images[0]?.id);
      doc.rect(x, top, colW, imageH).fill('#e4ded3');
      if (image) doc.image(image, x, top, { cover: [colW, imageH], align: 'center', valign: 'center' });

      doc.fillColor(INK).font('Times-Roman').fontSize(22).text(r.label, x, top + imageH + 14, { width: colW });

      let y = top + imageH + 48;
      for (const row of rows) {
        doc.moveTo(x, y - 8).lineTo(x + colW, y - 8).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(row.label.toUpperCase(), x, y, { width: colW, characterSpacing: 1.2 });
        doc.font('Helvetica').fontSize(10.5).fillColor(row.label === 'Price' ? ACCENT : INK).text(row.value(r), x, y + 11, { width: colW });
        y += 30;
      }
    }

    const panelH = 96;
    doc.rect(0, H - panelH, W, panelH).fill(INK);
    doc.font('Times-Roman').fontSize(18).fillColor('#ffffff').text('Arrange a private viewing.', M, H - panelH + 24);
    const lines = [d.contactPhone && `Telephone  ${d.contactPhone}`, d.whatsappNumber && `WhatsApp  ${d.whatsappNumber}`, d.contactEmail && `Email  ${d.contactEmail}`]
      .filter(Boolean)
      .join('     ');
    doc.font('Helvetica').fontSize(9).fillColor(STONE).text(lines, M, H - panelH + 52);
    doc
      .fontSize(7)
      .fillColor('#a8a298')
      .text(
        `${d.developerName ? `Developer: ${d.developerName}   ` : ''}Generated from live availability. Images are artist's impressions. Prices and availability change; the sale contract is the authority.`,
        M,
        H - 24,
        { width: W - M * 2 },
      );

    doc.end();
    return { filename: `${d.name.replace(/[^A-Za-z0-9]+/g, '-')}-Shortlist.pdf`, pdf: await done };
  }

  private heading(doc: PDFKit.PDFDocument, text: string, y: number) {
    doc.font('Helvetica').fontSize(8).fillColor(ACCENT).text(text.toUpperCase(), M, y, { characterSpacing: 2 });
    doc.moveTo(M, y + 16).lineTo(A4.w - M, y + 16).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  private footer(doc: PDFKit.PDFDocument, name: string, page: number) {
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(`${name} · ${page}`, M, A4.h - 28, { width: A4.w - M * 2, align: 'right', lineBreak: false });
  }

  /** A library image as a JPEG pdfkit can embed (renditions are WebP). */
  private async jpeg(mediaId: string | undefined): Promise<Buffer | null> {
    if (!mediaId) return null;
    try {
      const m = await this.prisma.client.media.findUnique({ where: { id: mediaId }, select: { storageKey: true, variants: true } });
      if (!m) return null;
      const variants = (m.variants ?? {}) as Record<string, string>;
      const key = variants['1600'] ?? variants['800'] ?? m.storageKey;
      const raw = await this.storage.read(key);
      return raw ? await sharp(raw).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer() : null;
    } catch (error) {
      this.log.warn(`Brochure image skipped: ${(error as Error).message}`);
      return null;
    }
  }
}
