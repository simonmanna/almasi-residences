import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ENQUIRY_INTENTS, type EnquiryIntent } from '@avida/types';

class UtmDto {
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(120) medium?: string;
  @IsOptional() @IsString() @MaxLength(120) campaign?: string;
}

export class CreateEnquiryDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsEmail() @MaxLength(200) email!: string;

  @IsString() @MinLength(6) @MaxLength(32) phone!: string;

  @IsOptional() @IsString() @MaxLength(2000) message?: string;

  @IsIn(ENQUIRY_INTENTS) intent!: EnquiryIntent;

  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) unitIds!: string[];

  @IsOptional() @IsString() @MaxLength(60) source?: string;

  @IsOptional() @ValidateNested() @Type(() => UtmDto) utm?: UtmDto;

  @IsOptional() @IsString() @MaxLength(500) referrer?: string;

  @IsOptional() @IsString() @MaxLength(500) landingPath?: string;

  @IsOptional() @IsString() @MaxLength(4000) turnstileToken?: string;

  /**
   * §5.7 step 2 — honeypot. Declared so the global ValidationPipe's
   * `forbidNonWhitelisted` does not reject the field before we can read it;
   * a value here means a bot, and the enquiry is accepted-and-dropped.
   */
  @IsOptional() @IsString() @MaxLength(200) company?: string;
}
