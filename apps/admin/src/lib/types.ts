import type { UnitStatus } from '@avida/types';

export type { UnitStatus };

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; pages: number };
}

export interface MediaView {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'MODEL';
  collection: 'LIBRARY' | 'FLOOR_PLAN' | 'DESIGN';
  category: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  published: boolean;
  isCover: boolean;
  sortOrder: number;
  /** §49 — PHOTOGRAPH, SUPPLIED_RENDER, CONCEPT_RENDER or DRAWING. */
  provenance?: string;
  focusX?: number | null;
  focusY?: number | null;
  url: string;
  originalUrl: string;
  thumbUrl: string;
  srcSet: string | null;
  blurDataUrl: string | null;
  dominantHex: string | null;
  unitId: string | null;
  floorId: string | null;
  amenityId: string | null;
  roomId: string | null;
  typologyId: string | null;
  createdAt: string;
  owner?: {
    label: string;
    unit: { id: string; code: string } | null;
    floor: { id: string; label: string } | null;
    amenity: { id: string; name: string } | null;
    room: { id: string; name: string; unitCode: string } | null;
    typology: { id: string; name: string } | null;
  };
  galleryCount?: number;
  galleries?: { id: string; title: string }[];
  /** Detail only: every place on the website this file appears. */
  usage?: { label: string; path: string; adminPath: string }[];
}

export interface FloorRef {
  id: string;
  level: number;
  label: string;
  displayName: string | null;
}

export interface TypeRef {
  id: string;
  name: string;
  slug: string;
  isPenthouse: boolean;
}

export interface ResidenceRow {
  id: string;
  code: string;
  status: UnitStatus;
  published: boolean;
  featured: boolean;
  archivedAt: string | null;
  priceMinor: number;
  currency: string;
  effectivePriceMinor: number;
  pricePerSqmMinor: number | null;
  discountMinor: number | null;
  promoPriceMinor: number | null;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  orientation: string;
  tags: string[];
  floorId: string;
  typologyId: string;
  floor: FloorRef;
  typology: TypeRef;
  cover: MediaView | null;
  /** False when the 3D building on the website has no volume for this code. */
  placedInModel: boolean;
  /** The maquette volume chosen in the admin; null derives it from the code. */
  modelSlot?: string | null;
  /** Detail only: the volumes the residence's level offers. */
  modelSlotOptions?: { key: string; label: string }[];
  enquiryCount: number;
  interestCount: number;
  residentCount: number;
  buyer: { id: string; fullName: string; stage: string } | null;
  updatedAt: string;
}

export interface Milestone {
  id?: string;
  sortOrder?: number;
  label: string;
  percent: number;
  triggerType: string;
  triggerDate: string | null;
  triggerNote: string | null;
}

export interface PaymentPlan {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  published: boolean;
  depositPercent: number | null;
  reservationFeeMinor: number | null;
  installmentCount: number | null;
  durationMonths: number | null;
  milestones: Milestone[];
  residences?: number;
  totalPercent?: number;
}

export interface Room {
  id: string;
  unitId: string;
  name: string;
  type: string;
  areaSqm: number | null;
  description: string | null;
  features: string[];
  /** Position and size on the plan drawing; null when not drawn. */
  planX?: number | null;
  planY?: number | null;
  planW?: number | null;
  planH?: number | null;
  planOpen?: boolean;
  sortOrder: number;
  media?: MediaView[];
}

export interface Feature {
  id: string;
  name: string;
  category: string;
  iconKey: string | null;
  note?: string | null;
  residences?: number;
}

export interface ActivityRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  target: string | null;
  summary: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
  actorName: string;
}

export interface ResidenceDetail extends Omit<ResidenceRow, 'cover' | 'buyer' | 'typology'> {
  typology: TypeRef & { bedrooms: number; bathrooms: number; descriptionMd: string | null };
  interiorSqm: number | null;
  exteriorSqm: number | null;
  balconySqm: number | null;
  terraceSqm: number | null;
  parkingIncluded: number;
  hasStorage: boolean;
  storageNote: string | null;
  viewTags: string[];
  availabilityDate: string | null;
  shortDescription: string | null;
  description: string | null;
  promoEndsAt: string | null;
  reservationFeeMinor: number | null;
  depositPercent: number | null;
  paymentPlanId: string | null;
  paymentPlan: PaymentPlan | null;
  paymentPlanIsDefault: boolean;
  schedule: { totalMinor: number; currency: string; rows: { label: string; percent: number; amountMinor: number; dueDate: string | null; triggerNote: string | null }[] } | null;
  notes: string | null;
  features: Feature[];
  rooms: Room[];
  media: MediaView[];
  priceHistory: { id: string; fromMinor: number; toMinor: number; currency: string; reason: string | null; createdAt: string; actorName: string }[];
  statusLog: { id: string; from: UnitStatus; to: UnitStatus; note: string | null; createdAt: string; actorName: string }[];
  activity: ActivityRow[];
  parkingSpaces: { id: string; code: string; level: string; type: string; status: string }[];
  buyer: ({ id: string; fullName: string; email: string | null; phone: string | null; stage: string } & { restricted?: boolean }) | null;
  residents: { id: string; fullName?: string; occupancyStatus?: string; residentType?: string; restricted?: boolean }[];
  interests: { id: string; fullName: string; stage: string }[];
  enquiries: { id: string; name: string; email: string; status: string; intent: string; createdAt: string }[];
  enquiryCount: number;
}

export interface BuildingUnit {
  id: string;
  code: string;
  status: UnitStatus;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  priceMinor: number;
  effectivePriceMinor: number;
  currency: string;
  published: boolean;
  featured: boolean;
  orientation: string;
  typology: { name: string; isPenthouse: boolean };
  enquiryCount: number;
  interestCount: number;
}

export interface BuildingFloor {
  id: string;
  level: number;
  label: string;
  displayName: string | null;
  published: boolean;
  units: BuildingUnit[];
  stats: Record<UnitStatus, number> & { total: number };
}

export interface Dashboard {
  property: {
    name: string;
    location: string;
    buildingConfig: string | null;
    handoverDate: string | null;
    constructionStatus: string;
    constructionPercent: number | null;
    heroImage: MediaView | null;
  };
  currency: string;
  stats: {
    floors: number;
    residentialFloors: number;
    residences: number;
    unpublished: number;
    byStatus: Record<UnitStatus, number>;
    residents: { total: number; active: number };
    parking: { total: number; byStatus: Record<string, number> };
    amenities: number;
    enquiries: { total: number; new: number; thisWeek: number; open: number; byStatus: Record<string, number> };
  };
  sales: {
    totalValueMinor: number;
    availableValueMinor: number;
    soldValueMinor: number;
    reservedValueMinor: number;
    averagePriceMinor: number | null;
    averagePricePerSqmMinor: number | null;
    percentSold: number;
    valueByStatus: Record<UnitStatus, number>;
  };
  breakdown: { key: string; label: string; count: number; available: number; areaMin: number; areaMax: number; priceFromMinor: number | null }[];
  building: BuildingFloor[];
  activity: ActivityRow[];
  featured: {
    id: string;
    code: string;
    status: UnitStatus;
    floor: string;
    type: string;
    bedrooms: number;
    bathrooms: number;
    areaSqm: number;
    priceMinor: number;
    currency: string;
    parkingIncluded: number;
    hasBalcony: boolean;
    images: MediaView[];
  }[];
  recentImages: MediaView[];
}

export interface Typology {
  id: string;
  slug: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  areaSqmMin: number;
  areaSqmMax: number;
  descriptionMd: string | null;
  summary?: string | null;
  isPenthouse: boolean;
  published: boolean;
  sortOrder: number;
  stats: { total: number; available: number; areaMin: number | null; areaMax: number | null };
}

export interface FloorRow {
  id: string;
  level: number;
  label: string;
  displayName: string | null;
  description: string | null;
  heightM: number;
  published: boolean;
  sortOrder: number;
  mediaCount: number;
  cover: MediaView | null;
  stats: Record<UnitStatus, number> & { total: number };
}

export interface TeamMember {
  id: string;
  name: string;
  /** Role key; show `roleName`. */
  role: string;
  roleName?: string;
  department?: string | null;
  /** Whether their effective access lets them work leads. */
  worksLeads?: boolean;
}
