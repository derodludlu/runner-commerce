// src/modules/payments/payments.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { StripeConfigService } from './stripe/stripe.config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { OrderStatus } from '../orders/dto/update-order-status.dto';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private stripeConfig: StripeConfigService,
  ) {}

  /**
   * Initialize payment for an order
   */
  async createPayment(createPaymentDto: CreatePaymentDto, userId: string) {
    const {
      orderId,
      amount,
      currency,
      customerEmail,
      paymentMethodId,
      metadata,
    } = createPaymentDto;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.customerId && order.customerId !== userId) {
      throw new BadRequestException("Cannot pay for another user's order");
    }

    // Verify amount matches order total (prevent tampering)
    if (Math.abs(order.totalAmount - amount) > 0.01) {
      this.logger.warn(
        `Amount mismatch: order=${order.totalAmount}, payment=${amount}`,
      );
      throw new BadRequestException(
        'Payment amount does not match order total',
      );
    }

    // Create PaymentIntent via Stripe
    const paymentIntent = await this.stripeService.createPaymentIntent(
      orderId,
      amount,
      currency || this.stripeConfig.getCurrency(),
      customerEmail,
      metadata,
    );

    // ✅ FIX #1: Added 'data:' key before object literal
    const payment = await this.prisma.payment.create({
      data: {
        // ✅ FIX: Added 'data:' key
        orderId,
        amount,
        currency: currency || this.stripeConfig.getCurrency(),
        method: paymentMethodId ? 'CARD' : 'PENDING',
        status: 'PENDING',
        stripePaymentIntentId: paymentIntent.id,
        metadata: metadata || {}, // ✅ FIX: 'meta' -> 'metadata'
      },
    });

    this.logger.log(
      `Payment record created: ${payment.id} for PaymentIntent ${paymentIntent.id}`,
    );

    return {
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
      amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      publishableKey: this.stripeConfig.getPublishableKey(),
    };
  }

  /**
   * Confirm payment after Stripe Elements completes
   */
  async confirmPayment(
    paymentId: string,
    paymentIntentId: string,
    userId: string,
    role: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (!this.canManagePayments(role) && payment.order?.customerId !== userId) {
      throw new ForbiddenException('You can only confirm your own payments');
    }

    if (payment.stripePaymentIntentId !== paymentIntentId) {
      throw new BadRequestException('PaymentIntent ID mismatch');
    }

    // Fetch latest status from Stripe
    const stripeIntent =
      await this.stripeService.getPaymentIntent(paymentIntentId);

    // ✅ FIX #2: Added 'data:' key before object literal
    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        // ✅ FIX: Added 'data:' key
        status:
          stripeIntent.status === 'succeeded'
            ? 'SUCCEEDED'
            : stripeIntent.status === 'requires_payment_method'
              ? 'FAILED'
              : stripeIntent.status.toUpperCase(),
        stripeChargeId: (stripeIntent.latest_charge as string) || null,
        updatedAt: new Date(),
      },
      include: { order: true },
    });

    // If payment succeeded, update order status
    if (stripeIntent.status === 'succeeded' && updatedPayment.order) {
      // ✅ FIX #3: Added 'data:' key before object literal
      await this.prisma.order.update({
        where: { id: updatedPayment.orderId },
        data: { status: OrderStatus.PAID }, // ✅ FIX: Added 'data:' key
      });
      this.logger.log(`Order ${updatedPayment.orderId} marked as PAID`);
    }

    return updatedPayment;
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId: string, userId: string, role: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (!this.canManagePayments(role) && payment.order?.customerId !== userId) {
      throw new ForbiddenException('You can only view your own payments');
    }

    return payment;
  }

  /**
   * Process Stripe webhook events
   */
  async handleWebhookEvent(event: Stripe.Event) {
    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await this.handlePaymentSucceeded(paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        await this.handlePaymentFailed(paymentIntent);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        await this.handleChargeRefunded(charge);
        break;
      }

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
      include: { order: true } as Prisma.PaymentInclude, // ✅ FIX: Added type assertion for include
    });

    if (!payment) {
      this.logger.warn(
        `Payment record not found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    // ✅ FIX #4: Added 'data:' key before object literal
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        // ✅ FIX: Added 'data:' key
        status: 'SUCCEEDED',
        stripeChargeId: paymentIntent.latest_charge as string,
        updatedAt: new Date(),
      },
    });

    if (payment.order && payment.order.status !== OrderStatus.PAID) {
      // ✅ FIX #5: Added 'data:' key before object literal
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.PAID }, // ✅ FIX: Added 'data:' key
      });
      this.logger.log(`Order ${payment.orderId} marked as PAID via webhook`);
    }
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (payment) {
      // ✅ FIX #6: Added 'data:' key before object literal
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          // ✅ FIX: Added 'data:' key
          status: 'FAILED',
          failureReason:
            paymentIntent.last_payment_error?.message || 'Unknown error',
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Payment ${payment.id} marked as FAILED`);
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge) {
    const payment = await this.prisma.payment.findFirst({
      where: { stripeChargeId: charge.id },
    });

    if (payment) {
      const refundAmount = (charge.amount_refunded || 0) / 100;

      // ✅ FIX #7: Added 'data:' key before object literal
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          // ✅ FIX: Added 'data:' key
          status:
            refundAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAmount: refundAmount,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Payment ${payment.id} refunded: $${refundAmount}`);
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentId: string,
    userId: string,
    role: string,
    amount?: number,
    reason?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (!this.canManagePayments(role)) {
      throw new ForbiddenException('Only admins can refund payments');
    }

    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('Payment not processed via Stripe');
    }

    const refund = await this.stripeService.refundPayment(
      payment.stripePaymentIntentId,
      amount,
      reason as any,
    );

    // ✅ FIX #8: Added 'data:' key before object literal
    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        // ✅ FIX: Added 'data:' key
        status:
          refund.amount === payment.amount * 100
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED',
        refundedAmount: refund.amount / 100,
        updatedAt: new Date(),
      },
    });

    if (refund.amount === payment.amount * 100 && updatedPayment.orderId) {
      // ✅ FIX #9: Added 'data:' key before object literal
      await this.prisma.order.update({
        where: { id: updatedPayment.orderId },
        data: { status: OrderStatus.REFUNDED }, // ✅ FIX: Added 'data:' key
      });
    }

    return updatedPayment;
  }

  private canManagePayments(role: string) {
    return ['ADMIN', 'SUPERUSER'].includes(role);
  }
}
