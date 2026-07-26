import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateRunnerProfileDto {
  @ApiPropertyOptional({ example: 'Doreen Runner' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '+26876123456' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Car' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleType?: string;

  @ApiPropertyOptional({ example: 'ABC123' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleNumber?: string;

  @ApiPropertyOptional({ example: 'Mbabane, Manzini' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceArea?: string;

  @ApiPropertyOptional({ example: 'Runner Commerce DEV Reposts' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  whatsappGroup?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoPostEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 30, example: 30 })
  @IsOptional()
  @IsInt()
  @Min(30)
  autoPostIntervalMinutes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPostsPerRun?: number;

  @ApiPropertyOptional({
    enum: ['ORIGINAL', 'TOTAL_ONLY', 'STOCK_EACH_TOTALS'],
    example: 'ORIGINAL',
  })
  @IsOptional()
  @IsIn(['ORIGINAL', 'TOTAL_ONLY', 'STOCK_EACH_TOTALS'])
  repostPriceMode?: 'ORIGINAL' | 'TOTAL_ONLY' | 'STOCK_EACH_TOTALS';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  repostOrderDetailsEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  repostFeePercentageEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  repostOriginalPricePerImageEnabled?: boolean;
}
