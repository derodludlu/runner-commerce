// src/modules/runner/dto/register-runner.dto.ts

import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterRunnerDto {
  @ApiProperty({ example: 'Bicycle', description: 'Type of vehicle' })
  @IsString()
  @IsNotEmpty()
  vehicleType!: string;

  @ApiProperty({
    example: 'ABC123',
    description: 'Vehicle registration number',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiProperty({
    example: '+26876123456',
    description: 'Contact phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'Mbabane, Manzini',
    description: 'Service areas',
    required: false,
  })
  @IsOptional()
  @IsString()
  serviceArea?: string;
}
