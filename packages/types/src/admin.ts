/**
 * The admin platform's shared vocabulary: roles and what each may do, the
 * enumerations the forms offer, and the editable fields of each public page.
 *
 * The API enforces every permission here (never the admin UI alone — D-35);
 * the admin reads the same table to hide what a role cannot use.
 */

// ─── Permissions ─────────────────────────────────────────────────────────
//
// Roles live in the database now; see access.ts for the catalog, data scopes,
// default roles and how a user's effective access is resolved.

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
  'user.view',
  'user.create',
  'user.edit',
  'user.deactivate',
  'user.assign-role',
  'role.manage',
  'audit.view',
  'audit.export',
  'settings.edit',
  'reservation.edit',
  'reports.view',
  'finance.view',
  // CRM.
  'enquiry.assign',
  'enquiry.merge',
  'enquiry.archive',
  'deal.edit',
  'deal.price',
  'deal.close',
  'campaign.edit',
  'crm.documents',
  'crm.configure',
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
  'user.view': 'See users',
  'user.create': 'Add users',
  'user.edit': 'Edit users',
  'user.deactivate': 'Deactivate users',
  'user.assign-role': 'Assign roles',
  'role.manage': 'Manage roles and permissions',
  'audit.view': 'Read the audit log',
  'audit.export': 'Export the audit log',
  'finance.view': 'See financial details',
  'settings.edit': 'Change settings',
  'reservation.edit': 'Hold, extend and release reservations',
  'reports.view': 'See sales, demand and website reports',
  'enquiry.assign': 'Assign and reassign leads to other people',
  'enquiry.merge': 'Merge duplicate leads',
  'enquiry.archive': 'Archive and restore leads',
  'deal.edit': 'Create and work deals',
  'deal.price': 'Agree prices and discounts on deals',
  'deal.close': 'Mark deals sold or lost',
  'campaign.edit': 'Manage marketing campaigns',
  'crm.documents': 'Upload and read lead documents',
  'crm.configure': 'Configure the pipeline, lead scoring and assignment rules',
};

// ─── Enumerations ────────────────────────────────────────────────────────

/** §40.3 — the pipeline, then the two exits. */
export const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPERTY_INTEREST', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD', 'ON_HOLD', 'LOST', 'DISQUALIFIED', 'SPAM'] as const;
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

/** `MOVED_OUT` → "Moved out". For enum values that have no bespoke label. */
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

export type ContentFieldType = 'text' | 'textarea' | 'url' | 'media' | 'list' | 'boolean';

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
      { key: 'amenitiesKicker', label: 'Amenities section kicker', type: 'text' },
      { key: 'amenitiesTitle', label: 'Amenities section title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'amenitiesLede', label: 'Amenities section introduction', type: 'textarea' },
      { key: 'penthouseKicker', label: 'Penthouse section kicker', type: 'text' },
      { key: 'penthouseTitle', label: 'Penthouse section title', type: 'text', help: 'A line break is written as “|”.' },
      { key: 'penthouseLede', label: 'Penthouse section introduction', type: 'textarea' },
      { key: 'progressKicker', label: 'Construction progress kicker', type: 'text' },
      { key: 'progressTitle', label: 'Construction progress title', type: 'text', help: 'A line break is written as “|”.' },
    ],
  },
  {
    key: 'featuredSection',
    title: 'Selected residences',
    description: 'The “Selected” residences section of the homepage. Which residences appear in it is set by marking them featured under Property → Residences.',
    fields: [
      { key: 'showFeaturedResidences', label: 'Show selected residences', type: 'boolean', help: 'Toggle to show/hide the selected (featured) residences section on the homepage.' },
    ],
  },
  {
    key: 'experienceSection',
    title: 'Homepage experience',
    description: 'The “Experience” reel on the homepage. Its chapters are the stations of the Homepage experience tour, edited under Website → Experience.',
    fields: [
      { key: 'showExperienceSection', label: 'Show the experience', type: 'boolean', help: 'Off hides the whole experience reel on the homepage. Its chapters are kept.' },
      { key: 'title', label: 'Heading', type: 'text', help: 'The line above the reel, e.g. “The Experience”.' },
    ],
  },
  {
    key: 'filmSection',
    title: 'Homepage film',
    description: 'The full-width invitation to watch the film, lower on the homepage. Its picture or loop is chosen under Website → Placements; the film itself under Website → Film page.',
    fields: [
      { key: 'showFilmSection', label: 'Show the film section', type: 'boolean', help: 'Off hides the film invitation on the homepage. The /film page stays live.' },
      { key: 'kicker', label: 'Kicker', type: 'text', help: 'Small line above the title, e.g. “The Film”.' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'cta', label: 'Button', type: 'text', help: 'The play label, e.g. “Play the film”. Empty shows no button.' },
    ],
  },
  {
    key: 'locationSection',
    title: 'Homepage location',
    description: 'The location section of the homepage. Its nearby places and distances are managed under Website → Location.',
    fields: [
      { key: 'kicker', label: 'Heading', type: 'text', help: 'The large line, e.g. "Location".' },
      { key: 'title', label: 'Subheading', type: 'text', help: 'One short line beneath the heading. Empty shows nothing.' },
      { key: 'lede', label: 'Description', type: 'textarea' },
      { key: 'note', label: 'Footnote', type: 'text', help: 'Small print beneath the list, e.g. how distances are measured.' },
      { key: 'showNearbyPlaces', label: 'Show nearby places', type: 'boolean', help: 'Toggle to show/hide the nearby places list and map on the homepage and location page.' },
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
    description: 'The words around the film. The film and its chapters are managed under Website → Film page.',
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
