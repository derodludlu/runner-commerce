// src/modules/orders/dto/create-order.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class OrderItemDto {
  @ApiProperty({ description: 'Product listing ID' })
  @IsString()
  @IsNotEmpty()
  listingId!: string;

  @ApiPropertyOptional({
    description: 'Product ID (derived from listing when omitted)',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ description: 'Quantity ordered' })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Customer-sent reference image URLs for this item',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerImageUrls?: string[];

  @ApiPropertyOptional({ description: 'Requested product size' })
  @IsOptional()
  @IsString()
  selectedSize?: string;

  @ApiPropertyOptional({ description: 'Requested product colour' })
  @IsOptional()
  @IsString()
  selectedColor?: string;

  @ApiPropertyOptional({ description: 'Customer note for this item' })
  @IsOptional()
  @IsString()
  customerNote?: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: '+1987654321', description: 'Customer phone number' })
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiPropertyOptional({
    description: 'Customer name (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiProperty({ description: 'Shipping address details', required: false })
  @IsOptional()
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  @ApiProperty({
    description: 'List of products in cart',
    type: [OrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiPropertyOptional({
    description: 'Special delivery notes',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Customer confirmed checkout outside their matched trusted runner',
  })
  @IsOptional()
  @IsBoolean()
  trustedRunnerOverrideConfirmed?: boolean;

  @ApiPropertyOptional({
    description: 'Reason/context for trusted runner override',
  })
  @IsString()
  @IsOptional()
  trustedRunnerOverrideReason?: string;

  @ApiProperty({
    enum: ['COLLECTION', 'DELIVERY_STATION', 'PUBLIC_TRANSPORT'],
  })
  @IsString()
  @IsIn(['COLLECTION', 'DELIVERY_STATION', 'PUBLIC_TRANSPORT'])
  fulfillmentMethod!: string;

  @ApiProperty({ description: 'Collection point, delivery station, or town' })
  @IsString()
  @IsNotEmpty()
  fulfillmentLocation!: string;

  @ApiPropertyOptional({
    description: 'Transport or alternate contact details',
  })
  @IsOptional()
  @IsString()
  fulfillmentContact?: string;

  @ApiPropertyOptional({ description: 'Handover instructions' })
  @IsOptional()
  @IsString()
  fulfillmentNotes?: string;
}
