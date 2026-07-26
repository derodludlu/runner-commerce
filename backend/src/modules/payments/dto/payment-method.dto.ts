// payment-method.dto.ts - Runner Commerce Payments Module
// Generated: 2026-03-11

// src/modules/payments/dto/payment-method.dto.ts

import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentMethodDto {
  @ApiProperty({ description: 'Stripe PaymentMethod ID (pm_XXX)' })
  @IsString()
  paymentMethodId!: string;

  @ApiPropertyOptional({ description: 'Set as default payment method' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class PaymentMethodResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  last4!: string;

  @ApiProperty()
  expMonth!: number;

  @ApiProperty()
  expYear!: number;

  @ApiProperty()
  isDefault!: boolean;
}
