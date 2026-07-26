// src/modules/products/dto/create-product.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsArray,
  MaxLength,
  MinLength,
  IsUrl,
  IsBoolean,
  ValidateNested,
  IsPositive,
  IsInt,
  IsNumberString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export class ImageDto {
  @ApiProperty({
    example: 'https://example.com/iphone.jpg',
    description: 'Image URL',
  })
  @IsUrl({
    protocols: ['http', 'https'],
    require_tld: true,
    require_protocol: true,
  })
  url!: string;

  @ApiPropertyOptional({
    example: 'Front view of the product',
    description: 'Description of the image',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateProductDto {
  @ApiProperty({
    example: 'iPhone 15 Pro',
    description: 'Product name',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'Latest Apple smartphone with A17 Pro chip',
    required: false,
    maxLength: 2000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    example: 999.0,
    description: 'Base price from shop',
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiProperty({
    example: 50,
    description: 'Available stock quantity',
    minimum: 0,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @IsPositive({ message: 'Stock quantity must be a positive integer' })
  stockQty!: number;

  @ApiProperty({
    example: 'electronics',
    description: 'Comma-separated categories (e.g., "electronics,phones")',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  category?: string;

  @ApiProperty({
    example: [
      {
        url: 'https://example.com/iphone.jpg',
        description: 'Front view of the product',
      },
    ],
    description: 'Product images with optional descriptions',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images?: ImageDto[];

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: Object.values(ProductStatus),
    description: 'Product status',
  })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the product requires shipping',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  requiresShipping?: boolean;

  @ApiPropertyOptional({
    example: 0.5,
    description: 'Weight in kg for shipping calculations',
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weight?: number;
}
