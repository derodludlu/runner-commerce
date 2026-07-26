import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsBoolean()
  @IsOptional()
  isInternal?: boolean = false;

  @IsOptional()
  attachments?: any;
}
