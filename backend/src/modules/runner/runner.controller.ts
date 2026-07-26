// src/modules/runner/runner.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RunnerService } from './runner.service';
import { RegisterRunnerDto } from './dto/register-runner.dto';
import { UpdateRunnerProfileDto } from './dto/update-runner-profile.dto';
import { ApplyRepostPriceFormatDto } from './dto/apply-repost-price-format.dto';
import { UpdateListingRepostControlDto } from './dto/update-listing-repost-control.dto';
import { ConvertWhatsAppOrderRequestDto } from './dto/convert-whatsapp-order-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';

@ApiTags('Runner Dashboard')
@Controller('runner')
export class RunnerController {
  constructor(private runnerService: RunnerService) {}

  @Get('public/:runnerCode')
  @ApiOperation({ summary: 'Get public runner storefront by runner code' })
  getPublicRunner(
    @Param('runnerCode') runnerCode: string,
    @Query('code') orderCode?: string,
  ) {
    return this.runnerService.getPublicRunnerByCode(runnerCode, orderCode);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register as a runner' })
  @ApiResponse({ status: 201, description: 'Runner registration successful' })
  @ApiResponse({ status: 409, description: 'Already a runner' })
  register(@Body() dto: RegisterRunnerDto, @User() user: any) {
    return this.runnerService.register(user.userId, dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get runner profile' })
  @ApiResponse({ status: 200, description: 'Runner profile' })
  getProfile(@User() user: any) {
    return this.runnerService.getRunnerByUserId(user.userId);
  }

  @Get('automation-metrics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get runner capture and repost metrics by time interval',
  })
  getAutomationMetrics(
    @User() user: any,
    @Query('intervalMinutes') intervalMinutes?: string,
    @Query('hours') hours?: string,
    @Query('selectionScope') selectionScope?: string,
  ) {
    return this.runnerService.getAutomationMetrics(user.runnerId, {
      intervalMinutes: Number(intervalMinutes || 30),
      hours: Number(hours || 24),
      selectionScope:
        selectionScope === 'test' || selectionScope === 'live'
          ? selectionScope
          : undefined,
    });
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own runner profile details' })
  @ApiResponse({ status: 200, description: 'Updated runner profile' })
  updateProfile(@Body() dto: UpdateRunnerProfileDto, @User() user: any) {
    return this.runnerService.updateProfile(user.userId, dto);
  }

  @Post('repost-price-format/apply-now')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply the runner repost price format to pending repost work',
  })
  applyRepostPriceFormat(
    @Body() dto: ApplyRepostPriceFormatDto,
    @User() user: any,
  ) {
    return this.runnerService.applyRepostPriceFormat(user.userId, dto);
  }

  @Get('listings/summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get synchronized runner listing totals' })
  getListingSummary(@User() user: any) {
    return this.runnerService.getListingSummary(user.runnerId);
  }

  @Get('listings/repost-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get runner listing repost totals for one destination',
  })
  getListingRepostStatus(
    @User() user: any,
    @Query('destinationGroup') destinationGroup?: string,
  ) {
    return this.runnerService.getListingRepostStatus(
      user.runnerId,
      destinationGroup,
    );
  }

  @Get('listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get runner listings' })
  @ApiResponse({ status: 200, description: 'List of runner listings' })
  getListings(
    @User() user: any,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('paginated') paginated?: string,
    @Query('capturedFrom') capturedFrom?: string,
    @Query('capturedTo') capturedTo?: string,
    @Query('status') status?: string,
    @Query('captionIssue') captionIssue?: string,
  ) {
    return this.runnerService.getListings(user.runnerId, {
      search,
      page: Number(page || 1),
      limit: Number(limit || 40),
      paginated: paginated === 'true',
      capturedFrom,
      capturedTo,
      status,
      captionIssue: captionIssue === 'true',
    });
  }

  @Post('products/:productId/listing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update product listing with markup' })
  @ApiResponse({ status: 201, description: 'Listing created/updated' })
  createListing(
    @Param('productId') productId: string,
    @Body('markup') markup: number,
    @User() user: any,
  ) {
    return this.runnerService.createOrUpdateListing(
      user.runnerId,
      productId,
      markup,
    );
  }

  @Patch('listings/:id/auto-post')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Approve or pause a runner listing for auto-posting',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated listing auto-post setting',
  })
  updateListingAutoPost(
    @Param('id') id: string,
    @Body('autoPostApproved') autoPostApproved: boolean,
    @User() user: any,
  ) {
    return this.runnerService.updateListingAutoPost(
      user.runnerId,
      id,
      autoPostApproved,
    );
  }

  @Patch('listings/caption-recovery/automatic')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark caption-problem listings for automatic repost recovery',
  })
  recoverListingCaptionsAutomatically(
    @Body('listingIds') listingIds: string[],
    @User() user: any,
  ) {
    return this.runnerService.recoverListingCaptionsAutomatically(
      user.runnerId,
      listingIds,
    );
  }

  @Patch('listings/:id/repost-control')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start, schedule, pause, resume, or stop listing reposting',
  })
  updateListingRepostControl(
    @Param('id') id: string,
    @Body() dto: UpdateListingRepostControlDto,
    @User() user: any,
  ) {
    return this.runnerService.updateListingRepostControl(
      user.runnerId,
      id,
      dto,
    );
  }

  @Post('listings/repost-whatsapp-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Queue runner listings for WhatsApp session bridge reposting',
  })
  queueWhatsAppSessionRepost(
    @Body('listingIds') listingIds: string[],
    @Body('groupIdOrName') groupIdOrName: string,
    @Body('captionOverrides') captionOverrides: Record<string, string>,
    @Body('imageOverrides') imageOverrides: Record<string, string[]>,
    @Body('forceRepost') forceRepost: boolean,
    @User() user: any,
  ) {
    return this.runnerService.queueWhatsAppSessionRepost(
      user.runnerId,
      listingIds,
      groupIdOrName,
      captionOverrides,
      imageOverrides,
      Boolean(forceRepost),
    );
  }

  @Delete('listings/older-than/:days')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own runner listings older than N days' })
  @ApiResponse({ status: 200, description: 'Old listings deleted' })
  deleteListingsOlderThan(@Param('days') days: string, @User() user: any) {
    return this.runnerService.deleteListingsOlderThan(
      user.runnerId,
      Number(days),
    );
  }

  @Delete('listings/older-than-hours/:hours')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own runner listings older than N hours' })
  @ApiResponse({ status: 200, description: 'Old listings deleted' })
  deleteListingsOlderThanHours(
    @Param('hours') hours: string,
    @User() user: any,
  ) {
    return this.runnerService.deleteListingsOlderThanHours(
      user.runnerId,
      Number(hours),
    );
  }

  @Delete('listings/older-than-capture/:days')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete own runner listings whose source WhatsApp post is older than N days',
  })
  @ApiResponse({ status: 200, description: 'Old captured listings deleted' })
  deleteListingsOlderThanCapture(
    @Param('days') days: string,
    @User() user: any,
  ) {
    return this.runnerService.deleteListingsOlderThanCapture(
      user.runnerId,
      Number(days),
    );
  }

  @Delete('listings/older-than-capture-hours/:hours')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete own runner listings whose source WhatsApp post is older than N hours',
  })
  @ApiResponse({ status: 200, description: 'Old captured listings deleted' })
  deleteListingsOlderThanCaptureHours(
    @Param('hours') hours: string,
    @User() user: any,
  ) {
    return this.runnerService.deleteListingsOlderThanCaptureHours(
      user.runnerId,
      Number(hours),
    );
  }

  @Post('listings/:id/skip')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark a listing product as do-not-buy for this runner',
  })
  skipListing(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @User() user: any,
  ) {
    return this.runnerService.skipListing(user.runnerId, id, reason);
  }
  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a listing' })
  @ApiResponse({ status: 200, description: 'Listing deleted' })
  deleteListing(@Param('id') id: string, @User() user: any) {
    return this.runnerService.deleteListing(user.runnerId, id);
  }

  @Get('order-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get incoming WhatsApp order requests for this runner',
  })
  @ApiResponse({ status: 200, description: 'Incoming order requests' })
  getOrderRequests(@User() user: any) {
    return this.runnerService.getOrderRequests(user.runnerId);
  }

  @Get('shopping-list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get runner buying list grouped shop by shop',
  })
  getShoppingList(@User() user: any) {
    return this.runnerService.getShoppingList(user.runnerId);
  }

  @Get('packing-list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get runner packing list grouped customer by customer',
  })
  getPackingList(@User() user: any) {
    return this.runnerService.getCustomerPackingList(user.runnerId);
  }

  @Patch('shopping-list/items/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update shopping list item status for this runner',
  })
  updateShoppingListItemsStatus(
    @Body('itemIds') itemIds: string[],
    @Body('status') status: string,
    @User() user: any,
  ) {
    return this.runnerService.updateShoppingListItemsStatus(
      user.runnerId,
      itemIds,
      status,
    );
  }

  @Post('order-requests/:id/convert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Convert a captured WhatsApp request into a platform order',
  })
  @ApiResponse({ status: 201, description: 'Order created from request' })
  convertOrderRequest(
    @Param('id') id: string,
    @Body() dto: ConvertWhatsAppOrderRequestDto,
    @User() user: any,
  ) {
    return this.runnerService.convertOrderRequest(user.runnerId, id, dto);
  }

  @Patch('order-requests/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a captured WhatsApp order request status',
  })
  @ApiResponse({ status: 200, description: 'Order request status updated' })
  updateOrderRequestStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @User() user: any,
  ) {
    return this.runnerService.updateOrderRequestStatus(
      user.runnerId,
      id,
      status,
    );
  }

  @Get('earnings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get runner earnings and stats' })
  @ApiResponse({ status: 200, description: 'Earnings data' })
  getEarnings(@User() user: any) {
    return this.runnerService.getEarnings(user.runnerId);
  }

  @Get('skipped-items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get products this runner has marked as do not buy',
  })
  getSkippedItems(@User() user: any, @Query('limit') limit?: string) {
    return this.runnerService.getSkippedItems(
      user.runnerId,
      Number(limit || 100),
    );
  }
  @Get('products/available')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available products to promote' })
  @ApiResponse({ status: 200, description: 'List of available products' })
  getAvailableProducts(@User() user: any) {
    return this.runnerService.getAvailableProducts(user.runnerId);
  }
}
