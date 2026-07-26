import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestWhatsAppPostDto {
  @ApiProperty({ description: 'WhatsApp post caption or message text' })
  @IsString()
  @MaxLength(10000)
  caption!: string;

  @ApiPropertyOptional({ description: 'WhatsApp group/source name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceGroup?: string;

  @ApiPropertyOptional({ description: 'Sender phone number from source post' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  senderPhone?: string;

  @ApiPropertyOptional({ description: 'Stable WhatsApp message id' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Synced media URLs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: 'Original message received timestamp' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
