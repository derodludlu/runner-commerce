import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { WhatsAppImportsController } from './whatsapp-imports.controller';
import { WhatsAppImportsWebhookController } from './whatsapp-imports-webhook.controller';
import { WhatsAppMetaWebhookController } from './whatsapp-meta-webhook.controller';
import { WhatsAppImportsService } from './whatsapp-imports.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [
    WhatsAppImportsController,
    WhatsAppImportsWebhookController,
    WhatsAppMetaWebhookController,
  ],
  providers: [WhatsAppImportsService],
})
export class WhatsAppImportsModule {}
