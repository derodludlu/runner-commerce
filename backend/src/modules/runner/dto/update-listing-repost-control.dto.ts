import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateListingRepostControlDto {
  @IsIn(['START_NOW', 'SCHEDULE', 'PAUSE', 'RESUME', 'STOP'])
  action!: 'START_NOW' | 'SCHEDULE' | 'PAUSE' | 'RESUME' | 'STOP';

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(10080)
  repostFrequencyMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  maximumListingAgeDays?: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
