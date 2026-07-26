// src/modules/auth/dto/auth-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'JWT refresh token', required: false })
  refreshToken?: string;

  @ApiProperty({
    description: 'Authenticated user details',
    type: UserResponseDto,
  })
  user!: UserResponseDto;

  @ApiProperty({
    required: false,
    description: 'Trusted runner matching result for new customer registration',
  })
  runnerPreference?: {
    city: string;
    runnerPhone: string;
    status: string;
    runnerId?: string;
  };
}
