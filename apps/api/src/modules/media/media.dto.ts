import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TIME_STATES } from '@avida/types';

const TIME_STATE_KEYS = TIME_STATES.map((s) => s.toUpperCase());

export class UploadUrlDto {
  @IsString() @MaxLength(200) mediaSetKey!: string;

  @IsIn(TIME_STATE_KEYS) timeState!: string;

  @IsString() @MaxLength(120) filename!: string;

  @IsIn(['image/jpeg', 'image/png', 'image/tiff', 'image/webp', 'video/mp4', 'video/quicktime'])
  contentType!: string;

  /** §5.9 — a presigned URL is scoped to a maximum size as well as a key. */
  @IsInt() @Min(1) @Max(512 * 1024 * 1024) contentLength!: number;

  @IsOptional() @IsIn(['PRIMARY', 'ALTERNATE', 'DETAIL']) role?: string;
}

export class CompleteUploadDto {
  @IsString() assetId!: string;
}
