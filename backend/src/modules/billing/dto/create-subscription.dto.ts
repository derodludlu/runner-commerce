import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'Billing plan code, for example RUNNER_ACTIVE' })
  @IsString()
  planCode!: string;

  @ApiPropertyOptional({ description: 'Shop id for shop-owner subscriptions' })
  @IsOptional()
  @IsString()
  shopId?: string;

  @ApiPropertyOptional({ description: 'Enable WhatsApp automation add-on' })
  @IsOptional()
  @IsBoolean()
  automationAddonEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable Phase 2 order workflow add-on' })
  @IsOptional()
  @IsBoolean()
  orderWorkflowAddonEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable runner price editing and calculation add-on',
  })
  @IsOptional()
  @IsBoolean()
  priceEditingAddonEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable shop price attachment on product images add-on',
  })
  @IsOptional()
  @IsBoolean()
  shopPriceImageAddonEnabled?: boolean;
}
