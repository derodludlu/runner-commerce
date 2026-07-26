import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRunnerShopAutomationDto {
  @IsIn(['test', 'live', 'all'])
  @IsOptional()
  selectionScope?: 'test' | 'live' | 'all';

  @IsBoolean()
  @IsOptional()
  autoListEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  autoPostEnabled?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  markupPercent?: number;

  @IsString()
  @MaxLength(240)
  @IsOptional()
  destinationGroup?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxPostsPerRun?: number;

  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  maximumListingAgeDays?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  categoryFilter?: string;

  @IsBoolean()
  @IsOptional()
  requireMedia?: boolean;
}
