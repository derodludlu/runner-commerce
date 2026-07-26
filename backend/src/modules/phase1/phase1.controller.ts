import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';
import { Phase1Service } from './phase1.service';

@ApiTags('Runner Phase 1')
@Controller('runner/phase1')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class Phase1Controller {
  constructor(private phase1: Phase1Service) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Phase 1 runner setup and readiness status' })
  getStatus(@User() user: any) {
    return this.phase1.getRunnerStatus(user.runnerId);
  }

  @Get('shops')
  @ApiOperation({ summary: 'Discover available Phase 1 shop groups' })
  discoverShops(
    @Query('search') search?: string,
    @Query('location') location?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    return this.phase1.discoverShops({
      search,
      location,
      category,
      limit: Number(limit || 30),
    });
  }

  @Post('shops')
  @ApiOperation({ summary: 'Select up to 30 shop groups' })
  selectShops(
    @User() user: any,
    @Body('shopIds') shopIds: string[],
    @Body('scope') scope?: string,
  ) {
    return scope === 'live'
      ? this.phase1.selectLiveShops(user.runnerId, shopIds)
      : this.phase1.selectShops(user.runnerId, shopIds);
  }

  @Delete('shops/:shopId')
  @ApiOperation({ summary: 'Remove a Phase 1 selected shop' })
  removeShop(@User() user: any, @Param('shopId') shopId: string) {
    return this.phase1.removeShop(user.runnerId, shopId);
  }

  @Post('submitted-shop-links')
  @ApiOperation({ summary: 'Submit missing WhatsApp shop group links' })
  submitShopLinks(@User() user: any, @Body('links') links: string | string[]) {
    return this.phase1.submitShopLinks(user.runnerId, links);
  }

  @Post('reposting-groups')
  @ApiOperation({ summary: 'Submit a runner reposting group invite link' })
  submitRepostingGroup(@User() user: any, @Body() body: any) {
    return this.phase1.submitRepostingGroup(user.runnerId, body);
  }

  @Patch('reposting-groups/:groupId/admin-confirmed')
  @ApiOperation({ summary: 'Runner confirms bot admin status was granted' })
  confirmBotAdmin(@User() user: any, @Param('groupId') groupId: string) {
    return this.phase1.confirmBotAdmin(user.runnerId, groupId);
  }

  @Post('commands')
  @ApiOperation({ summary: 'Run a Phase 1 reposting command' })
  command(@User() user: any, @Body('message') message: string) {
    return this.phase1.commandReposting(user.runnerId, message);
  }
}

@ApiTags('Runner Phase 1 Bot')
@Controller('phase1-bot/webhook')
export class Phase1BotWebhookController {
  constructor(private phase1: Phase1Service) {}

  @Post('messages')
  @ApiOperation({ summary: 'Process a private Phase 1 WhatsApp bot message' })
  handleMessage(
    @Headers('x-whatsapp-ingest-secret') secret: string,
    @Body() body: any,
  ) {
    if (
      process.env.WHATSAPP_INGEST_SECRET &&
      secret !== process.env.WHATSAPP_INGEST_SECRET
    ) {
      throw new ForbiddenException('Invalid WhatsApp ingest secret');
    }
    return this.phase1.handleBotMessage({
      whatsappNumber: body.whatsappNumber || body.from || body.senderPhone,
      messageText: body.messageText || body.text || body.body,
      bridgeAccountId:
        body.bridgeAccountId ||
        body.whatsAppBridgeAccountId ||
        body.receivingBridgeAccountId,
      messageId: body.messageId,
      mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls : undefined,
      receivedAt: body.receivedAt,
    });
  }
}
