import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class ConvertWhatsAppOrderRequestDto {
  @ApiPropertyOptional({ example: 1, description: 'Quantity requested' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Confirmed customer phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Customer name, if known' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Customer selected size' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  size?: string;

  @ApiPropertyOptional({ description: 'Customer selected color' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @ApiPropertyOptional({ description: 'Delivery street/address line' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  street?: string;

  @ApiPropertyOptional({ description: 'Delivery city/area' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ description: 'Special notes from the WhatsApp chat' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
