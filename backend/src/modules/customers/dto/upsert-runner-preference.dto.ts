import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertRunnerPreferenceDto {
  @ApiProperty({ example: '+26876154884' })
  @IsString()
  @IsNotEmpty()
  runnerPhone!: string;
}
