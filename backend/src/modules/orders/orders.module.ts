import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderLifecycleWorkflow } from './workflows/order-lifecycle.workflow';

@Module({
  controllers: [OrdersController],

  providers: [OrdersService, PrismaService, OrderLifecycleWorkflow],

  exports: [OrdersService],
})
export class OrdersModule {}
