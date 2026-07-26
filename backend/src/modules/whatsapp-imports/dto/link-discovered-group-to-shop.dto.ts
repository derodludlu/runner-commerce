import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkDiscoveredGroupToShopDto {
  @ApiProperty({ description: 'Existing shop that owns this WhatsApp group' })
  @IsString()
  @MaxLength(80)
  shopId!: string;

  @ApiPropertyOptional({ enum: ['SOURCE', 'SHOP_REPOST_DESTINATION'] })
  @IsOptional()
  @IsIn(['SOURCE', 'SHOP_REPOST_DESTINATION'])
  groupRole?: string;

  @ApiPropertyOptional({
    description: 'Marks this linked group as the primary shop source group',
  })
  @IsOptional()
  @IsBoolean()
  isPrimarySource?: boolean;
}
