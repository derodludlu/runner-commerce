import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';

export class CreateReturnDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsOptional()
  orderItemId?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['ORIGINAL_PAYMENT', 'STORE_CREDIT', 'EXCHANGE'])
  @IsOptional()
  refundType?: 'ORIGINAL_PAYMENT' | 'STORE_CREDIT' | 'EXCHANGE';

  @IsOptional()
  images?: any;
}
