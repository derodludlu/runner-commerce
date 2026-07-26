import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class UpdateWhatsAppDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  stockQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  images?: string[];
}

export class UpdateWhatsAppImportDto {
  @ApiPropertyOptional({ type: UpdateWhatsAppDraftDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWhatsAppDraftDto)
  parsedDraft?: UpdateWhatsAppDraftDto;

  @ApiPropertyOptional({
    enum: ['PARSED', 'NEEDS_REVIEW', 'IGNORED'],
  })
  @IsOptional()
  @IsString()
  status?: 'PARSED' | 'NEEDS_REVIEW' | 'IGNORED';
}
