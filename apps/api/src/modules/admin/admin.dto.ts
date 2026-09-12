import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(10) totp?: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(200) current!: string;
  @IsString() @MinLength(12, { message: 'Use at least 12 characters.' }) @MaxLength(200) next!: string;
}
