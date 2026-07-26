// src/modules/shops/dto/create-shop.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShopDto {
  @ApiProperty({ example: 'Tech Gadgets Store', description: 'Shop name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'Latest electronics and accessories',
    description: 'Shop description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '+1555987654', description: 'Shop contact phone' })
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({
    example: '123 Main St, City, State 12345',
    description: 'Shop address',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;
}
