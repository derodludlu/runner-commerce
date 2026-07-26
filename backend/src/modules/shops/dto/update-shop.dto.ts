// src/modules/shops/dto/update-shop.dto.ts

import { PartialType } from '@nestjs/swagger';
import { CreateShopDto } from './create-shop.dto';

// PartialType makes all fields optional for updates
export class UpdateShopDto extends PartialType(CreateShopDto) {}
