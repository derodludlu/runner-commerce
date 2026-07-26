import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class UpdateRunnerShopStatusDto {
  @IsString()
  @IsNotEmpty()
  runnerId!: string;

  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'])
  status!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
