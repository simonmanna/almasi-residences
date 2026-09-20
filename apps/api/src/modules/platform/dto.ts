/**
 * §45 — request bodies for every admin write. The global ValidationPipe
 * rejects any property not declared here (forbidNonWhitelisted), so a crafted
 * request cannot set a column the form does not offer.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PERMISSION_SCOPES,
  PERMISSIONS,
  BUYER_STAGES,
  CONSTRUCTION_STATUSES,
  DEVELOPMENT_STATUSES,
  VIEWING_STATUSES,
  MEDIA_COLLECTIONS,
  MEDIA_PROVENANCES,
  MEDIA_SLOTS,
  POST_CATEGORIES,
  SCHEMA_TYPES,
  SEO_DESCRIPTION_MAX,
  SEO_ROUTES,
  SEO_TITLE_MAX,
  TOUR_LEVELS,
  MILESTONE_TRIGGERS,
  OCCUPANCY_STATUSES,
  ORIENTATIONS,
  PARKING_STATUSES,
  PARKING_TYPES,
  RESIDENT_TYPES,
  ROOM_TYPES,
  UNIT_STATUSES,
} from '@avida/types';

const MAX_MINOR = 100_000_000_000; // a billion in major units — no residence costs more
const CODE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,15}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Shared ──────────────────────────────────────────────────────────────

export class IdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
}

// ─── Property ────────────────────────────────────────────────────────────

export class UpdatePropertyDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) tagline?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) descriptionMd?: string;
  @IsOptional() @IsString() @Length(1, 80) city?: string;
  @IsOptional() @IsString() @Length(2, 80) country?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine?: string | null;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @Length(1, 80) propertyType?: string;
  @IsOptional() @IsString() @MaxLength(40) buildingConfig?: string | null;
  @IsOptional() @IsIn(DEVELOPMENT_STATUSES) status?: string;
  @IsOptional() @IsIn(CONSTRUCTION_STATUSES) constructionStatus?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) constructionPercent?: number | null;
  @IsOptional() @IsString() @MaxLength(120) developerName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) architect?: string | null;
  @IsOptional() @IsString() @MaxLength(120) contractor?: string | null;
  @IsOptional() @IsInt() @Min(1900) @Max(2200) yearStarted?: number | null;
  @IsOptional() @IsDateString() handoverDate?: string | null;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() logoMediaId?: string | null;
  @IsOptional() @IsString() heroMediaId?: string | null;
  @IsOptional() @IsString() mainMediaId?: string | null;
  @IsOptional() @IsString() videoMediaId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string | null;
  @IsOptional() @IsEmail() contactEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(40) whatsappNumber?: string | null;
  @IsOptional() @IsBoolean() whatsappIconVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(300) officeAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(200) officeHours?: string | null;
  @IsOptional() @IsObject() socials?: Record<string, string> | null;
}

// ─── Floors ──────────────────────────────────────────────────────────────

export class CreateFloorDto {
  @IsInt() @Min(-5) @Max(200) level!: number;
  @IsString() @Length(1, 60) label!: string;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsNumber() @Min(-50) @Max(1000) heightM?: number;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateFloorDto {
  @IsOptional() @IsInt() @Min(-5) @Max(200) level?: number;
  @IsOptional() @IsString() @Length(1, 60) label?: string;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsNumber() @Min(-50) @Max(1000) heightM?: number;
  @IsOptional() @IsBoolean() published?: boolean;
}

// ─── Residences ──────────────────────────────────────────────────────────

export class ResidencePricingDto {
  @IsOptional() @IsInt() @Min(1) @Max(MAX_MINOR) priceMinor?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) discountMinor?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_MINOR) promoPriceMinor?: number | null;
  @IsOptional() @IsDateString() promoEndsAt?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) reservationFeeMinor?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) depositPercent?: number | null;
  @IsOptional() @IsString() paymentPlanId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class UpdateResidenceDto {
  @IsOptional() @Matches(CODE, { message: 'A unit code is letters, numbers, spaces or dashes, up to 16 characters.' }) code?: string;
  @IsOptional() @IsString() floorId?: string;
  @IsOptional() @IsString() typologyId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(20) bedrooms?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(20) bathrooms?: number;
  @IsOptional() @IsNumber() @IsPositive() @Max(100000) areaSqm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) interiorSqm?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) exteriorSqm?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) balconySqm?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) terraceSqm?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(20) parkingIncluded?: number;
  @IsOptional() @IsBoolean() hasStorage?: boolean;
  @IsOptional() @IsString() @MaxLength(200) storageNote?: string | null;
  @IsOptional() @IsIn(ORIENTATIONS) orientation?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) viewTags?: string[];
  @IsOptional() @IsDateString() availabilityDate?: string | null;
  @IsOptional() @IsString() @MaxLength(300) shortDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) description?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) featureIds?: string[];
  @IsOptional() @IsString() buyerId?: string | null;
  // Pricing fields are accepted here too (the multi-step form saves at once),
  // but need the residence.price permission — checked in the service.
  @IsOptional() @IsInt() @Min(1) @Max(MAX_MINOR) priceMinor?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) discountMinor?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_MINOR) promoPriceMinor?: number | null;
  @IsOptional() @IsDateString() promoEndsAt?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) reservationFeeMinor?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) depositPercent?: number | null;
  @IsOptional() @IsString() paymentPlanId?: string | null;
  /** §40.1 — the maquette volume; null derives it from the code. */
  @IsOptional() @IsString() @MaxLength(16) modelSlot?: string | null;
}

export class CreateResidenceDto extends UpdateResidenceDto {
  @Matches(CODE, { message: 'A unit code is letters, numbers, spaces or dashes, up to 16 characters.' }) declare code: string;
  @IsString() declare floorId: string;
  @IsString() declare typologyId: string;
  @IsInt() @Min(0) @Max(20) declare bedrooms: number;
  @IsNumber() @Min(0) @Max(20) declare bathrooms: number;
  @IsNumber() @IsPositive() @Max(100000) declare areaSqm: number;
  @IsIn(ORIENTATIONS) declare orientation: string;
  @IsInt() @Min(1) @Max(MAX_MINOR) declare priceMinor: number;
  @IsOptional() @IsIn(UNIT_STATUSES) status?: string;
}

export class StatusChangeDto {
  @IsIn(UNIT_STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export const BULK_ACTIONS = ['status', 'price', 'publish', 'unpublish', 'archive', 'restore', 'floor', 'tag', 'untag', 'feature', 'unfeature'] as const;

export class BulkResidenceDto extends IdsDto {
  @IsIn(BULK_ACTIONS) action!: (typeof BULK_ACTIONS)[number];
  @IsOptional() @IsIn(UNIT_STATUSES) status?: string;
  @IsOptional() @IsIn(['set', 'percent', 'amount']) priceMode?: 'set' | 'percent' | 'amount';
  @IsOptional() @IsNumber() @Min(-100_000_000) @Max(MAX_MINOR) value?: number;
  @IsOptional() @IsString() floorId?: string;
  @IsOptional() @IsString() @Length(1, 40) tag?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DuplicateResidenceDto {
  @Matches(CODE) code!: string;
  @IsOptional() @IsString() floorId?: string;
}

// ─── Rooms ───────────────────────────────────────────────────────────────

export class UpdateRoomDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(ROOM_TYPES) type?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) areaSqm?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) features?: string[];
  @IsOptional() @IsNumber() planX?: number | null;
  @IsOptional() @IsNumber() planY?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) planW?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) planH?: number | null;
  @IsOptional() @IsBoolean() planOpen?: boolean;
}

export class CreateRoomDto extends UpdateRoomDto {
  @IsString() @Length(1, 80) declare name: string;
  @IsIn(ROOM_TYPES) declare type: string;
}

// ─── Residence types & features ──────────────────────────────────────────

export class UpdateTypologyDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @Matches(SLUG, { message: 'Use lowercase letters, numbers and dashes.' }) slug?: string;
  @IsOptional() @IsInt() @Min(0) @Max(20) bedrooms?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(20) bathrooms?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) areaSqmMin?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100000) areaSqmMax?: number;
  @IsOptional() @IsString() @MaxLength(20000) descriptionMd?: string | null;
  @IsOptional() @IsString() @MaxLength(300) summary?: string | null;
  @IsOptional() @IsBoolean() isPenthouse?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateTypologyDto extends UpdateTypologyDto {
  @IsString() @Length(1, 80) declare name: string;
  @IsInt() @Min(0) @Max(20) declare bedrooms: number;
  @IsNumber() @Min(0) @Max(20) declare bathrooms: number;
}

export class UpdateFeatureDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(1, 60) category?: string;
  @IsOptional() @IsString() @MaxLength(40) iconKey?: string | null;
}

export class CreateFeatureDto extends UpdateFeatureDto {
  @IsString() @Length(1, 80) declare name: string;
}

// ─── Parking ─────────────────────────────────────────────────────────────

export class UpdateParkingDto {
  @IsOptional() @Matches(CODE) code?: string;
  @IsOptional() @IsString() @Length(1, 40) level?: string;
  @IsOptional() @IsIn(PARKING_TYPES) type?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(200) sizeSqm?: number | null;
  @IsOptional() @IsIn(PARKING_STATUSES) status?: string;
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsString() residentId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) priceMinor?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class CreateParkingDto extends UpdateParkingDto {
  @Matches(CODE) declare code: string;
}

// ─── Residents ───────────────────────────────────────────────────────────

export class UpdateResidentDto {
  @IsOptional() @IsString() @Length(1, 120) fullName?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @Length(2, 2) countryIso?: string | null;
  @IsOptional() @IsIn(RESIDENT_TYPES) residentType?: string;
  @IsOptional() @IsIn(OCCUPANCY_STATUSES) occupancyStatus?: string;
  @IsOptional() @IsDateString() moveInDate?: string | null;
  @IsOptional() @IsDateString() moveOutDate?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsOptional() @IsString() profileMediaId?: string | null;
  @IsOptional() @IsString() buyerId?: string | null;
}

export class CreateResidentDto extends UpdateResidentDto {
  @IsString() @Length(1, 120) declare fullName: string;
  @IsOptional() @IsString() unitId?: string | null;
}

export class AssignResidentDto {
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsDateString() moveInDate?: string;
}

// ─── Buyers ──────────────────────────────────────────────────────────────

export class UpdateBuyerDto {
  @IsOptional() @IsString() @Length(1, 120) fullName?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @Length(2, 2) countryIso?: string | null;
  @IsOptional() @IsIn(BUYER_STAGES) stage?: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string | null;
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class CreateBuyerDto extends UpdateBuyerDto {
  @IsString() @Length(1, 120) declare fullName: string;
}

export class BuyerUnitDto {
  @IsString() unitId!: string;
  @IsIn(['interest', 'purchase']) relation!: 'interest' | 'purchase';
}

// Leads, tasks, deals and the rest of the CRM: see crm.dto.ts.

// ─── Viewings ────────────────────────────────────────────────────────────

export class UpdateViewingDto {
  @IsOptional() @IsDateString() scheduledAt?: string | null;
  @IsOptional() @IsInt() @Min(15) @Max(480) durationMinutes?: number;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsIn(VIEWING_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) outcome?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) unitIds?: string[];
  /** Send the confirmation email now (on confirming, or after a reschedule). */
  @IsOptional() @IsBoolean() notify?: boolean;
}

export class CreateViewingDto extends UpdateViewingDto {
  @IsOptional() @IsString() enquiryId?: string;
  @IsOptional() @IsString() buyerId?: string;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

// ─── Reservations ────────────────────────────────────────────────────────

export class CreateReservationDto {
  @IsString() unitId!: string;
  @IsOptional() @IsString() buyerId?: string | null;
  @IsOptional() @IsString() enquiryId?: string | null;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsDateString() heldUntil?: string;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) depositMinor?: number | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class UpdateReservationDto {
  @IsOptional() @IsDateString() heldUntil?: string;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsString() buyerId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) depositMinor?: number | null;
  @IsOptional() @IsDateString() depositReceivedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class CloseReservationDto {
  @IsIn(['convert', 'cancel']) action!: 'convert' | 'cancel';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

// ─── Payment plans ───────────────────────────────────────────────────────

export class MilestoneDto {
  @IsString() @Length(1, 120) label!: string;
  @IsNumber() @IsPositive() @Max(100) percent!: number;
  @IsIn(MILESTONE_TRIGGERS) triggerType!: string;
  @IsOptional() @IsDateString() triggerDate?: string | null;
  @IsOptional() @IsString() @MaxLength(200) triggerNote?: string | null;
}

export class UpdatePaymentPlanDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) depositPercent?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) reservationFeeMinor?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) installmentCount?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) durationMonths?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => MilestoneDto) milestones?: MilestoneDto[];
}

export class CreatePaymentPlanDto extends UpdatePaymentPlanDto {
  @IsString() @Length(1, 80) declare name: string;
}

// ─── Media library ───────────────────────────────────────────────────────

export class UpdateAssetDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) caption?: string | null;
  @IsOptional() @IsString() @MaxLength(500) altText?: string | null;
  @IsOptional() @IsIn(MEDIA_COLLECTIONS) collection?: string;
  @IsOptional() @IsString() @Length(1, 40) category?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() isCover?: boolean;
  @IsOptional() @IsIn(MEDIA_PROVENANCES) provenance?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) focusX?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) focusY?: number | null;
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsString() floorId?: string | null;
  @IsOptional() @IsString() amenityId?: string | null;
  @IsOptional() @IsString() roomId?: string | null;
  @IsOptional() @IsString() typologyId?: string | null;
}

export class BulkAssetDto extends IdsDto {
  @IsIn(['publish', 'unpublish', 'delete', 'assign', 'category']) action!: string;
  @IsOptional() @IsString() @Length(1, 40) category?: string;
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsString() floorId?: string | null;
  @IsOptional() @IsString() amenityId?: string | null;
  @IsOptional() @IsString() roomId?: string | null;
  @IsOptional() @IsString() typologyId?: string | null;
}

// ─── Galleries ───────────────────────────────────────────────────────────

export class UpdateGalleryDto {
  @IsOptional() @IsString() @Length(1, 120) title?: string;
  @IsOptional() @Matches(SLUG) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() coverMediaId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateGalleryDto extends UpdateGalleryDto {
  @IsString() @Length(1, 120) declare title: string;
}

export class GalleryItemsDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) mediaIds!: string[];
}

// ─── Website content ─────────────────────────────────────────────────────

export class UpdatePageDto {
  /** Publish at once instead of saving a draft (needs content.publish). */
  @IsOptional() @IsBoolean() publish?: boolean;
  @IsObject() content!: Record<string, unknown>;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateFaqDto {
  @IsOptional() @IsString() @Length(3, 300) question?: string;
  @IsOptional() @IsString() @Length(1, 5000) answerMd?: string;
  @IsOptional() @IsString() @Length(1, 60) category?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateFaqDto extends UpdateFaqDto {
  @IsString() @Length(3, 300) declare question: string;
  @IsString() @Length(1, 5000) declare answerMd: string;
}

export class UpdateProgressDto {
  @IsOptional() @IsDateString() capturedOn?: string;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() @MaxLength(20000) bodyMd?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) percentComplete?: number | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) mediaAssetIds?: string[];
}

export class CreateProgressDto extends UpdateProgressDto {
  @IsDateString() declare capturedOn: string;
  @IsString() @Length(1, 200) declare title: string;
}

export class SpecDto {
  @IsString() @Length(1, 60) label!: string;
  @IsString() @Length(1, 120) value!: string;
}

export class UpdateAmenityDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @Matches(SLUG) slug?: string | null;
  @IsOptional() @IsString() @MaxLength(300) shortDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) descriptionMd?: string | null;
  @IsOptional() @IsString() @MaxLength(40) iconKey?: string | null;
  @IsOptional() @IsString() @MaxLength(120) location?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => SpecDto) specifications?: SpecDto[];
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateAmenityDto extends UpdateAmenityDto {
  @IsString() @Length(1, 120) declare name: string;
}

// ─── Landmarks (Website → Location) ─────────────────────────────────────

export const LANDMARK_CATEGORIES = ['SCHOOL', 'EMBASSY', 'HOSPITAL', 'SHOPPING', 'AIRPORT', 'LEISURE', 'BUSINESS'] as const;
type LandmarkCategory = (typeof LANDMARK_CATEGORIES)[number];

export class UpdateLandmarkDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsIn(LANDMARK_CATEGORIES) category?: LandmarkCategory;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  /** True keeps the three figures below as typed; false computes them from the coordinates. */
  @IsOptional() @IsBoolean() manualDistance?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(500000) distanceM?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) driveMinutes?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) walkMinutes?: number | null;
  @IsOptional() @IsBoolean() visible?: boolean;
}

export class CreateLandmarkDto extends UpdateLandmarkDto {
  @IsString() @Length(1, 120) declare name: string;
  @IsIn(LANDMARK_CATEGORIES) declare category: LandmarkCategory;
  @IsNumber() @Min(-90) @Max(90) declare latitude: number;
  @IsNumber() @Min(-180) @Max(180) declare longitude: number;
}

// ─── Users ───────────────────────────────────────────────────────────────

export class CreateUserDto {
  @IsEmail() @MaxLength(200) email!: string;
  /** Either `name`, or first and last name (joined). */
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 60) firstName?: string;
  @IsOptional() @IsString() @MaxLength(60) lastName?: string;
  /** Role id; `role` (a role key) is still accepted from older clients. */
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(60) department?: string | null;
  @IsOptional() @IsString() @MaxLength(80) jobTitle?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'INVITED']) status?: 'ACTIVE' | 'INVITED';
  @IsOptional() @IsString() @MinLength(12) @MaxLength(200) password?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() @MaxLength(60) role?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(60) department?: string | null;
  @IsOptional() @IsString() @MaxLength(80) jobTitle?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  /** Kept for older clients: false deactivates, true reactivates. */
  @IsOptional() @IsBoolean() active?: boolean;
}

export class DeactivateUserDto {
  @IsOptional() @IsIn(['INACTIVE', 'SUSPENDED']) status?: 'INACTIVE' | 'SUSPENDED';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Hand their open leads, tasks, deals and viewings to this person in the same step. */
  @IsOptional() @IsString() reassignToId?: string;
}

export class ReassignUserDto {
  @IsString() toUserId!: string;
}

export class OverrideDto {
  @IsIn(PERMISSIONS) permission!: string;
  @IsIn(PERMISSION_SCOPES) scope!: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

export class OverridesDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OverrideDto) overrides!: OverrideDto[];
}

export class RoleDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
}

export class CreateRoleDto {
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  /** Start from another role's permissions. */
  @IsOptional() @IsString() copyFromId?: string;
}

export class GrantDto {
  @IsIn(PERMISSIONS) permission!: string;
  @IsIn(PERMISSION_SCOPES) scope!: string;
}

export class RolePermissionsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => GrantDto) grants!: GrantDto[];
}

// ─── Website presentation (roadmap phase 1) ──────────────────────────────

export class UpdateSlotDto {
  @IsOptional() @IsString() imageId?: string | null;
  @IsOptional() @IsString() videoId?: string | null;
}
export const SLOT_KEYS = MEDIA_SLOTS.map((s) => s.key);

export class UpdateSpecificationDto {
  @IsOptional() @IsString() @Length(1, 60) category?: string;
  @IsOptional() @IsString() @Length(1, 80) label?: string;
  @IsOptional() @IsString() @Length(1, 2000) value?: string;
  @IsOptional() @IsString() typologyId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateSpecificationDto extends UpdateSpecificationDto {
  @IsString() @Length(1, 80) declare label: string;
  @IsString() @Length(1, 2000) declare value: string;
}

export class UpdateTourDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateSceneDto {
  @IsOptional() @IsString() @Length(1, 120) label?: string;
  @IsOptional() @IsString() @MaxLength(120) place?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) body?: string | null;
  @IsOptional() @IsString() imageId?: string | null;
  @IsOptional() @IsString() videoId?: string | null;
  @IsOptional() @IsIn(TOUR_LEVELS.map((l) => l.key)) level?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class CreateSceneDto extends UpdateSceneDto {
  @IsString() @Length(1, 120) declare label: string;
}

export class FilmChapterDto {
  @IsNumber() @Min(0) @Max(36000) startSec!: number;
  @IsString() @Length(1, 120) label!: string;
  @IsOptional() @IsString() @MaxLength(120) place?: string | null;
}

export class UpdateFilmDto {
  @IsOptional() @IsString() @Length(1, 120) label?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() mediaId?: string | null;
  @IsOptional() @IsString() posterMediaId?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(36000) durationSec?: number;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => FilmChapterDto) chapters?: FilmChapterDto[];
  /// §SEO — a VideoObject needs words: what is said, and when it was published.
  @IsOptional() @IsString() @MaxLength(60000) transcript?: string | null;
  @IsOptional() @IsDateString() uploadDate?: string | null;
}

export class UpdateSiteSeoDto {
  @IsOptional() @IsString() @Length(1, SEO_TITLE_MAX) title?: string;
  @IsOptional() @IsString() @Length(1, SEO_DESCRIPTION_MAX * 2) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) keywords?: string[];
}

export class UpdateSeoPageDto {
  @IsIn(SEO_ROUTES.map((r) => r.path)) path!: string;
  @IsOptional() @IsString() @MaxLength(SEO_TITLE_MAX) title?: string | null;
  @IsOptional() @IsString() @MaxLength(SEO_DESCRIPTION_MAX * 2) description?: string | null;
  @IsOptional() @IsString() ogImageId?: string | null;
  @IsOptional() @IsBoolean() noindex?: boolean;
}

// ─── SEO engine ──────────────────────────────────────────────────────────

export class UpdateSeoEntityDto {
  @IsOptional() @IsString() @MaxLength(SEO_TITLE_MAX) title?: string | null;
  @IsOptional() @IsString() @MaxLength(SEO_DESCRIPTION_MAX * 2) metaDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(300) canonicalUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(SEO_TITLE_MAX) ogTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(SEO_DESCRIPTION_MAX * 2) ogDescription?: string | null;
  @IsOptional() @IsString() ogImageId?: string | null;
  @IsOptional() @IsBoolean() robotsIndex?: boolean;
  @IsOptional() @IsBoolean() robotsFollow?: boolean;
  @IsOptional() @IsIn(SCHEMA_TYPES as unknown as string[]) schemaType?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) keywords?: string[];
}

export class UpsertRedirectDto {
  @IsString() @MaxLength(300) fromPath!: string;
  @IsString() @MaxLength(300) toPath!: string;
  @IsOptional() @IsIn([301, 302, 307, 308]) statusCode?: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string | null;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateSeoIntegrationsDto {
  @IsOptional() @IsString() @MaxLength(200) gscVerification?: string | null;
  @IsOptional() @IsString() @MaxLength(200) bingVerification?: string | null;
  @IsOptional() @IsString() @Matches(/^(G-[A-Z0-9]+)?$/, { message: 'A GA4 id looks like G-XXXXXXX.' }) ga4MeasurementId?: string | null;
  @IsOptional() @IsString() @Matches(/^(GTM-[A-Z0-9]+)?$/, { message: 'A Tag Manager id looks like GTM-XXXXXX.' }) gtmContainerId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) organizationName?: string | null;
  @IsOptional() @IsIn(['Organization', 'RealEstateAgent', 'Corporation', 'LocalBusiness']) organizationType?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(300, { each: true }) sameAs?: string[];
}

export class UpsertLocationPageDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'A URL uses lower-case letters, numbers and hyphens.' }) @Length(2, 96) slug?: string;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(80) kicker?: string | null;
  @IsOptional() @IsString() @MaxLength(160) title?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) lede?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) body?: string | null;
  @IsOptional() @IsString() @MaxLength(120) locality?: string | null;
  @IsOptional() @IsString() @MaxLength(120) region?: string | null;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsString() heroImageId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class UpsertPostDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'A URL uses lower-case letters, numbers and hyphens.' }) @Length(2, 96) slug?: string;
  @IsOptional() @IsString() @Length(2, 160) title?: string;
  @IsOptional() @IsString() @MaxLength(600) excerpt?: string | null;
  @IsOptional() @IsString() @MaxLength(60000) body?: string;
  @IsOptional() @IsIn(POST_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(120) authorName?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(120) readMinutes?: number | null;
  @IsOptional() @IsString() heroImageId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateVideoSeoDto {
  @IsOptional() @IsString() @MaxLength(60000) transcript?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsDateString() uploadDate?: string | null;
}
