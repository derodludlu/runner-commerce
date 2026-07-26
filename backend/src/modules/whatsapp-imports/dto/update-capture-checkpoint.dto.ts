import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCaptureCheckpointDto {
  @ApiProperty({
    description: 'Canonical WhatsApp group id used by the bridge',
  })
  @IsString()
  @MaxLength(160)
  groupId!: string;

  @ApiPropertyOptional({ description: 'Human readable WhatsApp group name' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceGroup?: string;

  @ApiPropertyOptional({
    enum: ['SCANNING', 'COMPLETED', 'PARTIAL', 'FAILED'],
  })
  @IsOptional()
  @IsIn(['SCANNING', 'COMPLETED', 'PARTIAL', 'FAILED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  lastFullyCapturedMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastFullyCapturedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastScanStartedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastScanCompletedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastError?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  messagesScanned?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  productsCaptured?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  productsSkipped?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  productsFailed?: number;
}
