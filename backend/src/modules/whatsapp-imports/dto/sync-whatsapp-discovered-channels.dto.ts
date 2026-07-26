import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncWhatsAppDiscoveredChannelDto {
  @ApiProperty({ description: 'Canonical WhatsApp channel/newsletter id' })
  @IsString()
  @MaxLength(160)
  channelId!: string;

  @ApiProperty({ description: 'WhatsApp channel display name' })
  @IsString()
  @MaxLength(240)
  name!: string;

  @ApiPropertyOptional({ description: 'WhatsApp channel description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the linked account can post' })
  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;

  @ApiPropertyOptional({ description: 'Unread message count' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unreadCount?: number;

  @ApiPropertyOptional({ description: 'Approximate subscriber count' })
  @IsOptional()
  @IsInt()
  @Min(0)
  subscriberCount?: number;

  @ApiPropertyOptional({ description: 'Public WhatsApp channel invite link' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteLink?: string;

  @ApiPropertyOptional({
    description: 'Unix timestamp for the most recent channel activity',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  timestamp?: number;
}

export class SyncWhatsAppDiscoveredChannelsDto {
  @ApiPropertyOptional({
    description:
      'Bridge account id for the WhatsApp session reporting channels',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bridgeAccountId?: string;

  @ApiProperty({ type: [SyncWhatsAppDiscoveredChannelDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncWhatsAppDiscoveredChannelDto)
  channels!: SyncWhatsAppDiscoveredChannelDto[];
}
