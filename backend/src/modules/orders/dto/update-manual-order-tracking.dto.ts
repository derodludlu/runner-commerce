import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateManualOrderTrackingDto {
  @ApiPropertyOptional({ description: 'UNPAID, PART_PAID, PAID' })
  @IsOptional()
  @IsString()
  @IsIn(['UNPAID', 'SUBMITTED', 'PART_PAID', 'PAID', 'REJECTED'])
  customerPaymentStatus?: string;

  @ApiPropertyOptional({ description: 'EFT, MTN_MOMO, CASH_DEPOSIT, OTHER' })
  @IsOptional()
  @IsString()
  @IsIn([
    'MTN_MOMO',
    'EFT',
    'CASH_DEPOSIT',
    'INSTANT_MONEY',
    'EWALLET',
    'UNAYO',
    'CASH',
    'OTHER',
  ])
  customerPaymentMethod?: string;

  @ApiPropertyOptional({ description: 'Customer payment reference' })
  @IsOptional()
  @IsString()
  customerPaymentReference?: string;

  @ApiPropertyOptional({ description: 'Customer proof URL/path' })
  @IsOptional()
  @IsString()
  customerPaymentProofUrl?: string;

  @ApiPropertyOptional({ description: 'UNPAID, PART_PAID, PAID' })
  @IsOptional()
  @IsString()
  @IsIn(['UNPAID', 'PART_PAID', 'PAID'])
  shopPaymentStatus?: string;

  @ApiPropertyOptional({ description: 'Shop payment method' })
  @IsOptional()
  @IsString()
  shopPaymentMethod?: string;

  @ApiPropertyOptional({ description: 'Shop payment reference' })
  @IsOptional()
  @IsString()
  shopPaymentReference?: string;

  @ApiPropertyOptional({ description: 'Shop payment proof URL/path' })
  @IsOptional()
  @IsString()
  shopPaymentProofUrl?: string;

  @ApiPropertyOptional({ description: 'NOT_BOUGHT, BOUGHT, PARTIAL' })
  @IsOptional()
  @IsString()
  @IsIn(['NOT_BOUGHT', 'BOUGHT', 'PARTIAL', 'UNAVAILABLE'])
  runnerPurchaseStatus?: string;

  @ApiPropertyOptional({ description: 'PENDING, DELIVERED, COLLECTED, SENT' })
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'DELIVERED', 'COLLECTED', 'SENT'])
  handoverStatus?: string;

  @ApiPropertyOptional({
    description:
      'MANUAL_HANDOVER, MANUAL_TRACKING, PROVIDER_RATE_QUOTE, PROVIDER_LABELS',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'MANUAL_HANDOVER',
    'MANUAL_TRACKING',
    'PROVIDER_RATE_QUOTE',
    'PROVIDER_LABELS',
  ])
  shippingMode?: string;

  @ApiPropertyOptional({ description: 'Manual carrier/provider label' })
  @IsOptional()
  @IsString()
  shippingProvider?: string;

  @ApiPropertyOptional({ description: 'Manual tracking number/reference' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({
    description: 'Provider quote/label/tracking metadata',
  })
  @IsOptional()
  @IsObject()
  shippingProviderMetadata?: Record<string, unknown>;
}
