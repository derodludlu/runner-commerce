import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncWhatsAppDiscoveredGroupDto {
  @ApiProperty({ description: 'Canonical WhatsApp group id' })
  @IsString()
  @MaxLength(160)
  groupId!: string;

  @ApiProperty({ description: 'WhatsApp group display name' })
  @IsString()
  @MaxLength(240)
  name!: string;

  @ApiPropertyOptional({ description: 'WhatsApp creator id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  creatorId?: string;

  @ApiPropertyOptional({ description: 'Normalized creator phone' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  creatorPhone?: string;

  @ApiPropertyOptional({ description: 'Approximate participants count' })
  @IsOptional()
  @IsInt()
  @Min(0)
  participants?: number;

  @ApiPropertyOptional({
    description: 'Normalized participant phone numbers visible in this group',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  participantPhones?: string[];

  @ApiPropertyOptional({
    description: 'Locally stored profile image URL for the WhatsApp group',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  profileImageUrl?: string;
}

export class SyncWhatsAppDiscoveredGroupsDto {
  @ApiPropertyOptional({
    description: 'Bridge account id for the WhatsApp session reporting groups',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bridgeAccountId?: string;

  @ApiPropertyOptional({
    description: 'Phone/user id of the authenticated WhatsApp account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  authenticatedPhone?: string;

  @ApiPropertyOptional({
    description: 'Display name reported by the authenticated WhatsApp account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  authenticatedName?: string;

  @ApiProperty({ type: [SyncWhatsAppDiscoveredGroupDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncWhatsAppDiscoveredGroupDto)
  groups!: SyncWhatsAppDiscoveredGroupDto[];
}
