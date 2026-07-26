import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RequestToJoinShopDto {
  @IsString()
  @IsNotEmpty()
  shopId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
