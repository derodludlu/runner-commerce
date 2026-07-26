import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { WhatsAppImportsService } from './whatsapp-imports.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('WhatsApp Imports')
@Controller('whatsapp-imports/meta')
export class WhatsAppMetaWebhookController {
  constructor(
    private service: WhatsAppImportsService,
    private configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Verify Meta WhatsApp webhook subscription' })
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = this.configService.get<string>(
      'WHATSAPP_META_VERIFY_TOKEN',
    );

    if (mode === 'subscribe' && expected && token === expected) {
      return challenge ?? '';
    }

    throw new ForbiddenException('Invalid WhatsApp verification token');
  }

  @Post()
  @ApiOperation({ summary: 'Capture inbound Meta WhatsApp messages' })
  ingestMetaWebhook(
    @Body() body: Record<string, unknown>,
    @Req() req: RawBodyRequest,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.verifySignatureIfConfigured(req.rawBody, signature);
    return this.service.ingestMetaCloudWebhook(body);
  }

  private verifySignatureIfConfigured(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ) {
    const appSecret = this.configService.get<string>(
      'WHATSAPP_META_APP_SECRET',
    );

    if (!appSecret) return;
    if (!rawBody || !signature?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing WhatsApp webhook signature');
    }

    const expected = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid WhatsApp webhook signature');
    }
  }
}
