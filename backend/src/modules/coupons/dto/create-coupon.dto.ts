import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['PERCENTAGE', 'FIXED'])
  discountType!: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  discountValue!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderAmount?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscount?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  perUserLimit?: number = 1;

  @IsString()
  @IsNotEmpty()
  validFrom!: string;

  @IsString()
  @IsOptional()
  validUntil?: string;

  @IsOptional()
  @IsObject()
  applicableShops?: any;

  @IsOptional()
  @IsObject()
  applicableCategories?: any;
}
