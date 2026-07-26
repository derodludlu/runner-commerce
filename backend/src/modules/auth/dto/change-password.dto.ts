import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current or temporary password' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ description: 'New password, at least 8 characters' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
