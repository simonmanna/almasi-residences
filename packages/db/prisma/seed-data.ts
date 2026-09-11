/**
 * Almasi Residence seed fixtures — Kimihurura, Kigali, Rwanda.
 *
 * The brief is from the developer's actual sales schedule so every unit code,
 * floor, bed count and size is real. Statuses and prices are illustrative
 * (sold/bottom-up, reserved top-down) and replaced by the sales team using the
 * admin panel once the site is live.
 */
import type {
  LandmarkCategory,
  MediaSetKind,
  MilestoneTrigger,
  Orientation,
  UnitStatus,
} from '../generated/client/client.js';

export const DEV_SLUG = 'almasi-residences';

export const development = {
  slug: DEV_SLUG,
  name: 'Almasi Residences',
  tagline: 'Twenty-eight homes in Kimihurura',
  descriptionMd: [
    '"Almasi" — the Swahili word for diamond — sits on a quiet rise in Kimihurura,',
    "Kigali's most connected neighbourhood. A building of twenty-eight apartments",
    'across five residential floors, it was designed to feel like fewer: wide',
    'corridors, generous room sizes, and an amenity floor that gives residents',
    'a reason to leave their apartment rather than a substitute for leaving the',
    'building.',
    '',
    'The ground floor holds the lobby, the restaurant, and the co-working room.',
    'Above it, floors one through three carry seven apartments each — a mix of',
    "one- and two-bedroom plans, every one of them a corner or an end. The",
    'fourth floor is reserved for three penthouses, the largest of which opens',
    'to a private roof terrace.',
    '',
    'Below the building, a full basement provides parking for every residence',
    'and storage for each apartment. The swimming pool, gym, sauna, and massage',
    'room sit on the amenity deck off the first floor.',
    '',
    'Handover is planned for the second quarter of 2028.',
  ].join('\n'),
  city: 'Kigali',
  country: 'RW',
  addressLine: 'KG 15 Ave, Kimihurura, Kigali',
  latitude: -1.9445,
  longitude: 30.0740,
  handoverDate: new Date('2028-06-30T00:00:00Z'),
  currency: 'USD',
};

export const building = {
  name: 'Almasi Block',
  floorCount: 5, // ground + 4
  groundLabel: 'Ground',
};

/**
 * Three typologies matching the brief. Per-floor counts sum to the known
 * distribution per the apartment schedule.
 */
export interface TypologySeed {
  slug: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  areaSqmMin: number;
  areaSqmMax: number;
  descriptionMd: string;
  /** how many of this typology sit on each standard floor */
  perFloor: number;
  basePriceMinor: number;
  widthRatio: number;
}

export const typologies: TypologySeed[] = [
  {
    slug: 'one-bed',
    name: 'One bedroom',
    bedrooms: 1,
    bathrooms: 1,
    areaSqmMin: 65,
    areaSqmMax: 82,
    descriptionMd: [
      'An open-plan living and dining room with a galley kitchen along one wall.',
      'The bedroom is separated by a full-height door, so the living space stays',
      'private when guests are over.',
      '',
      'Every one-bedroom apartment has its own balcony. The larger units on the',
      'end (A and D on the ground floor, A and G on the upper floors) offer a',
      'separate kitchen rather than a galley.',
    ].join('\n'),
    perFloor: 3, // ground: A, C; floor 1+: A1, B1, C1 are 1BR → actually A, B, C on upper floors
    basePriceMinor: 95_000_00, // $95,000 in cents
    widthRatio: 0.8,
  },
  {
    slug: 'two-bed',
    name: 'Two bedroom',
    bedrooms: 2,
    bathrooms: 2,
    areaSqmMin: 110,
    areaSqmMax: 132,
    descriptionMd: [
      'Two bedrooms, two bathrooms, a separate living room, and a dining area',
      'open to the kitchen. The master bedroom has an en-suite bathroom and a',
      'walk-in wardrobe.',
      '',
      'All two-bedroom apartments face the quiet side of the building. The larger',
      'corner units on each floor benefit from dual-aspect light.',
    ].join('\n'),
    perFloor: 3, // ground: B, D; floor 1+: D, E, F, G → wait, need to count per the brief
    basePriceMinor: 155_000_00, // $155,000 in cents
    widthRatio: 1.15,
  },
  {
    slug: 'two-bed-corner',
    name: 'Two bedroom corner',
    bedrooms: 2,
    bathrooms: 2,
    areaSqmMin: 126,
    areaSqmMax: 132,
    descriptionMd: [
      'A larger two-bedroom layout on the end of the building, with windows on',
      'two sides. The living room wraps the corner, taking morning light from the',
      'east and afternoon light from the south.',
      '',
      'Like the standard two-bedroom, the master bedroom has an en-suite bathroom',
      'and a walk-in wardrobe. These units are the most popular on every floor.',
    ].join('\n'),
    perFloor: 1, // the corner 2BR on each floor
    basePriceMinor: 175_000_00, // $175,000 in cents
    widthRatio: 1.3,
  },
  {
    slug: 'penthouse-two',
    name: 'Two bedroom penthouse',
    bedrooms: 2,
    bathrooms: 2,
    areaSqmMin: 180,
    areaSqmMax: 180,
    descriptionMd: [
      'A single-floor penthouse on the fourth floor with a private terrace.',
      'The living and dining room is large enough to seat ten, and the kitchen',
      'is a separate room with a breakfast bar.',
      '',
      'This apartment has its own private entrance from the lift lobby.',
    ].join('\n'),
    perFloor: 0, // top floor only
    basePriceMinor: 240_000_00, // $240,000 in cents
    widthRatio: 1.6,
  },
  {
    slug: 'penthouse-three',
    name: 'Three bedroom penthouse',
    bedrooms: 3,
    bathrooms: 3,
    areaSqmMin: 217,
    areaSqmMax: 390,
    descriptionMd: [
      'The largest residences in the building. PH B is a 217 sqm three-bedroom',
      'with wrap-around windows on three sides. PH C is a 390 sqm duplex with',
      'a private roof terrace, a study, a guest powder room, and a utility room.',
      '',
      'Both penthouses have their own private lift access from the basement parking.',
    ].join('\n'),
    perFloor: 0, // top floor only
    basePriceMinor: 320_000_00, // $320,000 in cents, PH C will be higher separately
    widthRatio: 2.4,
  },
];

/**
 * Status distribution for 28 units, illustrative. Bottom-up selling pattern:
 * ground floor mostly sold/reserved, upper floors available.
 */
export const statusDistribution: Record<UnitStatus, number> = {
  AVAILABLE: 18,
  RESERVED: 4,
  BOOKED: 3,
  SOLD: 3,
  NOT_RELEASED: 0,
};

/**
 * Per-unit area mapping based on the brief's exact size ranges per floor.
 * Keyed by unit code.
 */
export const unitAreas: Record<string, number> = {
  // Ground floor
  'A': 65,
  'B': 78,
  'C': 110,
  'D': 126,
  // Floor 1
  'A1': 69,
  'B1': 70,
  'C1': 76,
  'D1': 114,
  'E1': 126,
  'F1': 130,
  'G1': 132,
  // Floor 2
  'A2': 69,
  'B2': 70,
  'C2': 76,
  'D2': 114,
  'E2': 126,
  'F2': 130,
  'G2': 132,
  // Floor 3
  'A3': 69,
  'B3': 70,
  'C3': 76,
  'D3': 114,
  'E3': 126,
  'F3': 130,
  'G3': 132,
  // Penthouse floor
  'PH-A': 180,
  'PH-B': 217,
  'PH-C': 390,
};

/**
 * Per-unit price overrides for units that differ from their typology base.
 * Default = typology basePriceMinor * height premium.
 */
export const unitPrices: Record<string, number> = {
  // PH C is the biggest unit in the building
  'PH-C': 480_000_00, // $480,000
  // PH A gets a separate price (2BR penthouse)
  'PH-A': 240_000_00,
  'PH-B': 320_000_00,
};

/** Orientation per unit, compass-wise around the building. */
export const unitOrientations: Record<string, Orientation> = {
  'A': 'S', 'B': 'E', 'C': 'W', 'D': 'N',
  'A1': 'S', 'B1': 'SE', 'C1': 'SW', 'D1': 'E', 'E1': 'NE', 'F1': 'W', 'G1': 'NW',
  'A2': 'S', 'B2': 'SE', 'C2': 'SW', 'D2': 'E', 'E2': 'NE', 'F2': 'W', 'G2': 'NW',
  'A3': 'S', 'B3': 'SE', 'C3': 'SW', 'D3': 'E', 'E3': 'NE', 'F3': 'W', 'G3': 'NW',
  'PH-A': 'E', 'PH-B': 'S', 'PH-C': 'N',
};

/** View tags by orientation (Kimihurura context). */
export const viewTagsByOrientation: Record<Orientation, string[]> = {
  N: ['city', 'hills'],
  NE: ['city', 'hills'],
  E: ['hills', 'sunrise'],
  SE: ['hills', 'green'],
  S: ['city', 'green'],
  SW: ['city', 'sunset'],
  W: ['sunset', 'city'],
  NW: ['hills', 'sunset'],
};

/** §5.6 — four milestones summing to exactly 100. */
export const milestones: {
  sortOrder: number;
  label: string;
  percent: number;
  triggerType: MilestoneTrigger;
  triggerDate?: Date;
  triggerNote?: string;
}[] = [
  { sortOrder: 1, label: 'On signing', percent: 30, triggerType: 'ON_SIGNING' },
  {
    sortOrder: 2,
    label: 'On completion of structure',
    percent: 30,
    triggerType: 'ON_CONSTRUCTION_STAGE',
    triggerNote: 'On completion of the roof slab',
  },
  {
    sortOrder: 3,
    label: 'On completion of tiling',
    percent: 30,
    triggerType: 'ON_CONSTRUCTION_STAGE',
    triggerNote: 'On completion of all internal tiling and finishes',
  },
  {
    sortOrder: 4,
    label: 'On final handover',
    percent: 10,
    triggerType: 'ON_HANDOVER',
    triggerNote: 'Q2 2028',
  },
];

export const amenities: { name: string; descriptionMd: string; iconKey: string }[] = [
  {
    name: 'Reception and lobby',
    descriptionMd: 'A manned reception desk on the ground floor, with a seating area and a waiting lounge for guests.',
    iconKey: 'concierge',
  },
  {
    name: 'Swimming pool',
    descriptionMd: 'A 15-metre pool on the amenity deck, surrounded by sun loungers and shaded seating.',
    iconKey: 'pool',
  },
  {
    name: 'Restaurant',
    descriptionMd: 'A ground-floor restaurant open to residents and their guests, serving breakfast and lunch daily.',
    iconKey: 'restaurant',
  },
  {
    name: 'Gym',
    descriptionMd: 'An air-conditioned gym on the amenity deck with cardio machines, free weights, and a stretching area.',
    iconKey: 'gym',
  },
  {
    name: 'Sauna and massage room',
    descriptionMd: 'A Finnish sauna and a separate massage room, bookable by the hour through the concierge.',
    iconKey: 'spa',
  },
  {
    name: 'Co-working space',
    descriptionMd: 'Approximately 60 sqm of shared working space on the ground floor, with desks, power outlets, and wi-fi.',
    iconKey: 'work',
  },
  {
    name: 'Basement parking',
    descriptionMd: 'One parking bay per apartment, with additional visitor bays at ground level. EV charging points available.',
    iconKey: 'parking',
  },
];

/** Real Kimihurura-area landmarks. */
export const landmarks: {
  name: string;
  category: LandmarkCategory;
  latitude: number;
  longitude: number;
}[] = [
  { name: 'Kigali Convention Centre', category: 'BUSINESS', latitude: -1.9535, longitude: 30.0925 },
  { name: 'Kigali Heights', category: 'SHOPPING', latitude: -1.9541, longitude: 30.0937 },
  { name: 'Kigali Business Centre', category: 'BUSINESS', latitude: -1.9441, longitude: 30.0619 },
  { name: 'King Faisal Hospital', category: 'HOSPITAL', latitude: -1.9527, longitude: 30.0889 },
  { name: 'Green Hills Academy', category: 'SCHOOL', latitude: -1.9557, longitude: 30.1042 },
  { name: 'Kigali International Airport', category: 'AIRPORT', latitude: -1.9686, longitude: 30.1395 },
  { name: 'Kigali Golf Club', category: 'LEISURE', latitude: -1.9349, longitude: 30.0997 },
  { name: 'BK Arena', category: 'LEISURE', latitude: -1.9382, longitude: 30.0623 },
  { name: 'Kimihurura Market', category: 'SHOPPING', latitude: -1.9478, longitude: 30.0727 },
  { name: 'US Embassy', category: 'EMBASSY', latitude: -1.9520, longitude: 30.0930 },
];

/** §4.6 — media sets. Production renders replace these. */
export const mediaSets: {
  key: string;
  label: string;
  kind: MediaSetKind;
  cameraNote: string;
  sortOrder: number;
}[] = [
  { key: 'hero-exterior', label: 'Building approach from KG 15 Ave', kind: 'EXTERIOR', cameraNote: '35mm equivalent, eye height, from the south-east (§7.1)', sortOrder: 1 },
  { key: 'aerial-context', label: 'Kimihurura and the neighbourhood', kind: 'AERIAL', cameraNote: '120m altitude, 20° down tilt, looking north-west (§7.1)', sortOrder: 2 },
  { key: 'rooftop', label: 'Penthouse roof terrace', kind: 'AMENITY', cameraNote: 'Dusk is the money shot here (§7.1)', sortOrder: 3 },
  { key: 'lobby', label: 'Reception and lobby', kind: 'INTERIOR', cameraNote: '24mm, from the main entrance (§7.1)', sortOrder: 4 },
  { key: 'pool-deck', label: 'Pool and sun deck', kind: 'AMENITY', cameraNote: 'From the shallow end looking south (§7.1)', sortOrder: 5 },
];

export const faqs: { question: string; answerMd: string }[] = [
  {
    question: 'When is handover?',
    answerMd: 'Handover is planned for the second quarter of 2028. We will provide a more specific timeline as construction progresses.',
  },
  {
    question: 'What is the reservation process?',
    answerMd: 'Choose your apartment from the availability page, contact the sales team to confirm it is available, and sign the reservation agreement. A 30% deposit is due on signing, with the balance paid in stages as construction reaches each milestone.',
  },
  {
    question: 'Can I buy as a non-resident?',
    answerMd: 'Yes. Foreign buyers may purchase property in Rwanda. The developer will assist with the required documentation. Payment is accepted in USD.',
  },
  {
    question: 'What is included in the finish?',
    answerMd: 'Every apartment is finished to a premium standard: tiled floors throughout, fitted kitchen with granite worktops, built-in wardrobes, modern bathroom fixtures, and double-glazed windows. Specific finishes can be reviewed with the sales team.',
  },
  {
    question: 'Is parking included?',
    answerMd: 'Yes. Every apartment includes one basement parking bay. There are additional visitor parking spaces at ground level.',
  },
  {
    question: 'What are the service charges?',
    answerMd: 'Service charges cover building maintenance, security, the concierge, swimming pool, gym, and common area utilities. The exact amount will be confirmed at handover and is calculated per square metre.',
  },
  {
    question: 'Is there backup power?',
    answerMd: 'Yes. The building has a standby generator that covers common areas, lifts, and water pumps. Individual apartments have a dedicated power circuit for lighting and essential outlets during outages.',
  },
];

/** Per-floor unit codes matching the brief's apartment schedule. */
export const floorUnitCodes: Record<number, string[]> = {
  0: ['A', 'B', 'C', 'D'],
  1: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'],
  2: ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2'],
  3: ['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3'],
  4: ['PH-A', 'PH-B', 'PH-C'],
};

/**
 * Typology slug per unit on each floor, matching the brief's mix.
 */
export const floorUnitTypology: Record<string, string> = {
  // Ground: 1BR 65sqm (A), 1BR 78sqm (B), 2BR 110sqm (C), 2BR 126sqm (D)
  'A': 'one-bed',
  'B': 'one-bed',
  'C': 'two-bed',
  'D': 'two-bed-corner',
  // Floors 1–3: 3x 1BR + 3x 2BR + 1x 2BR-corner per floor
  'A1': 'one-bed', 'A2': 'one-bed', 'A3': 'one-bed',
  'B1': 'one-bed', 'B2': 'one-bed', 'B3': 'one-bed',
  'C1': 'one-bed', 'C2': 'one-bed', 'C3': 'one-bed',
  'D1': 'two-bed', 'D2': 'two-bed', 'D3': 'two-bed',
  'E1': 'two-bed-corner', 'E2': 'two-bed-corner', 'E3': 'two-bed-corner',
  'F1': 'two-bed', 'F2': 'two-bed', 'F3': 'two-bed',
  'G1': 'two-bed', 'G2': 'two-bed', 'G3': 'two-bed',
  // Penthouse: 2BR 180 (PH-A), 3BR 217 (PH-B), 3BR 390 (PH-C)
  'PH-A': 'penthouse-two',
  'PH-B': 'penthouse-three',
  'PH-C': 'penthouse-three',
};

export const tourScenes = [
  { key: 'entry', label: 'Entry', yawDeg: 0, planX: 120, planY: 700 },
  { key: 'living', label: 'Living room', yawDeg: 45, planX: 380, planY: 520 },
  { key: 'kitchen', label: 'Kitchen', yawDeg: 120, planX: 680, planY: 480 },
  { key: 'bedroom', label: 'Main bedroom', yawDeg: 200, planX: 880, planY: 300 },
  { key: 'balcony', label: 'Balcony', yawDeg: 270, planX: 420, planY: 160 },
];