import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Coupons')
@Controller('coupons')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CouponsController {
  constructor(private couponsService: CouponsService) {}

  @Post()
  @ApiOperation({ summary: 'Create coupon (Admin/Shop Owner)' })
  create(@Request() req: any, @Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto, req.user?.userId, req.user?.role);
  }

  @Get()
  @ApiOperation({ summary: 'Get all coupons (Admin)' })
  findAll(@Request() req: any) {
    return this.couponsService.findAll();
  }

  @Get('my-usage')
  @ApiOperation({ summary: 'Get user coupon usage history' })
  getUserUsage(@Request() req: any) {
    return this.couponsService.getUserUsage(req.user?.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by ID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update coupon (Admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @Request() req: any,
  ) {
    return this.couponsService.update(
      id,
      dto,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon (Admin)' })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.couponsService.delete(id, req.user?.role);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply coupon to order' })
  applyCoupon(@Request() req: any, @Body() dto: ApplyCouponDto) {
    return this.couponsService.applyCoupon(dto, req.user?.userId);
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate coupon code' })
  validateCoupon(@Param('code') code: string, @Request() req: any) {
    return this.couponsService.validateCoupon(code, req.user?.userId);
  }
}
