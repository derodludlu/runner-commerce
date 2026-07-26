// src/modules/payments/stripe/stripe.service.ts

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeConfigService } from './stripe.config';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(
    private stripeConfig: StripeConfigService,
    private configService: ConfigService,
  ) {
    this.stripe = stripeConfig.getClient();
  }

  /**
   * Create a PaymentIntent for an order
   */
  async createPaymentIntent(
    orderId: string,
    amount: number,
    currency: string,
    customerEmail?: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    try {
      const amountInCents = Math.round(amount * 100);

      // ✅ FIX #1: 'meta' → 'metadata' (Stripe API property name)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        metadata: {
          // ✅ FIX: Was 'meta' (typo)
          orderId,
          ...metadata,
        },
        receipt_email: customerEmail,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      this.logger.log(
        `PaymentIntent created: ${paymentIntent.id} for order ${orderId}`,
      );
      return paymentIntent;
    } catch (error: any) {
      this.logger.error(
        `Failed to create PaymentIntent: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Failed to initialize payment: ' + error.message,
      );
    }
  }

  /**
   * Retrieve a PaymentIntent by ID
   */
  async getPaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  /**
   * Refund a payment (full or partial)
   */
  async refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason:
      | 'duplicate'
      | 'fraudulent'
      | 'requested_by_customer' = 'requested_by_customer',
  ): Promise<Stripe.Refund> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        ...(amount && { amount: Math.round(amount * 100) }),
        reason,
      });
      this.logger.log(`Refund created: ${refund.id} for ${paymentIntentId}`);
      return refund;
    } catch (error: any) {
      this.logger.error(
        `Failed to create refund: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Refund failed: ' + error.message);
    }
  }

  /**
   * Create or retrieve a Stripe Customer
   */
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string,
  ): Promise<Stripe.Customer> {
    const existing = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      return existing.data[0];
    }

    // ✅ FIX #2: 'meta' → 'metadata' (Stripe API property name)
    return this.stripe.customers.create({
      email,
      name,
      metadata: {
        // ✅ FIX: Was 'meta' (typo)
        userId,
      },
    });
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
    endpointSecret: string,
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        endpointSecret,
      );
    } catch (error: any) {
      this.logger.error(
        `Webhook signature verification failed: ${error.message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}
