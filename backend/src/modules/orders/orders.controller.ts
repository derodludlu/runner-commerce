// src/modules/orders/orders.controller.ts

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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  UpdateOrderStatusDto,
  OrderStatus,
} from './dto/update-order-status.dto';
import { UpdateManualOrderTrackingDto } from './dto/update-manual-order-tracking.dto';
import { SubmitCustomerPaymentDto } from './dto/submit-customer-payment.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, resolve } from 'path';
import { mkdirSync } from 'fs';

const { diskStorage } = require('multer');
const paymentProofUploadDir = resolve(
  process.env.UPLOAD_PATH || './uploads',
  'payment-proofs',
);
mkdirSync(paymentProofUploadDir, { recursive: true });

function safeProofName(file: any) {
  const extension = extname(file.originalname || '').toLowerCase() || '.jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
}

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created' })
  create(@Body() createOrderDto: CreateOrderDto, @User() user: any) {
    return this.ordersService.create(createOrderDto, user.userId);
  }

  @Post(':id/payment-proof')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: diskStorage({
        destination: paymentProofUploadDir,
        filename: (_req: any, file: any, callback: any) =>
          callback(null, safeProofName(file)),
      }),
      fileFilter: (_req, file, callback) => {
        if (!String(file.mimetype || '').startsWith('image/')) {
          callback(new BadRequestException('Proof must be an image'), false);
          return;
        }
        callback(null, true);
      },
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadPaymentProof(
    @Param('id') id: string,
    @UploadedFile() proof: any,
    @User() user: any,
  ) {
    if (!proof) throw new BadRequestException('Attach payment proof');
    return this.ordersService.attachCustomerPaymentProof(
      id,
      `/uploads/payment-proofs/${proof.filename}`,
      user.userId,
    );
  }

  @Patch(':id/customer-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit customer payment for runner verification' })
  submitCustomerPayment(
    @Param('id') id: string,
    @Body() dto: SubmitCustomerPaymentDto,
    @User() user: any,
  ) {
    return this.ordersService.submitCustomerPayment(id, dto, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List orders (authenticated)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: Object.values(OrderStatus),
  })
  @ApiQuery({ name: 'customerPhone', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  findAll(@Query() query: QueryOrderDto, @User() user: any) {
    return this.ordersService.findAll(
      query,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Get('shop/:shopId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get orders for a specific shop' })
  findByShop(@Param('shopId') shopId: string, @User() user: any) {
    return this.ordersService.findByShop(shopId, user.userId, user.role);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id') id: string, @User() user: any) {
    return this.ordersService.findOne(
      id,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'RUNNER', 'WAREHOUSE', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @User() user: any,
  ) {
    return this.ordersService.updateStatus(
      id,
      updateOrderStatusDto,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Patch(':id/manual-tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RUNNER', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Manually track customer payment, shop payment, runner purchase, and delivery/collection',
  })
  updateManualTracking(
    @Param('id') id: string,
    @Body() dto: UpdateManualOrderTrackingDto,
    @User() user: any,
  ) {
    return this.ordersService.updateManualTracking(
      id,
      dto,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Delete(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  cancel(@Param('id') id: string, @User() user: any) {
    return this.ordersService.cancelOrder(
      id,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Post(':id/confirm-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RUNNER', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm payment for an order' })
  @ApiResponse({ status: 200, description: 'Payment confirmed' })
  confirmPayment(
    @Param('id') id: string,
    @Body('transactionId') transactionId: string,
    @User() user: any,
  ) {
    return this.ordersService.confirmPayment(
      id,
      transactionId,
      user.userId,
      user.role,
      user.runnerId,
    );
  }

  @Patch(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: flexibly update order test data' })
  adminUpdate(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.ordersService.adminUpdate(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: permanently delete an order' })
  adminDelete(@Param('id') id: string) {
    return this.ordersService.adminDelete(id);
  }
}
