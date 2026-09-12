import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  /**
   * Either the six-digit code from the authenticator or one of the account's
   * recovery codes (`43583-1496f`), which is longer — capping this at ten
   * characters made the recovery path impossible to use.
   */
  @IsOptional() @IsString() @MaxLength(24) totp?: string;
}

export class TotpConfirmDto {
  @IsString() @MinLength(6) @MaxLength(10) code!: string;
}

export class TotpDisableDto {
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(200) current!: string;
  @IsString() @MinLength(12, { message: 'Use at least 12 characters.' }) @MaxLength(200) next!: string;
}
