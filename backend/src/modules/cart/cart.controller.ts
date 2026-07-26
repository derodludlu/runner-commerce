import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { extname, resolve } from 'path';
import { mkdirSync } from 'fs';
import { CartService } from './cart.service';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

const { diskStorage } = require('multer');

const customerReferenceUploadDir = resolve(
  process.env.UPLOAD_PATH || './uploads',
  'customer-reference',
);
mkdirSync(customerReferenceUploadDir, { recursive: true });

function safeUploadName(file: any) {
  const extension = extname(file.originalname || '').toLowerCase() || '.jpg';
  const baseName = String(file.originalname || 'reference')
    .replace(extension, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${extension}`;
}

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current cart' })
  getCart(@Request() req: any) {
    return this.cartService.getOrCreateCart(req.user?.userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  addItem(@Request() req: any, @Body() dto: CreateCartItemDto) {
    return this.cartService.addItem(req.user?.userId, dto);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateItem(
    @Request() req: any,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.user?.userId, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeItem(@Request() req: any, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(req.user?.userId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear cart' })
  clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user?.userId);
  }

  @Post('items/:itemId/reference-images')
  @ApiOperation({ summary: 'Attach customer reference images to a cart item' })
  @UseInterceptors(
    FilesInterceptor('images', 6, {
      storage: diskStorage({
        destination: customerReferenceUploadDir,
        filename: (_req: any, file: any, callback: any) => {
          callback(null, safeUploadName(file));
        },
      }),
      fileFilter: (_req, file, callback) => {
        if (!String(file.mimetype || '').startsWith('image/')) {
          callback(
            new BadRequestException('Only image uploads are supported'),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 8 * 1024 * 1024,
        files: 6,
      },
    }),
  )
  uploadReferenceImages(
    @Request() req: any,
    @Param('itemId') itemId: string,
    @UploadedFiles() files: any[],
  ) {
    const urls = (files || []).map(
      (file) => `/uploads/customer-reference/${file.filename}`,
    );

    if (urls.length === 0) {
      throw new BadRequestException('Attach at least one image');
    }

    return this.cartService.updateItemReferenceImages(
      req.user?.userId,
      itemId,
      urls,
    );
  }

  @Delete('items/:itemId/reference-images')
  @ApiOperation({
    summary: 'Remove customer reference images from a cart item',
  })
  clearReferenceImages(@Request() req: any, @Param('itemId') itemId: string) {
    return this.cartService.updateItemReferenceImages(
      req.user?.userId,
      itemId,
      [],
    );
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Convert cart to order (reserve inventory)' })
  checkout(@Request() req: any) {
    return this.cartService.convertToOrder(req.user?.userId);
  }
}
