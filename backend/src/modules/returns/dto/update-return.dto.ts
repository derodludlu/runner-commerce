import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UpdateReturnDto {
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  trackingNumber?: string;
}
