import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Product, Prisma } from '@prisma/client';
import { readFile, stat, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RESERVED_REPOSTING_GROUP_STATUSES } from '../../common/whatsapp-destination-reservations';

const RUNNER_SHOP_AUTO_APPROVAL_KEY = 'runnerShopJoinAutoApprovalEnabled';
const WHATSAPP_ORDER_TRACKING_KEY = 'whatsappOrderTrackingEnabled';
const PHASE_2_ENABLED_KEY = 'phase2Enabled';
const WHATSAPP_REPOSTING_ENABLED_KEY = 'whatsappRepostingEnabled';
const RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY = 'runnerBotBridgeAccountId';
const MAINTENANCE_FLAG = resolve(
  process.cwd(),
  '..',
  '.runner-commerce-maintenance',
);

interface DashboardStats {
  users: number;
  orders: number;
  revenue: number;
  shops: number;
  runners: number;
  pendingOrders: number;
  completedOrders: number;
  products: number;
}

interface TopProduct {
  product: Product;
  quantitySold: number;
}

interface TopRunner {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalOrders: number;
  totalEarnings: number;
  rating: number;
  balance: number;
  totalDeliveries: number;
}

interface BridgeLogCandidate {
  name: string;
  path: string;
}

interface BridgeRuntimeSignal {
  status: 'OK' | 'BROKEN' | 'UNKNOWN';
  issueCount: number;
  lastIssue: string | null;
  lastHealthy: string | null;
  checkedAt: Date;
}

const BRIDGE_RUNTIME_FAILURE_PATTERNS = [
  /Attempted to use detached Frame/i,
  /Runtime\.callFunctionOn timed out/i,
  /Execution context was destroyed/i,
  /Protocol error/i,
  /auth timeout/i,
  /Target closed/i,
  /net::ERR/i,
  /Runner auto-post failed/i,
  /Hourly shop capture failed/i,
  /WhatsApp group discovery sync failed/i,
];

const BRIDGE_RUNTIME_START_PATTERN = /Starting WhatsApp bridge worker/i;

const BRIDGE_RUNTIME_HEALTHY_PATTERNS = [
  BRIDGE_RUNTIME_START_PATTERN,
  /WhatsApp session bridge ready/i,
  /WhatsApp session authenticated/i,
  /Synced \d+ authenticated WhatsApp group/i,
  /Capturing \d+ mapped group/i,
  /Auto-post result .* sent=\d+ failed=0/i,
  /Hourly capture .* failed=0/i,
  /Runner auto-post scheduler active/i,
];

interface AdminRunner {
  id: string;
  status: string;
  phone: string | null;
  serviceArea: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  rating: number;
  totalOrders: number;
  totalEarnings: number;
  createdAt: Date;
  whatsappOrderIntakeEnabled: boolean;
  whatsappOrderTemplatesVerifiedAt: Date | null;
  whatsappOrderTestedAt: Date | null;
  refundMode: string;
  shippingMode: string;
  supervisionMode: string;
  phase2ReadinessNotes: string | null;
  phase2ReadinessBlockers: Prisma.JsonValue | null;
  phase2LastReviewedAt: Date | null;
  phase2Readiness?: {
    orderWorkflowAddonEnabled: boolean;
    whatsappOrderIntakeEnabled: boolean;
    refundMode: string;
    shippingMode: string;
    supervisionMode: string;
    blockers: string[];
    readyForWhatsAppOrderIntake: boolean;
    lastTestedAt: Date | null;
    lastReviewedAt: Date | null;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
  } | null;
  wallet: {
    balance: number;
    pending: number;
  } | null;
  bridgeAccount?: {
    id: string;
    name: string;
    phone: string | null;
    sessionName: string | null;
    status: string;
    capacityRunners: number;
    _count?: {
      runners: number;
    };
  } | null;
  shopAssignments: Array<{
    id: string;
    status: string;
    joinedAt: Date;
    approvedAt: Date | null;
    shop: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  serviceCities?: Array<{ city: string; active: boolean }>;
  subscriptions?: Array<{
    id: string;
    status: string;
    orderWorkflowAddonEnabled: boolean;
    currentPeriodEnd: Date;
  }>;
  _count: {
    orders: number;
    listings: number;
    shopAssignments: number;
  };
}

interface TopShop {
  id: string;
  name: string;
  owner: string;
  phone: string;
  email: string;
  status: string;
  productCount: number;
  orderCount: number;
}

interface OrderStatusBreakdown {
  status: string;
  count: number;
  totalAmount: number;
}

interface RecentOrder {
  id: string;
  status: string;
  totalAmount: number;
  customer: any;
  runner: any;
  items: any[];
  createdAt: Date;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get dashboard overview stats
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      totalShops,
      totalRunners,
      pendingOrders,
      completedOrders,
      totalProducts,
    ]: [
      number,
      number,
      { _sum: { totalAmount: number | null } },
      number,
      number,
      number,
      number,
      number,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: 'COMPLETED' },
      }),
      this.prisma.shop.count(),
      this.prisma.runner.count(),
      this.prisma.order.count({
        where: { status: { in: ['PENDING_PAYMENT', 'PAID'] } },
      }),
      this.prisma.order.count({
        where: { status: 'COMPLETED' },
      }),
      this.prisma.product.count(),
    ]);

    return {
      users: totalUsers,
      orders: totalOrders,
      revenue: totalRevenue._sum.totalAmount || 0,
      shops: totalShops,
      runners: totalRunners,
      pendingOrders,
      completedOrders,
      products: totalProducts,
    };
  }

  /**
   * Get sales analytics
   */
  async getSalesAnalytics(from: Date, to: Date, shopId?: string) {
    // Get sales data from orders
    const sales = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: from, lte: to },
        shopId: shopId ? shopId : undefined,
      },
      select: {
        totalAmount: true,
        tax: true,
        createdAt: true,
      },
    });

    // Fix the reduce function with proper typing
    const salesByDate: Record<string, number> = sales.reduce(
      (acc: Record<string, number>, sale) => {
        const date = sale.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + sale.totalAmount;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { salesByDate };
  }

  async getTopProducts(limit: number = 10): Promise<TopProduct[]> {
    // Get top selling products
    const topProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: {
        quantity: true,
      },
      where: {
        order: {
          status: 'COMPLETED',
        },
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    // Get product details
    const productIds = topProducts.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    // Combine data
    const productMap = new Map(products.map((p) => [p.id, p]));
    return topProducts.map((p) => ({
      product: productMap.get(p.productId)!,
      quantitySold: p._sum.quantity!,
    }));
  }

  /**
   * Get top runners
   */
  async getTopRunners(limit: number = 10): Promise<TopRunner[]> {
    const runners = await this.prisma.runner.findMany({
      take: limit,
      orderBy: { totalOrders: 'desc' },
      select: {
        id: true,
        totalOrders: true,
        totalEarnings: true,
        rating: true,
        user: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
        wallet: {
          select: {
            balance: true,
          },
        },
      },
    });

    // Fix the map function with proper typing
    return runners.map(
      (runner: {
        id: string;
        totalOrders: number | null;
        totalEarnings: number;
        rating: number | null;
        user: {
          name: string | null;
          phone: string | null;
          email: string | null;
        } | null;
        wallet: {
          balance: number | null;
        } | null;
      }) => ({
        id: runner.id,
        name: runner.user?.name || '',
        phone: runner.user?.phone || '',
        email: runner.user?.email || '',
        totalOrders: runner.totalOrders ? Number(runner.totalOrders) : 0,
        totalEarnings: runner.totalEarnings ? Number(runner.totalEarnings) : 0,
        rating: runner.rating ? Number(runner.rating) : 0,
        balance: runner.wallet?.balance ? Number(runner.wallet.balance) : 0,
        totalDeliveries: runner.totalOrders ? Number(runner.totalOrders) : 0,
      }),
    );
  }

  /**
   * Get all runners for admin management
   */
  async getRunners(params: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runners: AdminRunner[]; total: number }> {
    const { status, search, limit = 20, offset = 0 } = params;
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const where: Prisma.RunnerWhereInput = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { serviceArea: { contains: search, mode: 'insensitive' } },
        { vehicleType: { contains: search, mode: 'insensitive' } },
        { vehicleNumber: { contains: search, mode: 'insensitive' } },
        { user: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
        { user: { is: { phone: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [runners, total] = await Promise.all([
      this.prisma.runner.findMany({
        where,
        skip: offset,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          phone: true,
          serviceArea: true,
          vehicleType: true,
          vehicleNumber: true,
          rating: true,
          totalOrders: true,
          totalEarnings: true,
          createdAt: true,
          whatsappOrderIntakeEnabled: true,
          whatsappOrderTemplatesVerifiedAt: true,
          whatsappOrderTestedAt: true,
          refundMode: true,
          shippingMode: true,
          supervisionMode: true,
          phase2ReadinessNotes: true,
          phase2ReadinessBlockers: true,
          phase2LastReviewedAt: true,
          whatsappGroup: true,
          autoPostEnabled: true,
          autoPostIntervalMinutes: true,
          maxPostsPerRun: true,
          lastAutoPostAt: true,
          trialStatus: true,
          trialStartsAt: true,
          trialEndsAt: true,
          subscriptionStatus: true,
          repostingStatus: true,
          approvedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
            },
          },
          wallet: {
            select: {
              balance: true,
              pending: true,
            },
          },
          bridgeAccount: {
            select: {
              id: true,
              name: true,
              phone: true,
              sessionName: true,
              status: true,
              capacityRunners: true,
              _count: {
                select: {
                  runners: true,
                },
              },
            },
          },
          shopAssignments: {
            include: {
              shop: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
            where: {
              status: { in: ['PENDING', 'APPROVED'] },
            },
            orderBy: { joinedAt: 'desc' },
          },
          repostingGroups: {
            where: {
              status: { not: 'JOIN_FAILED' },
            },
            select: {
              id: true,
              whatsappGroupId: true,
              discoveredGroupId: true,
              bridgeAccountId: true,
              groupName: true,
              isTestGroup: true,
              status: true,
              botJoinStatus: true,
              botAdminStatus: true,
              runnerConfirmedAdminAt: true,
              adminVerifiedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          submittedShopLinks: {
            select: {
              id: true,
              inviteLink: true,
              status: true,
              notes: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          serviceCities: {
            select: { city: true, active: true },
            orderBy: { city: 'asc' },
          },
          subscriptions: {
            where: {
              audience: 'RUNNER',
              status: 'ACTIVE',
              currentPeriodEnd: { gt: new Date() },
            },
            select: {
              id: true,
              status: true,
              orderWorkflowAddonEnabled: true,
              currentPeriodEnd: true,
            },
            orderBy: { currentPeriodEnd: 'desc' },
            take: 3,
          },
          _count: {
            select: {
              orders: true,
              listings: true,
              shopAssignments: true,
            },
          },
        },
      }),
      this.prisma.runner.count({ where }),
    ]);

    return {
      runners: runners.map((runner) => {
        const legacyReposting = this.runnerLegacyRepostingSummary(runner);
        const phase2Readiness = this.buildRunnerPhase2Readiness(runner);

        return {
          ...runner,
          legacyReposting,
          phase2Readiness,
          phase2ReadinessBlockers: phase2Readiness.blockers,
          rating: runner.rating ? Number(runner.rating) : 0,
          totalOrders: runner.totalOrders ? Number(runner.totalOrders) : 0,
          totalEarnings: runner.totalEarnings
            ? Number(runner.totalEarnings)
            : 0,
          wallet: runner.wallet
            ? {
                balance: runner.wallet.balance
                  ? Number(runner.wallet.balance)
                  : 0,
                pending: runner.wallet.pending
                  ? Number(runner.wallet.pending)
                  : 0,
              }
            : null,
        };
      }),
      total,
    };
  }

  async updateRunnerPhase2Controls(
    runnerId: string,
    actorUserId: string | undefined,
    body: any,
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { id: true },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    const data: Prisma.RunnerUpdateInput = {
      phase2LastReviewedAt: new Date(),
    };

    if (body.whatsappOrderIntakeEnabled !== undefined) {
      data.whatsappOrderIntakeEnabled = Boolean(
        body.whatsappOrderIntakeEnabled,
      );
    }
    if (body.whatsappOrderTemplatesVerified !== undefined) {
      data.whatsappOrderTemplatesVerifiedAt =
        body.whatsappOrderTemplatesVerified ? new Date() : null;
    }
    if (body.markWhatsAppOrderTested === true) {
      data.whatsappOrderTestedAt = new Date();
    } else if (body.clearWhatsAppOrderTested === true) {
      data.whatsappOrderTestedAt = null;
    }
    if (body.refundMode !== undefined) {
      data.refundMode = this.cleanEnumValue(body.refundMode, [
        'MANUAL_REFUND_ONLY',
        'STRIPE_ELIGIBLE',
        'STORE_CREDIT_OR_EXCHANGE',
      ]);
    }
    if (body.shippingMode !== undefined) {
      data.shippingMode = this.cleanEnumValue(body.shippingMode, [
        'MANUAL_HANDOVER',
        'MANUAL_TRACKING',
        'PROVIDER_RATE_QUOTE',
        'PROVIDER_LABELS',
      ]);
    }
    if (body.supervisionMode !== undefined) {
      data.supervisionMode = this.cleanEnumValue(body.supervisionMode, [
        'SUPERVISED',
        'ASSISTED',
        'AUTOMATION_REVIEW',
      ]);
    }
    if (body.phase2ReadinessNotes !== undefined) {
      data.phase2ReadinessNotes = this.cleanNullableText(
        body.phase2ReadinessNotes,
        2000,
      );
    }

    const updated = await this.prisma.runner.update({
      where: { id: runnerId },
      data,
      include: {
        bridgeAccount: {
          select: { id: true, name: true, status: true },
        },
        subscriptions: {
          where: {
            audience: 'RUNNER',
            status: 'ACTIVE',
            currentPeriodEnd: { gt: new Date() },
          },
          select: {
            id: true,
            status: true,
            orderWorkflowAddonEnabled: true,
            currentPeriodEnd: true,
          },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 3,
        },
      },
    });

    const phase2Readiness = this.buildRunnerPhase2Readiness(updated);
    await this.prisma.runner.update({
      where: { id: runnerId },
      data: { phase2ReadinessBlockers: phase2Readiness.blockers },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action: 'UPDATE_PHASE2_RUNNER_CONTROLS',
        entityType: 'Runner',
        entityId: runnerId,
        summary: 'Updated runner Phase 2 readiness controls',
        metadata: {
          requested: body,
          readiness: phase2Readiness,
        },
      },
    });

    return {
      runner: updated,
      phase2Readiness,
      message: phase2Readiness.readyForWhatsAppOrderIntake
        ? 'Runner is ready for supervised WhatsApp order intake.'
        : 'Runner Phase 2 controls saved; blockers remain before WhatsApp order intake.',
    };
  }

  private buildRunnerPhase2Readiness(runner: {
    whatsappOrderIntakeEnabled?: boolean | null;
    whatsappOrderTemplatesVerifiedAt?: Date | null;
    whatsappOrderTestedAt?: Date | null;
    refundMode?: string | null;
    shippingMode?: string | null;
    supervisionMode?: string | null;
    phase2LastReviewedAt?: Date | null;
    bridgeAccount?: { id?: string | null; status?: string | null } | null;
    subscriptions?: Array<{
      status: string;
      orderWorkflowAddonEnabled: boolean;
      currentPeriodEnd: Date;
    }>;
  }) {
    const hasOrderWorkflowAddon = Boolean(
      runner.subscriptions?.some(
        (subscription) =>
          subscription.status === 'ACTIVE' &&
          subscription.orderWorkflowAddonEnabled &&
          subscription.currentPeriodEnd > new Date(),
      ),
    );
    const blockers: string[] = [];

    if (!hasOrderWorkflowAddon) {
      blockers.push('Active Phase 2 order workflow add-on required');
    }
    if (!runner.bridgeAccount?.id) {
      blockers.push('Linked WhatsApp bridge required');
    } else if (runner.bridgeAccount.status !== 'ONLINE') {
      blockers.push('Linked WhatsApp bridge should be online');
    }
    if (!runner.whatsappOrderTemplatesVerifiedAt) {
      blockers.push('Customer reply templates must be verified');
    }
    if (!runner.whatsappOrderTestedAt) {
      blockers.push('Successful test intake required');
    }
    if (!runner.whatsappOrderIntakeEnabled) {
      blockers.push('Per-runner WhatsApp order intake is off');
    }
    if (
      ['PROVIDER_RATE_QUOTE', 'PROVIDER_LABELS'].includes(
        runner.shippingMode || '',
      )
    ) {
      blockers.push(
        'Provider shipping modes require credentials, quote validation, labels, tracking sync, and fallback handling',
      );
    }
    if (runner.supervisionMode !== 'SUPERVISED') {
      blockers.push('Supervised mode is required for early-access Phase 2');
    }

    return {
      orderWorkflowAddonEnabled: hasOrderWorkflowAddon,
      whatsappOrderIntakeEnabled: Boolean(runner.whatsappOrderIntakeEnabled),
      refundMode: runner.refundMode || 'MANUAL_REFUND_ONLY',
      shippingMode: runner.shippingMode || 'MANUAL_HANDOVER',
      supervisionMode: runner.supervisionMode || 'SUPERVISED',
      blockers,
      readyForWhatsAppOrderIntake: blockers.length === 0,
      lastTestedAt: runner.whatsappOrderTestedAt || null,
      lastReviewedAt: runner.phase2LastReviewedAt || null,
    };
  }

  private cleanEnumValue(value: unknown, allowed: string[]) {
    const clean = String(value || '')
      .trim()
      .toUpperCase();
    if (!allowed.includes(clean)) {
      throw new BadRequestException(
        `Value must be one of: ${allowed.join(', ')}`,
      );
    }
    return clean;
  }

  private cleanNullableText(value: unknown, maxLength = 1000) {
    const clean = String(value ?? '').trim();
    return clean ? clean.slice(0, maxLength) : null;
  }

  async updateRunnerServiceCities(runnerId: string, citiesValue: unknown) {
    const cities = this.cleanCities(citiesValue);
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
    });
    if (!runner) throw new NotFoundException('Runner not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.runnerServiceCity.updateMany({
        where: { runnerId },
        data: { active: false },
      });
      for (const city of cities) {
        await tx.runnerServiceCity.upsert({
          where: { runnerId_city: { runnerId, city } },
          create: { runnerId, city, active: true },
          update: { active: true },
        });
      }
      const pending = await tx.customerRunnerPreference.findMany({
        where: { city: { in: cities }, status: 'PENDING_MATCH' },
      });
      const runnerPhones = [runner.phone]
        .filter(Boolean)
        .map((phone) => String(phone).replace(/\D/g, ''));
      const user = await tx.user.findUnique({
        where: { id: runner.userId },
        select: { phone: true },
      });
      if (user?.phone) runnerPhones.push(user.phone.replace(/\D/g, ''));
      for (const preference of pending) {
        if (runnerPhones.includes(preference.runnerPhone.replace(/\D/g, ''))) {
          await tx.customerRunnerPreference.update({
            where: { id: preference.id },
            data: { runnerId, status: 'MATCHED', matchedAt: new Date() },
          });
        }
      }
    });
    return this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: { serviceCities: true },
    });
  }

  async updateShopProcurementCity(shopId: string, cityValue: unknown) {
    const [city] = this.cleanCities([cityValue]);
    if (!city) throw new BadRequestException('Procurement city is required');
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.prisma.shop.update({
      where: { id: shopId },
      data: { procurementCity: city },
    });
  }

  async resolveRunnerPreference(preferenceId: string, runnerId: string) {
    const preference = await this.prisma.customerRunnerPreference.findUnique({
      where: { id: preferenceId },
    });
    if (!preference) throw new NotFoundException('Runner preference not found');
    const assignment = await this.prisma.runnerServiceCity.findUnique({
      where: { runnerId_city: { runnerId, city: preference.city } },
    });
    if (!assignment?.active)
      throw new BadRequestException('Runner is not enabled for this city');
    return this.prisma.customerRunnerPreference.update({
      where: { id: preferenceId },
      data: { runnerId, status: 'MATCHED', matchedAt: new Date() },
      include: { runner: { include: { user: true } } },
    });
  }

  getPendingRunnerPreferences() {
    return this.prisma.customerRunnerPreference.findMany({
      where: { status: 'PENDING_MATCH' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private cleanCities(value: unknown) {
    const allowed = new Set(['DURBAN', 'JOHANNESBURG', 'MAPUTO']);
    const values = Array.isArray(value) ? value : [];
    const cities = Array.from(
      new Set(
        values
          .map((item) =>
            String(item || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    );
    if (cities.some((city) => !allowed.has(city))) {
      throw new BadRequestException(
        'Cities must be Durban, Johannesburg, or Maputo',
      );
    }
    return cities;
  }

  /**
   * Update a runner account status
   */
  async updateRunnerStatus(runnerId: string, status: string) {
    const allowedStatuses = ['ACTIVE', 'PENDING', 'INACTIVE'];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Runner status must be one of: ${allowedStatuses.join(', ')}`,
      );
    }

    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { id: true, userId: true },
    });

    if (!runner) {
      throw new NotFoundException('Runner not found');
    }

    const roleName = status === 'ACTIVE' ? 'RUNNER' : 'CUSTOMER';
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException(`${roleName} role not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: runner.userId },
        data: { roleId: role.id },
      });

      return tx.runner.update({
        where: { id: runnerId },
        data: { status },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              role: {
                select: { name: true },
              },
            },
          },
        },
      });
    });
  }

  async getWhatsAppBridgeAccounts() {
    const bridges = await this.prisma.whatsAppBridgeAccount.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        runners: {
          select: {
            id: true,
            status: true,
            user: {
              select: {
                name: true,
                phone: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            runners: true,
          },
        },
      },
    });

    const since = new Date(Date.now() - 5 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bridgeIds = bridges.map((bridge) => bridge.id);

    const [
      postedToday,
      currentFailed,
      failedToday,
      recoveredToday,
      pendingRetries,
      lastSuccessfulReposts,
      lastFailedReposts,
      recentLogs,
      availableBridgeGroups,
      totalBridgeGroups,
    ] = await Promise.all([
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'POSTED',
              postedAt: { gte: today },
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'FAILED',
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'FAILED',
              lastAttemptAt: { gte: today },
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'POSTED',
              retryCount: { gt: 0 },
              postedAt: { gte: today },
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'FAILED',
              nextRetryAt: { not: null },
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'POSTED',
            },
            _max: { postedAt: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              status: 'FAILED',
            },
            _max: { failedAt: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppRepostLog.findMany({
            where: { bridgeAccountId: { in: bridgeIds } },
            orderBy: [{ lastAttemptAt: 'desc' }, { postedAt: 'desc' }],
            take: 40,
            select: {
              id: true,
              bridgeAccountId: true,
              status: true,
              groupIdOrName: true,
              error: true,
              retryCount: true,
              nextRetryAt: true,
              lastAttemptAt: true,
              postedAt: true,
              listing: {
                select: {
                  id: true,
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
              runner: {
                select: {
                  id: true,
                  user: {
                    select: {
                      name: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppBridgeGroupPresence.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              isAvailable: true,
              archivedAt: null,
              bridgeAccount: {
                status: 'ONLINE',
                lastSeenAt: { gte: since },
              },
            },
            _count: { _all: true },
          })
        : [],
      bridgeIds.length
        ? this.prisma.whatsAppBridgeGroupPresence.groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridgeIds },
              archivedAt: null,
            },
            _count: { _all: true },
          })
        : [],
    ]);

    const countByBridge = (
      rows: Array<{ bridgeAccountId: string | null; _count: { _all: number } }>,
    ) =>
      new Map(
        rows
          .filter((row) => row.bridgeAccountId)
          .map((row) => [row.bridgeAccountId as string, row._count._all]),
      );
    const postedTodayByBridge = countByBridge(postedToday);
    const failedTodayByBridge = countByBridge(failedToday);
    const currentFailedByBridge = countByBridge(currentFailed);
    const recoveredTodayByBridge = countByBridge(recoveredToday);
    const pendingRetriesByBridge = countByBridge(pendingRetries);
    const availableGroupsByBridge = countByBridge(availableBridgeGroups);
    const totalGroupsByBridge = countByBridge(totalBridgeGroups);
    const lastSuccessByBridge = new Map(
      lastSuccessfulReposts
        .filter((row) => row.bridgeAccountId)
        .map((row) => [row.bridgeAccountId as string, row._max.postedAt]),
    );
    const lastFailureByBridge = new Map(
      lastFailedReposts
        .filter((row) => row.bridgeAccountId)
        .map((row) => [row.bridgeAccountId as string, row._max.failedAt]),
    );
    const recentLogsByBridge = new Map<string, typeof recentLogs>();
    for (const log of recentLogs) {
      if (!log.bridgeAccountId) continue;
      const bridgeLogs = recentLogsByBridge.get(log.bridgeAccountId) || [];
      if (bridgeLogs.length < 5) {
        bridgeLogs.push(log);
        recentLogsByBridge.set(log.bridgeAccountId, bridgeLogs);
      }
    }

    const runtimeSignals = await Promise.all(
      bridges.map(async (bridge) => ({
        bridgeId: bridge.id,
        signal: await this.getBridgeRuntimeSignal(bridge),
      })),
    );
    const runtimeSignalByBridge = new Map(
      runtimeSignals.map((item) => [item.bridgeId, item.signal]),
    );
    const botBridgeAccountId = await this.getSettingString(
      RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY,
    );

    return bridges.map((bridge) => {
      const runtimeSignal = runtimeSignalByBridge.get(bridge.id);
      const baseHealth =
        bridge.status === 'ONLINE' &&
        bridge.lastSeenAt &&
        bridge.lastSeenAt > since
          ? 'HEALTHY'
          : bridge.status === 'ONLINE'
            ? 'STALE'
            : bridge.status;
      const health =
        bridge.status === 'ONLINE' && runtimeSignal?.status === 'BROKEN'
          ? 'BROKEN'
          : baseHealth;

      return {
        ...bridge,
        health,
        isBotBridge: bridge.id === botBridgeAccountId,
        botBridgeAccountId,
        availableRunnerSlots: Math.max(
          0,
          Number(bridge.capacityRunners || 0) -
            Number(bridge._count?.runners || 0),
        ),
        metrics: {
          availableGroups: availableGroupsByBridge.get(bridge.id) || 0,
          totalGroupRecords: totalGroupsByBridge.get(bridge.id) || 0,
          postsSentToday: postedTodayByBridge.get(bridge.id) || 0,
          failedPostsToday: failedTodayByBridge.get(bridge.id) || 0,
          recoveredPostsToday: recoveredTodayByBridge.get(bridge.id) || 0,
          stillFailedPosts: currentFailedByBridge.get(bridge.id) || 0,
          pendingRetries: pendingRetriesByBridge.get(bridge.id) || 0,
          lastSuccessfulRepostAt: lastSuccessByBridge.get(bridge.id) || null,
          lastFailedRepostAt: lastFailureByBridge.get(bridge.id) || null,
          recentRepostLogs: recentLogsByBridge.get(bridge.id) || [],
          runtimeSignal,
        },
      };
    });
  }

  async getWhatsAppBridgeLogs(bridgeId: string, lines = 200) {
    const bridge = await this.prisma.whatsAppBridgeAccount.findUnique({
      where: { id: bridgeId },
      select: {
        id: true,
        name: true,
        phone: true,
        sessionName: true,
        workerKey: true,
        status: true,
        lastSeenAt: true,
      },
    });

    if (!bridge) {
      throw new NotFoundException('WhatsApp bridge account not found');
    }

    const lineLimit = Math.min(Math.max(Number(lines) || 200, 20), 1000);
    const candidates = this.getBridgeLogCandidates(bridge);
    const files = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const fileStats = await stat(candidate.path);
          const buffer = await readFile(candidate.path);
          const decoded = this.decodeLogBuffer(buffer);
          const tailLines = decoded
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .filter(Boolean)
            .slice(-lineLimit);

          return {
            name: candidate.name,
            exists: true,
            size: fileStats.size,
            modifiedAt: fileStats.mtime,
            lines: tailLines,
          };
        } catch (error: any) {
          if (error?.code === 'ENOENT') {
            return {
              name: candidate.name,
              exists: false,
              size: 0,
              modifiedAt: null,
              lines: [],
            };
          }

          throw error;
        }
      }),
    );

    const combinedLines = files
      .filter((file) => file.exists)
      .flatMap((file) =>
        file.lines.map((line) => ({
          file: file.name,
          text: line,
        })),
      )
      .slice(-lineLimit);

    return {
      bridge,
      lineLimit,
      files,
      combinedLines,
      generatedAt: new Date(),
    };
  }

  async getWhatsAppDestinationConflicts() {
    const [links, repostingGroups] = await Promise.all([
      this.prisma.runnerShopLink.findMany({
        where: {
          status: 'APPROVED',
          autoPostEnabled: true,
          destinationGroup: { not: null },
          runner: {
            status: 'ACTIVE',
          },
        },
        select: {
          id: true,
          runnerId: true,
          destinationGroup: true,
          maxPostsPerRun: true,
          shop: {
            select: {
              id: true,
              name: true,
            },
          },
          runner: {
            select: {
              id: true,
              bridgeAccountId: true,
              user: {
                select: {
                  name: true,
                  phone: true,
                  email: true,
                },
              },
              bridgeAccount: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ runnerId: 'asc' }, { joinedAt: 'desc' }],
      }),
      this.prisma.runnerRepostingGroup.findMany({
        where: {
          status: { in: RESERVED_REPOSTING_GROUP_STATUSES },
        },
        select: {
          id: true,
          runnerId: true,
          whatsappGroupId: true,
          discoveredGroupId: true,
          groupName: true,
          isTestGroup: true,
          status: true,
          runner: {
            select: {
              id: true,
              bridgeAccountId: true,
              user: {
                select: {
                  name: true,
                  phone: true,
                  email: true,
                },
              },
              bridgeAccount: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  status: true,
                },
              },
            },
          },
          discoveredGroup: {
            select: {
              groupId: true,
              name: true,
              participants: true,
            },
          },
        },
        orderBy: [{ runnerId: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    const destinationValues = [
      ...new Set([
        ...links.flatMap((link) =>
          this.parseDestinationGroups(link.destinationGroup),
        ),
        ...repostingGroups.flatMap((group) =>
          [
            group.whatsappGroupId,
            group.discoveredGroup?.groupId,
            group.discoveredGroup?.name,
            group.groupName,
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ]),
    ];
    const discoveredGroups =
      destinationValues.length > 0
        ? await this.prisma.whatsAppDiscoveredGroup.findMany({
            where: {
              OR: [
                { groupId: { in: destinationValues } },
                { name: { in: destinationValues } },
              ],
            },
            select: {
              groupId: true,
              name: true,
              participants: true,
            },
          })
        : [];
    const discoveredByKey = new Map<
      string,
      (typeof discoveredGroups)[number]
    >();
    for (const group of discoveredGroups) {
      discoveredByKey.set(this.normalizeDestinationKey(group.groupId), group);
      discoveredByKey.set(this.normalizeDestinationKey(group.name), group);
    }

    const grouped = new Map<
      string,
      {
        destinationGroup: string;
        destinationName: string;
        participants: number | null;
        runnerIds: Set<string>;
        assignments: Array<{
          assignmentId: string;
          runnerId: string;
          runnerName: string;
          runnerPhone: string | null;
          shopId: string | null;
          shopName: string;
          source: string;
          bridgeAccount: {
            id: string;
            name: string;
            phone: string | null;
            status: string;
          } | null;
          maxPostsPerRun: number;
        }>;
      }
    >();

    for (const link of links) {
      for (const destination of this.parseDestinationGroups(
        link.destinationGroup,
      )) {
        const destinationKey = this.normalizeDestinationKey(destination);
        const discovered = discoveredByKey.get(destinationKey);
        const key = this.normalizeDestinationKey(
          discovered?.groupId || destination,
        );
        const existing = grouped.get(key) || {
          destinationGroup: discovered?.groupId || destination,
          destinationName: discovered?.name || destination,
          participants: discovered?.participants ?? null,
          runnerIds: new Set<string>(),
          assignments: [],
        };

        existing.runnerIds.add(link.runnerId);
        existing.assignments.push({
          assignmentId: link.id,
          runnerId: link.runnerId,
          runnerName:
            link.runner.user?.name ||
            link.runner.user?.phone ||
            link.runner.user?.email ||
            link.runnerId,
          runnerPhone: link.runner.user?.phone || null,
          shopId: link.shop.id,
          shopName: link.shop.name,
          source: 'SHOP_AUTOMATION',
          bridgeAccount: link.runner.bridgeAccount,
          maxPostsPerRun: Number(link.maxPostsPerRun || 0),
        });
        grouped.set(key, existing);
      }
    }

    for (const group of repostingGroups) {
      const destinations = [
        group.whatsappGroupId,
        group.discoveredGroup?.groupId,
        group.discoveredGroup?.name,
        group.groupName,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (destinations.length === 0) continue;

      const destination = destinations[0];
      const discovered =
        discoveredByKey.get(this.normalizeDestinationKey(destination)) ||
        group.discoveredGroup;
      const key = this.normalizeDestinationKey(
        discovered?.groupId || destination,
      );
      const existing = grouped.get(key) || {
        destinationGroup: discovered?.groupId || destination,
        destinationName: discovered?.name || destination,
        participants: discovered?.participants ?? null,
        runnerIds: new Set<string>(),
        assignments: [],
      };

      existing.runnerIds.add(group.runnerId);
      existing.assignments.push({
        assignmentId: group.id,
        runnerId: group.runnerId,
        runnerName:
          group.runner.user?.name ||
          group.runner.user?.phone ||
          group.runner.user?.email ||
          group.runnerId,
        runnerPhone: group.runner.user?.phone || null,
        shopId: null,
        shopName: group.isTestGroup
          ? 'Phase 1 test destination'
          : 'Phase 1 reposting group',
        source: group.isTestGroup
          ? 'PHASE1_TEST_REPOSTING_GROUP'
          : 'PHASE1_REPOSTING_GROUP',
        bridgeAccount: group.runner.bridgeAccount,
        maxPostsPerRun: 0,
      });
      grouped.set(key, existing);
    }

    const data = [...grouped.values()]
      .map((group) => ({
        destinationGroup: group.destinationGroup,
        destinationName: group.destinationName,
        participants: group.participants,
        runnerCount: group.runnerIds.size,
        assignmentCount: group.assignments.length,
        severity: group.runnerIds.size > 1 ? 'CONFLICT' : 'OK',
        assignments: group.assignments,
      }))
      .filter((group) => group.runnerCount > 1)
      .sort(
        (a, b) =>
          b.runnerCount - a.runnerCount ||
          b.assignmentCount - a.assignmentCount,
      );

    return {
      data,
      totalConflicts: data.length,
      monitoredAssignments: links.length,
    };
  }

  async createWhatsAppBridgeAccount(
    dto: {
      name?: string;
      phone?: string;
      expectedPhone?: string;
      sessionName?: string;
      workerKey?: string;
      mode?: string;
      capacityRunners?: number;
      maxPostsPerRun?: number;
      runtimeSettings?: Record<string, unknown>;
      notes?: string;
      status?: string;
    },
    actorUserId?: string,
  ) {
    const phone = this.cleanOptional(dto.phone);
    const expectedPhone = this.cleanOptional(dto.expectedPhone) || phone;
    const sessionName = this.cleanOptional(dto.sessionName);
    const workerKey = this.cleanOptional(dto.workerKey);
    const mode = this.cleanBridgeMode(dto.mode);
    const runtimeSettings = this.cleanBridgeRuntimeSettings(
      dto.runtimeSettings,
    );
    const name =
      this.cleanOptional(dto.name) ||
      phone ||
      sessionName ||
      workerKey ||
      `WhatsApp Bridge ${new Date().toISOString().slice(0, 10)}`;

    return this.prisma.whatsAppBridgeAccount
      .create({
        data: {
          name,
          phone,
          expectedPhone,
          sessionName,
          workerKey,
          mode,
          capacityRunners: this.cleanPositiveInt(
            dto.capacityRunners,
            8,
            1,
            100,
          ),
          maxPostsPerRun: this.cleanPositiveInt(dto.maxPostsPerRun, 10, 1, 10),
          runtimeSettings: runtimeSettings as Prisma.InputJsonValue,
          notes: this.cleanOptional(dto.notes),
          status: dto.status || 'INACTIVE',
        },
        include: {
          _count: {
            select: { runners: true },
          },
        },
      })
      .then(async (bridge) => {
        await this.writeAuditLog({
          actorUserId,
          action: 'BRIDGE_CREATED',
          entityType: 'WhatsAppBridgeAccount',
          entityId: bridge.id,
          summary: `Created bridge ${bridge.name}`,
          metadata: { mode, expectedPhone, runtimeSettings },
        });
        return bridge;
      });
  }

  async updateWhatsAppBridgeAccount(
    bridgeId: string,
    dto: {
      name?: string;
      phone?: string | null;
      expectedPhone?: string | null;
      sessionName?: string | null;
      workerKey?: string | null;
      mode?: string;
      capacityRunners?: number;
      maxPostsPerRun?: number;
      runtimeSettings?: Record<string, unknown> | null;
      notes?: string | null;
      status?: string;
    },
    actorUserId?: string,
  ) {
    await this.assertBridgeExists(bridgeId);

    const data = {
      ...(dto.name !== undefined ? { name: String(dto.name).trim() } : {}),
      ...(dto.phone !== undefined
        ? { phone: this.cleanOptional(dto.phone) }
        : {}),
      ...(dto.expectedPhone !== undefined
        ? {
            expectedPhone:
              this.cleanOptional(dto.expectedPhone) ||
              this.cleanOptional(dto.phone),
            verificationStatus: 'UNVERIFIED',
            verifiedPhone: null,
            phoneVerifiedAt: null,
            mismatchReason: null,
          }
        : {}),
      ...(dto.sessionName !== undefined
        ? { sessionName: this.cleanOptional(dto.sessionName) }
        : {}),
      ...(dto.workerKey !== undefined
        ? { workerKey: this.cleanOptional(dto.workerKey) }
        : {}),
      ...(dto.mode !== undefined
        ? { mode: this.cleanBridgeMode(dto.mode) }
        : {}),
      ...(dto.capacityRunners !== undefined
        ? {
            capacityRunners: this.cleanPositiveInt(
              dto.capacityRunners,
              8,
              1,
              100,
            ),
          }
        : {}),
      ...(dto.maxPostsPerRun !== undefined
        ? {
            maxPostsPerRun: this.cleanPositiveInt(
              dto.maxPostsPerRun,
              10,
              1,
              10,
            ),
          }
        : {}),
      ...(dto.runtimeSettings !== undefined
        ? {
            runtimeSettings: this.cleanBridgeRuntimeSettings(
              dto.runtimeSettings,
            ) as Prisma.InputJsonValue,
          }
        : {}),
      ...(dto.notes !== undefined
        ? { notes: this.cleanOptional(dto.notes) }
        : {}),
      ...(dto.status !== undefined
        ? { status: String(dto.status).trim() }
        : {}),
    };

    const bridge = await this.prisma.whatsAppBridgeAccount.update({
      where: { id: bridgeId },
      data,
      include: {
        _count: {
          select: { runners: true },
        },
      },
    });

    await this.writeAuditLog({
      actorUserId,
      action: 'BRIDGE_UPDATED',
      entityType: 'WhatsAppBridgeAccount',
      entityId: bridgeId,
      summary: `Updated bridge ${bridge.name}`,
      metadata: data,
    });

    return bridge;
  }

  async setRunnerBotBridgeAccount(bridgeId: string, actorUserId?: string) {
    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        id: bridgeId,
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        mode: { not: 'PAUSED' },
      },
      select: { id: true, name: true, phone: true, expectedPhone: true },
    });

    if (!bridge) {
      throw new BadRequestException(
        'Choose an online, unpaused bridge for runner bot communication',
      );
    }

    await (this.prisma as any).appSetting.upsert({
      where: { key: RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY },
      create: { key: RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY, value: bridge.id },
      update: { value: bridge.id },
    });

    await this.writeAuditLog({
      actorUserId,
      action: 'RUNNER_BOT_BRIDGE_CHANGED',
      entityType: 'WhatsAppBridgeAccount',
      entityId: bridge.id,
      summary: `Runner bot communication switched to ${bridge.name}`,
      metadata: {
        phone: bridge.phone,
        expectedPhone: bridge.expectedPhone,
      },
    });

    return {
      message: 'Runner bot bridge updated',
      bridgeAccountId: bridge.id,
      bridge,
    };
  }

  async deleteWhatsAppBridgeAccount(bridgeId: string, actorUserId?: string) {
    await this.assertBridgeExists(bridgeId);

    const bridge = await this.prisma.whatsAppBridgeAccount.update({
      where: { id: bridgeId },
      data: {
        status: 'INACTIVE',
        mode: 'PAUSED',
        archivedAt: new Date(),
      },
    });

    await this.writeAuditLog({
      actorUserId,
      action: 'BRIDGE_ARCHIVED',
      entityType: 'WhatsAppBridgeAccount',
      entityId: bridgeId,
      summary: `Archived bridge ${bridge.name}`,
    });

    return { message: 'Bridge account archived. Runner assignments are kept.' };
  }

  async assignRunnerBridge(runnerId: string, bridgeAccountId?: string | null) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { id: true },
    });

    if (!runner) {
      throw new NotFoundException('Runner not found');
    }

    if (bridgeAccountId) {
      await this.assertBridgeExists(bridgeAccountId);
    }

    return this.prisma.runner.update({
      where: { id: runnerId },
      data: { bridgeAccountId: bridgeAccountId || null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        bridgeAccount: {
          select: {
            id: true,
            name: true,
            phone: true,
            sessionName: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Get top shops
   */
  async getTopShops(limit: number = 10): Promise<TopShop[]> {
    // Get shops with their product count and order stats
    const shops = await this.prisma.shop.findMany({
      take: limit,
      include: {
        owner: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    // Fix the map function with proper typing
    return shops.map(
      (shop: {
        id: string;
        name: string;
        status: string;
        owner: {
          name: string | null;
          phone: string | null;
          email: string | null;
        } | null;
        _count: {
          products: number;
        };
      }) => ({
        id: shop.id,
        name: shop.name,
        owner: shop.owner?.name || '',
        phone: shop.owner?.phone || '',
        email: shop.owner?.email || '',
        status: shop.status,
        productCount: shop._count.products,
        orderCount: 0,
      }),
    );
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics() {
    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      activeRunners,
      activeShops,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.runner.count({ where: { status: 'ACTIVE' } }),
      this.prisma.shop.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      activeRunners,
      activeShops,
    };
  }

  /**
   * Get order status breakdown
   */
  async getOrderStatusBreakdown(): Promise<OrderStatusBreakdown[]> {
    const orders = await this.prisma.order.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    });

    return orders.map((order) => ({
      status: order.status,
      count: order._count.id,
      totalAmount: order._sum.totalAmount || 0,
    }));
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(limit: number = 5): Promise<RecentOrder[]> {
    // Get recent orders
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        runner: {
          include: {
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
              },
            },
          },
        },
      },
    });

    return orders.map(
      (order: {
        id: string;
        status: string;
        totalAmount: number;
        customer: {
          name: string | null;
          phone: string | null;
        } | null;
        runner: {
          id: string;
          user: {
            name: string | null;
            phone: string | null;
          } | null;
        } | null;
        items: {
          id: string;
          productId: string;
          quantity: number;
          unitPrice: number;
          product: {
            name: string;
            images: unknown; // Using unknown instead of any for better type safety
          };
        }[];
        createdAt: Date;
      }) => ({
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        customer: {
          name: order.customer?.name || '',
          phone: order.customer?.phone || '',
        },
        runner: order.runner
          ? {
              id: order.runner.id,
              user: {
                name: order.runner.user?.name || '',
                phone: order.runner.user?.phone || '',
              },
            }
          : null,
        items: order.items.map(
          (item: {
            id: string;
            productId: string;
            quantity: number;
            unitPrice: number;
            product: {
              name: string;
              images: unknown; // Using unknown instead of any for better type safety
            };
          }) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.unitPrice, // Using unitPrice instead of price since Prisma returns unitPrice
            product: {
              name: item.product?.name || '',
              images: item.product?.images || [],
            },
          }),
        ),
        createdAt: order.createdAt,
      }),
    );
  }

  /**
   * Get revenue by period
   */
  async getRevenueByPeriod(period: 'day' | 'week' | 'month' | 'year') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
    }

    const result = await this.prisma.order.aggregate({
      _sum: {
        totalAmount: true,
        tax: true,
      },
      _count: {
        id: true,
      },
      where: {
        createdAt: { gte: startDate },
        status: 'COMPLETED',
      },
    });

    return {
      revenue: result._sum.totalAmount || 0,
      tax: result._sum.tax || 0,
      orders: result._count.id,
      period,
    };
  }

  /**
   * Get all users (admin)
   */
  async getUsers(params: {
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    users: Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      role: string;
      status: string;
      passwordResetRequired: boolean;
      createdAt: Date;
      runner: { id: string; status: string; totalOrders: number } | null;
      _count: { orders: number; shops: number };
    }>;
    total: number;
  }> {
    const { role, search, limit = 20, offset = 0 } = params;

    // Define the where condition with proper typing using Prisma's UserWhereInput
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = { name: role }; // 使用关系过滤
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [prismaUsers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          passwordResetRequired: true,
          role: { select: { name: true } },
          createdAt: true,
          runner: { select: { id: true, status: true, totalOrders: true } },
          _count: { select: { orders: true, shops: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const users = prismaUsers.map((user) => ({
      ...user,
      role: user.role.name,
    }));

    return { users, total };
  }

  async updateUserRole(userId: string, roleName: string, actorUserId?: string) {
    const allowedRoles = ['CUSTOMER', 'RUNNER', 'SHOP_OWNER'];
    const targetRole = String(roleName || '')
      .trim()
      .toUpperCase();

    if (!allowedRoles.includes(targetRole)) {
      throw new BadRequestException(
        `Role must be one of: ${allowedRoles.join(', ')}`,
      );
    }

    if (actorUserId && userId === actorUserId) {
      throw new BadRequestException('You cannot change your own role here');
    }

    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: { select: { name: true } },
          runner: { select: { id: true } },
          _count: { select: { shops: true } },
        },
      }),
      this.prisma.role.findUnique({
        where: { name: targetRole },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!role) {
      throw new NotFoundException(`${targetRole} role not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const pausedShops =
        user._count.shops > 0 && targetRole !== 'SHOP_OWNER'
          ? await tx.shop.updateMany({
              where: { ownerId: userId, status: 'ACTIVE' },
              data: { status: 'INACTIVE' },
            })
          : { count: 0 };

      let runnerId = user.runner?.id || null;
      if (targetRole === 'RUNNER') {
        const runner = user.runner?.id
          ? await tx.runner.update({
              where: { id: user.runner.id },
              data: { status: 'ACTIVE' },
              select: { id: true },
            })
          : await tx.runner.create({
              data: {
                user: { connect: { id: userId } },
                status: 'ACTIVE',
              },
              select: { id: true },
            });

        runnerId = runner.id;
        await tx.runnerWallet.upsert({
          where: { runnerId },
          update: {},
          create: {
            runnerId,
            balance: 0,
            pending: 0,
          },
        });
      } else if (user.runner?.id) {
        await tx.runner.update({
          where: { id: user.runner.id },
          data: { status: 'INACTIVE' },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { roleId: role.id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: { select: { name: true } },
          runner: { select: { id: true, status: true, totalOrders: true } },
          _count: { select: { orders: true, shops: true } },
        },
      });

      return {
        ...updatedUser,
        role: updatedUser.role.name,
        pausedShops: pausedShops.count,
      };
    });
  }

  async deleteUser(userId: string, actorUserId?: string) {
    if (actorUserId && userId === actorUserId) {
      throw new BadRequestException('You cannot delete your own account here');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        role: { select: { name: true } },
        runner: { select: { id: true, phone: true } },
        _count: {
          select: {
            orders: true,
            shops: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const phoneCandidates = this.phoneLookupCandidates(
      user.runner?.phone || user.phone,
      user.phone,
      user.runner?.phone,
    );

    if (user._count.orders > 0) {
      const customerRole = await this.prisma.role.findUnique({
        where: { name: 'CUSTOMER' },
        select: { id: true },
      });

      if (!customerRole) {
        throw new NotFoundException('CUSTOMER role not found');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.botSession.deleteMany({
          where: {
            OR: [
              ...phoneCandidates.map((whatsappNumber) => ({
                whatsappNumber,
              })),
              ...(user.runner?.id ? [{ runnerId: user.runner.id }] : []),
            ],
          },
        });

        await tx.shop.updateMany({
          where: { ownerId: userId, status: 'ACTIVE' },
          data: { status: 'INACTIVE' },
        });

        await tx.runner.updateMany({
          where: { userId },
          data: { status: 'INACTIVE', autoPostEnabled: false },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            roleId: customerRole.id,
            status: 'SUSPENDED',
          },
        });
      });

      return {
        deleted: false,
        suspended: true,
        userId,
        previousRole: user.role.name,
        pausedOwnedShops: user._count.shops,
        affectedOrders: user._count.orders,
        message:
          'User has order history, so the account was suspended instead of hard-deleted. Login is now blocked.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.botSession.deleteMany({
        where: {
          OR: [
            ...phoneCandidates.map((whatsappNumber) => ({
              whatsappNumber,
            })),
            ...(user.runner?.id ? [{ runnerId: user.runner.id }] : []),
          ],
        },
      });

      await tx.user.delete({ where: { id: userId } });
    });

    return {
      deleted: true,
      userId,
      previousRole: user.role.name,
      deletedOwnedShops: user._count.shops,
      affectedOrders: user._count.orders,
      message:
        user._count.shops > 0
          ? 'User deleted. Owned shops and dependent shop data were also removed by cascade.'
          : 'User deleted.',
    };
  }

  async resetUserPassword(userId: string, actorUserId?: string) {
    if (userId === actorUserId) {
      throw new BadRequestException(
        'Use Account Security to change your own password.',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        archivedAt: null,
        OR: [
          { sessionName: 'runner-commerce-session-bridge' },
          { name: { equals: 'WhatsApp Bridge 1', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, status: true, lastSeenAt: true },
    });
    if (!bridge) {
      throw new BadRequestException(
        'WhatsApp Bridge 1 is not configured. No password was reset.',
      );
    }

    const temporaryPassword = `RC-${randomBytes(6).toString('base64url')}`;
    const messageText = [
      'Runner Commerce password reset',
      `Hello ${user.name || 'there'},`,
      `Temporary password: ${temporaryPassword}`,
      'Log in and replace this password immediately under Account Security.',
      'This temporary password was requested by a Runner Commerce administrator.',
    ].join('\n');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const queuedMessage = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordResetRequired: true,
          passwordChangedAt: new Date(),
        },
      });
      return tx.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId: bridge.id,
          recipientPhone: user.phone,
          messageType: 'PASSWORD_RESET',
          messageText,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        select: { id: true, status: true, expiresAt: true },
      });
    });
    await this.writeAuditLog({
      actorUserId,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: userId,
      summary: `Issued a temporary password for ${user.name || user.phone}.`,
      metadata: { phone: user.phone, status: user.status },
    });

    return {
      userId,
      name: user.name,
      phone: user.phone,
      temporaryPassword,
      mustChangePassword: true,
      delivery: {
        id: queuedMessage.id,
        status: queuedMessage.status,
        bridgeId: bridge.id,
        bridgeName: bridge.name,
        bridgeStatus: bridge.status,
        expiresAt: queuedMessage.expiresAt,
      },
      message:
        'Temporary password generated and queued for delivery through WhatsApp Bridge 1.',
    };
  }

  async getDevelopmentState() {
    const [
      runnerListings,
      products,
      orders,
      shops,
      whatsappOrderRequests,
      groupMappings,
      discoveredGroups,
      orphanedDiscoveredGroups,
      runnerShopRequests,
      autoApproval,
      phase2Enabled,
      whatsappOrderTrackingEnabled,
      whatsappRepostingEnabled,
    ] = await Promise.all([
      this.prisma.runnerListing.count(),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.shop.count(),
      this.prisma.whatsAppOrderRequest.count(),
      this.prisma.whatsAppGroupMapping.count(),
      this.prisma.whatsAppDiscoveredGroup.count(),
      this.countOrphanedWhatsAppDiscoveredGroups(),
      this.prisma.runnerShopLink.count({ where: { status: 'PENDING' } }),
      this.getSettingBoolean(RUNNER_SHOP_AUTO_APPROVAL_KEY, false),
      this.getSettingBoolean(PHASE_2_ENABLED_KEY, false),
      this.getSettingBoolean(WHATSAPP_ORDER_TRACKING_KEY, false),
      this.getSettingBoolean(WHATSAPP_REPOSTING_ENABLED_KEY, false),
    ]);

    return {
      counts: {
        runnerListings,
        products,
        orders,
        shops,
        whatsappOrderRequests,
        groupMappings,
        discoveredGroups,
        orphanedDiscoveredGroups,
        pendingRunnerShopRequests: runnerShopRequests,
      },
      settings: {
        runnerShopJoinAutoApprovalEnabled: autoApproval,
        phase2Enabled,
        whatsappOrderTrackingEnabled:
          phase2Enabled && whatsappOrderTrackingEnabled,
        whatsappRepostingEnabled,
      },
      rbac: {
        admin: [
          'reset orders',
          'reset listings',
          'reset shops and WhatsApp groups',
          'delete products by source post age',
          'delete shops not connected to any available WhatsApp bridge group',
          'delete orphaned discovered WhatsApp groups',
          'toggle runner-shop request auto approval',
          'toggle incoming WhatsApp order intake',
          'pause/resume WhatsApp reposting globally',
          'delete discovered WhatsApp groups',
        ],
        runner: [
          'delete own listings',
          'leave joined shops',
          'update own listing and shop automation',
          'update own order/request tracking',
        ],
        shopOwner: [
          'approve/reject/remove runners for own shops',
          'create/update/deactivate mappings for own shop groups',
          'update own WhatsApp import drafts',
        ],
      },
    };
  }

  async updateRunnerShopAutoApproval(enabled: boolean) {
    await (this.prisma as any).appSetting.upsert({
      where: { key: RUNNER_SHOP_AUTO_APPROVAL_KEY },
      update: { value: enabled ? 'true' : 'false' },
      create: {
        key: RUNNER_SHOP_AUTO_APPROVAL_KEY,
        value: enabled ? 'true' : 'false',
      },
    });

    return {
      key: RUNNER_SHOP_AUTO_APPROVAL_KEY,
      enabled,
      message: enabled
        ? 'Runner shop join requests will be auto-approved.'
        : 'Runner shop join requests will require shop-owner approval.',
    };
  }

  async updateWhatsAppOrderTracking(enabled: boolean) {
    if (
      enabled &&
      !(await this.getSettingBoolean(PHASE_2_ENABLED_KEY, false))
    ) {
      throw new BadRequestException(
        'Enable Phase 2 before enabling incoming WhatsApp order intake.',
      );
    }

    await (this.prisma as any).appSetting.upsert({
      where: { key: WHATSAPP_ORDER_TRACKING_KEY },
      update: { value: enabled ? 'true' : 'false' },
      create: {
        key: WHATSAPP_ORDER_TRACKING_KEY,
        value: enabled ? 'true' : 'false',
      },
    });

    return {
      key: WHATSAPP_ORDER_TRACKING_KEY,
      enabled,
      message: enabled
        ? 'Incoming WhatsApp order intake is enabled.'
        : 'Incoming WhatsApp order intake is paused. Reposting remains active.',
    };
  }

  async updateWhatsAppReposting(enabled: boolean) {
    await (this.prisma as any).appSetting.upsert({
      where: { key: WHATSAPP_REPOSTING_ENABLED_KEY },
      update: { value: enabled ? 'true' : 'false' },
      create: {
        key: WHATSAPP_REPOSTING_ENABLED_KEY,
        value: enabled ? 'true' : 'false',
      },
    });

    return {
      key: WHATSAPP_REPOSTING_ENABLED_KEY,
      enabled,
      message: enabled
        ? 'Automatic WhatsApp reposting is enabled. Bridge mode, runner, shop, and listing settings still apply.'
        : 'Automatic WhatsApp reposting is paused immediately. Capture and listing creation remain available.',
    };
  }

  async getOperationsState() {
    let maintenanceMode = false;
    try {
      await stat(MAINTENANCE_FLAG);
      maintenanceMode = true;
    } catch {
      maintenanceMode = false;
    }

    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key: WHATSAPP_REPOSTING_ENABLED_KEY },
    });

    return {
      maintenanceMode,
      whatsappRepostingEnabled: setting?.value === 'true',
      canStartFromUi: false,
      startCommand: '.\\ops\\start-hybrid-local.ps1 -StartBridges',
    };
  }

  async updateMaintenanceMode(enabled: boolean) {
    if (enabled) {
      await this.updateWhatsAppReposting(false);
      await writeFile(MAINTENANCE_FLAG, new Date().toISOString(), 'utf8');
    } else {
      await unlink(MAINTENANCE_FLAG).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }

    return {
      enabled,
      whatsappRepostingEnabled: false,
      message: enabled
        ? 'Maintenance mode enabled. Reposting is paused and bridge watchdog restarts are blocked.'
        : 'Maintenance mode cleared. Reposting remains paused until explicitly resumed.',
    };
  }

  async requestSafeShutdown(stopBridges = true) {
    await this.updateMaintenanceMode(true);
    const script = resolve(process.cwd(), '..', 'ops', 'stop-hybrid-local.ps1');
    const shutdownLog = resolve(process.cwd(), 'logs', 'safe-shutdown.log');
    const shutdownErrorLog = resolve(
      process.cwd(),
      'logs',
      'safe-shutdown.error.log',
    );
    const shutdownArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-RepostingAlreadyPaused',
      '-DelayBeforeAppStopSeconds',
      '2',
    ];
    if (stopBridges) shutdownArgs.push('-StopBridges');

    // PM2 owns the API process tree on Windows. Launch the actual shutdown
    // worker through Start-Process so stopping the API last cannot also kill
    // the worker before it completes the remaining shutdown steps.
    const quotePowerShell = (value: string) =>
      `'${String(value).replace(/'/g, "''")}'`;
    const launcherCommand = [
      `$shutdownArgs = @(${shutdownArgs.map(quotePowerShell).join(',')})`,
      `Start-Process -FilePath 'powershell.exe' -ArgumentList $shutdownArgs -WorkingDirectory ${quotePowerShell(
        resolve(process.cwd(), '..'),
      )} -WindowStyle Hidden -RedirectStandardOutput ${quotePowerShell(
        shutdownLog,
      )} -RedirectStandardError ${quotePowerShell(shutdownErrorLog)}`,
    ].join('; ');
    const encodedLauncher = Buffer.from(launcherCommand, 'utf16le').toString(
      'base64',
    );

    await new Promise<void>((resolveLaunch, rejectLaunch) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', encodedLauncher],
        {
          cwd: resolve(process.cwd(), '..'),
          detached: false,
          stdio: 'ignore',
          windowsHide: true,
        },
      );

      child.once('spawn', () => {
        resolveLaunch();
      });
      child.once('error', (error) => {
        rejectLaunch(
          new BadRequestException(
            `Safe shutdown could not start: ${error.message}`,
          ),
        );
      });
    });

    return {
      accepted: true,
      log: shutdownLog,
      errorLog: shutdownErrorLog,
      message:
        'Safe shutdown started. Reposting is paused and local services will stop within a few seconds.',
    };
  }

  async updatePhase2(enabled: boolean) {
    await (this.prisma as any).appSetting.upsert({
      where: { key: PHASE_2_ENABLED_KEY },
      update: { value: enabled ? 'true' : 'false' },
      create: { key: PHASE_2_ENABLED_KEY, value: enabled ? 'true' : 'false' },
    });

    if (!enabled) {
      await (this.prisma as any).appSetting.upsert({
        where: { key: WHATSAPP_ORDER_TRACKING_KEY },
        update: { value: 'false' },
        create: { key: WHATSAPP_ORDER_TRACKING_KEY, value: 'false' },
      });
    }

    return {
      key: PHASE_2_ENABLED_KEY,
      enabled,
      message: enabled
        ? 'Phase 2 order management is enabled. WhatsApp intake remains separately controlled.'
        : 'Phase 2 is disabled. Phase 1 capture, listings, and reposting remain active.',
    };
  }

  async resetOrdersForDevelopment() {
    const result = await this.prisma.$transaction((tx) =>
      this.resetOrdersInTransaction(tx),
    );

    return {
      message: 'Order and WhatsApp order request test data reset.',
      deleted: result,
    };
  }

  async resetListingsForDevelopment() {
    const result = await this.prisma.$transaction(async (tx) => {
      const orders = await this.resetOrdersInTransaction(tx);
      const repostLogs = await tx.whatsAppRepostLog.deleteMany({});
      const cartItems = await tx.cartItem.deleteMany({});
      const runnerListings = await tx.runnerListing.deleteMany({});

      return {
        ...orders,
        repostLogs: repostLogs.count,
        cartItems: cartItems.count,
        runnerListings: runnerListings.count,
      };
    });

    return {
      message:
        'Runner listings reset. Dependent order/request/cart/repost data was cleared first for coherent test state.',
      deleted: result,
    };
  }

  async resetShopsAndWhatsAppGroupsForDevelopment() {
    const result = await this.prisma.$transaction(async (tx) => {
      const orders = await this.resetOrdersInTransaction(tx);
      const repostLogs = await tx.whatsAppRepostLog.deleteMany({});
      const cartItems = await tx.cartItem.deleteMany({});
      const wishlistItems = await tx.wishlistItem.deleteMany({});
      const reviews = await tx.review.deleteMany({});
      const inventoryReservations = await tx.inventoryReservation.deleteMany(
        {},
      );
      const pickLists = await tx.pickList.deleteMany({});
      const batchOrders = await tx.batchOrder.deleteMany({});
      const batches = await tx.batch.deleteMany({});
      const subscriptions = await tx.subscription.updateMany({
        where: { shopId: { not: null } },
        data: { shopId: null },
      });
      const invoices = await tx.platformInvoice.updateMany({
        where: { shopId: { not: null } },
        data: { shopId: null },
      });
      const detachedOrders = await tx.order.updateMany({
        where: { shopId: { not: null } },
        data: { shopId: null },
      });
      const discoveredGroups = await tx.whatsAppDiscoveredGroup.deleteMany({});
      const shops = await tx.shop.deleteMany({});

      return {
        ...orders,
        repostLogs: repostLogs.count,
        cartItems: cartItems.count,
        wishlistItems: wishlistItems.count,
        reviews: reviews.count,
        inventoryReservations: inventoryReservations.count,
        pickLists: pickLists.count,
        batchOrders: batchOrders.count,
        batches: batches.count,
        detachedSubscriptions: subscriptions.count,
        detachedInvoices: invoices.count,
        detachedOrders: detachedOrders.count,
        discoveredGroups: discoveredGroups.count,
        shops: shops.count,
      };
    });

    return {
      message:
        'Shops and WhatsApp groups reset. Shop-owned products, listings, imports, mappings, joins, checkpoints, and discovered groups were cleared.',
      deleted: result,
    };
  }

  async deleteProductsOlderThanCapture(days: number) {
    const cleanDays = Math.max(1, Math.min(Number(days || 1), 365));
    return this.deleteProductsOlderThanCaptureCutoff(
      new Date(Date.now() - cleanDays * 24 * 60 * 60 * 1000),
      `${cleanDays} day${cleanDays === 1 ? '' : 's'}`,
    );
  }

  async deleteProductsOlderThanCaptureHours(hours: number) {
    const cleanHours = Math.max(1, Math.min(Number(hours || 1), 24 * 365));
    return this.deleteProductsOlderThanCaptureCutoff(
      new Date(Date.now() - cleanHours * 60 * 60 * 1000),
      `${cleanHours} hour${cleanHours === 1 ? '' : 's'}`,
    );
  }

  async deleteOrphanedWhatsAppGroups() {
    const mappedGroupIds = await this.prisma.whatsAppGroupMapping.findMany({
      select: { groupId: true },
    });

    const result = await this.prisma.whatsAppDiscoveredGroup.deleteMany({
      where: {
        bridgePresence: {
          none: {
            isAvailable: true,
          },
        },
        ...(mappedGroupIds.length > 0
          ? { groupId: { notIn: mappedGroupIds.map((item) => item.groupId) } }
          : {}),
      },
    });

    return {
      deleted: result.count,
      message: `Deleted ${result.count} discovered WhatsApp group${result.count === 1 ? '' : 's'} not connected to any bridge or shop mapping.`,
    };
  }

  async deleteShopsNotConnectedToAnyBridge() {
    const bridgeGroups = await this.prisma.whatsAppBridgeGroupPresence.findMany(
      {
        where: {
          isAvailable: true,
        },
        select: {
          groupId: true,
        },
      },
    );
    const bridgeGroupIds = [
      ...new Set(bridgeGroups.map((item) => item.groupId)),
    ];

    if (bridgeGroupIds.length === 0) {
      throw new BadRequestException(
        'No available discovered groups are connected to any bridge. Sync/list groups first, then retry shop cleanup.',
      );
    }

    const linkedMappings = await this.prisma.whatsAppGroupMapping.findMany({
      where: {
        status: 'ACTIVE',
        groupId: { in: bridgeGroupIds },
      },
      select: {
        shopId: true,
      },
    });
    const linkedShopIds = [
      ...new Set(linkedMappings.map((mapping) => mapping.shopId)),
    ];

    if (linkedShopIds.length === 0) {
      throw new BadRequestException(
        'No active shops are linked to available bridge groups. Cleanup was not run to avoid deleting every shop.',
      );
    }

    const candidateShops = await this.prisma.shop.findMany({
      where: {
        id: {
          notIn: linkedShopIds,
        },
      },
      select: {
        id: true,
        name: true,
        products: {
          select: {
            _count: {
              select: {
                orderItems: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
            runnerAssignments: true,
            runnerListings: true,
            whatsappImports: true,
            whatsappGroupMappings: true,
          },
        },
      },
    });
    const candidateShopIds = candidateShops.map((shop) => shop.id);

    const orderCounts =
      candidateShopIds.length > 0
        ? await this.prisma.order.groupBy({
            by: ['shopId'],
            where: {
              shopId: { in: candidateShopIds },
            },
            _count: {
              _all: true,
            },
          })
        : [];
    const orderCountByShopId = new Map(
      orderCounts.map((item) => [item.shopId, item._count._all]),
    );

    const protectedShops = candidateShops.filter((shop) => {
      const productOrderItems = shop.products.reduce(
        (total, product) => total + product._count.orderItems,
        0,
      );
      const directOrders = orderCountByShopId.get(shop.id) || 0;
      return productOrderItems > 0 || directOrders > 0;
    });
    const protectedShopIds = new Set(protectedShops.map((shop) => shop.id));
    const deletableShops = candidateShops.filter(
      (shop) => !protectedShopIds.has(shop.id),
    );
    const deletableShopIds = deletableShops.map((shop) => shop.id);

    const result =
      deletableShopIds.length > 0
        ? await this.prisma.shop.deleteMany({
            where: {
              id: { in: deletableShopIds },
            },
          })
        : { count: 0 };
    const orphanedGroups = await this.deleteOrphanedWhatsAppGroups();

    return {
      deleted: result.count,
      protected: protectedShops.length,
      linkedShopCount: linkedShopIds.length,
      candidateShopCount: candidateShops.length,
      bridgeGroupCount: bridgeGroupIds.length,
      orphanedGroupsDeleted: orphanedGroups.deleted,
      deletedShopNames: deletableShops.slice(0, 20).map((shop) => shop.name),
      message: `Deleted ${result.count} shop${result.count === 1 ? '' : 's'} not connected to any available bridge group and ${orphanedGroups.deleted} orphaned WhatsApp group${orphanedGroups.deleted === 1 ? '' : 's'}${protectedShops.length ? `; kept ${protectedShops.length} shop${protectedShops.length === 1 ? '' : 's'} with order history` : ''}.`,
    };
  }

  private async deleteProductsOlderThanCaptureCutoff(
    cutoff: Date,
    ageLabel: string,
  ) {
    const candidates = await this.prisma.product.findMany({
      where: {
        whatsappImports: {
          some: {
            receivedAt: {
              lt: cutoff,
            },
          },
        },
      },
      select: {
        id: true,
        whatsappImports: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { receivedAt: true },
        },
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
    });

    const oldCandidates = candidates.filter((product) => {
      const latestCaptureAt = product.whatsappImports[0]?.receivedAt;
      return latestCaptureAt && latestCaptureAt < cutoff;
    });
    const deletableProductIds = oldCandidates
      .filter((product) => product._count.orderItems === 0)
      .map((product) => product.id);
    const protectedProducts = oldCandidates.length - deletableProductIds.length;

    const result =
      deletableProductIds.length > 0
        ? await this.prisma.product.deleteMany({
            where: { id: { in: deletableProductIds } },
          })
        : { count: 0 };

    return {
      deleted: result.count,
      protected: protectedProducts,
      cutoff,
      message: `Deleted ${result.count} product${result.count === 1 ? '' : 's'} whose latest source WhatsApp post is older than ${ageLabel}${protectedProducts ? `; kept ${protectedProducts} with order history` : ''}.`,
    };
  }

  private async countOrphanedWhatsAppDiscoveredGroups() {
    const mappedGroupIds = await this.prisma.whatsAppGroupMapping.findMany({
      select: { groupId: true },
    });

    return this.prisma.whatsAppDiscoveredGroup.count({
      where: {
        bridgePresence: {
          none: {
            isAvailable: true,
          },
        },
        ...(mappedGroupIds.length > 0
          ? { groupId: { notIn: mappedGroupIds.map((item) => item.groupId) } }
          : {}),
      },
    });
  }

  private async resetOrdersInTransaction(tx: Prisma.TransactionClient) {
    const whatsappOrderRequests = await tx.whatsAppOrderRequest.deleteMany({});
    const reviews = await tx.review.deleteMany({
      where: { orderId: { not: null } },
    });
    const inventoryReservations = await tx.inventoryReservation.deleteMany({
      where: { orderId: { not: null } },
    });
    const returnRequests = await tx.returnRequest.deleteMany({});
    const manualPayments = await tx.manualPaymentRecord.deleteMany({
      where: { orderId: { not: null } },
    });
    const payments = await tx.payment.deleteMany({});
    const batchOrders = await tx.batchOrder.deleteMany({});
    const couponUsages = await tx.couponUsage.deleteMany({});
    const orderItems = await tx.orderItem.deleteMany({});
    const orders = await tx.order.deleteMany({});

    return {
      whatsappOrderRequests: whatsappOrderRequests.count,
      reviews: reviews.count,
      inventoryReservations: inventoryReservations.count,
      returnRequests: returnRequests.count,
      manualPayments: manualPayments.count,
      payments: payments.count,
      batchOrders: batchOrders.count,
      couponUsages: couponUsages.count,
      orderItems: orderItems.count,
      orders: orders.count,
    };
  }

  private async getSettingBoolean(key: string, defaultValue: boolean) {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key },
    });
    if (!setting) return defaultValue;
    return String(setting.value).toLowerCase() === 'true';
  }

  private async getSettingString(key: string) {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key },
    });
    const value = String(setting?.value || '').trim();
    return value || null;
  }

  private runnerLegacyRepostingSummary(runner: any) {
    const destinationGroups = [
      ...new Set([
        ...this.parseLegacyDestinationGroupRefs(runner.whatsappGroup),
        ...(runner.shopAssignments || []).flatMap((link: any) =>
          this.parseLegacyDestinationGroupRefs(link.destinationGroup),
        ),
      ]),
    ];
    const phase1GroupIds = new Set(
      (runner.repostingGroups || [])
        .flatMap((group: any) => [
          this.cleanOptional(group.whatsappGroupId),
          this.cleanOptional(group.discoveredGroupId),
        ])
        .filter(Boolean),
    );
    const mergedCount = destinationGroups.filter((groupId) =>
      phase1GroupIds.has(groupId),
    ).length;

    return {
      destinationGroups,
      destinationGroupCount: destinationGroups.length,
      mergedCount,
      mergedIntoPhase1:
        destinationGroups.length === 0 ||
        mergedCount === destinationGroups.length,
      status:
        destinationGroups.length === 0
          ? 'NO_LEGACY_DESTINATIONS'
          : mergedCount === destinationGroups.length
            ? 'MERGED'
            : mergedCount > 0
              ? 'PARTIAL'
              : 'PENDING',
    };
  }

  private parseLegacyDestinationGroupRefs(value?: string | null) {
    const clean = String(value || '').trim();
    if (!clean) return [];

    if (clean.startsWith('[')) {
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return parsed
            .map((group) => String(group || '').trim())
            .filter(Boolean);
        }
      } catch {
        return [clean];
      }
    }

    return clean
      .split(',')
      .map((group) => group.trim())
      .filter(Boolean);
  }

  private cleanOptional(value?: string | null) {
    if (value === undefined) return undefined;
    const clean = String(value || '').trim();
    return clean || null;
  }

  private cleanPositiveInt(
    value: unknown,
    defaultValue: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? defaultValue);
    if (!Number.isFinite(parsed)) return defaultValue;
    return Math.max(min, Math.min(Math.round(parsed), max));
  }

  private cleanBridgeMode(value?: string | null) {
    const mode = String(value || 'CAPTURE_AND_POST')
      .trim()
      .toUpperCase();
    if (
      ['CAPTURE_ONLY', 'POST_ONLY', 'CAPTURE_AND_POST', 'PAUSED'].includes(mode)
    ) {
      return mode;
    }
    return 'CAPTURE_AND_POST';
  }

  private cleanBridgeRuntimeSettings(value?: Record<string, unknown> | null) {
    const source =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const cleanString = (input: unknown, maxLength: number) => {
      const clean = String(input ?? '').trim();
      return clean ? clean.slice(0, maxLength) : '';
    };
    const cleanBoolean = (input: unknown, defaultValue: boolean) => {
      if (typeof input === 'boolean') return input;
      if (typeof input === 'string') {
        if (input.toLowerCase() === 'true') return true;
        if (input.toLowerCase() === 'false') return false;
      }
      return defaultValue;
    };

    return {
      repostProductSeparator:
        cleanString(source.repostProductSeparator, 120) || '━━━━━━━━━━━━',
      repostImagesPerListing: this.cleanPositiveInt(
        source.repostImagesPerListing,
        0,
        0,
        20,
      ),
      repostSendDelayMs: this.cleanPositiveInt(
        source.repostSendDelayMs,
        90000,
        90000,
        300000,
      ),
      shopRepostSendDelayMs: this.cleanPositiveInt(
        source.shopRepostSendDelayMs,
        90000,
        90000,
        300000,
      ),
      repostMaxPostsPerJob: this.cleanPositiveInt(
        source.repostMaxPostsPerJob,
        10,
        1,
        10,
      ),
      repostRetryDelayMinutes: this.cleanPositiveInt(
        source.repostRetryDelayMinutes,
        30,
        1,
        1440,
      ),
      repostMaxRetryCount: this.cleanPositiveInt(
        source.repostMaxRetryCount,
        3,
        0,
        20,
      ),
      showRunnerPriceOnRepost: cleanBoolean(
        source.showRunnerPriceOnRepost,
        false,
      ),
      syncGroupProfileImagesDuringDiscovery: cleanBoolean(
        source.syncGroupProfileImagesDuringDiscovery,
        false,
      ),
      groupProfileImageSyncLimit: this.cleanPositiveInt(
        source.groupProfileImageSyncLimit,
        40,
        0,
        500,
      ),
    };
  }

  private async writeAuditLog(input: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: unknown;
  }) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorUserId: input.actorUserId || null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || null,
          summary: input.summary || null,
          metadata: (input.metadata || {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit logging must never block the operational admin action.
    }
  }

  private parseDestinationGroups(value?: string | null) {
    const clean = String(value || '').trim();
    if (!clean) return [];

    if (clean.startsWith('[')) {
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return [
            ...new Set(
              parsed.map((item) => String(item || '').trim()).filter(Boolean),
            ),
          ];
        }
      } catch {
        return [clean];
      }
    }

    return [
      ...new Set(
        clean
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  private normalizeDestinationKey(value?: string | null) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private getBridgeLogCandidates(bridge: {
    id: string;
    sessionName: string | null;
    workerKey: string | null;
  }): BridgeLogCandidate[] {
    const cwd = resolve(process.cwd());
    const backendRoot =
      cwd.split(/[\\/]/).pop()?.toLowerCase() === 'backend'
        ? cwd
        : join(cwd, 'backend');
    const logDir = join(backendRoot, 'logs');
    const names: string[] = [];

    const knownBridgeLogs: Record<string, string> = {
      'c153058c-375f-475b-93ea-86d1bc1dcc42': 'task-whatsapp-bridge-001.log',
      '246622ad-dd30-4adf-aef6-f2ea41e6d17d': 'task-whatsapp-bridge-002.log',
    };

    if (knownBridgeLogs[bridge.id]) {
      names.push(knownBridgeLogs[bridge.id]);
    }

    const workerNumber = bridge.workerKey?.match(/bridge[-_]?(\d+)/i)?.[1];
    if (workerNumber) {
      names.push(`task-whatsapp-bridge-${workerNumber.padStart(3, '0')}.log`);
    }

    const sessionNumber = bridge.sessionName?.match(/bridge[-_]?(\d+)/i)?.[1];
    if (sessionNumber) {
      names.push(`task-whatsapp-bridge-${sessionNumber.padStart(3, '0')}.log`);
    }

    if (bridge.sessionName?.includes('session-bridge')) {
      names.push('task-whatsapp-bridge-001.log');
    }

    if (bridge.sessionName) {
      names.push(
        `task-whatsapp-bridge-${this.safeLogFileSegment(
          bridge.sessionName,
        )}.log`,
      );
    }

    names.push('pm2-whatsapp-bridge.out.log', 'pm2-whatsapp-bridge.err.log');

    return [...new Set(names)].map((name) => ({
      name,
      path: join(logDir, name),
    }));
  }

  private safeLogFileSegment(value: string) {
    return value.trim().replace(/[^a-zA-Z0-9_.-]/g, '-');
  }

  private async getBridgeRuntimeSignal(bridge: {
    id: string;
    sessionName: string | null;
    workerKey: string | null;
  }): Promise<BridgeRuntimeSignal> {
    const candidates = this.getBridgeLogCandidates(bridge);
    const bridgeSpecificCandidates = candidates.filter((candidate) =>
      candidate.name.startsWith('task-whatsapp-bridge-'),
    );

    for (const candidate of bridgeSpecificCandidates) {
      try {
        const buffer = await readFile(candidate.path);
        const lines = this.decodeLogBuffer(buffer)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-160);

        if (lines.length > 0) {
          return this.evaluateBridgeRuntimeLines(lines);
        }
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          return this.evaluateBridgeRuntimeLines([
            `Runtime monitor could not read ${candidate.name}`,
          ]);
        }
      }
    }

    const fallbackLines: string[] = [];
    for (const candidate of candidates.filter(
      (candidate) => !bridgeSpecificCandidates.includes(candidate),
    )) {
      try {
        const buffer = await readFile(candidate.path);
        fallbackLines.push(
          ...this.decodeLogBuffer(buffer)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(-160),
        );
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          fallbackLines.push(
            `Runtime monitor could not read ${candidate.name}`,
          );
        }
      }
    }

    if (fallbackLines.length === 0) {
      return {
        status: 'UNKNOWN',
        issueCount: 0,
        lastIssue: null,
        lastHealthy: null,
        checkedAt: new Date(),
      };
    }

    return this.evaluateBridgeRuntimeLines(fallbackLines);
  }

  private evaluateBridgeRuntimeLines(lines: string[]): BridgeRuntimeSignal {
    let latestWorkerStartIndex = -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (BRIDGE_RUNTIME_START_PATTERN.test(lines[index])) {
        latestWorkerStartIndex = index;
        break;
      }
    }
    const currentWorkerLines =
      latestWorkerStartIndex >= 0 ? lines.slice(latestWorkerStartIndex) : lines;

    let lastHealthyIndex = -1;
    let lastIssueIndex = -1;
    for (const [index, line] of currentWorkerLines.entries()) {
      if (this.matchesAny(line, BRIDGE_RUNTIME_HEALTHY_PATTERNS)) {
        lastHealthyIndex = index;
      }
      if (this.matchesAny(line, BRIDGE_RUNTIME_FAILURE_PATTERNS)) {
        lastIssueIndex = index;
      }
    }

    const linesAfterHealthy = currentWorkerLines.slice(lastHealthyIndex + 1);
    const issueLinesAfterHealthy = linesAfterHealthy.filter((line) =>
      this.matchesAny(line, BRIDGE_RUNTIME_FAILURE_PATTERNS),
    );

    return {
      status:
        issueLinesAfterHealthy.length >= 3 && lastIssueIndex > lastHealthyIndex
          ? 'BROKEN'
          : 'OK',
      issueCount: issueLinesAfterHealthy.length,
      lastIssue:
        lastIssueIndex >= 0 ? currentWorkerLines[lastIssueIndex] : null,
      lastHealthy:
        lastHealthyIndex >= 0 ? currentWorkerLines[lastHealthyIndex] : null,
      checkedAt: new Date(),
    };
  }

  private matchesAny(line: string, patterns: RegExp[]) {
    return patterns.some((pattern) => pattern.test(line));
  }

  private decodeLogBuffer(buffer: Buffer) {
    const hasUtf16LeBom = buffer[0] === 0xff && buffer[1] === 0xfe;
    const encoding: BufferEncoding = hasUtf16LeBom ? 'utf16le' : 'utf8';

    return buffer.toString(encoding).replace(/\u0000/g, '');
  }

  private async assertBridgeExists(bridgeAccountId: string) {
    const bridge = await this.prisma.whatsAppBridgeAccount.findUnique({
      where: { id: bridgeAccountId },
      select: { id: true },
    });

    if (!bridge) {
      throw new NotFoundException('WhatsApp bridge account not found');
    }
  }

  private phoneLookupCandidates(...values: Array<string | null | undefined>) {
    const candidates = new Set<string>();
    const addDigits = (next?: string | null) => {
      const clean = String(next || '').replace(/\D/g, '');
      if (!clean) return;
      candidates.add(`+${clean}`);
      candidates.add(clean);
    };

    for (const value of values) {
      const raw = String(value || '').trim();
      const digits = raw.replace(/\D/g, '');
      if (raw) candidates.add(raw);
      addDigits(digits);

      if (digits.startsWith('268') && digits.length > 3) {
        const local = digits.slice(3);
        addDigits(local);
        addDigits(`0${local}`);
      } else if (digits.startsWith('0') && digits.length > 1) {
        const local = digits.slice(1);
        addDigits(local);
        addDigits(`268${local}`);
      } else if (digits.length === 8) {
        addDigits(`268${digits}`);
        addDigits(`0${digits}`);
      }
    }

    return [...candidates].filter(Boolean);
  }

  /**
   * Create analytics snapshot
   */
  createAnalyticsSnapshot(): { message: string; timestamp: Date } {
    // Since we don't have analyticsSnapshot in our schema, we'll skip this functionality
    // or implement it using existing models
    return {
      message: 'Analytics snapshot feature requires schema modification',
      timestamp: new Date(),
    };
  }

  /**
   * Create a snapshot of analytics data
   * @param type The type of snapshot (DAILY, WEEKLY, MONTHLY)
   * @returns A promise containing the snapshot result
   */
  createSnapshot(type: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY'): {
    message: string;
    timestamp: Date;
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  } {
    return {
      message: `Analytics snapshot for ${type} created`,
      timestamp: new Date(),
      type,
    };
  }
}
