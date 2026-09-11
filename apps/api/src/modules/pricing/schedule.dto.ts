import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class ScheduleRequestDto {
  @IsString()
  unitId!: string;

  /** Defaults to today. Present so a buyer can model a reservation next month. */
  @IsOptional()
  @IsISO8601()
  startDate?: string;
}
