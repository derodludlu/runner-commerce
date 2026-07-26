// src/modules/payments/payments.controller.ts
import type { RawBodyRequest as IsolatedRawBodyRequest } from '@nestjs/common';

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe/stripe.service';
import { StripeConfigService } from './stripe/stripe.config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    private stripeService: StripeService,
    private stripeConfig: StripeConfigService,
  ) {}

  /**
   * Initialize payment for an order
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize payment for an order' })
  @ApiResponse({ status: 201, description: 'Payment initialized' })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @User() user: any,
  ) {
    return this.paymentsService.createPayment(createPaymentDto, user.userId);
  }

  /**
   * Confirm payment after frontend Stripe Elements completes
   */
  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm payment after Stripe Elements' })
  @ApiResponse({ status: 200, description: 'Payment confirmed' })
  async confirmPayment(
    @Param('id') paymentId: string,
    @Body('paymentIntentId') paymentIntentId: string,
    @User() user: any,
  ) {
    return this.paymentsService.confirmPayment(
      paymentId,
      paymentIntentId,
      user.userId,
      user.role,
    );
  }

  /**
   * Get payment details
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  async getPayment(@Param('id') paymentId: string, @User() user: any) {
    return this.paymentsService.getPayment(paymentId, user.userId, user.role);
  }

  /**
   * Refund a payment
   */
  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refund a payment (full or partial)' })
  @ApiResponse({ status: 200, description: 'Refund processed' })
  async refundPayment(
    @Param('id') paymentId: string,
    @User() user: any,
    @Body('amount') amount?: number,
    @Body('reason') reason?: string,
  ) {
    return this.paymentsService.refundPayment(
      paymentId,
      user.userId,
      user.role,
      amount,
      reason,
    );
  }

  /**
   * Stripe Webhook Endpoint (NO AUTH - Stripe signs requests)
   * IMPORTANT: Requires bodyParser.raw middleware in main.ts for /payments/webhook
   */
  @Post('webhook')
  @ApiHeader({
    name: 'Stripe-Signature',
    description: 'Stripe webhook signature',
  })
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleWebhook(
    @Req() req: IsolatedRawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    try {
      const webhookSecret = this.stripeConfig.getWebhookSecret();

      if (!webhookSecret) {
        this.logger.warn('STRIPE_WEBHOOK_SECRET not configured');
        return { received: true };
      }

      // req.rawBody is populated by body-parser.raw middleware
      // Non-null assertion is safe when middleware is configured correctly
      const event = this.stripeService.verifyWebhookSignature(
        req.rawBody!,
        signature,
        webhookSecret,
      );

      await this.paymentsService.handleWebhookEvent(event);

      return { received: true };
    } catch (error: any) {
      this.logger.error(`Webhook error: ${error.message}`);
      return { error: 'Webhook failed' };
    }
  }
}
