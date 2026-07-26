import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWhatsAppGroupMappingDto {
  @ApiPropertyOptional({
    description: 'Shop that owns this source WhatsApp group',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shopId?: string;

  @ApiPropertyOptional({ description: 'Canonical WhatsApp group id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  groupId?: string;

  @ApiPropertyOptional({ description: 'Human readable WhatsApp group name' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceGroup?: string;

  @ApiPropertyOptional({ description: 'Approximate group participant count' })
  @IsOptional()
  @IsInt()
  @Min(0)
  participants?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'INACTIVE'])
  status?: string;

  @ApiPropertyOptional({ enum: ['SOURCE', 'SHOP_REPOST_DESTINATION'] })
  @IsOptional()
  @IsIn(['SOURCE', 'SHOP_REPOST_DESTINATION'])
  groupRole?: string;

  @ApiPropertyOptional({
    description: 'Marks this group as the primary capture source for the shop',
  })
  @IsOptional()
  @IsBoolean()
  isPrimarySource?: boolean;

  @ApiPropertyOptional({ description: 'Allow this group to be captured' })
  @IsOptional()
  @IsBoolean()
  captureEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Allow reposting to this group when used as a destination',
  })
  @IsOptional()
  @IsBoolean()
  postingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Maximum messages to capture per run' })
  @IsOptional()
  @IsInt()
  @Min(1)
  captureLimitPerRun?: number;

  @ApiPropertyOptional({ description: 'Maximum listings to post per run' })
  @IsOptional()
  @IsInt()
  @Min(1)
  listingLimitPerRun?: number;

  @ApiPropertyOptional({ description: 'Exact WhatsApp group invite link' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
