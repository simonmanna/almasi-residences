/**
 * The admin platform's shared vocabulary: roles and what each may do, the
 * enumerations the forms offer, and the editable fields of each public page.
 *
 * The API enforces every permission here (never the admin UI alone — D-35);
 * the admin reads the same table to hide what a role cannot use.
 */

// ─── Roles & permissions ─────────────────────────────────────────────────

export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'PROPERTY_MANAGER',
  'SALES_MANAGER',
  'CONTENT_MANAGER',
  'VIEWER',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super admin',
  PROPERTY_MANAGER: 'Property manager',
  SALES_MANAGER: 'Sales manager',
  CONTENT_MANAGER: 'Content manager',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Full access, including users, settings and reversing a sale.',
  PROPERTY_MANAGER: 'Property, floors, residences, rooms, parking, amenities and residents.',
  SALES_MANAGER: 'Availability, pricing, payment plans, reservations, enquiries and buyers.',
  CONTENT_MANAGER: 'Images, galleries, videos, floor plans, designs and website content.',
  VIEWER: 'Read-only. No access to resident or buyer contact details.',
};

export const PERMISSIONS = [
  // Reads. Before these existed, any authenticated request could read any admin
  // GET, so VIEWER — a role with no permissions at all — could pull the whole
  // priced inventory and the media library. A read is a permission like any other.
  'property.view',
  'floor.view',
  'residence.view',
  'residence.export',
  'typology.view',
  'parking.view',
  'payment-plan.view',
  'media.view',
  'gallery.view',
  'content.view',
  // Writes.
  'property.edit',
  'floor.edit',
  'residence.edit',
  'residence.delete',
  'residence.status',
  'residence.reverse-sale',
  'residence.price',
  'residence.notes',
  'typology.edit',
  'room.edit',
  'parking.edit',
  'amenity.edit',
  'resident.view',
  'resident.edit',
  'buyer.view',
  'buyer.edit',
  'enquiry.view',
  'enquiry.edit',
  'enquiry.export',
  'payment-plan.edit',
  'media.edit',
  'gallery.edit',
  'content.edit',
  'content.publish',
  'user.manage',
  'audit.view',
  'settings.edit',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<Permission, string> = {
  'property.view': 'See the property overview',
  'floor.view': 'See floors',
  'residence.view': 'See residences and their prices',
  'residence.export': 'Export all residences as CSV',
  'typology.view': 'See residence types and features',
  'parking.view': 'See parking',
  'payment-plan.view': 'See payment plans',
  'media.view': 'See the media library',
  'gallery.view': 'See galleries',
  'content.view': 'See website content, FAQs and progress updates',
  'property.edit': 'Edit property details',
  'floor.edit': 'Create, edit and delete floors',
  'residence.edit': 'Create and edit residences',
  'residence.delete': 'Archive and delete residences',
  'residence.status': 'Change residence status',
  'residence.reverse-sale': 'Undo a sale (sold or occupied back to open)',
  'residence.price': 'Change prices and discounts',
  'residence.notes': 'Read private notes on a residence',
  'typology.edit': 'Manage residence types and features',
  'room.edit': 'Manage rooms and spaces',
  'parking.edit': 'Manage parking',
  'amenity.edit': 'Manage amenities',
  'resident.view': 'See residents and their contact details',
  'resident.edit': 'Add, edit and archive residents',
  'buyer.view': 'See buyers and their contact details',
  'buyer.edit': 'Add and edit buyers',
  'enquiry.view': 'Read enquiries',
  'enquiry.edit': 'Work enquiries',
  'enquiry.export': 'Export all enquiries as CSV',
  'payment-plan.edit': 'Manage payment plans',
  'media.edit': 'Upload and manage media',
  'gallery.edit': 'Manage galleries',
  'content.edit': 'Edit website content and FAQs',
  'content.publish': 'Publish, unpublish and archive website content',
  'user.manage': 'Manage users and roles',
  'audit.view': 'Read the audit log',
  'settings.edit': 'Change settings',
};

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  PROPERTY_MANAGER: [
    'property.view',
    'floor.view',
    'residence.view',
    'typology.view',
    'parking.view',
    'payment-plan.view',
    'media.view',
    'gallery.view',
    'content.view',
    'residence.export',
    'property.edit',
    'floor.edit',
    'residence.edit',
    'residence.delete',
    'residence.status',
    'residence.notes',
    'typology.edit',
    'room.edit',
    'parking.edit',
    'amenity.edit',
    'resident.view',
    'resident.edit',
    'media.edit',
    'content.publish',
    'audit.view',
  ],
  SALES_MANAGER: [
    'property.view',
    'floor.view',
    'residence.view',
    'typology.view',
    'parking.view',
    'payment-plan.view',
    'media.view',
    'gallery.view',
    'content.view',
    'residence.export',
    'residence.status',
    'residence.price',
    'residence.notes',
    'payment-plan.edit',
    'parking.edit',
    'buyer.view',
    'buyer.edit',
    'enquiry.view',
    'enquiry.edit',
    'enquiry.export',
    'resident.view',
  ],
  CONTENT_MANAGER: [
    'property.view',
    'floor.view',
    'residence.view',
    'typology.view',
    'parking.view',
    'payment-plan.view',
    'media.view',
    'gallery.view',
    'content.view',
    'media.edit',
    'gallery.edit',
    'content.edit',
    'content.publish',
    'amenity.edit',
  ],
  // Read-only, and that is now an explicit grant rather than the absence of
  // checks. A viewer may browse the property; it may not export it in bulk, and
  // it never sees residents, buyers, enquiries, private notes or the audit log.
  VIEWER: [
    'property.view',
    'floor.view',
    'residence.view',
    'typology.view',
    'parking.view',
    'payment-plan.view',
    'media.view',
    'gallery.view',
    'content.view',
  ],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as AdminRole].includes(permission);
}

// ─── Enumerations ────────────────────────────────────────────────────────

export const ENQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'NEGOTIATION',
  'RESERVED',
  'CONVERTED',
  'LOST',
  'SPAM',
] as const;
export type EnquiryStatusValue = (typeof ENQUIRY_STATUSES)[number];

export const BUYER_STAGES = [
  'PROSPECT',
  'ENQUIRY',
  'INTERESTED',
  'RESERVATION',
  'BUYER',
  'OWNER',
  'RESIDENT',
] as const;
export type BuyerStageValue = (typeof BUYER_STAGES)[number];

export const PARKING_STATUSES = ['AVAILABLE', 'RESERVED', 'ASSIGNED', 'SOLD', 'UNAVAILABLE'] as const;
export const PARKING_TYPES = ['STANDARD', 'COMPACT', 'ACCESSIBLE', 'EV', 'VISITOR', 'MOTORCYCLE'] as const;
export const ROOM_TYPES = [
  'LIVING',
  'DINING',
  'KITCHEN',
  'BEDROOM',
  'BATHROOM',
  'WC',
  'STUDY',
  'BALCONY',
  'TERRACE',
  'STORAGE',
  'LAUNDRY',
  'HALL',
  'OTHER',
] as const;
export const RESIDENT_TYPES = ['OWNER', 'TENANT', 'FAMILY', 'OTHER'] as const;
export const OCCUPANCY_STATUSES = ['UPCOMING', 'ACTIVE', 'MOVED_OUT'] as const;
export const CONSTRUCTION_STATUSES = [
  'PLANNING',
  'SITE_PREPARATION',
  'FOUNDATION',
  'STRUCTURE',
  'ENVELOPE',
  'FINISHES',
  'HANDOVER',
  'COMPLETED',
] as const;
export const DEVELOPMENT_STATUSES = ['ANNOUNCED', 'SELLING', 'SOLD_OUT', 'COMPLETED'] as const;
export const MILESTONE_TRIGGERS = [
  'ON_RESERVATION',
  'ON_SIGNING',
  'ON_DATE',
  'ON_CONSTRUCTION_STAGE',
  'ON_HANDOVER',
] as const;

/** `ON_HOLD` → "On hold". For enum values that have no bespoke label. */
export function humanise(value: string): string {
  const words = value.toLowerCase().replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ─── Media ───────────────────────────────────────────────────────────────

export const MEDIA_KINDS = ['IMAGE', 'VIDEO', 'DOCUMENT', 'MODEL'] as const;
export type MediaKindValue = (typeof MEDIA_KINDS)[number];
export const MEDIA_COLLECTIONS = ['LIBRARY', 'FLOOR_PLAN', 'DESIGN'] as const;
export type MediaCollectionValue = (typeof MEDIA_COLLECTIONS)[number];

export const IMAGE_CATEGORIES = [
  'EXTERIOR',
  'INTERIOR',
  'LIVING_ROOM',
  'BEDROOM',
  'KITCHEN',
  'BATHROOM',
  'BALCONY',
  'POOL',
  'GYM',
  'RESTAURANT',
  'LOBBY',
  'COWORKING',
  'CONSTRUCTION',
  'PROGRESS',
  'ARCHITECTURE',
  'FLOOR_PLANS',
  'RENDERS_3D',
  'OTHER',
] as const;

export const FLOOR_PLAN_CATEGORIES = [
  'RESIDENCE_PLAN',
  'FLOOR_PLAN',
  'BUILDING_PLAN',
  'ARCHITECTURAL_DRAWING',
  'PLAN_3D',
  'OTHER',
] as const;

export const DESIGN_CATEGORIES = [
  'EXTERIOR_RENDER',
  'INTERIOR_RENDER',
  'RENDER_3D',
  'ARCHITECTURAL_DRAWING',
  'CONCEPT',
  'ELEVATION',
  'SITE_PLAN',
  'SECTION',
  'LANDSCAPE',
  'OTHER',
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Living room',
  COWORKING: 'Co-working',
  FLOOR_PLANS: 'Floor plans',
  RENDERS_3D: '3D renders',
  RENDER_3D: '3D render',
  PLAN_3D: '3D plan',
  RESIDENCE_PLAN: 'Residence plan',
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? humanise(c);

export function categoriesFor(collection: MediaCollectionValue): readonly string[] {
  if (collection === 'FLOOR_PLAN') return FLOOR_PLAN_CATEGORIES;
  if (collection === 'DESIGN') return DESIGN_CATEGORIES;
  return IMAGE_CATEGORIES;
}

/** §45 — what an upload may be. Anything else is refused before it touches storage. */
export const UPLOAD_MIME_TYPES: Record<string, MediaKindValue> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/avif': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/svg+xml': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'application/pdf': 'DOCUMENT',
  'model/gltf-binary': 'MODEL',
};

export const UPLOAD_MAX_BYTES: Record<MediaKindValue, number> = {
  IMAGE: 30 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024,
  DOCUMENT: 50 * 1024 * 1024,
  MODEL: 200 * 1024 * 1024,
};

/** Widths generated for every raster image, served as WebP. */
export const IMAGE_WIDTHS = [400, 800, 1600, 2400] as const;

// ─── Website content (CMS) ───────────────────────────────────────────────

export type ContentFieldType = 'text' | 'textarea' | 'url' | 'media' | 'list';

export interface ContentField {
  key: string;
  label: string;
  type: ContentFieldType;
  help?: string;
  /** For `list`: each entry is `{ title, body }`. */
  itemLabel?: string;
}

export interface ContentPageDef {
  key: string;
  title: string;
  description: string;
  fields: ContentField[];
}

/**
 * Every editable page and the keys it owns. The public site reads these keys
 * and renders nothing for a key left empty (roadmap item 26): it never prints
 * prose from its own code in place of the admin's. Images for page headers are
 * chosen under Website → Placements, not here.
 *
 * Text fields may name live figures in braces — see COPY_TOKEN_HELP.
 */
export const CONTENT_PAGES: ContentPageDef[] = [
  {
    key: 'home',
    title: 'Homepage',
    description: 'The headline, the calls to action and the heading of every homepage section.',
    fields: [
      { key: 'heroKicker', label: 'Hero kicker', type: 'text', help: 'Small line above the headline.' },
      { key: 'heroTitle', label: 'Hero title', type: 'text' },
      { key: 'heroSubtitle', label: 'Hero subtitle', type: 'textarea' },
      { key: 'ctaPrimaryLabel', label: 'Primary button label', type: 'text' },
      { key: 'ctaPrimaryHref', label: 'Primary button link', type: 'url' },
      { key: 'ctaSecondaryLabel', label: 'Secondary button label', type: 'text' },
      { key: 'ctaSecondaryHref', label: 'Secondary button link', type: 'url' },
      { key: 'introTitle', label: 'Introduction title', type: 'text' },
      { key: 'introBody', label: 'Introduction text', type: 'textarea' },
      { key: 'residencesKicker', label: 'Residences section kicker', type: 'text' },
      { key: 'residencesTitle', label: 'Residences section title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'storyTitle', label: 'Experience section title', type: 'text', help: 'Its chapters are edited under Website → Tours → Homepage experience.' },
      { key: 'amenitiesKicker', label: 'Amenities section kicker', type: 'text' },
      { key: 'amenitiesTitle', label: 'Amenities section title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'amenitiesLede', label: 'Amenities section introduction', type: 'textarea' },
      { key: 'penthouseKicker', label: 'Penthouse section kicker', type: 'text' },
      { key: 'penthouseTitle', label: 'Penthouse section title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'penthouseLede', label: 'Penthouse section introduction', type: 'textarea' },
      { key: 'filmKicker', label: 'Film teaser kicker', type: 'text' },
      { key: 'filmTitle', label: 'Film teaser title', type: 'text' },
      { key: 'filmCta', label: 'Film teaser button', type: 'text' },
      { key: 'progressKicker', label: 'Construction progress kicker', type: 'text' },
      { key: 'progressTitle', label: 'Construction progress title', type: 'text', help: 'A line break is written as “|”.' },
    ],
  },
  {
    key: 'about',
    title: 'About the project',
    description: 'Who is building it. The developer, architect and contractor names are edited on Property overview.',
    fields: [
      { key: 'developerTitle', label: 'Developer heading', type: 'text' },
      { key: 'developerBody', label: 'About the developer', type: 'textarea' },
      { key: 'architectureTitle', label: 'Architecture heading', type: 'text' },
      { key: 'architectureBody', label: 'About the architecture', type: 'textarea' },
    ],
  },
  {
    key: 'residences',
    title: 'Residences page',
    description: 'The heading of the residence explorer. The residences themselves come from Property → Residences.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
    ],
  },
  {
    key: 'amenities',
    title: 'Amenities page',
    description: 'The amenities page heading. The amenities themselves are managed under Property → Amenities.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
    ],
  },
  {
    key: 'location',
    title: 'Location page',
    description: 'The location page heading. Landmarks and coordinates come from Property overview.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
    ],
  },
  {
    key: 'buying',
    title: 'Buying guide',
    description: 'How to buy, reserve and pay. Payment milestones come from the default payment plan.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
      { key: 'processSteps', label: 'Purchase process', type: 'list', itemLabel: 'Step' },
      { key: 'reservationBody', label: 'Reservation process', type: 'textarea' },
      { key: 'foreignBuyersBody', label: 'Buying from abroad', type: 'textarea' },
    ],
  },
  {
    key: 'gallery',
    title: 'Gallery page',
    description: 'The gallery page heading. Galleries are managed under Media → Galleries.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
    ],
  },
  {
    key: 'progress',
    title: 'Construction progress page',
    description: 'The progress page heading. The updates themselves are managed under Content → Progress updates.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
      { key: 'emptyText', label: 'Shown before the first update', type: 'textarea' },
    ],
  },
  {
    key: 'film',
    title: 'Film page',
    description: 'The words around the film. The film and its chapters are managed under Website → Film.',
    fields: [
      { key: 'caption', label: 'Caption under the film', type: 'textarea' },
      { key: 'downloadLabel', label: 'Download link label', type: 'text' },
    ],
  },
  {
    key: 'contact',
    title: 'Contact and enquiry',
    description: 'Phone, email, WhatsApp and office details are edited on Property overview → Contact; this page holds the enquiry copy.',
    fields: [
      { key: 'heroKicker', label: 'Kicker', type: 'text', help: 'Small line above the title.' },
      { key: 'heroTitle', label: 'Title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'heroLede', label: 'Introduction', type: 'textarea' },
      { key: 'enquireTitle', label: 'Enquiry heading', type: 'text' },
      { key: 'enquireBody', label: 'Enquiry text', type: 'textarea' },
      { key: 'responseTime', label: 'Response-time promise', type: 'text' },
    ],
  },
];

export const contentPageDef = (key: string) => CONTENT_PAGES.find((p) => p.key === key);
