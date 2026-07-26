import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @IsNotEmpty({ message: 'Phone number, email, or username is required' })
  @MaxLength(160)
  identifier!: string;
}
