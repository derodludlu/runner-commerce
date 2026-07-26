import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { UpdateManualPaymentDto } from './dto/update-manual-payment.dto';
import PDFDocument = require('pdfkit');
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';

const WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE = 14;
const MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE = 49;
const BILLING_DOCUMENT_DIR = 'billing-documents';

const DEFAULT_PLANS = [
  {
    code: 'RUNNER_STARTER_WEEKLY',
    name: 'Starter Runner',
    audience: 'RUNNER',
    monthlyPrice: 95,
    billingCycle: 'WEEKLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 25,
    orderWorkflowAddonPrice: 35,
    priceEditingAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description:
      'Flexible weekly reposting for a starter runner shopping cycle',
    features: [
      'Up to 30 source shop groups',
      '1 runner advertising group',
      '1,500 repost deliveries per week',
    ],
  },
  {
    code: 'RUNNER_ACTIVE_WEEKLY',
    name: 'Active Runner',
    audience: 'RUNNER',
    monthlyPrice: 125,
    billingCycle: 'WEEKLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 39,
    orderWorkflowAddonPrice: 35,
    priceEditingAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description: 'Flexible weekly reposting for active runner cycles',
    features: [
      'Up to 50 source shop groups',
      'Up to 2 runner advertising groups',
      '2,500 repost deliveries per week',
    ],
  },
  {
    code: 'RUNNER_POWER_WEEKLY',
    name: 'Power Runner',
    audience: 'RUNNER',
    monthlyPrice: 165,
    billingCycle: 'WEEKLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 59,
    orderWorkflowAddonPrice: 35,
    priceEditingAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: WEEKLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description: 'Flexible weekly reposting for high-volume runner cycles',
    features: [
      'Up to 70 source shop groups',
      'Up to 2 runner advertising groups',
      '4,000 repost deliveries per week',
    ],
  },
  {
    code: 'RUNNER_STARTER',
    name: 'Starter Runner',
    audience: 'RUNNER',
    monthlyPrice: 349,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 79,
    orderWorkflowAddonPrice: 99,
    priceEditingAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description: 'Monthly reposting plan for runners with many shop groups',
    features: [
      'Up to 30 source shop groups',
      'Up to 2 runner advertising groups',
      '6,000 repost deliveries per month',
    ],
  },
  {
    code: 'RUNNER_ACTIVE',
    name: 'Active Runner',
    audience: 'RUNNER',
    monthlyPrice: 489,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 79,
    orderWorkflowAddonPrice: 99,
    priceEditingAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description:
      'Recommended monthly plan for active runners with more shop groups',
    features: [
      'Up to 50 source shop groups',
      'Up to 2 runner advertising groups',
      '10,000 repost deliveries per month',
    ],
  },
  {
    code: 'RUNNER_POWER',
    name: 'Power Runner',
    audience: 'RUNNER',
    monthlyPrice: 649,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 3,
    automationAddonPrice: 79,
    orderWorkflowAddonPrice: 99,
    priceEditingAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    shopPriceImageAddonPrice: MONTHLY_RUNNER_OPTIONAL_ADDON_PRICE,
    description: 'Higher-volume monthly plan for power runners',
    features: [
      'Up to 70 source shop groups',
      'Up to 2 runner advertising groups',
      '16,000 repost deliveries per month',
    ],
  },
  {
    code: 'SHOP_STARTER',
    name: 'Shop Starter',
    audience: 'SHOP_OWNER',
    monthlyPrice: 189,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 0,
    automationAddonPrice: 149,
    orderWorkflowAddonPrice: 0,
    priceEditingAddonPrice: 0,
    shopPriceImageAddonPrice: 0,
    description: 'Launch plan for shop owners reposting to a few groups',
    features: [
      '25% launch discount included',
      '1 source shop group',
      'Up to 4 destination shop groups',
      'Up to 5 total shop WhatsApp groups',
      '1,500 repost deliveries per month',
      'Same-shop WhatsApp reposting included',
      'Shop add-on: +5 destination groups and +1,000 repost deliveries',
    ],
  },
  {
    code: 'SHOP_ACTIVE',
    name: 'Shop Active',
    audience: 'SHOP_OWNER',
    monthlyPrice: 299,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 0,
    automationAddonPrice: 149,
    orderWorkflowAddonPrice: 0,
    priceEditingAddonPrice: 0,
    shopPriceImageAddonPrice: 0,
    description: 'Recommended launch plan for active shop owners',
    features: [
      '25% launch discount included',
      '1 source shop group',
      'Up to 9 destination shop groups',
      'Up to 10 total shop WhatsApp groups',
      '3,000 repost deliveries per month',
      'Same-shop WhatsApp reposting included',
      'Shop add-on: +5 destination groups and +1,000 repost deliveries',
    ],
  },
  {
    code: 'SHOP_MULTI_GROUP',
    name: 'Shop Multi-Group',
    audience: 'SHOP_OWNER',
    monthlyPrice: 479,
    billingCycle: 'MONTHLY',
    perConfirmedOrderFee: 0,
    automationAddonPrice: 199,
    orderWorkflowAddonPrice: 0,
    priceEditingAddonPrice: 0,
    shopPriceImageAddonPrice: 0,
    description: 'Higher-volume launch plan for multi-group shop owners',
    features: [
      '25% launch discount included',
      'Up to 2 source shop groups',
      'Up to 18 destination shop groups',
      'Up to 20 total shop WhatsApp groups',
      '6,000 repost deliveries per month',
      'Same-shop WhatsApp reposting included',
      'Shop add-on: +5 destination groups and +1,500 repost deliveries',
    ],
  },
];

const DEFAULT_PLAN_CODES = DEFAULT_PLANS.map((plan) => plan.code);
const RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY = 'runnerBotBridgeAccountId';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async listPlans() {
    await this.ensureDefaultPlans();

    return this.prisma.billingPlan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ audience: 'asc' }, { monthlyPrice: 'asc' }],
    });
  }

  async listRunnerPlans() {
    await this.ensureDefaultPlans();

    const plans = await this.prisma.billingPlan.findMany({
      where: { audience: 'RUNNER', status: 'ACTIVE' },
      orderBy: [{ monthlyPrice: 'asc' }],
    });
    const cycleRank = (value?: string | null) =>
      String(value || '').toUpperCase() === 'WEEKLY' ? 0 : 1;
    return plans.sort(
      (a: any, b: any) =>
        cycleRank(a.billingCycle) - cycleRank(b.billingCycle) ||
        Number(a.monthlyPrice || 0) - Number(b.monthlyPrice || 0),
    );
  }

  async getMyBilling(user: any) {
    await this.ensureDefaultPlans();

    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId: user.userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const invoices = await this.prisma.platformInvoice.findMany({
      where: { userId: user.userId },
      include: {
        manualPayments: true,
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    const manualPayments = await this.prisma.manualPaymentRecord.findMany({
      where: { payerUserId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const billingEvents = await this.prisma.platformBillingEvent.findMany({
      where: { runner: { userId: user.userId } },
      include: {
        order: { select: { id: true, status: true, createdAt: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
      orderBy: { effectiveAt: 'desc' },
      take: 100,
    });

    return { subscriptions, invoices, manualPayments, billingEvents };
  }

  async createSubscription(user: any, dto: CreateSubscriptionDto) {
    await this.ensureDefaultPlans();

    const plan = await this.prisma.billingPlan.findUnique({
      where: { code: dto.planCode },
    });

    if (!plan || plan.status !== 'ACTIVE') {
      throw new NotFoundException('Billing plan not found');
    }

    const audience = this.audienceForUser(user, plan.audience);
    const runnerId = audience === 'RUNNER' ? user.runnerId : null;
    const shopId =
      audience === 'SHOP_OWNER'
        ? await this.resolveShopIdForOwner(user.userId, dto.shopId)
        : null;

    if (audience === 'RUNNER' && !runnerId) {
      throw new ForbiddenException('Runner profile required');
    }

    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId: user.userId,
        audience,
        runnerId,
        shopId,
        status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const sameRequest =
        existing.plan.code === dto.planCode &&
        Boolean(existing.automationAddonEnabled) ===
          Boolean(dto.automationAddonEnabled) &&
        Boolean(existing.orderWorkflowAddonEnabled) ===
          Boolean(dto.orderWorkflowAddonEnabled) &&
        Boolean(existing.priceEditingAddonEnabled) ===
          Boolean(dto.priceEditingAddonEnabled) &&
        Boolean(existing.shopPriceImageAddonEnabled) ===
          Boolean(dto.shopPriceImageAddonEnabled);

      throw new BadRequestException(
        sameRequest
          ? `Duplicate subscription request: ${existing.plan.name} is already ${existing.status.toLowerCase()}.`
          : `A ${existing.status.toLowerCase()} subscription already exists. Use upgrade/downgrade instead of creating a duplicate request.`,
      );
    }

    const now = new Date();
    const runner =
      audience === 'RUNNER' && runnerId
        ? await (this.prisma as any).runner?.findUnique?.({
            where: { id: runnerId },
            select: { trialStatus: true, trialEndsAt: true },
          })
        : null;
    const paidStart = this.runnerPaidPeriodStart(runner, now);
    const periodEnd = this.addBillingPeriod(paidStart, plan.billingCycle);
    const status = ['ADMIN', 'SUPERUSER'].includes(user.role)
      ? 'ACTIVE'
      : 'PENDING';

    return this.prisma.subscription.create({
      data: {
        userId: user.userId,
        runnerId,
        shopId,
        planId: plan.id,
        audience,
        status,
        currency: plan.currency,
        monthlyPrice: plan.monthlyPrice,
        billingCycle: plan.billingCycle,
        perConfirmedOrderFee: plan.perConfirmedOrderFee,
        automationAddonEnabled: Boolean(dto.automationAddonEnabled),
        automationAddonPrice: dto.automationAddonEnabled
          ? plan.automationAddonPrice
          : 0,
        orderWorkflowAddonEnabled: Boolean(dto.orderWorkflowAddonEnabled),
        orderWorkflowAddonPrice: dto.orderWorkflowAddonEnabled
          ? plan.orderWorkflowAddonPrice
          : 0,
        priceEditingAddonEnabled: Boolean(dto.priceEditingAddonEnabled),
        priceEditingAddonPrice: dto.priceEditingAddonEnabled
          ? plan.priceEditingAddonPrice
          : 0,
        shopPriceImageAddonEnabled: Boolean(dto.shopPriceImageAddonEnabled),
        shopPriceImageAddonPrice: dto.shopPriceImageAddonEnabled
          ? plan.shopPriceImageAddonPrice
          : 0,
        currentPeriodStart: paidStart,
        currentPeriodEnd: periodEnd,
      },
      include: { plan: true },
    });
  }

  async listSubscriptions(user: any) {
    const where = ['ADMIN', 'SUPERUSER'].includes(user.role)
      ? {}
      : { userId: user.userId };

    return this.prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        runner: { include: { user: { select: { name: true, phone: true } } } },
        shop: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async changeSubscriptionPlan(
    user: any,
    subscriptionId: string,
    dto: {
      planCode?: string;
      automationAddonEnabled?: boolean;
      orderWorkflowAddonEnabled?: boolean;
      priceEditingAddonEnabled?: boolean;
      shopPriceImageAddonEnabled?: boolean;
    },
  ) {
    const subscription = await this.assertSubscriptionAccess(
      user,
      subscriptionId,
    );

    const planCode = String(dto.planCode || '').trim();
    if (!planCode) {
      throw new BadRequestException('planCode is required');
    }

    const plan = await this.prisma.billingPlan.findUnique({
      where: { code: planCode },
    });

    if (!plan || plan.status !== 'ACTIVE') {
      throw new NotFoundException('Billing plan not found');
    }

    if (plan.audience !== subscription.audience) {
      throw new BadRequestException(
        'New plan must match the subscription audience',
      );
    }

    if (['CANCELLED', 'REJECTED'].includes(subscription.status)) {
      throw new BadRequestException(
        'Cancelled or rejected subscriptions cannot be changed',
      );
    }

    const previousMonthlyPrice = subscription.monthlyPrice;
    const previousCycle = subscription.billingCycle;
    const automationAddonEnabled =
      dto.automationAddonEnabled === undefined
        ? subscription.automationAddonEnabled
        : Boolean(dto.automationAddonEnabled);
    const orderWorkflowAddonEnabled =
      dto.orderWorkflowAddonEnabled === undefined
        ? subscription.orderWorkflowAddonEnabled
        : Boolean(dto.orderWorkflowAddonEnabled);
    const priceEditingAddonEnabled =
      dto.priceEditingAddonEnabled === undefined
        ? subscription.priceEditingAddonEnabled
        : Boolean(dto.priceEditingAddonEnabled);
    const shopPriceImageAddonEnabled =
      dto.shopPriceImageAddonEnabled === undefined
        ? subscription.shopPriceImageAddonEnabled
        : Boolean(dto.shopPriceImageAddonEnabled);
    const action =
      plan.monthlyPrice > previousMonthlyPrice
        ? 'UPGRADE'
        : plan.monthlyPrice < previousMonthlyPrice
          ? 'DOWNGRADE'
          : 'PLAN_CHANGE';

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        monthlyPrice: plan.monthlyPrice,
        billingCycle: plan.billingCycle,
        perConfirmedOrderFee: plan.perConfirmedOrderFee,
        automationAddonEnabled,
        automationAddonPrice: automationAddonEnabled
          ? plan.automationAddonPrice
          : 0,
        orderWorkflowAddonEnabled,
        orderWorkflowAddonPrice: orderWorkflowAddonEnabled
          ? plan.orderWorkflowAddonPrice
          : 0,
        priceEditingAddonEnabled,
        priceEditingAddonPrice: priceEditingAddonEnabled
          ? plan.priceEditingAddonPrice
          : 0,
        shopPriceImageAddonEnabled,
        shopPriceImageAddonPrice: shopPriceImageAddonEnabled
          ? plan.shopPriceImageAddonPrice
          : 0,
      },
      include: { plan: true },
    });

    return {
      action,
      previousMonthlyPrice,
      previousCycle,
      subscription: updated,
      message:
        action === 'UPGRADE'
          ? 'Subscription upgraded'
          : action === 'DOWNGRADE'
            ? 'Subscription downgraded'
            : 'Subscription plan updated',
    };
  }

  async updateSubscriptionStatus(
    user: any,
    subscriptionId: string,
    dto: { status?: string; notes?: string },
  ) {
    const subscription = await this.assertSubscriptionAccess(
      user,
      subscriptionId,
    );
    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const isAdmin = ['ADMIN', 'SUPERUSER'].includes(user.role);
    const allowed = isAdmin
      ? ['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'REJECTED']
      : ['PAUSED', 'CANCELLED'];

    if (!allowed.includes(status)) {
      throw new ForbiddenException(
        isAdmin
          ? 'Status must be PENDING, ACTIVE, PAUSED, CANCELLED, or REJECTED'
          : 'You can only pause or cancel your own subscription',
      );
    }

    if (!isAdmin && ['CANCELLED', 'REJECTED'].includes(subscription.status)) {
      throw new BadRequestException(
        'Cancelled or rejected subscriptions cannot be changed',
      );
    }

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status,
        cancelledAt: status === 'CANCELLED' ? new Date() : null,
      },
      include: { plan: true },
    });
  }

  async generateCurrentInvoice(user: any, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (
      subscription.userId !== user.userId &&
      !['ADMIN', 'SUPERUSER'].includes(user.role)
    ) {
      throw new ForbiddenException(
        'You can only invoice your own subscription',
      );
    }

    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Only active subscriptions can be invoiced. Current status is ${subscription.status}.`,
      );
    }

    const periodWhere = {
      subscriptionId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    };
    const openInvoice = await this.prisma.platformInvoice.findFirst({
      where: {
        ...periodWhere,
        status: { notIn: ['PAID', 'VOID', 'CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const existing =
      openInvoice ||
      (await this.prisma.platformInvoice.findFirst({
        where: periodWhere,
        orderBy: { createdAt: 'asc' },
      }));

    const chargeableEvents = await this.prisma.platformBillingEvent.findMany({
      where: { subscriptionId, status: 'CHARGEABLE' },
      orderBy: { effectiveAt: 'asc' },
    });
    const orderFees = this.roundMoney(
      chargeableEvents.reduce((sum, event) => sum + event.amount, 0),
    );
    const confirmedOrderCount = chargeableEvents.length;

    if (existing && confirmedOrderCount === 0) {
      const invoice = await this.prisma.platformInvoice.findUnique({
        where: { id: existing.id },
        include: {
          subscription: { include: { plan: true } },
          billingEvents: true,
        },
      });
      return invoice ? this.ensureInvoicePdf(invoice.id) : invoice;
    }

    if (existing && !['PAID', 'VOID', 'CANCELLED'].includes(existing.status)) {
      const updatedInvoice = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.platformInvoice.update({
          where: { id: existing.id },
          data: {
            orderFees: { increment: orderFees },
            subtotal: { increment: orderFees },
            total: { increment: orderFees },
            notes: this.orderFeeNote(
              confirmedOrderCount,
              subscription.perConfirmedOrderFee,
            ),
          },
        });
        await tx.platformBillingEvent.updateMany({
          where: {
            id: { in: chargeableEvents.map((event) => event.id) },
            status: 'CHARGEABLE',
          },
          data: { status: 'INVOICED', invoiceId: invoice.id },
        });
        return tx.platformInvoice.findUnique({
          where: { id: invoice.id },
          include: {
            subscription: { include: { plan: true } },
            billingEvents: true,
          },
        });
      });
      return updatedInvoice ? this.ensureInvoicePdf(updatedInvoice.id) : null;
    }

    const automationAddonFee = subscription.automationAddonEnabled
      ? subscription.automationAddonPrice
      : 0;
    const orderWorkflowAddonFee = subscription.orderWorkflowAddonEnabled
      ? subscription.orderWorkflowAddonPrice
      : 0;
    const priceEditingAddonFee = subscription.priceEditingAddonEnabled
      ? subscription.priceEditingAddonPrice
      : 0;
    const shopPriceImageAddonFee = subscription.shopPriceImageAddonEnabled
      ? subscription.shopPriceImageAddonPrice
      : 0;
    const isSupplemental = Boolean(existing);
    const monthlyFee = isSupplemental ? 0 : subscription.monthlyPrice;
    const addonFee = isSupplemental ? 0 : automationAddonFee;
    const workflowAddonFee = isSupplemental ? 0 : orderWorkflowAddonFee;
    const priceEditingFee = isSupplemental ? 0 : priceEditingAddonFee;
    const shopPriceImageFee = isSupplemental ? 0 : shopPriceImageAddonFee;
    const subtotal = this.roundMoney(
      monthlyFee +
        orderFees +
        addonFee +
        workflowAddonFee +
        priceEditingFee +
        shopPriceImageFee,
    );
    const invoiceNumber = await this.nextInvoiceNumber();

    const createdInvoice = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.platformInvoice.create({
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          runnerId: subscription.runnerId,
          shopId: subscription.shopId,
          invoiceNumber,
          currency: subscription.currency,
          monthlyFee,
          orderFees,
          automationAddonFee: addonFee,
          orderWorkflowAddonFee: workflowAddonFee,
          priceEditingAddonFee: priceEditingFee,
          shopPriceImageAddonFee: shopPriceImageFee,
          subtotal,
          total: subtotal,
          status: 'ISSUED',
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          notes:
            confirmedOrderCount > 0
              ? this.orderFeeNote(
                  confirmedOrderCount,
                  subscription.perConfirmedOrderFee,
                )
              : undefined,
        },
      });
      if (chargeableEvents.length > 0) {
        await tx.platformBillingEvent.updateMany({
          where: {
            id: { in: chargeableEvents.map((event) => event.id) },
            status: 'CHARGEABLE',
          },
          data: { status: 'INVOICED', invoiceId: invoice.id },
        });
      }
      return tx.platformInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          subscription: { include: { plan: true } },
          billingEvents: true,
        },
      });
    });
    return createdInvoice ? this.ensureInvoicePdf(createdInvoice.id) : null;
  }

  async generateCurrentInvoiceForRunnerBot(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    return this.generateCurrentInvoice(
      {
        userId: subscription.userId,
        role: 'ADMIN',
      },
      subscriptionId,
    );
  }

  async createRunnerBotSubscriptionAndInvoice(
    runnerId: string,
    planCode: string,
    options: {
      automationAddonEnabled?: boolean;
      orderWorkflowAddonEnabled?: boolean;
      priceEditingAddonEnabled?: boolean;
      shopPriceImageAddonEnabled?: boolean;
    } = {},
  ) {
    await this.ensureDefaultPlans();
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: { user: true },
    });
    if (!runner?.userId) throw new NotFoundException('Runner not found');

    const plan = await this.prisma.billingPlan.findUnique({
      where: { code: planCode },
    });
    if (!plan || plan.status !== 'ACTIVE' || plan.audience !== 'RUNNER') {
      throw new NotFoundException('Runner billing plan not found');
    }

    const now = new Date();
    const paidStart = this.runnerPaidPeriodStart(runner, now);
    const periodEnd = this.addBillingPeriod(paidStart, plan.billingCycle);
    const automationAddonEnabled = Boolean(options.automationAddonEnabled);
    const orderWorkflowAddonEnabled = Boolean(
      options.orderWorkflowAddonEnabled,
    );
    const priceEditingAddonEnabled = Boolean(options.priceEditingAddonEnabled);
    const shopPriceImageAddonEnabled = Boolean(
      options.shopPriceImageAddonEnabled,
    );
    const subscription = await this.prisma.subscription.upsert({
      where: {
        id:
          (
            await this.prisma.subscription.findFirst({
              where: {
                userId: runner.userId,
                runnerId,
                audience: 'RUNNER',
                status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] },
              },
              select: { id: true },
              orderBy: { createdAt: 'desc' },
            })
          )?.id || '__new_runner_bot_subscription__',
      },
      create: {
        userId: runner.userId,
        runnerId,
        planId: plan.id,
        audience: 'RUNNER',
        status: 'PENDING',
        currency: plan.currency,
        monthlyPrice: plan.monthlyPrice,
        billingCycle: plan.billingCycle,
        perConfirmedOrderFee: plan.perConfirmedOrderFee,
        automationAddonEnabled,
        automationAddonPrice: automationAddonEnabled
          ? plan.automationAddonPrice
          : 0,
        orderWorkflowAddonEnabled,
        orderWorkflowAddonPrice: orderWorkflowAddonEnabled
          ? plan.orderWorkflowAddonPrice
          : 0,
        priceEditingAddonEnabled,
        priceEditingAddonPrice: priceEditingAddonEnabled
          ? plan.priceEditingAddonPrice
          : 0,
        shopPriceImageAddonEnabled,
        shopPriceImageAddonPrice: shopPriceImageAddonEnabled
          ? plan.shopPriceImageAddonPrice
          : 0,
        currentPeriodStart: paidStart,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: plan.id,
        status: 'PENDING',
        currency: plan.currency,
        monthlyPrice: plan.monthlyPrice,
        billingCycle: plan.billingCycle,
        perConfirmedOrderFee: plan.perConfirmedOrderFee,
        automationAddonEnabled,
        automationAddonPrice: automationAddonEnabled
          ? plan.automationAddonPrice
          : 0,
        orderWorkflowAddonEnabled,
        orderWorkflowAddonPrice: orderWorkflowAddonEnabled
          ? plan.orderWorkflowAddonPrice
          : 0,
        priceEditingAddonEnabled,
        priceEditingAddonPrice: priceEditingAddonEnabled
          ? plan.priceEditingAddonPrice
          : 0,
        shopPriceImageAddonEnabled,
        shopPriceImageAddonPrice: shopPriceImageAddonEnabled
          ? plan.shopPriceImageAddonPrice
          : 0,
        currentPeriodStart: paidStart,
        currentPeriodEnd: periodEnd,
      },
      include: { plan: true },
    });

    const existing = await this.prisma.platformInvoice.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: { notIn: ['PAID', 'VOID', 'CANCELLED', 'REJECTED'] },
      },
      include: {
        subscription: { include: { plan: true } },
        manualPayments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const automationAddonFee = subscription.automationAddonEnabled
      ? subscription.automationAddonPrice
      : 0;
    const orderWorkflowAddonFee = subscription.orderWorkflowAddonEnabled
      ? subscription.orderWorkflowAddonPrice
      : 0;
    const priceEditingAddonFee = subscription.priceEditingAddonEnabled
      ? subscription.priceEditingAddonPrice
      : 0;
    const shopPriceImageAddonFee = subscription.shopPriceImageAddonEnabled
      ? subscription.shopPriceImageAddonPrice
      : 0;
    const subtotal = this.roundMoney(
      subscription.monthlyPrice +
        automationAddonFee +
        orderWorkflowAddonFee +
        priceEditingAddonFee +
        shopPriceImageAddonFee,
    );

    if (existing && existing.total === subtotal) {
      return { subscription, invoice: existing };
    }
    if (existing) {
      await this.prisma.platformInvoice.update({
        where: { id: existing.id },
        data: { status: 'VOID', notes: 'Replaced by RunnerBot plan selection' },
      });
    }

    const invoiceNumber = await this.nextInvoiceNumber();
    const invoice = await this.prisma.platformInvoice.create({
      data: {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        runnerId: subscription.runnerId,
        shopId: null,
        invoiceNumber,
        currency: subscription.currency,
        monthlyFee: subscription.monthlyPrice,
        automationAddonFee,
        orderWorkflowAddonFee,
        priceEditingAddonFee,
        shopPriceImageAddonFee,
        subtotal,
        total: subtotal,
        status: 'ISSUED',
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes: 'RunnerBot subscription invoice pending admin payment approval',
      },
      include: {
        subscription: { include: { plan: true } },
        manualPayments: true,
      },
    });

    return { subscription, invoice: await this.ensureInvoicePdf(invoice.id) };
  }

  async listBillingEvents(user: any) {
    const where = ['ADMIN', 'SUPERUSER'].includes(user.role)
      ? {}
      : { runner: { userId: user.userId } };
    return this.prisma.platformBillingEvent.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            customerPhone: true,
            createdAt: true,
          },
        },
        runner: { include: { user: { select: { name: true, phone: true } } } },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
      orderBy: { effectiveAt: 'desc' },
      take: 500,
    });
  }

  async listInvoices(user: any) {
    const where = ['ADMIN', 'SUPERUSER'].includes(user.role)
      ? {}
      : { userId: user.userId };

    return this.prisma.platformInvoice.findMany({
      where,
      include: {
        manualPayments: true,
        subscription: { include: { plan: true } },
        user: { select: { id: true, name: true, phone: true, email: true } },
        runner: { include: { user: { select: { name: true, phone: true } } } },
        shop: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async submitInvoicePayment(
    user: any,
    invoiceId: string,
    dto: ManualPaymentDto,
  ) {
    const invoice = await this.assertInvoicePaymentAccess(user, invoiceId);

    const method = this.cleanMethod(dto.method);
    const reference = this.cleanText(dto.reference, 160);
    const proofUrl = this.cleanText(dto.proofUrl, 500);
    const runnerReference = this.cleanText(dto.runnerReference, 120);
    const proofText = this.cleanText(dto.proofText, 4000);
    const proofImageUrls = this.cleanStringArray(dto.proofImageUrls, 8, 500);
    const source = this.cleanSource(dto.source);
    const sourceMessageId = this.cleanText(dto.sourceMessageId, 300);
    if (!reference && !proofUrl && !proofText && proofImageUrls.length === 0) {
      throw new BadRequestException(
        'Add a payment reference, SMS text, or screenshot proof before submitting',
      );
    }
    if (sourceMessageId) {
      const duplicateMessage = await this.prisma.manualPaymentRecord.findFirst({
        where: {
          sourceMessageId,
          status: { in: ['PENDING', 'VERIFIED'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (duplicateMessage) {
        throw new BadRequestException(
          `Duplicate payment proof already exists with status ${duplicateMessage.status}.`,
        );
      }
    }
    const duplicate = await this.prisma.manualPaymentRecord.findFirst({
      where: {
        invoiceId,
        amount: Number(dto.amount),
        method,
        reference: reference ?? null,
        runnerReference: runnerReference ?? null,
        proofUrl: proofUrl ?? null,
        proofText: proofText ?? null,
        source,
        OR: [
          sourceMessageId ? { sourceMessageId } : {},
          { proofImageUrls: proofImageUrls as any },
        ],
        status: { in: ['PENDING', 'VERIFIED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (duplicate) {
      throw new BadRequestException(
        `Duplicate payment request already exists with status ${duplicate.status}.`,
      );
    }

    return this.prisma.manualPaymentRecord.create({
      data: {
        invoiceId,
        payerUserId: user.userId,
        amount: Number(dto.amount),
        currency: invoice.currency || 'ZAR',
        method,
        reference,
        runnerReference,
        proofUrl,
        proofText,
        proofImageUrls:
          proofImageUrls.length > 0 ? (proofImageUrls as any) : undefined,
        source,
        sourceMessageId,
        notes: this.cleanText(dto.notes, 1000),
        status: 'PENDING',
      },
    });
  }

  async submitRunnerBotInvoicePayment(data: {
    runnerId: string;
    invoiceNumber?: string;
    amount: number;
    method: string;
    reference?: string;
    runnerReference?: string;
    proofText?: string;
    proofImageUrls?: string[];
    sourceMessageId?: string;
    notes?: string;
  }) {
    const invoice = await this.resolveRunnerBotInvoice(
      data.runnerId,
      data.invoiceNumber,
    );

    return this.submitInvoicePayment(
      { userId: invoice.userId, role: 'ADMIN' },
      invoice.id,
      {
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        runnerReference: data.runnerReference,
        proofText: data.proofText,
        proofImageUrls: data.proofImageUrls,
        source: 'RUNNER_BOT',
        sourceMessageId: data.sourceMessageId,
        notes: data.notes,
      },
    );
  }

  async assertInvoicePaymentAccess(user: any, invoiceId: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.userId !== user.userId &&
      !['ADMIN', 'SUPERUSER'].includes(user.role)
    ) {
      throw new ForbiddenException('You can only pay your own invoices');
    }
    if (['PAID', 'VOID', 'CANCELLED', 'REJECTED'].includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot submit proof for invoice status ${invoice.status}`,
      );
    }
    return invoice;
  }

  async updateManualPayment(
    paymentId: string,
    dto: UpdateManualPaymentDto,
    adminUserId: string,
  ) {
    const payment = await this.prisma.manualPaymentRecord.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });

    if (!payment) throw new NotFoundException('Manual payment not found');

    const status = String(dto.status || '').toUpperCase();
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Status must be VERIFIED or REJECTED');
    }

    const wasAlreadyVerified = payment.status === 'VERIFIED';
    const updated = await this.prisma.manualPaymentRecord.update({
      where: { id: paymentId },
      data: {
        status,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
        verifiedById: status === 'VERIFIED' ? adminUserId : null,
        notes: this.cleanText(dto.notes, 1000) ?? payment.notes,
      },
    });

    if (status === 'VERIFIED' && payment.invoiceId) {
      const verifiedTotal = await this.prisma.manualPaymentRecord.aggregate({
        where: { invoiceId: payment.invoiceId, status: 'VERIFIED' },
        _sum: { amount: true },
      });
      const paidAmount = verifiedTotal._sum.amount || 0;

      if (payment.invoice && paidAmount >= payment.invoice.total) {
        await this.prisma.platformInvoice.update({
          where: { id: payment.invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        });
        await this.activatePaidInvoiceAccess(payment.invoice);
      }
    }

    if (status !== 'VERIFIED') return updated;

    const receipted = await this.ensureReceiptPdf(updated.id);
    if (!wasAlreadyVerified) {
      await this.queueRunnerBotReceiptNotification(receipted);
    }
    return receipted;
  }

  async updateInvoiceStatus(
    invoiceId: string,
    dto: { status?: string; notes?: string },
  ) {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const allowed = [
      'ISSUED',
      'PAID',
      'OVERDUE',
      'VOID',
      'CANCELLED',
      'REJECTED',
    ];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Invoice status must be one of: ${allowed.join(', ')}`,
      );
    }
    const updated = await this.prisma.platformInvoice.update({
      where: { id: invoiceId },
      data: {
        status,
        paidAt: status === 'PAID' ? new Date() : null,
        notes:
          dto.notes !== undefined
            ? this.cleanText(dto.notes, 1000)
            : invoice.notes,
      },
      include: {
        manualPayments: true,
        subscription: { include: { plan: true } },
      },
    });

    if (status === 'PAID') {
      await this.activatePaidInvoiceAccess(updated);
    }

    return updated;
  }

  private async activatePaidInvoiceAccess(invoice: {
    subscriptionId?: string | null;
    runnerId?: string | null;
  }) {
    if (invoice.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: 'ACTIVE' },
      });
    }

    if (invoice.runnerId) {
      await (this.prisma as any).runner?.update?.({
        where: { id: invoice.runnerId },
        data: { subscriptionStatus: 'ACTIVE_SUBSCRIPTION' },
      });
    }
  }

  async deleteManualPayment(paymentId: string) {
    const payment = await this.prisma.manualPaymentRecord.findUnique({
      where: { id: paymentId },
      select: { id: true, invoiceId: true },
    });
    if (!payment) throw new NotFoundException('Manual payment not found');

    await this.prisma.manualPaymentRecord.delete({ where: { id: paymentId } });
    return { message: 'Manual payment request deleted', payment };
  }

  async deleteInvoice(invoiceId: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.prisma.platformInvoice.delete({ where: { id: invoiceId } });
    return { message: 'Invoice deleted', invoice };
  }

  async deleteSubscription(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, status: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    await this.prisma.subscription.delete({ where: { id: subscriptionId } });
    return { message: 'Subscription deleted', subscription };
  }

  async resetBillingForDevelopment() {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const manualPayments = await tx.manualPaymentRecord.deleteMany({
        where: { invoiceId: { not: null } },
      });
      const billingEvents = await tx.platformBillingEvent.deleteMany({});
      const invoices = await tx.platformInvoice.deleteMany({});
      const subscriptions = await tx.subscription.deleteMany({});

      return {
        manualPayments: manualPayments.count,
        billingEvents: billingEvents.count,
        invoices: invoices.count,
        subscriptions: subscriptions.count,
      };
    });

    return {
      message: 'Billing subscriptions, invoices, and payment requests reset.',
      deleted,
    };
  }

  async ensureInvoicePdf(invoiceId: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        manualPayments: true,
        subscription: { include: { plan: true } },
        user: { select: { name: true, phone: true, email: true } },
        runner: { include: { user: { select: { name: true, phone: true } } } },
        shop: { select: { name: true, phone: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.invoicePdfUrl) return invoice;

    const invoicePdfUrl = await this.writeBillingPdf({
      title: 'Runner Commerce Invoice',
      filename: `${invoice.invoiceNumber}.pdf`,
      rows: [
        ['Invoice', invoice.invoiceNumber],
        ['Status', invoice.status],
        ['Customer', this.billingCustomerName(invoice)],
        ['Plan', invoice.subscription?.plan?.name || 'Runner Commerce'],
        [
          'Period',
          `${this.dateText(invoice.periodStart)} to ${this.dateText(invoice.periodEnd)}`,
        ],
        ['Due', invoice.dueAt ? this.dateText(invoice.dueAt) : 'On receipt'],
        ['Currency', invoice.currency || 'ZAR'],
        ['Subscription', this.moneyText(invoice.monthlyFee)],
        ['Automation addon', this.moneyText(invoice.automationAddonFee)],
        ['Order workflow addon', this.moneyText(invoice.orderWorkflowAddonFee)],
        ['Price editing addon', this.moneyText(invoice.priceEditingAddonFee)],
        [
          'Shop price image addon',
          this.moneyText(invoice.shopPriceImageAddonFee),
        ],
        ['Order fees', this.moneyText(invoice.orderFees)],
        ['Total', this.moneyText(invoice.total)],
      ],
      notes: [
        invoice.notes,
        `Payment reference: ${invoice.invoiceNumber}${
          invoice.runner?.user?.phone
            ? ` ${String(invoice.runner.user.phone).replace(/\D/g, '')}`
            : ''
        }`,
      ].filter(Boolean) as string[],
    });

    return this.prisma.platformInvoice.update({
      where: { id: invoice.id },
      data: { invoicePdfUrl },
      include: {
        manualPayments: true,
        subscription: { include: { plan: true } },
        user: { select: { name: true, phone: true, email: true } },
        runner: { include: { user: { select: { name: true, phone: true } } } },
        shop: { select: { name: true, phone: true } },
      },
    });
  }

  async ensureReceiptPdf(paymentId: string) {
    const payment = await this.prisma.manualPaymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            user: { select: { name: true, phone: true, email: true } },
            runner: {
              include: { user: { select: { name: true, phone: true } } },
            },
            subscription: { include: { plan: true } },
          },
        },
        payer: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!payment) throw new NotFoundException('Manual payment not found');
    if (payment.status !== 'VERIFIED') return payment;
    if (payment.receiptPdfUrl) return payment;

    const receiptNumber =
      payment.receiptNumber ||
      `RCR-${String(Date.now()).slice(-8)}-${payment.id.slice(0, 4).toUpperCase()}`;
    const receiptPdfUrl = await this.writeBillingPdf({
      title: 'Runner Commerce Official Receipt',
      filename: `${receiptNumber}.pdf`,
      rows: [
        ['Receipt', receiptNumber],
        ['Invoice', payment.invoice?.invoiceNumber || 'N/A'],
        ['Payment status', payment.status],
        [
          'Customer',
          payment.invoice
            ? this.billingCustomerName(payment.invoice)
            : payment.payer?.name || 'Runner Commerce customer',
        ],
        ['Amount received', this.moneyText(payment.amount)],
        ['Method', payment.method],
        ['Reference', payment.reference || payment.runnerReference || 'N/A'],
        ['Received', this.dateText(payment.receivedAt)],
        [
          'Verified',
          payment.verifiedAt
            ? this.dateText(payment.verifiedAt)
            : this.dateText(new Date()),
        ],
      ],
      notes: ['Official receipt issued after admin payment verification.'],
    });

    return this.prisma.manualPaymentRecord.update({
      where: { id: payment.id },
      data: { receiptNumber, receiptPdfUrl },
      include: {
        invoice: true,
        payer: { select: { name: true, phone: true, email: true } },
      },
    });
  }

  private async assertSubscriptionAccess(user: any, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (
      subscription.userId !== user.userId &&
      !['ADMIN', 'SUPERUSER'].includes(user.role)
    ) {
      throw new ForbiddenException('You can only manage your own subscription');
    }

    return subscription;
  }

  private async ensureDefaultPlans() {
    for (const plan of DEFAULT_PLANS) {
      await this.prisma.billingPlan.upsert({
        where: { code: plan.code },
        create: {
          ...plan,
          currency: 'ZAR',
        },
        update: {
          name: plan.name,
          audience: plan.audience,
          monthlyPrice: plan.monthlyPrice,
          billingCycle: plan.billingCycle,
          perConfirmedOrderFee: plan.perConfirmedOrderFee,
          automationAddonPrice: plan.automationAddonPrice,
          orderWorkflowAddonPrice: plan.orderWorkflowAddonPrice,
          priceEditingAddonPrice: plan.priceEditingAddonPrice,
          shopPriceImageAddonPrice: plan.shopPriceImageAddonPrice,
          description: plan.description,
          features: plan.features,
          currency: 'ZAR',
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.billingPlan.updateMany({
      where: {
        code: { notIn: DEFAULT_PLAN_CODES },
        OR: [
          { code: 'SHOP_OWNER' },
          { code: { startsWith: 'RUNNER_' } },
          { code: { startsWith: 'SHOP_' } },
        ],
      },
      data: { status: 'INACTIVE' },
    });
  }

  private audienceForUser(user: any, planAudience: string) {
    if (user.role === 'SUPERUSER' || user.role === 'ADMIN') return planAudience;
    if (planAudience === 'RUNNER' && user.role === 'RUNNER') return 'RUNNER';
    if (planAudience === 'SHOP_OWNER' && user.role === 'SHOP_OWNER')
      return 'SHOP_OWNER';
    throw new ForbiddenException('This plan is not available for your role');
  }

  private async resolveShopIdForOwner(
    userId: string,
    requestedShopId?: string,
  ) {
    const shop = requestedShopId
      ? await this.prisma.shop.findFirst({
          where: { id: requestedShopId, ownerId: userId },
          select: { id: true },
        })
      : await this.prisma.shop.findFirst({
          where: { ownerId: userId, status: 'ACTIVE' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!shop) throw new BadRequestException('Active shop required');
    return shop.id;
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  private addBillingPeriod(date: Date, billingCycle?: string | null) {
    const next = new Date(date);
    if (String(billingCycle || '').toUpperCase() === 'WEEKLY') {
      next.setDate(next.getDate() + 7);
      return next;
    }
    return this.addMonths(date, 1);
  }

  private runnerPaidPeriodStart(
    runner: {
      trialStatus?: string | null;
      trialEndsAt?: Date | string | null;
    } | null,
    now: Date,
  ) {
    if (runner?.trialStatus !== 'TRIAL_ACTIVE' || !runner.trialEndsAt) {
      return now;
    }
    const trialEndsAt = new Date(runner.trialEndsAt);
    if (Number.isNaN(trialEndsAt.getTime()) || trialEndsAt <= now) {
      return now;
    }
    return trialEndsAt;
  }

  private async queueRunnerBotReceiptNotification(payment: any) {
    if (!payment || payment.source !== 'RUNNER_BOT' || !payment.receiptPdfUrl) {
      return;
    }
    const invoice = payment.invoice;
    const runner = invoice?.runner;
    const recipientPhone = runner?.user?.phone || runner?.phone;
    if (!invoice?.runnerId || !recipientPhone) return;

    const bridgeAccountId = await this.resolveReceiptBridgeAccountId(runner);
    if (!bridgeAccountId) return;

    const paidLine =
      invoice.status === 'PAID' || invoice.paidAt
        ? 'Your invoice is now marked paid.'
        : 'Your payment has been verified.';
    const receiptNumber = payment.receiptNumber || 'Runner-Commerce-Receipt';
    const messageText = [
      'Payment verified',
      '',
      `Invoice: ${invoice.invoiceNumber || 'N/A'}`,
      `Amount: ${this.moneyText(payment.amount)}`,
      `Receipt: ${receiptNumber}`,
      paidLine,
      'Your official receipt PDF is attached.',
    ].join('\n');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      await this.prisma.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId,
          recipientPhone,
          messageType: 'TEXT',
          messageText,
          expiresAt,
        },
      });
      await this.prisma.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId,
          recipientPhone,
          messageType: 'DOCUMENT',
          messageText: `Official receipt ${receiptNumber}`,
          mediaUrl: payment.receiptPdfUrl,
          filename: `${receiptNumber}.pdf`,
          mimeType: 'application/pdf',
          expiresAt,
        },
      });
    } catch {
      // Receipt verification must not be rolled back by a WhatsApp queue failure.
    }
  }

  private async resolveReceiptBridgeAccountId(runner: any) {
    if (runner?.bridgeAccountId) return runner.bridgeAccountId;

    const configured = await (this.prisma as any).appSetting?.findUnique?.({
      where: { key: RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY },
    });
    const configuredBridgeId = this.cleanText(configured?.value, 120);
    if (configuredBridgeId) {
      const configuredBridge = await (
        this.prisma as any
      ).whatsAppBridgeAccount?.findFirst?.({
        where: {
          id: configuredBridgeId,
          archivedAt: null,
          status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
          mode: { not: 'PAUSED' },
        },
        select: { id: true },
      });
      if (configuredBridge?.id) return configuredBridge.id;
    }

    const bridge = await (
      this.prisma as any
    ).whatsAppBridgeAccount?.findFirst?.({
      where: {
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        mode: { not: 'PAUSED' },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return bridge?.id || null;
  }

  private async writeBillingPdf(data: {
    title: string;
    filename: string;
    rows: Array<[string, string]>;
    notes?: string[];
  }) {
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const documentDir = resolve(uploadRoot, BILLING_DOCUMENT_DIR);
    await mkdir(documentDir, { recursive: true });

    const safeFilename = data.filename.replace(/[^a-zA-Z0-9_.-]/g, '-');
    const filePath = resolve(documentDir, safeFilename);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const stream = createWriteStream(filePath);
      stream.on('finish', resolvePromise);
      stream.on('error', rejectPromise);
      doc.on('error', rejectPromise);
      doc.pipe(stream);

      doc.fontSize(18).text(data.title, { align: 'left' });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#555').text('Runner Commerce');
      doc.fillColor('#000').moveDown(1);

      for (const [label, value] of data.rows) {
        doc.fontSize(10).fillColor('#555').text(label, { continued: true });
        doc.fillColor('#000').text(`  ${value || '-'}`, { align: 'right' });
        doc.moveDown(0.35);
      }

      if (data.notes?.length) {
        doc.moveDown(1);
        doc.fontSize(11).text('Notes');
        doc.moveDown(0.3);
        for (const note of data.notes) {
          doc.fontSize(9).text(String(note || ''), { width: 500 });
        }
      }

      doc.moveDown(1.5);
      doc
        .fontSize(8)
        .fillColor('#666')
        .text(
          `Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        );
      doc.end();
    });

    return `/uploads/${BILLING_DOCUMENT_DIR}/${safeFilename}`;
  }

  private billingCustomerName(record: any) {
    return (
      record.runner?.user?.name ||
      record.user?.name ||
      record.shop?.name ||
      record.user?.phone ||
      record.runner?.user?.phone ||
      'Runner Commerce customer'
    );
  }

  private moneyText(value: number | string | null | undefined) {
    return `R ${Number(value || 0).toFixed(2)}`;
  }

  private dateText(value: Date | string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  }

  private async nextInvoiceNumber() {
    const count = await this.prisma.platformInvoice.count();
    return `RCINV-${String(count + 1).padStart(6, '0')}`;
  }

  private roundMoney(value: number) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  private orderFeeNote(count: number, fee: number) {
    return `${count} verified paid order${count === 1 ? '' : 's'} at R ${Number(fee || 0).toFixed(2)} each`;
  }

  private cleanMethod(value: string) {
    const method = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (!method) throw new BadRequestException('Payment method is required');
    return method;
  }

  private cleanText(value: string | undefined, maxLength: number) {
    const clean = String(value || '').trim();
    return clean ? clean.slice(0, maxLength) : undefined;
  }

  private cleanStringArray(
    value: string[] | undefined,
    maxItems: number,
    maxLength: number,
  ) {
    return Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((item) => this.cleanText(item, maxLength))
              .filter(Boolean) as string[],
          ),
        ).slice(0, maxItems)
      : [];
  }

  private cleanSource(value?: string) {
    const source = String(value || 'WEB')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    return source || 'WEB';
  }

  private async resolveRunnerBotInvoice(
    runnerId: string,
    invoiceNumber?: string,
  ) {
    const number = this.cleanText(invoiceNumber, 80);
    const where: any = {
      runnerId,
      status: { notIn: ['PAID', 'VOID', 'CANCELLED', 'REJECTED'] },
    };
    if (number) where.invoiceNumber = number;

    const invoices = await this.prisma.platformInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: number ? 1 : 2,
    });

    if (invoices.length === 0) {
      throw new NotFoundException(
        number
          ? `Invoice ${number} was not found for this runner`
          : 'No unpaid invoice found. Reply BILLING to choose a plan first.',
      );
    }
    if (!number && invoices.length > 1) {
      throw new BadRequestException(
        'More than one unpaid invoice exists. Send PAY <invoice number> <amount> <method> <reference>.',
      );
    }
    return invoices[0];
  }
}
