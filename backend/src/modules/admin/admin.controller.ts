import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Phase1Service } from '../phase1/phase1.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(
    private adminService: AdminService,
    private phase1Service: Phase1Service,
    private authService: AuthService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics (Admin)' })
  getDashboard(@Request() req: any) {
    return this.adminService.getDashboardStats();
  }

  @Post('runners/:runnerId/impersonate')
  @Roles('SUPERUSER')
  @ApiOperation({
    summary:
      'Create a short-lived SUPERUSER impersonation session for a runner',
  })
  impersonateRunner(@Param('runnerId') runnerId: string, @Request() req: any) {
    return this.authService.impersonateRunner(req.user?.userId, runnerId);
  }

  @Get('analytics/sales')
  @ApiOperation({ summary: 'Get sales analytics' })
  getSalesAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    return this.adminService.getSalesAnalytics(start, end);
  }

  @Get('analytics/users')
  @ApiOperation({ summary: 'Get user analytics' })
  getUserAnalytics() {
    return this.adminService.getUserAnalytics();
  }

  @Get('analytics/orders')
  @ApiOperation({ summary: 'Get order status breakdown' })
  getOrderStatusBreakdown() {
    return this.adminService.getOrderStatusBreakdown();
  }

  @Get('analytics/revenue')
  @ApiOperation({ summary: 'Get revenue by period' })
  getRevenueByPeriod(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    return this.adminService.getRevenueByPeriod(period);
  }

  @Get('products/top')
  @ApiOperation({ summary: 'Get top selling products' })
  getTopProducts(@Query('limit') limit: number = 10) {
    return this.adminService.getTopProducts(limit);
  }

  @Get('runners/top')
  @ApiOperation({ summary: 'Get top runners' })
  getTopRunners(@Query('limit') limit: number = 10) {
    return this.adminService.getTopRunners(limit);
  }

  @Get('runners')
  @ApiOperation({ summary: 'Get all runners (Admin)' })
  getRunners(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.adminService.getRunners({ status, search, limit, offset });
  }

  @Get('phase1/runners')
  @ApiOperation({ summary: 'Get Phase 1 runner pilot status list' })
  getPhase1Runners(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.phase1Service.getPhase1Runners({
      status,
      search,
      limit,
      offset,
    });
  }

  @Get('phase1/prospects')
  @ApiOperation({
    summary: 'Get Phase 1 bot prospects without runner profiles',
  })
  getPhase1Prospects(
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.phase1Service.getPhase1Prospects({
      search,
      limit,
      offset,
    });
  }

  @Patch('phase1/runners/:runnerId/access')
  @ApiOperation({
    summary: 'Approve runner and manage Phase 1 trial/subscription access',
  })
  updateRunnerPhase1Access(
    @Param('runnerId') runnerId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.phase1Service.updateRunnerPhase1Access(
      runnerId,
      req.user?.userId,
      body,
    );
  }

  @Patch('phase1/runners/merge-legacy-reposting/auto')
  @ApiOperation({
    summary: 'Auto-merge pending legacy runner reposting settings',
  })
  autoMergeLegacyRunnerReposting(@Request() req: any, @Body() body: any = {}) {
    return this.phase1Service.autoMergeLegacyRunnerRepostingSetups(
      req.user?.userId,
      { limit: body.limit },
    );
  }

  @Patch('phase1/runners/:runnerId/merge-legacy-reposting')
  @ApiOperation({
    summary: 'Merge legacy runner reposting settings into Phase 1 setup',
  })
  mergeLegacyRunnerReposting(
    @Param('runnerId') runnerId: string,
    @Request() req: any,
  ) {
    return this.phase1Service.mergeLegacyRunnerRepostingSetup(
      runnerId,
      req.user?.userId,
    );
  }

  @Patch('phase1/reposting-groups/:groupId/verify')
  @ApiOperation({
    summary: 'Admin/system verifies runner reposting group readiness',
  })
  verifyRunnerRepostingGroup(
    @Param('groupId') groupId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.phase1Service.verifyRunnerRepostingGroup(
      groupId,
      req.user?.userId,
      body,
    );
  }

  @Delete('phase1/reposting-groups/:groupId')
  @ApiOperation({
    summary: 'Delete a failed or pending runner reposting group',
  })
  deleteRunnerRepostingGroup(
    @Param('groupId') groupId: string,
    @Request() req: any,
  ) {
    return this.phase1Service.deleteRunnerRepostingGroup(
      groupId,
      req.user?.userId,
    );
  }

  @Patch('phase1/submitted-shop-links/:linkId/review')
  @ApiOperation({ summary: 'Review a runner-submitted shop group link' })
  reviewRunnerSubmittedShopLink(
    @Param('linkId') linkId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.phase1Service.reviewSubmittedShopLink(
      linkId,
      req.user?.userId,
      body,
    );
  }

  @Post('phase1/prospects/:sessionId/invite-links/approve')
  @ApiOperation({
    summary: 'Approve a Phase 1 prospect invite link and queue bridge join',
  })
  approvePhase1ProspectInviteLink(
    @Param('sessionId') sessionId: string,
    @Body() body: any,
  ) {
    return this.phase1Service.approveProspectInviteLink(sessionId, body);
  }

  @Patch('runners/:runnerId/status')
  @ApiOperation({ summary: 'Update runner status (Admin)' })
  updateRunnerStatus(
    @Param('runnerId') runnerId: string,
    @Body('status') status: string,
  ) {
    return this.adminService.updateRunnerStatus(runnerId, status);
  }

  @Patch('runners/:runnerId/bridge-account')
  @ApiOperation({ summary: 'Assign a runner to a WhatsApp bridge account' })
  assignRunnerBridge(
    @Param('runnerId') runnerId: string,
    @Body('bridgeAccountId') bridgeAccountId?: string | null,
  ) {
    return this.adminService.assignRunnerBridge(runnerId, bridgeAccountId);
  }

  @Patch('runners/:runnerId/phase2-controls')
  @ApiOperation({
    summary: 'Update runner Phase 2 readiness and promise-hardening controls',
  })
  updateRunnerPhase2Controls(
    @Param('runnerId') runnerId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.adminService.updateRunnerPhase2Controls(
      runnerId,
      req.user?.userId,
      body,
    );
  }

  @Patch('runners/:runnerId/service-cities')
  @ApiOperation({ summary: 'Assign procurement cities to a runner' })
  updateRunnerServiceCities(
    @Param('runnerId') runnerId: string,
    @Body('cities') cities: string[],
  ) {
    return this.adminService.updateRunnerServiceCities(runnerId, cities);
  }

  @Patch('shops/:shopId/procurement-city')
  @ApiOperation({ summary: 'Assign a procurement city to a shop' })
  updateShopProcurementCity(
    @Param('shopId') shopId: string,
    @Body('city') city: string,
  ) {
    return this.adminService.updateShopProcurementCity(shopId, city);
  }

  @Patch('customer-runner-preferences/:preferenceId/resolve')
  @ApiOperation({ summary: 'Resolve a pending customer runner preference' })
  resolveRunnerPreference(
    @Param('preferenceId') preferenceId: string,
    @Body('runnerId') runnerId: string,
  ) {
    return this.adminService.resolveRunnerPreference(preferenceId, runnerId);
  }

  @Get('customer-runner-preferences/pending')
  @ApiOperation({ summary: 'List unmatched customer runner numbers' })
  getPendingRunnerPreferences() {
    return this.adminService.getPendingRunnerPreferences();
  }

  @Get('whatsapp-bridges')
  @ApiOperation({ summary: 'List WhatsApp bridge accounts and capacity' })
  getWhatsAppBridgeAccounts() {
    return this.adminService.getWhatsAppBridgeAccounts();
  }

  @Get('whatsapp-bridges/:bridgeId/logs')
  @ApiOperation({ summary: 'Tail console logs for a WhatsApp bridge worker' })
  getWhatsAppBridgeLogs(
    @Param('bridgeId') bridgeId: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines?: number,
  ) {
    return this.adminService.getWhatsAppBridgeLogs(bridgeId, lines);
  }

  @Get('whatsapp-destination-conflicts')
  @ApiOperation({
    summary:
      'List destination WhatsApp groups selected by multiple active runners',
  })
  getWhatsAppDestinationConflicts() {
    return this.adminService.getWhatsAppDestinationConflicts();
  }

  @Post('whatsapp-bridges')
  @ApiOperation({ summary: 'Create a WhatsApp bridge account' })
  createWhatsAppBridgeAccount(@Body() body: any, @Request() req: any) {
    return this.adminService.createWhatsAppBridgeAccount(
      body,
      req.user?.userId,
    );
  }

  @Patch('whatsapp-bridges/:bridgeId')
  @ApiOperation({ summary: 'Update a WhatsApp bridge account' })
  updateWhatsAppBridgeAccount(
    @Param('bridgeId') bridgeId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.adminService.updateWhatsAppBridgeAccount(
      bridgeId,
      body,
      req.user?.userId,
    );
  }

  @Post('whatsapp-bridges/:bridgeId/bot-bridge')
  @ApiOperation({ summary: 'Use this WhatsApp bridge for runner bot replies' })
  setRunnerBotBridgeAccount(
    @Param('bridgeId') bridgeId: string,
    @Request() req: any,
  ) {
    return this.adminService.setRunnerBotBridgeAccount(
      bridgeId,
      req.user?.userId,
    );
  }

  @Delete('whatsapp-bridges/:bridgeId')
  @ApiOperation({ summary: 'Archive a WhatsApp bridge account' })
  deleteWhatsAppBridgeAccount(
    @Param('bridgeId') bridgeId: string,
    @Request() req: any,
  ) {
    return this.adminService.deleteWhatsAppBridgeAccount(
      bridgeId,
      req.user?.userId,
    );
  }

  @Get('shops/top')
  @ApiOperation({ summary: 'Get top shops' })
  getTopShops(@Query('limit') limit: number = 10) {
    return this.adminService.getTopShops(limit);
  }

  @Get('orders/recent')
  @ApiOperation({ summary: 'Get recent orders' })
  getRecentOrders(@Query('limit') limit: number = 20) {
    return this.adminService.getRecentOrders(limit);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users (Admin)' })
  getUsers(
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.adminService.getUsers({ role, search, limit, offset });
  }

  @Patch('users/:userId/role')
  @ApiOperation({ summary: 'Change user role with development safeguards' })
  updateUserRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
    @Request() req: any,
  ) {
    return this.adminService.updateUserRole(userId, role, req.user?.userId);
  }

  @Delete('users/:userId')
  @ApiOperation({ summary: 'Delete user account and cascaded owned records' })
  deleteUser(@Param('userId') userId: string, @Request() req: any) {
    return this.adminService.deleteUser(userId, req.user?.userId);
  }

  @Post('users/:userId/reset-password')
  @ApiOperation({ summary: 'Issue a one-time temporary user password' })
  resetUserPassword(@Param('userId') userId: string, @Request() req: any) {
    return this.adminService.resetUserPassword(userId, req.user?.userId);
  }

  @Post('analytics/snapshot')
  @ApiOperation({ summary: 'Create analytics snapshot' })
  createSnapshot(
    @Query('type') type: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY',
  ) {
    return this.adminService.createSnapshot(type);
  }

  @Get('dev/state')
  @ApiOperation({ summary: 'Get development CRUD/reset state (Admin)' })
  getDevelopmentState() {
    return this.adminService.getDevelopmentState();
  }

  @Patch('dev/settings/runner-shop-auto-approval')
  @ApiOperation({ summary: 'Toggle runner shop join request auto approval' })
  updateRunnerShopAutoApproval(@Body('enabled') enabled: boolean) {
    return this.adminService.updateRunnerShopAutoApproval(Boolean(enabled));
  }

  @Patch('dev/settings/whatsapp-order-tracking')
  @ApiOperation({ summary: 'Toggle incoming WhatsApp order intake' })
  updateWhatsAppOrderTracking(@Body('enabled') enabled: boolean) {
    return this.adminService.updateWhatsAppOrderTracking(Boolean(enabled));
  }

  @Patch('dev/settings/whatsapp-reposting')
  @ApiOperation({ summary: 'Toggle global WhatsApp reposting' })
  updateWhatsAppReposting(@Body('enabled') enabled: boolean) {
    return this.adminService.updateWhatsAppReposting(Boolean(enabled));
  }

  @Get('operations/state')
  @ApiOperation({ summary: 'Get local operational control state' })
  getOperationsState() {
    return this.adminService.getOperationsState();
  }

  @Patch('operations/maintenance')
  @ApiOperation({ summary: 'Enter or leave local maintenance mode' })
  updateMaintenanceMode(@Body('enabled') enabled: boolean) {
    return this.adminService.updateMaintenanceMode(Boolean(enabled));
  }

  @Post('operations/safe-shutdown')
  @ApiOperation({ summary: 'Safely stop local app services and bridges' })
  safeShutdown(@Body('stopBridges') stopBridges?: boolean) {
    return this.adminService.requestSafeShutdown(stopBridges !== false);
  }

  @Patch('dev/settings/phase-2')
  @ApiOperation({ summary: 'Enable or disable Phase 2 order management' })
  updatePhase2(@Body('enabled') enabled: boolean) {
    return this.adminService.updatePhase2(Boolean(enabled));
  }

  @Delete('dev/orders')
  @ApiOperation({ summary: 'Reset order and WhatsApp order request test data' })
  resetOrders() {
    return this.adminService.resetOrdersForDevelopment();
  }

  @Delete('dev/listings')
  @ApiOperation({
    summary: 'Reset runner listings and dependent order/request test data',
  })
  resetListings() {
    return this.adminService.resetListingsForDevelopment();
  }

  @Delete('dev/shops-and-whatsapp-groups')
  @ApiOperation({
    summary:
      'Reset shops, shop-owned data, WhatsApp group mappings, and discovered groups',
  })
  resetShopsAndWhatsAppGroups() {
    return this.adminService.resetShopsAndWhatsAppGroupsForDevelopment();
  }

  @Delete('dev/products/older-than-capture/:days')
  @ApiOperation({
    summary:
      'Delete products whose latest WhatsApp source post is older than N days',
  })
  deleteProductsOlderThanCapture(@Param('days') days: string) {
    return this.adminService.deleteProductsOlderThanCapture(Number(days));
  }

  @Delete('dev/products/older-than-capture-hours/:hours')
  @ApiOperation({
    summary:
      'Delete products whose latest WhatsApp source post is older than N hours',
  })
  deleteProductsOlderThanCaptureHours(@Param('hours') hours: string) {
    return this.adminService.deleteProductsOlderThanCaptureHours(Number(hours));
  }

  @Delete('dev/shops/not-connected-to-any-bridge')
  @ApiOperation({
    summary:
      'Delete shops not connected to any available WhatsApp bridge group',
  })
  deleteShopsNotConnectedToAnyBridge() {
    return this.adminService.deleteShopsNotConnectedToAnyBridge();
  }

  @Delete('dev/whatsapp-groups/orphaned')
  @ApiOperation({
    summary:
      'Delete discovered WhatsApp groups not connected to any bridge or shop mapping',
  })
  deleteOrphanedWhatsAppGroups() {
    return this.adminService.deleteOrphanedWhatsAppGroups();
  }
}
