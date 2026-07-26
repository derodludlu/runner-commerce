// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ShopsModule } from './modules/shops/shops.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { RunnerModule } from './modules/runner/runner.module';
import { HealthController } from './common/health.controller';
import { Phase2Guard } from './common/guards/phase2.guard';

// New e-commerce modules
import { CartModule } from './modules/cart/cart.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { SupportModule } from './modules/support/support.module';
import { RunnerShopsModule } from './modules/runner-shops/runner-shops.module';
import { WhatsAppImportsModule } from './modules/whatsapp-imports/whatsapp-imports.module';
import { BillingModule } from './modules/billing/billing.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { CustomersModule } from './modules/customers/customers.module';
import { Phase1Module } from './modules/phase1/phase1.module';

@Module({
  imports: [
    // ✅ Load .env file (MUST be first!)
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available everywhere
      envFilePath: '.env', // Path to your .env file
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.API_THROTTLE_TTL_MS || 60000),
        limit: Number(process.env.API_THROTTLE_LIMIT || 300),
      },
    ]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    ShopsModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule, // Product reviews
    RunnerModule, // Runner dashboard

    // New e-commerce modules
    CartModule,
    CouponsModule,
    WishlistModule,
    NotificationsModule,
    AdminModule,
    ReturnsModule,
    SupportModule,
    RunnerShopsModule,
    WhatsAppImportsModule,
    BillingModule,
    MaintenanceModule,
    CustomersModule,
    Phase1Module,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: Phase2Guard,
    },
  ],
})
export class AppModule {}
