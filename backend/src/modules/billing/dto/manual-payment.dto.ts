import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ManualPaymentDto {
  @ApiProperty({ example: 149, description: 'Amount paid in Rands' })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({
    example: 'EFT',
    description: 'EFT, MTN_MOMO, CASH_DEPOSIT, or OTHER',
  })
  @IsString()
  method!: string;

  @ApiPropertyOptional({ description: 'Bank/MoMo/cash deposit reference' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Runner phone/code used in the payment reference',
  })
  @IsOptional()
  @IsString()
  runnerReference?: string;

  @ApiPropertyOptional({ description: 'Stored proof/screenshot URL or path' })
  @IsOptional()
  @IsString()
  proofUrl?: string;

  @ApiPropertyOptional({ description: 'Pasted payment SMS or proof text' })
  @IsOptional()
  @IsString()
  proofText?: string;

  @ApiPropertyOptional({
    description: 'Stored proof screenshot URLs or paths',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofImageUrls?: string[];

  @ApiPropertyOptional({ description: 'WEB, RUNNER_BOT, or ADMIN' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp/source message id for idempotency',
  })
  @IsOptional()
  @IsString()
  sourceMessageId?: string;

  @ApiPropertyOptional({ description: 'Payment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
