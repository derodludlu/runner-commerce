// src/modules/payments/stripe/stripe.config.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeConfigService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }

    // ✅ Use the API version that matches your @types/stripe installation
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover', // ✅ Exact version from TypeScript error
      typescript: true,
    });
  }

  getClient(): Stripe {
    return this.stripe;
  }

  getPublishableKey(): string {
    return this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') || '';
  }

  getWebhookSecret(): string {
    return this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  getCurrency(): string {
    return this.configService.get<string>('DEFAULT_CURRENCY', 'usd');
  }
}
