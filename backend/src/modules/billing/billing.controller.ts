import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, resolve } from 'path';
import { mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import { BillingService } from './billing.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { UpdateManualPaymentDto } from './dto/update-manual-payment.dto';

const { diskStorage } = require('multer');
const billingPaymentProofUploadDir = resolve(
  process.env.UPLOAD_PATH || './uploads',
  'billing-payment-proofs',
);
mkdirSync(billingPaymentProofUploadDir, { recursive: true });

function safeBillingProofName(file: any) {
  const extension = extname(file.originalname || '').toLowerCase() || '.jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
}

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List Rands billing plans' })
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my subscriptions, invoices, and payments' })
  getMyBilling(@User() user: any) {
    return this.billingService.getMyBilling(user);
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RUNNER', 'SHOP_OWNER', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manual-billing subscription' })
  createSubscription(@User() user: any, @Body() dto: CreateSubscriptionDto) {
    return this.billingService.createSubscription(user, dto);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invoices' })
  listInvoices(@User() user: any) {
    return this.billingService.listInvoices(user);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List immutable platform billing events' })
  listBillingEvents(@User() user: any) {
    return this.billingService.listBillingEvents(user);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscriptions' })
  listSubscriptions(@User() user: any) {
    return this.billingService.listSubscriptions(user);
  }

  @Patch('subscriptions/:id/plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RUNNER', 'SHOP_OWNER', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrade or downgrade a subscription plan' })
  changeSubscriptionPlan(
    @User() user: any,
    @Param('id') id: string,
    @Body('planCode') planCode: string,
    @Body('automationAddonEnabled') automationAddonEnabled?: boolean,
    @Body('orderWorkflowAddonEnabled') orderWorkflowAddonEnabled?: boolean,
    @Body('priceEditingAddonEnabled') priceEditingAddonEnabled?: boolean,
    @Body('shopPriceImageAddonEnabled') shopPriceImageAddonEnabled?: boolean,
  ) {
    return this.billingService.changeSubscriptionPlan(user, id, {
      planCode,
      automationAddonEnabled,
      orderWorkflowAddonEnabled,
      priceEditingAddonEnabled,
      shopPriceImageAddonEnabled,
    });
  }

  @Patch('subscriptions/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RUNNER', 'SHOP_OWNER', 'ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Pause, cancel, approve, reject, or reactivate a subscription',
  })
  updateSubscriptionStatus(
    @User() user: any,
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.billingService.updateSubscriptionStatus(user, id, {
      status,
      notes,
    });
  }

  @Post('subscriptions/:id/invoice')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate invoice for the current period' })
  generateCurrentInvoice(@User() user: any, @Param('id') id: string) {
    return this.billingService.generateCurrentInvoice(user, id);
  }

  @Post('invoices/:id/manual-payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit manual proof/reference for an invoice' })
  submitInvoicePayment(
    @User() user: any,
    @Param('id') id: string,
    @Body() dto: ManualPaymentDto,
  ) {
    return this.billingService.submitInvoicePayment(user, id, dto);
  }

  @Post('invoices/:id/payment-proof-upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: diskStorage({
        destination: billingPaymentProofUploadDir,
        filename: (_req: any, file: any, callback: any) =>
          callback(null, safeBillingProofName(file)),
      }),
      fileFilter: (_req, file, callback) => {
        if (!String(file.mimetype || '').startsWith('image/')) {
          callback(new BadRequestException('Proof must be an image'), false);
          return;
        }
        callback(null, true);
      },
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload a manual billing payment screenshot' })
  uploadInvoicePaymentProof(
    @User() user: any,
    @Param('id') id: string,
    @UploadedFile() proof: any,
  ) {
    if (!proof) throw new BadRequestException('Attach payment proof');
    return this.billingService
      .assertInvoicePaymentAccess(user, id)
      .then(() => ({
        proofUrl: `/uploads/billing-payment-proofs/${proof.filename}`,
      }));
  }

  @Patch('manual-payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify or reject a manual payment' })
  updateManualPayment(
    @User() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateManualPaymentDto,
  ) {
    return this.billingService.updateManualPayment(id, dto, user.userId);
  }

  @Patch('invoices/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update invoice status' })
  updateInvoiceStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.billingService.updateInvoiceStatus(id, { status, notes });
  }

  @Delete('manual-payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: delete a manual payment request' })
  deleteManualPayment(@Param('id') id: string) {
    return this.billingService.deleteManualPayment(id);
  }

  @Delete('invoices/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: delete an invoice' })
  deleteInvoice(@Param('id') id: string) {
    return this.billingService.deleteInvoice(id);
  }

  @Delete('subscriptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: delete a subscription' })
  deleteSubscription(@Param('id') id: string) {
    return this.billingService.deleteSubscription(id);
  }

  @Delete('dev/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERUSER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: reset all billing test data' })
  resetBilling() {
    return this.billingService.resetBillingForDevelopment();
  }
}
