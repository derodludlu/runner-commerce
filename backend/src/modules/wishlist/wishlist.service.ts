import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get or create wishlist for user
   */
  async getOrCreateWishlist(customerId: string) {
    if (!customerId) {
      throw new BadRequestException('Customer ID is required');
    }

    let wishlist = await this.prisma.wishlist.findUnique({
      where: { customerId },
      include: {
        items: {
          include: {
            product: {
              include: {
                shop: true,
                listings: {
                  where: { status: 'ACTIVE' },
                  include: {
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
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: {
          customerId,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  shop: true,
                  listings: {
                    where: { status: 'ACTIVE' },
                    include: {
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
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    return wishlist;
  }

  /**
   * Add item to wishlist
   */
  async addItem(customerId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(customerId);

    // Check if item already exists
    const existing = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (existing) {
      throw new NotFoundException('Item already in wishlist');
    }

    const item = await this.prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId,
      },
      include: {
        product: {
          include: {
            shop: true,
            listings: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        },
      },
    });

    return {
      ...wishlist,
      items: [...wishlist.items, item],
    };
  }

  /**
   * Remove item from wishlist
   */
  async removeItem(customerId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(customerId);

    const item = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in wishlist');
    }

    await this.prisma.wishlistItem.delete({
      where: { id: item.id },
    });

    return {
      ...wishlist,
      items: wishlist.items.filter((i: any) => i.productId !== productId),
    };
  }

  /**
   * Check if product is in wishlist
   */
  async isInWishlist(customerId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(customerId);

    const item = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    return { isInWishlist: !!item };
  }

  /**
   * Clear wishlist
   */
  async clearWishlist(customerId: string) {
    const wishlist = await this.getOrCreateWishlist(customerId);

    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id },
    });

    return {
      ...wishlist,
      items: [],
    };
  }

  /**
   * Move wishlist item to cart
   */
  async moveToCart(customerId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(customerId);

    const item = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
      include: {
        product: {
          include: {
            listings: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in wishlist');
    }

    if (item.product.listings.length === 0) {
      throw new NotFoundException('No active listings for this product');
    }

    const listing = item.product.listings[0];

    // Add to cart
    const cart = await this.prisma.cart.findFirst({
      where: { customerId, status: 'ACTIVE' },
    });

    if (!cart) {
      await this.prisma.cart.create({
        data: {
          customerId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          items: {
            create: {
              listingId: listing.id,
              productId,
              quantity: 1,
            },
          },
        },
      });
    } else {
      const existingCartItem = await this.prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          listingId: listing.id,
        },
      });

      if (existingCartItem) {
        await this.prisma.cartItem.update({
          where: { id: existingCartItem.id },
          data: { quantity: { increment: 1 } },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            listingId: listing.id,
            productId,
            quantity: 1,
          },
        });
      }
    }

    // Remove from wishlist
    await this.prisma.wishlistItem.delete({
      where: { id: item.id },
    });

    return { message: 'Moved to cart successfully' };
  }
}
