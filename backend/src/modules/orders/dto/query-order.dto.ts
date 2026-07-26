// src/modules/orders/dto/query-order.dto.ts

import { Transform } from 'class-transformer';
import { IsString, Min, IsOptional, IsEnum, IsNumber } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from './update-order-status.dto';

export class QueryOrderDto {
  @ApiPropertyOptional({ description: 'Filter by order status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Customer phone number' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Orders per page', default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'Pagination offset', default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  offset: number = 0;
}
