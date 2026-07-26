import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SubmitCustomerPaymentDto {
  @ApiProperty({
    enum: [
      'MTN_MOMO',
      'EFT',
      'CASH_DEPOSIT',
      'INSTANT_MONEY',
      'EWALLET',
      'UNAYO',
      'CASH',
      'OTHER',
    ],
  })
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
  method!: string;

  @ApiPropertyOptional({ description: 'Payment transaction/reference number' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Uploaded proof URL' })
  @IsOptional()
  @IsString()
  proofUrl?: string;

  @ApiPropertyOptional({ description: 'Amount submitted in ZAR/SZL' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
