// src/modules/shops/dto/query-shop.dto.ts

import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class QueryShopDto {
  @ApiPropertyOptional({ example: 'Tech', description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Filter by status',
    enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status?: string;

  @ApiPropertyOptional({ example: '10', description: 'Items per page' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;

  @ApiPropertyOptional({ example: '0', description: 'Offset for pagination' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
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
}
