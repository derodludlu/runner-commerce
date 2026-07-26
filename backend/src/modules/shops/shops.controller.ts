// src/modules/shops/shops.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { MergeShopDto } from './dto/merge-shop.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';

@ApiTags('Shops')
@Controller('shops')
export class ShopsController {
  constructor(private shopsService: ShopsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new shop (SHOP_OWNER only)' })
  @ApiResponse({ status: 201, description: 'Shop created successfully' })
  @ApiResponse({ status: 400, description: 'User already has a shop' })
  @ApiResponse({ status: 403, description: 'Forbidden - wrong role' })
  create(@Body() createShopDto: CreateShopDto, @User() user: any) {
    return this.shopsService.create(createShopDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all active shops (public)' })
  @ApiResponse({ status: 200, description: 'List of shops' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  findAll(@Query() query: QueryShopDto) {
    return this.shopsService.findAll(query);
  }

  @Get('my-shops')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shops owned by current user' })
  @ApiResponse({ status: 200, description: 'List of user shops' })
  findMyShops(@User() user: any) {
    return this.shopsService.findByOwner(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shop details by ID (public)' })
  @ApiResponse({ status: 200, description: 'Shop details' })
  @ApiResponse({ status: 404, description: 'Shop not found' })
  findOne(@Param('id') id: string) {
    return this.shopsService.findOne(id);
  }

  @Get(':id/details')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shop full details (owner/admin only)' })
  @ApiResponse({ status: 200, description: 'Full shop details' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  findOneWithDetails(@Param('id') id: string, @User() user: any) {
    return this.shopsService.findOneWithDetails(id, user.userId, user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update shop (owner only)' })
  @ApiResponse({ status: 200, description: 'Shop updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  update(
    @Param('id') id: string,
    @Body() updateShopDto: UpdateShopDto,
    @User() user: any,
  ) {
    return this.shopsService.update(id, updateShopDto, user.userId);
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Permanently delete shop and owned records (ADMIN only)',
  })
  @ApiResponse({ status: 200, description: 'Shop permanently deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  hardDelete(@Param('id') id: string) {
    return this.shopsService.hardDelete(id);
  }

  @Post(':sourceId/merge-into/:targetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Merge a duplicate shop into another shop (ADMIN only)',
  })
  @ApiResponse({ status: 200, description: 'Shop merged successfully' })
  @ApiResponse({ status: 400, description: 'Invalid merge request' })
  mergeInto(
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
    @Body() dto: MergeShopDto,
  ) {
    return this.shopsService.mergeInto(sourceId, targetId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate shop (owner/admin only)' })
  @ApiResponse({ status: 200, description: 'Shop deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string, @User() user: any) {
    return this.shopsService.remove(id, user.userId, user.role);
  }
}
