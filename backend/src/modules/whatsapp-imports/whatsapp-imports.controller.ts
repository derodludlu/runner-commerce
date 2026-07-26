import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import { CreateWhatsAppGroupMappingDto } from './dto/create-whatsapp-group-mapping.dto';
import { IngestWhatsAppPostDto } from './dto/ingest-whatsapp-post.dto';
import { ImportWhatsAppImportsDto } from './dto/import-whatsapp-imports.dto';
import { LinkDiscoveredGroupToShopDto } from './dto/link-discovered-group-to-shop.dto';
import { UpdateWhatsAppGroupMappingDto } from './dto/update-whatsapp-group-mapping.dto';
import { UpdateWhatsAppImportDto } from './dto/update-whatsapp-import.dto';
import { WhatsAppImportsService } from './whatsapp-imports.service';

@ApiTags('WhatsApp Imports')
@Controller('whatsapp-imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SHOP_OWNER', 'ADMIN')
@ApiBearerAuth()
export class WhatsAppImportsController {
  constructor(private service: WhatsAppImportsService) {}

  @Get('discovered-groups')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List WhatsApp groups visible to the authenticated bridge session',
  })
  listDiscoveredGroups(
    @User() user: any,
    @Query('bridgeAccountId') bridgeAccountId?: string,
    @Query('availability') availability?: string,
  ) {
    return this.service.listDiscoveredGroups(
      user.userId,
      user.role,
      bridgeAccountId,
      availability,
    );
  }

  @Get('discovered-channels')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'List WhatsApp channels visible to the authenticated bridge session',
  })
  listDiscoveredChannels(
    @User() user: any,
    @Query('bridgeAccountId') bridgeAccountId?: string,
    @Query('availability') availability?: string,
  ) {
    return this.service.listDiscoveredChannels(
      user.userId,
      user.role,
      bridgeAccountId,
      availability,
    );
  }

  @Post('discovered-groups/:groupId/import-shop')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Import a discovered WhatsApp group as a shop and group mapping',
  })
  importDiscoveredGroupAsShop(
    @Param('groupId') groupId: string,
    @User() user: any,
  ) {
    return this.service.importDiscoveredGroupAsShop(
      groupId,
      user.userId,
      user.role,
    );
  }

  @Post('discovered-groups/:groupId/link-shop')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Link a discovered WhatsApp group into an existing shop',
  })
  linkDiscoveredGroupToShop(
    @Param('groupId') groupId: string,
    @Body() dto: LinkDiscoveredGroupToShopDto,
    @User() user: any,
  ) {
    return this.service.linkDiscoveredGroupToShop(
      groupId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Post('discovered-groups/:groupId/import-runner-advertising')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Mark a discovered WhatsApp group as a runner advertising group',
  })
  importDiscoveredGroupAsRunnerAdvertising(
    @Param('groupId') groupId: string,
    @User() user: any,
  ) {
    return this.service.importDiscoveredGroupAsRunnerAdvertising(
      groupId,
      user.role,
    );
  }

  @Delete('discovered-groups/:groupId')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Delete a synced discovered WhatsApp group record',
  })
  deleteDiscoveredGroup(@Param('groupId') groupId: string, @User() user: any) {
    return this.service.deleteDiscoveredGroup(groupId, user.role);
  }

  @Get('customer-group-conflicts')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'List customers found in multiple runner advertising groups for the same direction',
  })
  listCustomerGroupConflicts(
    @User() user: any,
    @Query('status') status?: string,
  ) {
    return this.service.listCustomerGroupConflicts(user.role, status);
  }

  @Post('customer-group-conflicts/:conflictId/resolve')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Resolve a duplicate customer runner-group conflict by choosing one trusted runner',
  })
  resolveCustomerGroupConflict(
    @Param('conflictId') conflictId: string,
    @Body() dto: { runnerId?: string; note?: string },
    @User() user: any,
  ) {
    return this.service.resolveCustomerGroupConflict(
      conflictId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Get('group-mappings')
  @ApiOperation({ summary: 'List persisted WhatsApp group to shop mappings' })
  listGroupMappings(
    @User() user: any,
    @Query('shopId') shopId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listGroupMappings(
      user.userId,
      user.role,
      shopId,
      status,
    );
  }

  @Post('group-mappings')
  @ApiOperation({ summary: 'Create a persisted WhatsApp group mapping' })
  createGroupMapping(
    @Body() dto: CreateWhatsAppGroupMappingDto,
    @User() user: any,
  ) {
    return this.service.createGroupMapping(user.userId, user.role, dto);
  }

  @Patch('group-mappings/:mappingId')
  @ApiOperation({ summary: 'Update a persisted WhatsApp group mapping' })
  updateGroupMapping(
    @Param('mappingId') mappingId: string,
    @Body() dto: UpdateWhatsAppGroupMappingDto,
    @User() user: any,
  ) {
    return this.service.updateGroupMapping(
      mappingId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Delete('group-mappings/:mappingId')
  @ApiOperation({ summary: 'Deactivate a persisted WhatsApp group mapping' })
  deactivateGroupMapping(
    @Param('mappingId') mappingId: string,
    @User() user: any,
  ) {
    return this.service.deactivateGroupMapping(
      mappingId,
      user.userId,
      user.role,
    );
  }

  @Delete('group-mappings/:mappingId/link')
  @ApiOperation({
    summary: 'Remove a WhatsApp group mapping and clear its shop relationship',
  })
  unlinkGroupMapping(@Param('mappingId') mappingId: string, @User() user: any) {
    return this.service.unlinkGroupMapping(mappingId, user.userId, user.role);
  }

  @Post('shops/:shopId')
  @ApiOperation({ summary: 'Ingest one raw WhatsApp product post' })
  ingest(
    @Param('shopId') shopId: string,
    @Body() dto: IngestWhatsAppPostDto,
    @User() user: any,
  ) {
    return this.service.ingest(shopId, user.userId, dto);
  }

  @Get('shops/:shopId/capture-stats')
  @ApiOperation({ summary: 'Get WhatsApp capture tracking stats for a shop' })
  getCaptureStats(@Param('shopId') shopId: string, @User() user: any) {
    return this.service.getCaptureStats(shopId, user.userId);
  }

  @Get('shops/:shopId')
  @ApiOperation({ summary: 'List WhatsApp product import queue' })
  findByShop(
    @Param('shopId') shopId: string,
    @User() user: any,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.service.findByShop(shopId, user.userId, status, limit, offset);
  }

  @Post('shops/:shopId/import')
  @ApiOperation({
    summary: 'Import selected queued WhatsApp posts as products',
  })
  importSelected(
    @Param('shopId') shopId: string,
    @Body() dto: ImportWhatsAppImportsDto,
    @User() user: any,
  ) {
    return this.service.importSelected(shopId, user.userId, dto.ids);
  }

  @Post('shops/:shopId/enrich')
  @ApiOperation({
    summary: 'Use AI vision to enrich selected queued WhatsApp product drafts',
  })
  enrichSelectedImports(
    @Param('shopId') shopId: string,
    @Body() dto: ImportWhatsAppImportsDto,
    @User() user: any,
  ) {
    return this.service.enrichSelectedImports(shopId, user.userId, dto.ids);
  }

  @Post('shops/:shopId/:importId/enrich')
  @ApiOperation({
    summary: 'Use AI vision to enrich a queued WhatsApp product draft',
  })
  enrichQueuedImport(
    @Param('shopId') shopId: string,
    @Param('importId') importId: string,
    @User() user: any,
  ) {
    return this.service.enrichQueuedImport(shopId, importId, user.userId);
  }

  @Patch('shops/:shopId/:importId')
  @ApiOperation({
    summary: 'Update a queued WhatsApp product draft or review status',
  })
  updateQueuedImport(
    @Param('shopId') shopId: string,
    @Param('importId') importId: string,
    @Body() dto: UpdateWhatsAppImportDto,
    @User() user: any,
  ) {
    return this.service.updateQueuedImport(shopId, importId, user.userId, dto);
  }
}
