// src/modules/reviews/reviews.controller.ts

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../common/decorators/user.decorator';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product review' })
  @ApiResponse({ status: 201, description: 'Review created successfully' })
  @ApiResponse({ status: 400, description: 'Already reviewed this product' })
  @ApiResponse({ status: 403, description: 'Cannot verify purchase' })
  create(@Body() createReviewDto: CreateReviewDto, @User() user: any) {
    return this.reviewsService.create(createReviewDto, user.userId);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get all reviews for a product' })
  @ApiResponse({ status: 200, description: 'List of reviews' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  findByProduct(
    @Param('productId') productId: string,
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
  ) {
    return this.reviewsService.findByProduct(
      productId,
      Number(limit),
      Number(offset),
    );
  }

  @Get('product/:productId/average')
  @ApiOperation({ summary: 'Get average rating for a product' })
  @ApiResponse({ status: 200, description: 'Average rating' })
  getAverageRating(@Param('productId') productId: string) {
    return this.reviewsService.getAverageRating(productId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a review' })
  @ApiResponse({ status: 200, description: 'Review deleted' })
  @ApiResponse({ status: 403, description: 'Cannot delete this review' })
  delete(@Param('id') id: string, @User() user: any) {
    return this.reviewsService.delete(id, user.userId, user.role);
  }
}
