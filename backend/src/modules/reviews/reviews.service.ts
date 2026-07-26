// src/modules/reviews/reviews.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new review for a product
   */
  async create(createReviewDto: CreateReviewDto, customerId: string) {
    const { productId, rating, title, comment, verified, orderId } =
      createReviewDto;

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // If verified purchase, verify order exists and belongs to customer
    if (orderId && verified) {
      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          customerId,
        },
      });

      if (!order) {
        throw new ForbiddenException(
          'You can only review products you have ordered',
        );
      }

      // Verify the order contains this product
      const orderHasProduct = await this.prisma.orderItem.findFirst({
        where: {
          orderId,
          productId,
        },
      });

      if (!orderHasProduct) {
        throw new ForbiddenException(
          'This order does not contain the product you are reviewing',
        );
      }
    }

    // Check if customer already reviewed this product
    const existingReview = await this.prisma.review.findFirst({
      where: {
        productId,
        customerId,
        status: 'ACTIVE',
      },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this product');
    }

    // Create the review
    const review = await this.prisma.review.create({
      data: {
        productId,
        customerId,
        orderId: orderId || null,
        rating,
        title,
        comment,
        verified: verified || false,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Update product's average rating
    await this.updateProductRating(productId);

    return review;
  }

  /**
   * Get all reviews for a product
   */
  async findByProduct(productId: string, limit = 10, offset = 0) {
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          productId,
          status: 'ACTIVE',
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.review.count({
        where: {
          productId,
          status: 'ACTIVE',
        },
      }),
    ]);

    return {
      data: reviews,
      total,
      limit,
      offset,
      hasNext: offset + limit < total,
    };
  }

  /**
   * Get average rating for a product
   */
  async getAverageRating(productId: string) {
    const result = await this.prisma.review.aggregate({
      where: {
        productId,
        status: 'ACTIVE',
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      average: result._avg.rating || 0,
      count: result._count.rating,
    };
  }

  /**
   * Update product's average rating in database (for future use)
   */
  private async updateProductRating(productId: string) {
    const stats = await this.getAverageRating(productId);

    // Note: We could store this in Product model for faster queries
    // For now, we calculate on-the-fly
    return stats;
  }

  /**
   * Delete a review (soft delete)
   */
  async delete(reviewId: string, customerId: string, userRole: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Only review author or admin can delete
    if (review.customerId !== customerId && userRole !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: 'HIDDEN' },
    });

    // Update product rating
    await this.updateProductRating(review.productId);

    return { message: 'Review deleted successfully' };
  }
}
