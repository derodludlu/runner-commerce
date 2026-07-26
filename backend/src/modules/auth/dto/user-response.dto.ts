// src/modules/auth/dto/user-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: 'User unique ID' })
  id!: string;

  @ApiProperty({ description: 'User full name' })
  name!: string;

  @ApiProperty({ description: 'User phone number' })
  phone!: string;

  @ApiProperty({ description: 'User email address', required: false })
  email?: string;

  @ApiProperty({
    description: 'User role',
    enum: [
      'ADMIN',
      'CUSTOMER',
      'RUNNER',
      'SHOP_OWNER',
      'WAREHOUSE',
      'SUPERUSER',
    ],
  })
  role!: string;

  @ApiProperty({ description: 'User must replace an admin-issued password' })
  mustChangePassword!: boolean;

  @ApiProperty({
    description: 'Runner profile (if user is a runner)',
    required: false,
  })
  runner?: {
    id: string;
    status: string;
    vehicleType?: string;
  };

  @ApiProperty({
    description:
      'Active impersonation metadata when a superuser is operating as this user',
    required: false,
  })
  impersonation?: {
    active: boolean;
    actorUserId?: string;
    actorName?: string | null;
    actorRole?: string;
  };
}
