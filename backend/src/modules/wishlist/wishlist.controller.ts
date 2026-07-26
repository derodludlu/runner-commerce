import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Wishlist')
@Controller('wishlist')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get user wishlist' })
  getWishlist(@Request() req: any) {
    return this.wishlistService.getOrCreateWishlist(req.user?.userId);
  }

  @Post('items/:productId')
  @ApiOperation({ summary: 'Add item to wishlist' })
  addItem(@Request() req: any, @Param('productId') productId: string) {
    return this.wishlistService.addItem(req.user?.userId, productId);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove item from wishlist' })
  removeItem(@Request() req: any, @Param('productId') productId: string) {
    return this.wishlistService.removeItem(req.user?.userId, productId);
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Check if product is in wishlist' })
  checkItem(@Request() req: any, @Param('productId') productId: string) {
    return this.wishlistService.isInWishlist(req.user?.userId, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear wishlist' })
  clearWishlist(@Request() req: any) {
    return this.wishlistService.clearWishlist(req.user?.userId);
  }

  @Post('move-to-cart/:productId')
  @ApiOperation({ summary: 'Move wishlist item to cart' })
  moveToCart(@Request() req: any, @Param('productId') productId: string) {
    return this.wishlistService.moveToCart(req.user?.userId, productId);
  }
}
