// src/modules/products/dto/query-product.dto.ts

import { IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator'; // ✅ Validators
import { Type } from 'class-transformer'; // ✅ Transform decorator
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryProductDto {
  @ApiPropertyOptional({
    example: 'Phone',
    description: 'Search by name or category',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Phones', description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: '2bcc7325-9473-4614-b788-8c00ac4073c6',
    description: 'Filter by shop ID',
  })
  @IsOptional()
  @IsString()
  shopId?: string;

  @ApiPropertyOptional({
    example: '2bcc7325-9473-4614-b788-8c00ac4073c6',
    description: 'Legacy alias for shopId',
  })
  @IsOptional()
  @IsString()
  shop?: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'],
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'])
  status?: string;

  @ApiPropertyOptional({ example: '10', description: 'Products per page' })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({ example: '0', description: 'Offset for pagination' })
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Sort field' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort order',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: true,
    description: 'Only show in-stock items',
  })
  @IsOptional()
  @IsOptional()
  inStock?: boolean;
}
