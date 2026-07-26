// src/modules/auth/dto/register.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '+1234567890', description: 'User phone number' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    example: 'DURBAN',
    enum: ['DURBAN', 'JOHANNESBURG', 'MAPUTO'],
  })
  @IsString()
  @IsNotEmpty()
  preferredRunnerCity!: string;

  @ApiProperty({
    example: '+26876154884',
    description: 'Trusted runner WhatsApp number',
  })
  @IsString()
  @IsNotEmpty()
  preferredRunnerPhone!: string;
}
