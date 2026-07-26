import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCurrentUserDto {
  @ApiPropertyOptional({ example: 'Mxolisi Dludlu' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+26876154884' })
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'user@runnercommerce.com' })
  @IsEmail()
  @MaxLength(180)
  @IsOptional()
  email?: string;
}
