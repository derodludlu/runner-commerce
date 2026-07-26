import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ApplyRepostPriceFormatDto {
  @ApiPropertyOptional({
    enum: ['ORIGINAL', 'TOTAL_ONLY', 'STOCK_EACH_TOTALS'],
    example: 'ORIGINAL',
  })
  @IsOptional()
  @IsIn(['ORIGINAL', 'TOTAL_ONLY', 'STOCK_EACH_TOTALS'])
  repostPriceMode?: 'ORIGINAL' | 'TOTAL_ONLY' | 'STOCK_EACH_TOTALS';
}
