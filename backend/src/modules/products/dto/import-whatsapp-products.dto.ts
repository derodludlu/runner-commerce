import {
  ArrayMaxSize,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsAppProductImportItemDto {
  @ApiProperty({ example: 'Fresh Milk 1L' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Organic whole milk' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 29.99 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQty!: number;

  @ApiPropertyOptional({ example: 'Dairy' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/image.jpg'],
    description: 'Image URLs extracted from WhatsApp media sync or exports',
  })
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
  images?: string[];

  @ApiPropertyOptional({ description: 'Original WhatsApp caption or message' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  sourceText?: string;
}

export class ImportWhatsAppProductsDto {
  @ApiProperty({ type: [WhatsAppProductImportItemDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => WhatsAppProductImportItemDto)
  items!: WhatsAppProductImportItemDto[];
}
