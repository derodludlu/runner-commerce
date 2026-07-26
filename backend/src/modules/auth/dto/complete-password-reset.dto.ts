import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CompletePasswordResetDto {
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  identifier!: string;

  @Transform(({ value }) => String(value || '').replace(/\s/g, ''))
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Reset PIN must contain 6 digits' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128)
  newPassword!: string;
}
