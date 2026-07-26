import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginCredentialsDto {
  @ApiProperty({
    description: 'User phone number, email, or username',
    example: '+26876123456 or user@example.com or john',
  })
  @Transform(({ value }) => value.trim())
  @IsString()
  @IsNotEmpty({ message: 'Phone number, email, or username is required' })
  identifier!: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123',
    minLength: 8,
  })
  @Transform(({ value }) => value.trim())
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;
}
