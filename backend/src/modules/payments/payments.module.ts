// payments.module.ts - Runner Commerce Payments Module
// Generated: 2026-03-11

// src/modules/payments/payments.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe/stripe.service';
import { StripeConfigService } from './stripe/stripe.config';

@Module({
  imports: [ConfigModule, HttpModule, PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService, StripeConfigService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
