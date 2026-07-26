import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create coupon (Admin/Shop Owner only)
   */
  async create(dto: CreateCouponDto, userId: string, role: string) {
    if (!['ADMIN', 'SHOP_OWNER'].includes(role)) {
      throw new ForbiddenException(
        'Only admins and shop owners can create coupons',
      );
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        ...dto,
        applicableShops: dto.applicableShops ?? null,
        applicableCategories: dto.applicableCategories ?? null,
      },
    });

    return coupon;
  }

  /**
   * Apply coupon to order
   */
  async applyCoupon(dto: ApplyCouponDto, userId: string) {
    const { code, orderAmount, shopId, category } = dto;

    const coupon = await this.prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        status: 'ACTIVE',
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
    });

    if (!coupon) {
      throw new NotFoundException('Invalid or expired coupon');
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    // Check per-user limit
    if (coupon.perUserLimit) {
      const userUsage = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });

      if (userUsage >= coupon.perUserLimit) {
        throw new BadRequestException(
          'You have reached the usage limit for this coupon',
        );
      }
    }

    // Check minimum order amount
    if (orderAmount < coupon.minOrderAmount) {
      throw new BadRequestException(
        `Minimum order amount is $${coupon.minOrderAmount}`,
      );
    }

    // Check applicable shops
    if (coupon.applicableShops && shopId) {
      const shops = coupon.applicableShops as string[];
      if (!shops.includes(shopId)) {
        throw new BadRequestException('Coupon not valid for this shop');
      }
    }

    // Check applicable categories
    if (coupon.applicableCategories && category) {
      const categories = coupon.applicableCategories as string[];
      if (!categories.includes(category)) {
        throw new BadRequestException('Coupon not valid for this category');
      }
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = (orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.discountValue;
    }

    discount = Math.round(discount * 100) / 100;

    return {
      couponId: coupon.id,
      code: coupon.code,
      discount,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    };
  }

  /**
   * Validate coupon (without applying)
   */
  async validateCoupon(code: string, userId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        status: 'ACTIVE',
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
    });

    if (!coupon) {
      return { valid: false, message: 'Invalid or expired coupon' };
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, message: 'Coupon usage limit reached' };
    }

    if (coupon.perUserLimit) {
      const userUsage = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });

      if (userUsage >= coupon.perUserLimit) {
        return { valid: false, message: 'You have reached the usage limit' };
      }
    }

    return { valid: true, coupon };
  }

  /**
   * Record coupon usage
   */
  async recordUsage(
    couponId: string,
    userId: string,
    orderId: string,
    discount: number,
  ) {
    const [usage] = await this.prisma.$transaction([
      this.prisma.couponUsage.create({
        data: {
          couponId,
          userId,
          orderId,
          discount,
        },
      }),
      this.prisma.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      }),
    ]);

    return usage;
  }

  /**
   * Get all coupons (Admin)
   */
  async findAll() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });
  }

  /**
   * Get coupon by ID
   */
  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        usages: {
          take: 10,
          include: {
            user: { select: { name: true, email: true } },
            order: { select: { id: true, totalAmount: true } },
          },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return coupon;
  }

  /**
   * Update coupon
   */
  async update(id: string, dto: UpdateCouponDto, userId: string, role: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can update coupons');
    }

    return this.prisma.coupon.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Delete coupon
   */
  async delete(id: string, role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can delete coupons');
    }

    await this.prisma.coupon.delete({ where: { id } });
    return { message: 'Coupon deleted successfully' };
  }

  /**
   * Get user's coupon usage history
   */
  async getUserUsage(userId: string) {
    return this.prisma.couponUsage.findMany({
      where: { userId },
      include: {
        coupon: {
          select: {
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
        order: {
          select: {
            id: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
