import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsEnum,
} from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsEnum(['ORDER', 'PAYMENT', 'PROMOTION', 'SYSTEM'])
  type!: 'ORDER' | 'PAYMENT' | 'PROMOTION' | 'SYSTEM';

  @IsEnum(['EMAIL', 'SMS', 'PUSH', 'IN_APP'])
  channel!: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';

  @IsOptional()
  @IsObject()
  metadata?: any;
}
