import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCartItemDto {
  @IsNotEmpty()
  listingId!: string;

  @IsInt()
  @Min(1)
  quantity: number = 1;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerImageUrls?: string[];
}
