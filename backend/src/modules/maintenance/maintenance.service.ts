import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { existsSync } from 'fs';
import { rm, unlink } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';

interface RetentionSummary {
  retentionDays: number;
  cutoff: string;
  productsExpired: number;
  listingsExpired: number;
  importsExpired: number;
  cartsReset: number;
  whatsappBasketsReset: number;
  customersNotified: number;
  filesDeleted: number;
  fileDeleteFailures: Array<{ url: string; message: string }>;
}

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private interval?: NodeJS.Timeout;
  private readonly uploadRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.uploadRoot = resolve(
      this.configService.get<string>('UPLOAD_PATH') || './uploads',
    );
  }

  onModuleInit() {
    if (
      this.configService.get<string>('STORAGE_RETENTION_ENABLED') === 'false'
    ) {
      this.logger.log('Storage retention cleanup is disabled');
      return;
    }

    const intervalHours = Math.max(
      1,
      Number(this.configService.get('STORAGE_RETENTION_INTERVAL_HOURS') || 24),
    );

    setTimeout(() => {
      this.runRetentionCleanup().catch((error) =>
        this.logger.error(`Storage retention cleanup failed: ${error.message}`),
      );
    }, 30_000).unref?.();

    this.interval = setInterval(
      () =>
        this.runRetentionCleanup().catch((error) =>
          this.logger.error(
            `Storage retention cleanup failed: ${error.message}`,
          ),
        ),
      intervalHours * 60 * 60 * 1000,
    );
    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  async runRetentionCleanup(retentionDays = this.retentionDays()) {
    const days = Math.max(1, Number(retentionDays || this.retentionDays()));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const summary: RetentionSummary = {
      retentionDays: days,
      cutoff: cutoff.toISOString(),
      productsExpired: 0,
      listingsExpired: 0,
      importsExpired: 0,
      cartsReset: 0,
      whatsappBasketsReset: 0,
      customersNotified: 0,
      filesDeleted: 0,
      fileDeleteFailures: [],
    };

    const productResult = await this.expireOldShopProducts(cutoff);
    summary.productsExpired = productResult.productsExpired;
    summary.listingsExpired = productResult.listingsExpired;
    summary.importsExpired = productResult.importsExpired;
    await this.deleteUploadUrls(productResult.mediaUrls, summary);

    const basketResult = await this.resetOldBaskets(cutoff, days);
    summary.cartsReset = basketResult.cartsReset;
    summary.whatsappBasketsReset = basketResult.whatsappBasketsReset;
    summary.customersNotified = basketResult.customersNotified;
    await this.deleteUploadUrls(basketResult.mediaUrls, summary);

    this.logger.log(
      `Storage retention cleanup complete: products=${summary.productsExpired}, carts=${summary.cartsReset}, files=${summary.filesDeleted}`,
    );

    return summary;
  }

  private retentionDays() {
    return Math.max(
      1,
      Number(
        this.configService.get('STORAGE_RETENTION_DAYS') ||
          this.configService.get('CART_CYCLE_DAYS') ||
          14,
      ),
    );
  }

  private async expireOldShopProducts(cutoff: Date) {
    const imports = await this.prisma.whatsAppImport.findMany({
      where: { receivedAt: { lt: cutoff } },
      select: {
        id: true,
        productId: true,
        mediaUrls: true,
        parsedDraft: true,
        product: {
          select: {
            id: true,
            images: true,
            variants: {
              select: {
                id: true,
                images: true,
              },
            },
          },
        },
      },
    });

    const importIds = imports.map((item) => item.id);
    const productIds = [
      ...new Set(imports.map((item) => item.productId).filter(Boolean)),
    ] as string[];
    const mediaUrls = new Set<string>();

    imports.forEach((item) => {
      this.collectMediaUrls(item.mediaUrls, mediaUrls);
      this.collectMediaUrls((item.parsedDraft as any)?.images, mediaUrls);
      this.collectMediaUrls(item.product?.images, mediaUrls);
      item.product?.variants?.forEach((variant) =>
        this.collectMediaUrls(variant.images, mediaUrls),
      );
    });

    const [listingsExpired, productsExpired] = await this.prisma.$transaction([
      this.prisma.runnerListing.updateMany({
        where: {
          productId: { in: productIds },
          status: 'ACTIVE',
        },
        data: {
          status: 'INACTIVE',
          autoPostApproved: false,
        },
      }),
      this.prisma.product.updateMany({
        where: {
          id: { in: productIds },
          status: 'ACTIVE',
        },
        data: {
          status: 'INACTIVE',
          stockQty: 0,
          images: [],
        },
      }),
      this.prisma.productVariant.updateMany({
        where: { productId: { in: productIds } },
        data: {
          status: 'INACTIVE',
          stockQty: 0,
          images: [],
        },
      }),
      this.prisma.whatsAppImport.updateMany({
        where: { id: { in: importIds } },
        data: {
          status: 'EXPIRED',
          mediaUrls: [],
          parsedDraft: {},
          error:
            'Expired by storage retention cleanup. Product media is removed after the shopping cycle.',
        },
      }),
    ]);

    return {
      productsExpired: productsExpired.count,
      listingsExpired: listingsExpired.count,
      importsExpired: importIds.length,
      mediaUrls: [...mediaUrls],
    };
  }

  private async resetOldBaskets(cutoff: Date, retentionDays: number) {
    const staleCarts = await this.prisma.cart.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ expiresAt: { lt: new Date() } }, { updatedAt: { lt: cutoff } }],
      },
      include: {
        items: {
          select: {
            customerImageUrls: true,
          },
        },
      },
    });
    const staleBasketOrders = await this.prisma.order.findMany({
      where: {
        status: 'WHATSAPP_BASKET',
        updatedAt: { lt: cutoff },
      },
      include: {
        items: {
          select: {
            customerImageUrls: true,
          },
        },
      },
    });

    const cartIds = staleCarts.map((cart) => cart.id);
    const orderIds = staleBasketOrders.map((order) => order.id);
    const customerIds = [
      ...new Set(
        [
          ...staleCarts.map((cart) => cart.customerId),
          ...staleBasketOrders.map((order) => order.customerId),
        ].filter(Boolean),
      ),
    ] as string[];
    const mediaUrls = new Set<string>();

    staleCarts.forEach((cart) =>
      cart.items.forEach((item) =>
        this.collectMediaUrls(item.customerImageUrls, mediaUrls),
      ),
    );
    staleBasketOrders.forEach((order) =>
      order.items.forEach((item) =>
        this.collectMediaUrls(item.customerImageUrls, mediaUrls),
      ),
    );

    const [cartItemsDeleted, cartsReset, orderItemsDeleted, , basketsDeleted] =
      await this.prisma.$transaction([
        this.prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } }),
        this.prisma.cart.updateMany({
          where: { id: { in: cartIds } },
          data: {
            status: 'ABANDONED',
            expiresAt: null,
          },
        }),
        this.prisma.orderItem.deleteMany({
          where: { orderId: { in: orderIds } },
        }),
        this.prisma.whatsAppOrderRequest.updateMany({
          where: { orderId: { in: orderIds } },
          data: {
            orderId: null,
            status: 'CLOSED',
          },
        }),
        this.prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
      ]);

    if (cartItemsDeleted.count || orderItemsDeleted.count) {
      await this.notifyBasketCustomers(customerIds, retentionDays);
    }

    return {
      cartsReset: cartsReset.count,
      whatsappBasketsReset: basketsDeleted.count,
      customersNotified:
        cartItemsDeleted.count || orderItemsDeleted.count
          ? customerIds.length
          : 0,
      mediaUrls: [...mediaUrls],
    };
  }

  private async notifyBasketCustomers(
    customerIds: string[],
    retentionDays: number,
  ) {
    if (customerIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: customerIds.map((userId) => ({
        userId,
        title: 'Basket reset for new buying cycle',
        message: `Your basket was reset automatically because Runner Commerce starts a new shopping cycle every ${retentionDays} days. Please add or resend items if you still want them.`,
        type: 'CART',
        channel: 'IN_APP',
        status: 'DELIVERED',
        sentAt: new Date(),
        metadata: {
          retentionDays,
          reason: 'STORAGE_RETENTION_CYCLE',
        },
      })),
    });
  }

  private collectMediaUrls(value: unknown, urls: Set<string>) {
    if (!Array.isArray(value)) return;

    value
      .map((url) => String(url || '').trim())
      .filter(Boolean)
      .forEach((url) => urls.add(url));
  }

  private async deleteUploadUrls(urls: string[], summary: RetentionSummary) {
    const uniquePaths = [
      ...new Map(
        urls
          .map((url) => [url, this.localUploadPathFromUrl(url)] as const)
          .filter(([, localPath]) => Boolean(localPath)),
      ).entries(),
    ];

    for (const [url, localPath] of uniquePaths) {
      try {
        if (localPath && existsSync(localPath)) {
          await unlink(localPath);
          summary.filesDeleted += 1;
          await this.removeEmptyParentDirs(dirname(localPath));
        }
      } catch (error) {
        summary.fileDeleteFailures.push({
          url,
          message: (error as Error).message,
        });
      }
    }
  }

  private localUploadPathFromUrl(value: string) {
    try {
      const pathname = value.startsWith('/uploads/')
        ? value
        : new URL(value).pathname;

      if (!pathname.startsWith('/uploads/')) return null;

      const relativePath = decodeURIComponent(
        pathname.replace(/^\/uploads\//, ''),
      );
      const target = resolve(this.uploadRoot, relativePath);
      const rel = relative(this.uploadRoot, target);

      if (rel.startsWith('..') || rel === '') return null;

      return target;
    } catch {
      return null;
    }
  }

  private async removeEmptyParentDirs(dir: string) {
    let current = dir;

    while (current.startsWith(this.uploadRoot) && current !== this.uploadRoot) {
      try {
        await rm(current, { recursive: false });
      } catch {
        break;
      }
      current = dirname(current);
    }
  }
}
