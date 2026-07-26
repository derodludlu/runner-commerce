import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const CART_CYCLE_DAYS = Math.max(
  1,
  Number(
    process.env.CART_CYCLE_DAYS || process.env.STORAGE_RETENTION_DAYS || 14,
  ),
);
const CART_EXPIRY_MS = CART_CYCLE_DAYS * 24 * 60 * 60 * 1000;
const TAX_RATE = 0;
const TRANSPORT_FEE_RATE = 0;

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get or create cart for user
   */
  async getOrCreateCart(customerId?: string) {
    if (!customerId) {
      // For guest users, we could use session-based cart
      // For now, return empty cart
      return { items: [], total: 0, itemCount: 0 };
    }

    let cart = await this.prisma.cart.findUnique({
      where: { customerId },
      include: {
        items: {
          include: {
            listing: {
              include: {
                product: { include: { shop: true } },
                runner: { include: { user: true } },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          customerId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
        },
        include: {
          items: {
            include: {
              listing: {
                include: {
                  product: true,
                  runner: true,
                },
              },
            },
          },
        },
      });
    } else if (
      cart.status !== 'ACTIVE' ||
      (cart.expiresAt && cart.expiresAt <= new Date())
    ) {
      const hadItems = cart.items.length > 0;
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await this.clearWhatsAppBasketForCustomer(customerId);
      if (hadItems) {
        await this.notifyCustomerBasketReset(customerId);
      }
      cart = await this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
        },
        include: {
          items: {
            include: {
              listing: {
                include: {
                  product: true,
                  runner: true,
                },
              },
            },
          },
        },
      });
    }

    return {
      id: cart.id,
      items: cart.items,
      total: cart.items.reduce(
        (sum: number, item: any) =>
          sum + (item.listing?.runnerPrice ?? 0) * item.quantity,
        0,
      ),
      itemCount: cart.items.reduce(
        (sum: number, item: any) => sum + item.quantity,
        0,
      ),
      expiresAt: cart.expiresAt,
      cycleNotice:
        'Baskets reset automatically at the start of each shopping cycle. Current cycle length is 14 days.',
    };
  }

  /**
   * Add item to cart
   */
  async addItem(customerId: string, dto: CreateCartItemDto) {
    const { listingId, quantity } = dto;
    const customerImageUrls = this.cleanImageUrls(dto.customerImageUrls);

    // Verify listing exists and is active
    const listing = await this.prisma.runnerListing.findFirst({
      where: { id: listingId, status: 'ACTIVE' },
      include: { product: { include: { shop: true } }, runner: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found or inactive');
    }

    if (listing.runner.status !== 'ACTIVE') {
      throw new BadRequestException('Runner is not active');
    }

    // Get or create cart
    const cart = await this.getOrCreateCart(customerId);
    const cartRecord = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cartRecord) {
      throw new NotFoundException('Cart not found');
    }

    // Check if item already exists in cart
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cartRecord.id,
        listingId,
      },
    });

    if (existingItem) {
      // Update quantity
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
          ...(customerImageUrls.length > 0 ? { customerImageUrls } : {}),
        },
      });
    } else {
      // Add new item
      await this.prisma.cartItem.create({
        data: {
          cartId: cartRecord.id,
          listingId,
          productId: listing.productId,
          quantity,
          customerImageUrls:
            customerImageUrls.length > 0 ? customerImageUrls : undefined,
        },
      });
    }

    await this.syncWhatsAppBasketItemFromCart(customerId, listingId);

    return this.getOrCreateCart(customerId);
  }

  /**
   * Update cart item quantity
   */
  async updateItem(customerId: string, itemId: string, dto: UpdateCartItemDto) {
    const { quantity } = dto;

    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        OR: [{ id: itemId }, { listingId: itemId }],
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    if (quantity <= 0) {
      // Remove item
      await this.prisma.cartItem.delete({ where: { id: cartItem.id } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: cartItem.id },
        data: { quantity },
      });
    }

    await this.syncWhatsAppBasketItemFromCart(customerId, cartItem.listingId);

    return this.getOrCreateCart(customerId);
  }

  /**
   * Remove item from cart
   */
  async removeItem(customerId: string, itemId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        OR: [{ id: itemId }, { listingId: itemId }],
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: cartItem.id } });
    await this.syncWhatsAppBasketItemFromCart(customerId, cartItem.listingId);

    return this.getOrCreateCart(customerId);
  }

  /**
   * Clear cart
   */
  async clearCart(customerId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.clearWhatsAppBasketForCustomer(customerId);

    return this.getOrCreateCart(customerId);
  }

  async updateItemReferenceImages(
    customerId: string,
    itemId: string,
    customerImageUrls: string[],
  ) {
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        OR: [{ id: itemId }, { listingId: itemId }],
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.update({
      where: { id: cartItem.id },
      data: {
        customerImageUrls: this.cleanImageUrls(customerImageUrls),
      },
    });
    await this.syncWhatsAppBasketItemFromCart(customerId, cartItem.listingId);

    return this.getOrCreateCart(customerId);
  }

  /**
   * Convert cart to order (reserve inventory)
   */
  async convertToOrder(customerId: string) {
    const cart = await this.getOrCreateCart(customerId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Verify all items are still available
    for (const item of cart.items) {
      const listing = await this.prisma.runnerListing.findUnique({
        where: { id: item.listing.id },
        include: { product: true },
      });

      if (!listing || listing.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Item "${listing?.product.name}" is no longer available`,
        );
      }

      if (listing.product.stockQty < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${listing.product.name}"`,
        );
      }
    }

    const reservations = [];
    for (const item of cart.items) {
      const reservation = await this.prisma.inventoryReservation.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
        },
      });

      reservations.push(reservation);
    }

    // Mark cart as converted
    const cartRecord = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (cartRecord) {
      await this.prisma.cart.update({
        where: { id: cartRecord.id },
        data: { status: 'CONVERTED' },
      });
    }

    return {
      message: 'Cart ready for checkout',
      items: cart.items,
      total: cart.total,
      reservations: reservations.map((r) => r.id),
    };
  }

  /**
   * Cleanup expired carts
   */
  async cleanupExpiredCarts() {
    const now = new Date();
    const carts = await this.prisma.cart.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      include: {
        items: {
          select: { id: true },
        },
      },
    });
    const customerIdsToNotify = carts
      .filter((cart) => cart.items.length > 0 && cart.customerId)
      .map((cart) => cart.customerId as string);
    const cartIds = carts.map((cart) => cart.id);

    if (cartIds.length > 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: { in: cartIds } },
      });
    }

    // Mark expired carts as abandoned
    await this.prisma.cart.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: { status: 'ABANDONED' },
    });

    await this.prisma.inventoryReservation.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    await Promise.all(
      [...new Set(customerIdsToNotify)].map((customerId) =>
        this.notifyCustomerBasketReset(customerId),
      ),
    );

    return { message: 'Cleanup completed' };
  }

  async reserveInventory(listingId: string, quantity: number) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      include: { product: true },
    });

    if (!listing) {
      throw new NotFoundException(`Listing ${listingId} not found`);
    }

    if (listing.product.stockQty < quantity) {
      throw new BadRequestException(
        `Insufficient stock for listing ${listingId}`,
      );
    }

    const reservation = await this.prisma.inventoryReservation.create({
      data: {
        productId: listing.productId,
        quantity,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
      },
    });

    return {
      success: true,
      listingId,
      quantity,
      reservationId: reservation.id,
    };
  }

  async releaseInventory(listingId: string, quantity: number) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      select: { productId: true },
    });

    if (!listing) {
      throw new NotFoundException(`Listing ${listingId} not found`);
    }

    const released = await this.prisma.inventoryReservation.updateMany({
      where: {
        productId: listing.productId,
        quantity,
        status: 'ACTIVE',
      },
      data: { status: 'RELEASED' },
    });

    return { success: true, listingId, quantity, released: released.count };
  }

  private async syncWhatsAppBasketItemFromCart(
    customerId: string,
    listingId: string,
  ) {
    if (!customerId || !listingId) return;

    const [customer, cartItem, listing] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, phone: true, name: true },
      }),
      this.prisma.cartItem.findFirst({
        where: {
          listingId,
          cart: {
            customerId,
            status: 'ACTIVE',
          },
        },
        select: { quantity: true, customerImageUrls: true },
      }),
      this.prisma.runnerListing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          runnerId: true,
          runnerPrice: true,
          productId: true,
          product: {
            select: {
              id: true,
              basePrice: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (!customer || !listing) return;

    const quantity = cartItem?.quantity ?? 0;
    const cartCustomerImageUrls = this.cleanImageUrls(
      cartItem?.customerImageUrls,
    );

    await this.prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: {
          customerId,
          runnerId: listing.runnerId,
          status: 'WHATSAPP_BASKET',
        },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (quantity <= 0) {
        if (!existingOrder) return;

        await tx.orderItem.deleteMany({
          where: {
            orderId: existingOrder.id,
            listingId,
          },
        });
        await this.refreshWhatsAppBasketOrderTotals(tx, existingOrder.id);
        return;
      }

      const notes = [
        'WhatsApp basket synced from web cart.',
        `Latest web cart item: ${listing.product.name}`,
      ].join('\n\n');
      const shippingAddress = {
        street: 'Synced web cart',
        city: 'To be confirmed',
        state: '',
        zipCode: '',
        country: 'Eswatini',
        source: 'WEB_CART',
        customerName: customer.name,
      };
      const order =
        existingOrder ||
        (await tx.order.create({
          data: {
            customerPhone: customer.phone,
            customerId,
            runnerId: listing.runnerId,
            shopId: null,
            status: 'WHATSAPP_BASKET',
            totalAmount: 0,
            subtotal: 0,
            tax: 0,
            shippingFee: 0,
            shippingAddress,
            fulfillmentMethod: 'TO_BE_CONFIRMED',
            procurementCity: 'TO_BE_CONFIRMED',
            notes,
          },
          include: {
            items: true,
          },
        }));

      const matchingItems = order.items.filter(
        (item) => item.listingId === listingId,
      );
      const primaryItem = matchingItems[0];

      if (primaryItem) {
        await tx.orderItem.update({
          where: { id: primaryItem.id },
          data: {
            quantity,
            unitPrice: listing.runnerPrice,
            shopPrice: listing.product.basePrice,
            commission: listing.runnerPrice - listing.product.basePrice,
            customerImageUrls:
              cartCustomerImageUrls.length > 0
                ? cartCustomerImageUrls
                : undefined,
          },
        });

        const duplicateIds = matchingItems.slice(1).map((item) => item.id);
        if (duplicateIds.length > 0) {
          await tx.orderItem.deleteMany({
            where: { id: { in: duplicateIds } },
          });
        }
      } else {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            listingId,
            productId: listing.productId,
            quantity,
            unitPrice: listing.runnerPrice,
            shopPrice: listing.product.basePrice,
            commission: listing.runnerPrice - listing.product.basePrice,
            customerImageUrls:
              cartCustomerImageUrls.length > 0
                ? cartCustomerImageUrls
                : undefined,
            status: 'REQUESTED',
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          notes,
          updatedAt: new Date(),
        },
      });
      await this.refreshWhatsAppBasketOrderTotals(tx, order.id);
    });
  }

  private async clearWhatsAppBasketForCustomer(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        status: 'WHATSAPP_BASKET',
      },
      select: { id: true },
    });

    if (orders.length === 0) return;

    const orderIds = orders.map((order) => order.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.whatsAppOrderRequest.updateMany({
        where: { orderId: { in: orderIds } },
        data: {
          orderId: null,
          status: 'NEW',
        },
      });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    });
  }

  private async notifyCustomerBasketReset(customerId: string) {
    await this.prisma.notification.create({
      data: {
        userId: customerId,
        title: 'Basket reset for new buying cycle',
        message: `Your basket was reset automatically because Runner Commerce starts a new shopping cycle every ${CART_CYCLE_DAYS} days. Please add or resend items if you still want them.`,
        type: 'CART',
        channel: 'IN_APP',
        status: 'DELIVERED',
        sentAt: new Date(),
        metadata: {
          retentionDays: CART_CYCLE_DAYS,
          reason: 'CART_CYCLE_RESET',
        },
      },
    });
  }

  private async refreshWhatsAppBasketOrderTotals(tx: any, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        quantity: true,
        unitPrice: true,
        shopPrice: true,
      },
    });

    if (items.length === 0) {
      await tx.whatsAppOrderRequest.updateMany({
        where: { orderId },
        data: {
          orderId: null,
          status: 'NEW',
        },
      });
      await tx.order.delete({ where: { id: orderId } });
      return;
    }

    const subtotal = roundMoney(
      items.reduce(
        (total: number, item: any) => total + item.quantity * item.unitPrice,
        0,
      ),
    );
    const shippingFee = roundMoney(
      items.reduce(
        (total: number, item: any) =>
          total + item.quantity * item.shopPrice * TRANSPORT_FEE_RATE,
        0,
      ),
    );

    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        shippingFee,
        tax: roundMoney(subtotal * TAX_RATE),
        totalAmount: roundMoney(subtotal + shippingFee),
        updatedAt: new Date(),
      },
    });
  }

  private cleanImageUrls(value?: unknown) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((url) => String(url || '').trim())
              .filter(
                (url) =>
                  url.startsWith('/uploads/') || url.includes('/uploads/'),
              ),
          ),
        ].slice(0, 6)
      : [];
  }
}
