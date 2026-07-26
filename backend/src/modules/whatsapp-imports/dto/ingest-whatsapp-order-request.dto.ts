import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerImageHashDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sha256?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  perceptualHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimetype?: string;
}

export class IngestWhatsAppOrderRequestDto {
  @ApiProperty({
    description:
      'Incoming private WhatsApp message text or caption from a customer',
  })
  @IsString()
  @MaxLength(4000)
  messageText!: string;

  @ApiPropertyOptional({ description: 'WhatsApp message id for idempotency' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  messageId?: string;

  @ApiPropertyOptional({ description: 'Customer WhatsApp phone/id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Customer display name from WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({
    description: 'Bridge account/runner phone that received the message',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Message received time' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional({
    description: 'Customer-sent reference image URLs for the requested item',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerImageUrls?: string[];

  @ApiPropertyOptional({
    description:
      'Hashes/fingerprints for customer-sent reference images, used to match stamped repost media',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerImageHashDto)
  customerImageHashes?: CustomerImageHashDto[];
}
