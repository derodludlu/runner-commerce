import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsEnum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'])
  @IsOptional()
  status?: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  resolvedAt?: string;
}
