import { ArrayMaxSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IngestWhatsAppPostDto } from './ingest-whatsapp-post.dto';

export class WebhookWhatsAppIngestDto {
  @ApiProperty({ description: 'Shop that owns the incoming WhatsApp posts' })
  @IsUUID()
  shopId!: string;

  @ApiProperty({
    type: [IngestWhatsAppPostDto],
    description: 'WhatsApp product posts to queue',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestWhatsAppPostDto)
  posts!: IngestWhatsAppPostDto[];
}
