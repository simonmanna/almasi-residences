/**
 * Request bodies for the CRM. Like dto.ts, every property is declared: the
 * global ValidationPipe rejects anything else, so a crafted request cannot set
 * a column (an owner, a creator, a score) the form does not offer.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ASSIGNMENT_MODES,
  CONTACT_METHODS,
  CRM_PRIORITIES,
  CRM_TONES,
  DOCUMENT_KINDS,
  ENQUIRY_STATUSES,
  LEAD_NOTE_KINDS,
  LEAD_PURPOSES,
  LEAD_SOURCES,
  LEAD_TEMPERATURES,
  LOST_REASONS,
  PURCHASE_TIMELINES,
  SCORING_RULES,
  TASK_STATUSES,
  TASK_TYPES,
  VIEWING_INTERESTS,
} from '@avida/types';

const MAX_MINOR = 2_000_000_000; // the Int column; ~$20M in cents
const SCORE_KEYS = SCORING_RULES.map((r) => r.key);

// ─── Leads ───────────────────────────────────────────────────────────────

/** Everything a person may edit on a lead. Create extends it. */
export class LeadFieldsDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(40) whatsapp?: string | null;
  @IsOptional() @IsString() @Length(2, 2) countryIso?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsIn(CONTACT_METHODS) preferredContact?: string | null;
  @IsOptional() @IsIn(LEAD_SOURCES) leadSource?: string;
  @IsOptional() @IsString() campaignId?: string | null;
  @IsOptional() @IsIn(LEAD_TEMPERATURES) temperature?: string | null;
  @IsOptional() @IsIn(CRM_PRIORITIES) priority?: string;
  @IsOptional() @IsString() @MaxLength(5000) message?: string | null;

  @IsOptional() @IsString() typologyId?: string | null;
  @IsOptional() @IsString() primaryUnitId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(10) bedrooms?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(5000) sizeMinSqm?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(5000) sizeMaxSqm?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) budgetMinMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) budgetMaxMinor?: number | null;
  @IsOptional() @IsString() @MaxLength(80) floorPreference?: string | null;
  @IsOptional() @IsIn(LEAD_PURPOSES) purpose?: string | null;
  @IsOptional() @IsBoolean() financingRequired?: boolean | null;
  @IsOptional() @IsBoolean() budgetConfirmed?: boolean;
  @IsOptional() @IsIn(PURCHASE_TIMELINES) timeline?: string | null;
  @IsOptional() @IsString() @MaxLength(120) decisionMaker?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
}

export class UpdateLeadDto extends LeadFieldsDto {
  /** Move to this pipeline column. */
  @IsOptional() @IsString() stageId?: string;
  /** Legacy: move to the first column of this category. */
  @IsOptional() @IsIn(ENQUIRY_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(40) assignedToId?: string | null;
  /** Sets (or clears) the lead's follow-up task. */
  @IsOptional() @IsDateString() followUpAt?: string | null;
  @IsOptional() @IsIn(LOST_REASONS) lostReason?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) lostNote?: string | null;
  @IsOptional() @IsString() buyerId?: string | null;
}

export class CreateLeadDto extends LeadFieldsDto {
  @IsString() @Length(1, 120) declare name: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() @MaxLength(40) assignedToId?: string | null;
  @IsOptional() @IsIn(['INFORMATION', 'VIEWING', 'RESERVATION', 'BROKER']) intent?: string;
  /** Create even though possible duplicates were found (the person has looked at them). */
  @IsOptional() @IsBoolean() force?: boolean;
  @IsOptional() @IsDateString() followUpAt?: string | null;
}

export class DuplicateCheckDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() excludeId?: string;
}

export class MergeLeadDto {
  /** The duplicate; its history moves onto this lead and it is archived. */
  @IsString() otherId!: string;
}

export class LeadNoteDto {
  @IsIn(LEAD_NOTE_KINDS) kind!: string;
  @IsString() @Length(1, 5000) body!: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT' | null;
  @IsOptional() @IsInt() @Min(0) @Max(600) durationMin?: number | null;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsDateString() followUpAt?: string | null;
}

export class PinNoteDto {
  @IsBoolean() pinned!: boolean;
}

export class BulkLeadDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
  @IsIn(['assign', 'status', 'stage', 'spam', 'archive', 'restore', 'tag']) action!: 'assign' | 'status' | 'stage' | 'spam' | 'archive' | 'restore' | 'tag';
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @IsIn(ENQUIRY_STATUSES) status?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsIn(LOST_REASONS) lostReason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) tags?: string[];
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export class TaskFieldsDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsIn(TASK_TYPES) type?: string;
  @IsOptional() @IsIn(CRM_PRIORITIES) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsDateString() remindAt?: string | null;
  @IsOptional() @IsString() assignedToId?: string | null;
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsString() dealId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class CreateTaskDto extends TaskFieldsDto {
  @IsString() @Length(1, 200) declare title: string;
  @IsOptional() @IsString() enquiryId?: string | null;
}

export class UpdateTaskDto extends TaskFieldsDto {
  @IsOptional() @IsIn(TASK_STATUSES) status?: string;
}

class NextActionDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsIn(TASK_TYPES) type?: string;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsBoolean() allDay?: boolean;
}

export class CompleteTaskDto {
  /** What happened — logged on the lead's timeline. */
  @IsOptional() @IsString() @MaxLength(5000) outcome?: string;
  @IsOptional() @IsIn(LEAD_NOTE_KINDS) logAs?: string;
  @IsOptional() @ValidateNested() @Type(() => NextActionDto) next?: NextActionDto;
}

// ─── Deals ───────────────────────────────────────────────────────────────

export class DealFieldsDto {
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) agreedPriceMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) discountMinor?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) reservationAmountMinor?: number | null;
  @IsOptional() @IsString() paymentPlanId?: string | null;
  @IsOptional() @IsDateString() expectedCloseAt?: string | null;
  @IsOptional() @IsDateString() contractSignedAt?: string | null;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class CreateDealDto extends DealFieldsDto {
  @IsString() enquiryId!: string;
  @IsString() unitId!: string;
}

export class DealActionDto {
  @IsIn(['reserve', 'contract', 'sold', 'lost', 'cancel', 'reopen']) action!: 'reserve' | 'contract' | 'sold' | 'lost' | 'cancel' | 'reopen';
  @IsOptional() @IsDateString() heldUntil?: string;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) depositMinor?: number | null;
  @IsOptional() @IsIn(LOST_REASONS) lostReason?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export class CampaignDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsIn(LEAD_SOURCES) channel?: string;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string | null;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MINOR) budgetMinor?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class CreateCampaignDto extends CampaignDto {
  @IsString() @Length(1, 120) declare name: string;
}

// ─── Pipeline & settings ─────────────────────────────────────────────────

export class StageDto {
  @IsOptional() @IsString() @Length(1, 60) label?: string;
  @IsOptional() @IsIn(ENQUIRY_STATUSES) category?: string;
  @IsOptional() @IsIn(CRM_TONES) color?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateStageDto extends StageDto {
  @IsString() @Length(1, 60) declare label: string;
  @IsIn(ENQUIRY_STATUSES) declare category: string;
}

export class ReorderStagesDto {
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) ids!: string[];
}

class ScoringRuleDto {
  @IsIn(SCORE_KEYS) key!: string;
  @IsInt() @Min(-50) @Max(100) points!: number;
  @IsBoolean() enabled!: boolean;
}

export class CrmSettingsDto {
  @IsOptional() @IsIn(ASSIGNMENT_MODES) assignmentMode?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) assignmentPool?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => ScoringRuleDto) scoringRules?: ScoringRuleDto[];
  @IsOptional() @IsInt() @Min(1) @Max(100) hotThreshold?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) warmThreshold?: number;
}

export class SavedViewDto {
  @IsIn(['leads', 'pipeline', 'tasks', 'deals']) scope!: string;
  @IsString() @Length(1, 60) name!: string;
  @IsObject() filters!: Record<string, string>;
  @IsOptional() @IsBoolean() shared?: boolean;
}

// ─── Viewings ────────────────────────────────────────────────────────────

export class ViewingFeedbackDto {
  @IsOptional() @IsIn(['COMPLETED', 'NO_SHOW']) status?: 'COMPLETED' | 'NO_SHOW';
  @IsOptional() @IsIn(VIEWING_INTERESTS) interestLevel?: string;
  @IsOptional() @IsString() @MaxLength(5000) outcome?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) objections?: string | null;
  @IsOptional() @IsString() alternativeUnitId?: string | null;
  @IsOptional() @ValidateNested() @Type(() => NextActionDto) next?: NextActionDto;
}

// ─── Documents ───────────────────────────────────────────────────────────

export class DocumentMetaDto {
  @IsOptional() @IsIn(DOCUMENT_KINDS) kind?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() sent?: boolean;
}

// ─── Approvals ───────────────────────────────────────────────────────────

/** A change the requester may not make themselves, for someone who may. */
export class ApprovalRequestDto {
  @IsIn(['update', 'action']) operation!: 'update' | 'action';
  @IsOptional() @ValidateNested() @Type(() => DealFieldsDto) fields?: DealFieldsDto;
  @IsOptional() @ValidateNested() @Type(() => DealActionDto) action?: DealActionDto;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ApprovalDecisionDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
