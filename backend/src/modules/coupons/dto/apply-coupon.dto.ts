import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsNumber()
  @Min(0)
  orderAmount!: number;

  @IsString()
  @IsOptional()
  shopId?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
