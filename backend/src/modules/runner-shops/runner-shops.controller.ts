import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RunnerShopsService } from './runner-shops.service';
import { RequestToJoinShopDto } from './dto/request-to-join.dto';
import { UpdateRunnerShopStatusDto } from './dto/update-runner-shop.dto';
import { UpdateRunnerShopAutomationDto } from './dto/update-runner-shop-automation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Runner Shops')
@Controller('runner-shops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RunnerShopsController {
  constructor(private runnerShopsService: RunnerShopsService) {}

  @Post('join')
  @ApiOperation({ summary: 'Runner: Request to join a shop' })
  requestToJoin(@Request() req: any, @Body() dto: RequestToJoinShopDto) {
    return this.runnerShopsService.requestToJoin(req.user?.runnerId, dto);
  }

  @Get('my-shops')
  @ApiOperation({ summary: 'Runner: Get my shop assignments' })
  getMyShops(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('selectionScope') selectionScope?: 'test' | 'live' | 'all',
  ) {
    return this.runnerShopsService.getRunnerShops(
      req.user?.runnerId,
      status,
      selectionScope,
    );
  }

  @Get('destination-groups')
  @ApiOperation({
    summary: 'Runner: List WhatsApp destination groups for reposting',
  })
  getDestinationGroups(
    @Request() req: any,
    @Query('includeCandidates') includeCandidates?: string,
  ) {
    return this.runnerShopsService.getRunnerDestinationGroups(
      req.user?.runnerId,
      includeCandidates === 'true',
    );
  }

  @Patch('destination-groups/:groupId/scope')
  @ApiOperation({
    summary:
      'Runner: Switch a reposting destination group between test and live',
  })
  updateDestinationGroupScope(
    @Request() req: any,
    @Param('groupId') groupId: string,
    @Body('isTestGroup') isTestGroup: boolean,
  ) {
    return this.runnerShopsService.updateRunnerDestinationGroupScope(
      req.user?.runnerId,
      groupId,
      Boolean(isTestGroup),
    );
  }

  @Post('capture-approved-shops')
  @ApiOperation({
    summary: 'Runner: Queue WhatsApp capture for approved joined shops',
  })
  captureApprovedShops(
    @Request() req: any,
    @Body('shopIds') shopIds?: string[],
  ) {
    return this.runnerShopsService.queueCaptureForApprovedShops(
      req.user?.runnerId,
      shopIds,
    );
  }

  @Patch('my-shops/automation')
  @ApiOperation({
    summary:
      'Runner: Apply auto-list and auto-repost settings to all approved shops',
  })
  updateAllMyShopAutomation(
    @Request() req: any,
    @Body() dto: UpdateRunnerShopAutomationDto,
  ) {
    return this.runnerShopsService.updateAllRunnerShopAutomation(
      req.user?.runnerId,
      dto,
    );
  }

  @Patch('my-shops/:shopId/automation')
  @ApiOperation({
    summary: 'Runner: Update auto-list and auto-repost settings for a shop',
  })
  updateMyShopAutomation(
    @Request() req: any,
    @Param('shopId') shopId: string,
    @Body() dto: UpdateRunnerShopAutomationDto,
  ) {
    return this.runnerShopsService.updateRunnerShopAutomation(
      req.user?.runnerId,
      shopId,
      dto,
    );
  }

  @Delete('my-shops/:shopId/request')
  @ApiOperation({
    summary: 'Runner: Cancel a pending or rejected shop request',
  })
  cancelJoinRequest(@Request() req: any, @Param('shopId') shopId: string) {
    return this.runnerShopsService.cancelJoinRequest(
      req.user?.runnerId,
      shopId,
    );
  }

  @Get('marketplace')
  @ApiOperation({
    summary: 'Runner: Get marketplace (products from approved shops)',
  })
  getMarketplace(@Request() req: any) {
    return this.runnerShopsService.getRunnerApprovedShops(req.user?.runnerId);
  }

  @Delete('leave/:shopId')
  @ApiOperation({ summary: 'Runner: Leave a shop' })
  leaveShop(@Request() req: any, @Param('shopId') shopId: string) {
    return this.runnerShopsService.leaveShop(req.user?.runnerId, shopId);
  }

  @Get('shops/:shopId/runners')
  @ApiOperation({ summary: 'Get available runners for a shop (Customer)' })
  getRunnersForShop(@Param('shopId') shopId: string) {
    return this.runnerShopsService.getRunnersForShop(shopId);
  }

  @Post('find-runners')
  @ApiOperation({ summary: 'Find runners for multi-shop order (Customer)' })
  findRunnersForOrder(@Body('shopIds') shopIds: string[]) {
    return this.runnerShopsService.findRunnersForMultiShopOrder(shopIds);
  }

  // Shop Owner endpoints
  @Get('shops/:shopId/requests')
  @ApiOperation({ summary: 'Shop Owner: Get runner requests' })
  getRunnerRequests(
    @Request() req: any,
    @Param('shopId') shopId: string,
    @Query('status') status?: string,
  ) {
    return this.runnerShopsService.getShopRunnerRequests(
      shopId,
      req.user?.userId,
      status,
    );
  }

  @Patch('shops/:shopId/runners')
  @ApiOperation({ summary: 'Shop Owner: Approve/Reject runner' })
  updateRunnerStatus(
    @Request() req: any,
    @Param('shopId') shopId: string,
    @Body() dto: UpdateRunnerShopStatusDto,
  ) {
    return this.runnerShopsService.updateRunnerStatus(
      shopId,
      req.user?.userId,
      dto,
    );
  }

  @Delete('shops/:shopId/runners/:runnerId')
  @ApiOperation({ summary: 'Shop Owner: Remove runner from shop' })
  removeRunner(
    @Request() req: any,
    @Param('shopId') shopId: string,
    @Param('runnerId') runnerId: string,
  ) {
    return this.runnerShopsService.removeRunner(
      shopId,
      req.user?.userId,
      runnerId,
    );
  }
}
