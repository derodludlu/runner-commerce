import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhookWhatsAppIngestDto } from './dto/webhook-whatsapp-ingest.dto';
import { UpdateCaptureCheckpointDto } from './dto/update-capture-checkpoint.dto';
import { SyncWhatsAppDiscoveredGroupsDto } from './dto/sync-whatsapp-discovered-groups.dto';
import { SyncWhatsAppDiscoveredChannelsDto } from './dto/sync-whatsapp-discovered-channels.dto';
import { IngestWhatsAppOrderRequestDto } from './dto/ingest-whatsapp-order-request.dto';
import { WhatsAppImportsService } from './whatsapp-imports.service';

@ApiTags('WhatsApp Imports')
@SkipThrottle()
@Controller('whatsapp-imports/webhook')
export class WhatsAppImportsWebhookController {
  constructor(
    private service: WhatsAppImportsService,
    private configService: ConfigService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Queue WhatsApp posts from an ingestion worker',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  ingestBatch(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Body() dto: WebhookWhatsAppIngestDto,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.ingestBatchFromWebhook(dto.shopId, dto.posts);
  }

  @Post('automation/process')
  @ApiOperation({
    summary:
      'Automatically enrich/import captured WhatsApp posts and create runner listings',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  processAutomation(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Body() dto: { limit?: number },
  ) {
    this.assertWebhookSecret(secret);
    return this.service.processAutomationForBridge(dto?.limit);
  }

  @Get('group-mappings')
  @ApiOperation({
    summary: 'List active persisted WhatsApp group mappings for the bridge',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  getGroupMappings(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Headers('x-whatsapp-bridge-account-id') bridgeAccountId?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.getActiveGroupMappingsForBridge(bridgeAccountId);
  }

  @Post('discovered-groups')
  @ApiOperation({
    summary: 'Sync WhatsApp groups visible to the authenticated bridge session',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  syncDiscoveredGroups(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Body() dto: SyncWhatsAppDiscoveredGroupsDto,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.syncDiscoveredGroupsForBridge(dto);
  }

  @Post('discovered-channels')
  @ApiOperation({
    summary:
      'Sync WhatsApp channels visible to the authenticated bridge session',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  syncDiscoveredChannels(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Body() dto: SyncWhatsAppDiscoveredChannelsDto,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.syncDiscoveredChannelsForBridge(dto);
  }

  @Post('order-requests')
  @ApiOperation({
    summary: 'Capture private WhatsApp customer order messages for runners',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  async ingestOrderRequest(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Body() dto: IngestWhatsAppOrderRequestDto,
  ) {
    this.assertWebhookSecret(secret);
    const enabled = await this.service.isWhatsAppOrderTrackingEnabled();
    if (!enabled) {
      return {
        accepted: false,
        disabled: true,
        message:
          'Incoming WhatsApp order intake is paused. Reposting remains active.',
      };
    }

    return this.service.ingestOrderRequestFromWebhook(dto);
  }

  @Get('shops/:shopId/capture-state')
  @ApiOperation({
    summary: 'Read the latest WhatsApp capture state for an ingestion worker',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  getCaptureState(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Param('shopId') shopId: string,
    @Query('groupId') groupId?: string,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.getCaptureStateForBridge(shopId, groupId);
  }

  @Post('shops/:shopId/capture-state')
  @ApiOperation({
    summary: 'Update WhatsApp capture checkpoint for an ingestion worker',
  })
  @ApiHeader({
    name: 'x-whatsapp-ingest-secret',
    description: 'Shared secret for the WhatsApp ingestion worker',
  })
  updateCaptureState(
    @Headers('x-whatsapp-ingest-secret') secret: string | undefined,
    @Param('shopId') shopId: string,
    @Body() dto: UpdateCaptureCheckpointDto,
  ) {
    this.assertWebhookSecret(secret);
    return this.service.updateCaptureStateForBridge(shopId, dto);
  }

  private assertWebhookSecret(secret: string | undefined) {
    const expected = this.configService.get<string>('WHATSAPP_INGEST_SECRET');

    if (!expected) {
      throw new ServiceUnavailableException(
        'WhatsApp ingestion secret is not configured',
      );
    }

    if (!secret || secret !== expected) {
      throw new ForbiddenException('Invalid WhatsApp ingestion secret');
    }
  }
}
