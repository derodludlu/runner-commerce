// create-payment.dto.ts - Runner Commerce Payments Module
// Generated: 2026-03-11

// src/modules/payments/dto/create-payment.dto.ts

import { IsString, IsNumber, IsOptional, IsEmail, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Order ID to pay for' })
  @IsString()
  orderId!: string;

  @ApiProperty({ description: 'Amount to charge (in dollars, e.g., 161.36)' })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Currency code (default: usd)' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Customer email for receipt' })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiPropertyOptional({
    description: 'Payment method ID from Stripe Elements',
  })
  @IsString()
  @IsOptional()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, string>;
}
