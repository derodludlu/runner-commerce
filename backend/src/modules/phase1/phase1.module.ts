import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RunnerModule } from '../runner/runner.module';
import { BillingModule } from '../billing/billing.module';
import {
  Phase1BotWebhookController,
  Phase1Controller,
} from './phase1.controller';
import { Phase1Service } from './phase1.service';

@Module({
  imports: [PrismaModule, RunnerModule, BillingModule],
  controllers: [Phase1Controller, Phase1BotWebhookController],
  providers: [Phase1Service],
  exports: [Phase1Service],
})
export class Phase1Module {}
