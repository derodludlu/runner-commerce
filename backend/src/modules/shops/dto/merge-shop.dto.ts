import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MergeShopDto {
  @ApiPropertyOptional({
    description: 'Optional admin note explaining why the duplicate was merged',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
