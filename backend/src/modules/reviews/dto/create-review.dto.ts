// src/modules/reviews/dto/create-review.dto.ts

import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateReviewDto {
  @ApiProperty({
    example: 'product-id-123',
    description: 'Product ID to review',
  })
  @IsString()
  productId!: string;

  @ApiProperty({
    example: 5,
    description: 'Rating from 1-5 stars',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => parseInt(value))
  rating!: number;

  @ApiProperty({
    example: 'Great product!',
    description: 'Review title',
    required: false,
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: 'This product exceeded my expectations...',
    description: 'Review comment',
    required: false,
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({
    example: true,
    description: 'Verified purchase',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiProperty({
    example: 'order-id-456',
    description: 'Order ID (if verified purchase)',
    required: false,
  })
  @IsOptional()
  @IsString()
  orderId?: string;
}
