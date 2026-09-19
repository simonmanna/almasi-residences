/**
 * CRM demo data: a sales team, campaigns, and ~40 realistic leads spread
 * across the pipeline with their calls, messages, tasks, viewings and deals —
 * enough to judge the CRM screens with real-looking work in them.
 *
 * Local only, and idempotent: it does nothing if the demo campaign exists.
 * It never changes a residence's status: reserved and sold deals are placed on
 * residences the inventory seed already marked BOOKED or SOLD.
 *
 *   pnpm --filter @avida/db seed:crm
 */
import type { EnquiryStatus, LeadNoteKind, LeadSource, Prisma, TaskType } from '../generated/client/client.js';
import { DEFAULT_PIPELINE } from '@avida/types';
import { prisma } from '../src/index.js';

const DAY = 86_400_000;
const now = Date.now();
const at = (days: number, hour = 10, minute = 0) => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

let seed = 20260919;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const PEOPLE = [
  ['Sarah Nakato', 'UG', 'Kampala'], ['David Mugisha', 'RW', 'Kigali'], ['Aline Uwase', 'RW', 'Kigali'], ['James Otieno', 'KE', 'Nairobi'],
  ['Grace Mukamana', 'RW', 'Kigali'], ['Eric Habimana', 'RW', 'Musanze'], ['Claudine Ingabire', 'RW', 'Kigali'], ['Peter Kamau', 'KE', 'Nairobi'],
  ['Diane Umutoni', 'RW', 'Kigali'], ['Olivier Niyonzima', 'BI', 'Bujumbura'], ['Fatuma Hassan', 'TZ', 'Dar es Salaam'], ['Jean-Paul Nshimiyimana', 'RW', 'Kigali'],
  ['Amina Wanjiru', 'KE', 'Mombasa'], ['Patrick Rwigema', 'RW', 'Kigali'], ['Chantal Mukeshimana', 'BE', 'Brussels'], ['Samuel Okello', 'UG', 'Entebbe'],
  ['Yvonne Iradukunda', 'RW', 'Huye'], ['Michael Ndayisaba', 'RW', 'Kigali'], ['Linda Achieng', 'KE', 'Kisumu'], ['Emmanuel Kagame', 'RW', 'Kigali'],
  ['Josiane Uwimana', 'FR', 'Lyon'], ['Robert Ssempijja', 'UG', 'Kampala'], ['Nadia Karangwa', 'CA', 'Montreal'], ['Thierry Mutabazi', 'RW', 'Kigali'],
  ['Esther Nyiraneza', 'RW', 'Rubavu'], ['Kevin Mwangi', 'KE', 'Nairobi'], ['Solange Mukandori', 'RW', 'Kigali'], ['Brian Tumusiime', 'UG', 'Mbarara'],
  ['Aisha Mohamed', 'AE', 'Dubai'], ['Innocent Hakizimana', 'RW', 'Kigali'], ['Ruth Wairimu', 'KE', 'Nakuru'], ['Fabrice Gasana', 'RW', 'Kigali'],
  ['Marie-Claire Umubyeyi', 'US', 'Houston'], ['Joseph Byiringiro', 'RW', 'Kigali'], ['Irene Namutebi', 'UG', 'Jinja'], ['Alex Rutayisire', 'GB', 'London'],
  ['Pascaline Mukarugwiza', 'RW', 'Kigali'], ['Daniel Kiprop', 'KE', 'Eldoret'], ['Vanessa Ishimwe', 'RW', 'Kigali'], ['Moses Byaruhanga', 'UG', 'Kampala'],
] as const;

const DIAL: Record<string, string> = { RW: '+25078', UG: '+25677', KE: '+25471', TZ: '+25575', BI: '+25779', BE: '+32470', FR: '+33612', CA: '+1514', US: '+1713', GB: '+44770', AE: '+97150' };
const SOURCES: LeadSource[] = ['WEBSITE', 'WEBSITE', 'WEBSITE', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'PROPERTY_PORTAL', 'REFERRAL', 'WALK_IN', 'PHONE', 'CAMPAIGN'];

/** Stage per lead, in order, so the board has a believable shape. */
const PLAN: EnquiryStatus[] = [
  'NEW', 'NEW', 'NEW', 'NEW', 'NEW',
  'CONTACTED', 'CONTACTED', 'CONTACTED', 'CONTACTED',
  'QUALIFIED', 'QUALIFIED', 'QUALIFIED', 'QUALIFIED',
  'PROPERTY_INTEREST', 'PROPERTY_INTEREST', 'PROPERTY_INTEREST',
  'VIEWING_SCHEDULED', 'VIEWING_SCHEDULED', 'VIEWING_SCHEDULED', 'VIEWING_SCHEDULED',
  'VIEWED', 'VIEWED', 'VIEWED',
  'NEGOTIATION', 'NEGOTIATION', 'NEGOTIATION',
  'RESERVED', 'RESERVED',
  'CONTRACT',
  'SOLD', 'SOLD',
  'ON_HOLD',
  'LOST', 'LOST', 'LOST', 'LOST',
  'DISQUALIFIED',
  'NEW', 'CONTACTED', 'QUALIFIED',
];
const ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPERTY_INTEREST', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'];

async function main() {
  const dev = await prisma.development.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!dev) throw new Error('Run the main seed first.');
  if (await prisma.campaign.findFirst({ where: { developmentId: dev.id, name: 'Kigali launch — Facebook' } })) {
    console.log('› CRM demo data already present; nothing to do.');
    return;
  }

  // ── Team ──
  const manager = await prisma.adminUser.findFirstOrThrow({ where: { role: 'SALES_MANAGER' } });
  const passwordHash = manager.passwordHash;
  const team = [];
  for (const [email, name, role] of [['john.agent@example.invalid', 'John Mugabo', 'SALES_AGENT'], ['mary.agent@example.invalid', 'Mary Uwera', 'SALES_AGENT'], ['marketing@example.invalid', 'Seed marketing', 'MARKETING']] as const) {
    team.push(await prisma.adminUser.upsert({ where: { email }, create: { email, name, role, passwordHash }, update: {} }));
  }
  const [john, mary] = team;
  const agents = [john!, mary!, manager];

  // ── Pipeline & settings ──
  if (!(await prisma.pipelineStage.count({ where: { developmentId: dev.id } }))) {
    await prisma.pipelineStage.createMany({ data: DEFAULT_PIPELINE.map((s, position) => ({ developmentId: dev.id, label: s.label, category: s.category as EnquiryStatus, color: s.color, probability: s.probability, position })) });
  }
  const stages = await prisma.pipelineStage.findMany({ where: { developmentId: dev.id }, orderBy: { position: 'asc' } });
  const stageOf = (st: EnquiryStatus) => stages.find((s) => s.category === st && s.active)?.id ?? null;
  await prisma.crmSettings.upsert({ where: { developmentId: dev.id }, create: { developmentId: dev.id, assignmentMode: 'ROUND_ROBIN', assignmentPool: [john!.id, mary!.id] }, update: {} });

  // ── Campaigns ──
  const campaigns = await Promise.all([
    prisma.campaign.create({ data: { developmentId: dev.id, name: 'Kigali launch — Facebook', channel: 'FACEBOOK', utmCampaign: 'kigali-launch', startsAt: at(-75), endsAt: at(15), budgetMinor: 250_000, notes: 'Carousel of the penthouse renders, Kigali + diaspora targeting.' } }),
    prisma.campaign.create({ data: { developmentId: dev.id, name: 'Diaspora webinar', channel: 'CAMPAIGN', utmCampaign: 'diaspora-webinar', startsAt: at(-40), endsAt: at(-38), budgetMinor: 80_000 } }),
    prisma.campaign.create({ data: { developmentId: dev.id, name: 'Google search — Kimihurura apartments', channel: 'GOOGLE', utmCampaign: 'search-kimihurura', startsAt: at(-90), budgetMinor: 400_000 } }),
  ]);

  // ── Inventory to point at ──
  const units = await prisma.unit.findMany({ where: { developmentId: dev.id, archivedAt: null }, include: { typology: true, floor: true }, orderBy: { code: 'asc' } });
  const available = units.filter((u) => u.status === 'AVAILABLE');
  const booked = units.filter((u) => u.status === 'BOOKED');
  const sold = units.filter((u) => u.status === 'SOLD');
  const plan = await prisma.paymentPlan.findFirst({ where: { developmentId: dev.id } });

  let bookedIdx = 0;
  let soldIdx = 0;
  for (let i = 0; i < PEOPLE.length; i++) {
    const [name, country, city] = PEOPLE[i]!;
    const status = PLAN[i]!;
    const rank = ORDER.indexOf(status);
    const createdAt = at(-Math.round(2 + rand() * 80 - (status === 'NEW' ? 70 : 0)), 8 + Math.floor(rand() * 9), Math.floor(rand() * 60));
    if (status === 'NEW' && i < 3) createdAt.setTime(now - (i + 1) * 5 * 3_600_000);
    const source = pick(SOURCES);
    const campaign = source === 'FACEBOOK' ? campaigns[0] : source === 'CAMPAIGN' ? campaigns[1] : source === 'GOOGLE' && rand() > 0.3 ? campaigns[2] : null;
    // Deals past negotiation sit on residences the inventory already holds.
    let unit = pick(available);
    if (status === 'RESERVED' || status === 'CONTRACT') unit = booked[bookedIdx++ % Math.max(1, booked.length)] ?? unit;
    if (status === 'SOLD') unit = sold[soldIdx++ % Math.max(1, sold.length)] ?? unit;
    const hasUnit = rank >= 3 || (rank >= 0 && rand() > 0.5) || status === 'LOST';
    const agent = status === 'NEW' && i % 2 === 0 ? null : agents[i % agents.length]!;
    const phone = `${DIAL[country] ?? '+25078'}${String(1_000_000 + Math.floor(rand() * 8_999_999)).slice(0, 7)}`;
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.+$/, '')}@example.invalid`;
    const contacted = rank >= 1 || ['LOST', 'ON_HOLD', 'DISQUALIFIED'].includes(status);
    const lastActivity = new Date(Math.min(now - 3_600_000, createdAt.getTime() + (1 + rand() * 20) * DAY));
    const budget = Math.round((unit.priceMinor * (0.9 + rand() * 0.3)) / 100_000) * 100_000;
    const purgeAfter = new Date(createdAt.getTime() + 730 * DAY);

    const lead = await prisma.enquiry.create({
      data: {
        developmentId: dev.id,
        name,
        email,
        phone,
        whatsapp: rand() > 0.3 ? phone : null,
        countryIso: country,
        city,
        preferredContact: pick(['PHONE', 'WHATSAPP', 'WHATSAPP', 'EMAIL'] as const),
        message: pick([
          'I would like to know the payment plan for a two-bedroom.',
          'Is the penthouse still available? Interested in a viewing next week.',
          'Looking for an investment unit with good rental yield.',
          'Please send the brochure and floor plans.',
          'Relocating to Kigali in the new year — what is ready by then?',
          null,
        ]),
        intent: rank >= 4 ? 'VIEWING' : 'INFORMATION',
        source: source === 'WEBSITE' ? pick(['unit-panel', 'floating-cta', 'footer']) : 'admin',
        leadSource: source,
        campaignId: campaign?.id ?? null,
        utmCampaign: campaign?.utmCampaign ?? null,
        status,
        stageId: stageOf(status),
        stageChangedAt: new Date(Math.min(now - 3_600_000, createdAt.getTime() + rank * 3 * DAY)),
        assignedToId: agent?.id ?? null,
        createdById: source === 'WALK_IN' || source === 'PHONE' ? agent?.id ?? manager.id : null,
        priority: rank >= 6 ? 'HIGH' : i % 7 === 0 ? 'URGENT' : 'NORMAL',
        temperature: status === 'ON_HOLD' ? 'COLD' : null,
        typologyId: rand() > 0.3 ? unit.typologyId : null,
        primaryUnitId: hasUnit ? unit.id : null,
        bedrooms: rand() > 0.4 ? unit.bedrooms : null,
        budgetMinMinor: rand() > 0.5 ? Math.round(budget * 0.8) : null,
        budgetMaxMinor: rank >= 2 || rand() > 0.5 ? budget : null,
        budgetConfirmed: rank >= 4,
        purpose: pick(['OWN_USE', 'OWN_USE', 'INVESTMENT'] as const),
        financingRequired: rank >= 2 ? rand() > 0.6 : null,
        timeline: rank >= 2 ? pick(['IMMEDIATE', 'WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'WITHIN_12_MONTHS'] as const) : null,
        decisionMaker: rank >= 3 ? pick(['Self', 'Self and spouse', 'Company board']) : null,
        floorPreference: rand() > 0.6 ? pick(['High floor', 'Not ground floor', 'Penthouse level']) : null,
        tags: rand() > 0.6 ? [pick(['diaspora', 'investor', 'cash-buyer', 'relocation', 'vip'])] : [],
        lostReason: status === 'LOST' ? pick(['PRICE', 'FINANCING', 'CHOSE_COMPETITOR', 'NO_RESPONSE', 'TIMING'] as const) : null,
        contactedAt: contacted ? new Date(createdAt.getTime() + (0.5 + rand() * 30) * 3_600_000) : null,
        lastContactAt: contacted ? lastActivity : null,
        lastActivityAt: lastActivity,
        createdAt,
        purgeAfter,
        units: hasUnit ? { create: [{ unitId: unit.id }] } : undefined,
      },
    });

    // Stage history, one step at a time.
    const steps = status === 'LOST' || status === 'DISQUALIFIED' || status === 'ON_HOLD' ? ['NEW', 'CONTACTED', 'QUALIFIED', status] : ORDER.slice(0, rank + 1);
    let t = createdAt.getTime();
    let prev: EnquiryStatus | null = null;
    for (const st of steps as EnquiryStatus[]) {
      await prisma.leadStageChange.create({ data: { enquiryId: lead.id, fromStatus: prev, toStatus: st, toStageId: stageOf(st), fromStageId: prev ? stageOf(prev) : null, actorId: agent?.id ?? null, createdAt: new Date(Math.min(t, now - 3_600_000)) } });
      prev = st;
      t += (1 + rand() * 5) * DAY;
    }

    // The timeline.
    const notes: { kind: LeadNoteKind; body: string; dir?: 'IN' | 'OUT'; mins?: number; days: number }[] = [
      { kind: 'SYSTEM', body: `New enquiry via ${source.toLowerCase().replace('_', ' ')}`, dir: 'IN', days: 0 },
    ];
    if (contacted) {
      notes.push({ kind: 'CALL', body: pick(['Introduced Almasi; wants details on the two-bedroom units.', 'First call — interested, asked about completion date.', 'Discussed budget and timeline; prefers WhatsApp.']), dir: 'OUT', mins: 4 + Math.floor(rand() * 12), days: 0.2 });
      notes.push({ kind: 'WHATSAPP', body: 'Sent brochure and floor plan PDF.', dir: 'OUT', days: 0.4 });
    }
    if (rank >= 2) notes.push({ kind: 'WHATSAPP', body: pick(['Replied: likes the balcony layout, asked about parking.', 'Asked if a 30% deposit is possible.', 'Confirmed budget, wants a high floor.']), dir: 'IN', days: 2 });
    if (rank >= 3) notes.push({ kind: 'EMAIL', body: `Sent payment plan for ${unit.code}.`, dir: 'OUT', days: 4 });
    if (rank >= 5) notes.push({ kind: 'MEETING', body: `Site visit — walked through ${unit.code} and the amenities.`, mins: 50, days: 8 });
    if (rank >= 6) notes.push({ kind: 'CALL', body: 'Negotiating on price; asked for a discount for a cash payment.', dir: 'IN', mins: 12, days: 10 });
    if (status === 'LOST') notes.push({ kind: 'CALL', body: 'Decided not to proceed.', dir: 'IN', mins: 3, days: 12 });
    for (const n of notes) {
      await prisma.leadNote.create({ data: { enquiryId: lead.id, kind: n.kind, body: n.body, direction: n.dir ?? null, durationMin: n.mins ?? null, authorId: n.kind === 'SYSTEM' ? null : agent?.id ?? manager.id, createdAt: new Date(Math.min(createdAt.getTime() + n.days * DAY, now - 2 * 3_600_000)) } });
    }

    // Tasks: the next action on every open lead.
    const open = !['SOLD', 'LOST', 'DISQUALIFIED'].includes(status);
    if (open && agent) {
      const due = pick([-2, -1, -0.1, 0.1, 0.3, 1, 2, 4, 7]);
      const [title, type] = pick([
        ['Call back about payment plan', 'CALL'],
        ['Send quotation', 'SEND_QUOTATION'],
        ['Send floor plan', 'SEND_FLOOR_PLAN'],
        ['Follow up after viewing', 'POST_VIEWING'],
        ['Schedule viewing', 'SCHEDULE_VIEWING'],
        ['Discuss payment plan', 'SEND_PAYMENT_PLAN'],
      ] as [string, TaskType][]);
      const dueAt = new Date(now + due * DAY);
      await prisma.leadTask.create({ data: { developmentId: dev.id, enquiryId: lead.id, title: `${title} — ${name.split(' ')[0]}`, type, dueAt, priority: due < 0 ? 'HIGH' : 'NORMAL', assignedToId: agent.id, createdById: agent.id, unitId: hasUnit ? unit.id : null, createdAt } });
      await prisma.enquiry.update({ where: { id: lead.id }, data: { followUpAt: dueAt } });
      if (rand() > 0.5) await prisma.leadTask.create({ data: { developmentId: dev.id, enquiryId: lead.id, title: 'Send brochure', type: 'SEND_BROCHURE', status: 'DONE', dueAt: new Date(createdAt.getTime() + DAY), completedAt: new Date(createdAt.getTime() + DAY), completedById: agent.id, assignedToId: agent.id, createdById: agent.id, createdAt } });
    }

    // Viewings.
    if (rank >= 4 || status === 'LOST') {
      const upcoming = status === 'VIEWING_SCHEDULED';
      const when = upcoming ? at(pick([0, 0, 1, 2, 3]), pick([10, 11, 14, 15, 16])) : new Date(createdAt.getTime() + 7 * DAY);
      await prisma.viewing.create({
        data: {
          developmentId: dev.id,
          enquiryId: lead.id,
          name,
          email,
          phone,
          scheduledAt: new Date(Math.min(when.getTime(), upcoming ? when.getTime() : now - DAY)),
          agentId: agent?.id ?? manager.id,
          status: upcoming ? pick(['SCHEDULED', 'CONFIRMED'] as const) : 'COMPLETED',
          location: 'Sales gallery, Kimihurura',
          interestLevel: upcoming ? null : status === 'LOST' ? 'NOT_INTERESTED' : pick(['VERY_INTERESTED', 'INTERESTED', 'NEEDS_FOLLOW_UP'] as const),
          outcome: upcoming ? null : status === 'LOST' ? 'Found it above budget.' : 'Liked the finishes and the view towards the city.',
          objections: upcoming ? null : pick([null, 'Service charge', 'Completion date', 'Parking allocation']),
          feedbackAt: upcoming ? null : new Date(Math.min(when.getTime() + 3_600_000, now - DAY)),
          units: { create: [{ unitId: unit.id }] },
          createdAt,
        },
      });
    }
    if (status === 'QUALIFIED' && i % 2 === 0) {
      await prisma.viewing.create({ data: { developmentId: dev.id, enquiryId: lead.id, name, email, phone, status: 'REQUESTED', requestedDate: at(3, 12), requestedSlot: 'AFTERNOON', units: hasUnit ? { create: [{ unitId: unit.id }] } : undefined, createdAt } });
    }

    // Deals.
    if (rank >= 6) {
      const list = unit.priceMinor;
      const discount = rank >= 7 ? Math.round(list * 0.03 / 100_000) * 100_000 : null;
      const dealStatus = status === 'NEGOTIATION' ? 'NEGOTIATION' : status === 'RESERVED' ? 'RESERVED' : status === 'CONTRACT' ? 'CONTRACT' : 'SOLD';
      const buyer = await prisma.buyer.create({ data: { developmentId: dev.id, fullName: name, email, phone, countryIso: country, stage: dealStatus === 'SOLD' ? 'BUYER' : dealStatus === 'NEGOTIATION' ? 'INTERESTED' : 'RESERVATION', source: source, assignedToId: agent?.id ?? null } });
      await prisma.enquiry.update({ where: { id: lead.id }, data: { buyerId: buyer.id } });
      let reservationId: string | null = null;
      if ((dealStatus === 'RESERVED' || dealStatus === 'CONTRACT') && !(await prisma.reservation.count({ where: { unitId: unit.id, status: 'ACTIVE' } }))) {
        const r = await prisma.reservation.create({ data: { developmentId: dev.id, unitId: unit.id, enquiryId: lead.id, buyerId: buyer.id, agentId: agent?.id ?? manager.id, heldUntil: at(pick([2, 6, 10])), depositMinor: 500_000, depositReceivedAt: rand() > 0.4 ? at(-3) : null, currency: unit.currency, previousStatus: 'AVAILABLE', createdAt: at(-5) } });
        reservationId = r.id;
      }
      await prisma.deal.create({
        data: {
          developmentId: dev.id,
          enquiryId: lead.id,
          buyerId: buyer.id,
          unitId: unit.id,
          agentId: agent?.id ?? manager.id,
          status: dealStatus,
          listPriceMinor: list,
          agreedPriceMinor: discount ? list - discount : null,
          discountMinor: discount,
          reservationAmountMinor: 500_000,
          paymentPlanId: plan?.id ?? null,
          expectedCloseAt: dealStatus === 'SOLD' ? null : at(pick([14, 30, 45])),
          contractSignedAt: dealStatus === 'CONTRACT' || dealStatus === 'SOLD' ? at(-4) : null,
          closedAt: dealStatus === 'SOLD' ? at(-pick([3, 12, 25])) : null,
          reservationId,
          createdById: agent?.id ?? manager.id,
          createdAt: new Date(createdAt.getTime() + 10 * DAY),
        },
      });
      await prisma.leadNote.create({ data: { enquiryId: lead.id, kind: 'DEAL', body: `Deal opened on ${unit.code}`, authorId: agent?.id ?? manager.id, createdAt: new Date(Math.min(createdAt.getTime() + 10 * DAY, now - DAY)) } });
    }
    if (status === 'NEW' && i === 1) {
      // A likely duplicate for the merge flow.
      await prisma.enquiry.create({ data: { developmentId: dev.id, name, email: null, phone, leadSource: 'WHATSAPP', status: 'NEW', stageId: stageOf('NEW'), lastActivityAt: new Date(now - 7_200_000), createdAt: new Date(now - 7_200_000), purgeAfter, message: 'Hello, following up on my website enquiry — still interested.' } });
    }
  }

  // Bell notifications for the agents, so the inbox has something in it.
  for (const a of [john!, mary!]) {
    await prisma.adminNotification.create({ data: { userId: a.id, kind: 'lead.assigned', title: 'New lead assigned to you', body: 'Round-robin from the website', link: '/enquiries?view=mine' } });
  }
  console.log(`› CRM demo: ${PEOPLE.length} leads, ${campaigns.length} campaigns, agents ${agents.map((a) => a.name).join(', ')}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

export type _Unused = Prisma.EnquiryWhereInput;
