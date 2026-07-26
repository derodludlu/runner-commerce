import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM';

  @IsEnum(['ORDER', 'PAYMENT', 'PRODUCT', 'TECHNICAL', 'OTHER'])
  @IsOptional()
  category?: 'ORDER' | 'PAYMENT' | 'PRODUCT' | 'TECHNICAL' | 'OTHER' = 'OTHER';

  @IsString()
  @IsOptional()
  orderId?: string;
}
