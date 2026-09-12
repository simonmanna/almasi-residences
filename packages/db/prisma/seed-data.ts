/**
 * Almasi Residence seed fixtures — Kimihurura, Kigali, Rwanda.
 *
 * The brief is from the developer's actual sales schedule so every unit code,
 * floor, bed count and size is real. Statuses and prices are illustrative
 * (sold/bottom-up, reserved top-down) and replaced by the sales team using the
 * admin panel once the site is live.
 *
 * D-33 — this file is the FIRST state of the database, never a second source of
 * truth. The seed only creates what is missing; once a row exists the admin
 * owns it and a re-seed leaves it alone.
 */
import type {
  LandmarkCategory,
  MediaSetKind,
  MilestoneTrigger,
  Orientation,
  RoomType,
  UnitStatus,
} from '../generated/client/client.js';

export const DEV_SLUG = 'almasi-residences';

/** The Phase 0 placeholder development. Removed by the seed if still present (D-15). */
export const LEGACY_DEV_SLUGS = ['seed-dev'];

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
  propertyType: 'Residential apartments',
  buildingConfig: 'B + G + 4',
  constructionStatus: 'STRUCTURE' as const,
  officeAddress: 'KG 15 Ave, Kimihurura, Kigali, Rwanda',
};

export const building = {
  name: 'Almasi Block',
  floorCount: 5, // ground + 4
  groundLabel: 'Ground',
};

/** Floor copy, keyed by level. */
export const floorDetails: Record<number, { displayName?: string; description: string }> = {
  [-1]: { description: 'Basement parking with one bay per residence, private storage rooms and plant.' },
  0: { description: 'The lobby and reception, the residents’ restaurant, the co-working room and four residences.' },
  1: { description: 'Seven residences and the amenity deck: pool, gym, sauna and massage room.' },
  2: { description: 'Seven residences — one- and two-bedroom plans, every one a corner or an end.' },
  3: { description: 'Seven residences with the widest views over Kimihurura.' },
  4: { displayName: 'Penthouse level', description: 'Three penthouses, the largest opening to a private roof terrace.' },
};

/**
 * Residence types matching the brief. Per-floor counts sum to the known
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
  isPenthouse: boolean;
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
    isPenthouse: false,
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
    isPenthouse: false,
    basePriceMinor: 155_000_00,
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
    isPenthouse: false,
    basePriceMinor: 175_000_00,
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
    isPenthouse: true,
    basePriceMinor: 240_000_00,
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
    isPenthouse: true,
    basePriceMinor: 320_000_00,
    widthRatio: 2.4,
  },
];

/**
 * Status distribution for 28 units, illustrative. Bottom-up selling pattern:
 * ground floor mostly sold/reserved, upper floors available.
 */
export const statusDistribution: Record<UnitStatus, number> = {
  SOLD: 3,
  ON_HOLD: 3,
  RESERVED: 4,
  AVAILABLE: 18,
  OCCUPIED: 0,
  UNAVAILABLE: 0,
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
  'PH-C': 480_000_00,
  'PH-A': 240_000_00,
  'PH-B': 320_000_00,
};

/** Residences the homepage features on first launch. The admin changes this. */
export const featuredCodes = ['PH-C', 'E3', 'A1'];

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

export const defaultPaymentPlan = {
  name: 'Standard plan',
  description: 'Paid in four stages as construction reaches each milestone, from signing to handover.',
  depositPercent: 30,
  installmentCount: 4,
};

/** The ten amenities of the brief. `slug` pairs each with its artwork on the public site. */
export const amenities: {
  slug: string;
  name: string;
  shortDescription: string;
  descriptionMd: string;
  iconKey: string;
  location: string;
  specifications?: { label: string; value: string }[];
}[] = [
  {
    slug: 'basement-parking',
    name: 'Basement parking',
    shortDescription: 'A basement bay for every residence.',
    descriptionMd: 'One parking bay per apartment, with additional visitor bays at ground level. EV charging points available.',
    iconKey: 'parking',
    location: 'Basement',
  },
  {
    slug: 'reception',
    name: 'Reception',
    shortDescription: 'A staffed reception desk.',
    descriptionMd: 'A manned reception desk on the ground floor that receives guests and deliveries.',
    iconKey: 'concierge',
    location: 'Ground floor',
  },
  {
    slug: 'lobby',
    name: 'Lobby',
    shortDescription: 'A double-height arrival hall.',
    descriptionMd: 'A seating area and waiting lounge for guests, off the porte-cochère.',
    iconKey: 'lobby',
    location: 'Ground floor',
  },
  {
    slug: 'swimming-pool',
    name: 'Swimming pool',
    shortDescription: 'A fifteen-metre pool on the amenity deck.',
    descriptionMd: 'A 15-metre pool on the amenity deck, surrounded by sun loungers and shaded seating.',
    iconKey: 'pool',
    location: 'Amenity deck, level 1',
    specifications: [{ label: 'Length', value: '15 m' }],
  },
  {
    slug: 'restaurant',
    name: 'Restaurant',
    shortDescription: 'A ground-floor restaurant for residents and their guests.',
    descriptionMd: 'A ground-floor restaurant open to residents and their guests, serving breakfast and lunch daily.',
    iconKey: 'restaurant',
    location: 'Ground floor',
  },
  {
    slug: 'gym',
    name: 'Gym',
    shortDescription: 'A gym with a view of the hills.',
    descriptionMd: 'An air-conditioned gym on the amenity deck with cardio machines, free weights, and a stretching area.',
    iconKey: 'gym',
    location: 'Amenity deck, level 1',
  },
  {
    slug: 'sauna',
    name: 'Sauna',
    shortDescription: 'A Finnish sauna.',
    descriptionMd: 'A Finnish sauna beside the gym, bookable by the hour through reception.',
    iconKey: 'spa',
    location: 'Amenity deck, level 1',
  },
  {
    slug: 'massage-room',
    name: 'Massage room',
    shortDescription: 'A private treatment room.',
    descriptionMd: 'A separate massage room, bookable by the hour through reception.',
    iconKey: 'spa',
    location: 'Amenity deck, level 1',
  },
  {
    slug: 'residents-working-space',
    name: 'Residents’ working space',
    shortDescription: 'Quiet desks for residents only.',
    descriptionMd: 'A quiet room with desks and meeting booths reserved for residents.',
    iconKey: 'work',
    location: 'Ground floor',
  },
  {
    slug: 'co-working',
    name: 'Co-working space',
    shortDescription: 'About 60 m² of shared working space.',
    descriptionMd: 'Approximately 60 sqm of shared working space on the ground floor, with desks, power outlets, and wi-fi.',
    iconKey: 'work',
    location: 'Ground floor',
    specifications: [{ label: 'Area', value: 'About 60 m²' }],
  },
];

/** The feature catalogue. Assigned to residences by type below. */
export const features: { name: string; category: string; iconKey: string }[] = [
  { name: 'Private balcony', category: 'Outdoor', iconKey: 'balcony' },
  { name: 'Private roof terrace', category: 'Outdoor', iconKey: 'terrace' },
  { name: 'Fitted kitchen', category: 'Kitchen', iconKey: 'kitchen' },
  { name: 'Granite worktops', category: 'Kitchen', iconKey: 'kitchen' },
  { name: 'Built-in wardrobes', category: 'Bedrooms', iconKey: 'wardrobe' },
  { name: 'Walk-in wardrobe', category: 'Bedrooms', iconKey: 'wardrobe' },
  { name: 'En-suite bathroom', category: 'Bathrooms', iconKey: 'bath' },
  { name: 'Double glazing', category: 'Building', iconKey: 'window' },
  { name: 'Dual-aspect light', category: 'Building', iconKey: 'sun' },
  { name: 'Basement parking', category: 'Parking & storage', iconKey: 'parking' },
  { name: 'Private storage room', category: 'Parking & storage', iconKey: 'storage' },
  { name: 'Private lift access', category: 'Building', iconKey: 'lift' },
  { name: 'Standby power circuit', category: 'Building', iconKey: 'power' },
];

export function featuresFor(typologySlug: string): string[] {
  const base = ['Fitted kitchen', 'Granite worktops', 'Built-in wardrobes', 'Double glazing', 'Basement parking', 'Private storage room', 'Standby power circuit'];
  if (typologySlug === 'one-bed') return [...base, 'Private balcony'];
  if (typologySlug === 'two-bed') return [...base, 'Private balcony', 'En-suite bathroom', 'Walk-in wardrobe'];
  if (typologySlug === 'two-bed-corner') return [...base, 'Private balcony', 'En-suite bathroom', 'Walk-in wardrobe', 'Dual-aspect light'];
  if (typologySlug === 'penthouse-two') return [...base, 'Private roof terrace', 'En-suite bathroom', 'Walk-in wardrobe', 'Dual-aspect light'];
  return [...base, 'Private roof terrace', 'En-suite bathroom', 'Walk-in wardrobe', 'Dual-aspect light', 'Private lift access'];
}

/** Rooms by type, as fractions of the interior area. */
export function roomsFor(bedrooms: number, bathrooms: number, penthouse: boolean): { name: string; type: RoomType; share: number }[] {
  const rooms: { name: string; type: RoomType; share: number }[] = [
    { name: 'Entrance hall', type: 'HALL', share: 0.06 },
    { name: 'Living room', type: 'LIVING', share: penthouse ? 0.24 : 0.28 },
    { name: 'Kitchen', type: 'KITCHEN', share: 0.1 },
  ];
  for (let i = 1; i <= bedrooms; i++) {
    rooms.push({ name: i === 1 && bedrooms > 1 ? 'Main bedroom' : `Bedroom ${i}`, type: 'BEDROOM', share: i === 1 ? 0.16 : 0.12 });
  }
  for (let i = 1; i <= Math.ceil(bathrooms); i++) {
    rooms.push({ name: i === 1 && bedrooms > 1 ? 'En-suite bathroom' : `Bathroom ${i}`, type: 'BATHROOM', share: 0.05 });
  }
  rooms.push({ name: penthouse ? 'Terrace' : 'Balcony', type: penthouse ? 'TERRACE' : 'BALCONY', share: 0 });
  rooms.push({ name: 'Storage', type: 'STORAGE', share: 0.02 });
  return rooms;
}

/** The galleries the brief names. Images are added by `pnpm media:import`. */
export const galleries: { slug: string; title: string; description: string }[] = [
  { slug: 'project-exterior', title: 'Project exterior', description: 'The building from the street, the gate and the air.' },
  { slug: 'luxury-interiors', title: 'Luxury interiors', description: 'Living rooms, kitchens and bedrooms across the residence types.' },
  { slug: 'amenities', title: 'Amenities', description: 'The pool deck, gym, wellness rooms, restaurant and co-working.' },
  { slug: 'construction-progress', title: 'Construction progress', description: 'Site photographs as the building rises.' },
  { slug: '3d-renders', title: '3D renders', description: 'Architectural visualisations of the finished building.' },
  { slug: 'lifestyle', title: 'Lifestyle', description: 'Life at Almasi, from arrival to the roof terrace.' },
  { slug: 'architecture', title: 'Architecture', description: 'Plans, elevations and the thinking behind the design.' },
];

export const amenitiesSeed = amenities;

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

export const faqs: { question: string; answerMd: string; category: string }[] = [
  {
    question: 'When is handover?',
    answerMd: 'Handover is planned for the second quarter of 2028. We will provide a more specific timeline as construction progresses.',
    category: 'Construction',
  },
  {
    question: 'What is the reservation process?',
    answerMd: 'Choose your apartment from the availability page, contact the sales team to confirm it is available, and sign the reservation agreement. A 30% deposit is due on signing, with the balance paid in stages as construction reaches each milestone.',
    category: 'Buying',
  },
  {
    question: 'Can I buy as a non-resident?',
    answerMd: 'Yes. Foreign buyers may purchase property in Rwanda. The developer will assist with the required documentation. Payment is accepted in USD.',
    category: 'Buying',
  },
  {
    question: 'What is included in the finish?',
    answerMd: 'Every apartment is finished to a premium standard: tiled floors throughout, fitted kitchen with granite worktops, built-in wardrobes, modern bathroom fixtures, and double-glazed windows. Specific finishes can be reviewed with the sales team.',
    category: 'Residences',
  },
  {
    question: 'Is parking included?',
    answerMd: 'Yes. Every apartment includes one basement parking bay. There are additional visitor parking spaces at ground level.',
    category: 'Residences',
  },
  {
    question: 'What are the service charges?',
    answerMd: 'Service charges cover building maintenance, security, the concierge, swimming pool, gym, and common area utilities. The exact amount will be confirmed at handover and is calculated per square metre.',
    category: 'Ownership',
  },
  {
    question: 'Is there backup power?',
    answerMd: 'Yes. The building has a standby generator that covers common areas, lifts, and water pumps. Individual apartments have a dedicated power circuit for lighting and essential outlets during outages.',
    category: 'Residences',
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

/**
 * Seed accounts, one per role, for local development only. Production refuses
 * a login without TOTP (§5.9), and the seed skips these when NODE_ENV=production.
 */
export const seedAdmins = [
  ['owner@example.invalid', 'Seed owner', 'SUPER_ADMIN'],
  ['property@example.invalid', 'Seed property manager', 'PROPERTY_MANAGER'],
  ['sales@example.invalid', 'Seed sales manager', 'SALES_MANAGER'],
  ['content@example.invalid', 'Seed content manager', 'CONTENT_MANAGER'],
  ['viewer@example.invalid', 'Seed viewer', 'VIEWER'],
] as const;
