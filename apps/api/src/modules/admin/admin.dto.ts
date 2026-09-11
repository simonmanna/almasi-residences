import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UNIT_STATUSES, type UnitStatus } from '@avida/types';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(10) totp?: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsIn(UNIT_STATUSES) status?: UnitStatus;
  @IsOptional() @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class BulkStatusDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsIn(UNIT_STATUSES) status!: UnitStatus;
}

export class UpdateEnquiryDto {
  @IsOptional() @IsIn(['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'SPAM']) status?: string;
  @IsOptional() @IsString() @MaxLength(120) assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(2000) internalNote?: string;
}
