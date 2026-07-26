// src/modules/products/products.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  BadRequestException,
  Param,
  Query,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ImportWhatsAppProductsDto } from './dto/import-whatsapp-products.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post('shops/:shopId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add product to a specific shop (SHOP_OWNER only)' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 403, description: 'Forbidden - not shop owner' })
  @ApiResponse({ status: 404, description: 'Shop not found' })
  create(
    @Param('shopId') shopId: string,
    @Body() createProductDto: CreateProductDto,
    @User() user: any,
  ) {
    return this.productsService.create(createProductDto, user.userId, shopId);
  }

  @Post('shops/:shopId/import/whatsapp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bulk create/update products from WhatsApp product posts',
  })
  importWhatsAppProducts(
    @Param('shopId') shopId: string,
    @Body() dto: ImportWhatsAppProductsDto,
    @User() user: any,
  ) {
    return this.productsService.importWhatsAppProducts(
      shopId,
      user.userId,
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all products (public)' })
  @ApiResponse({ status: 200, description: 'List of products' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'shopId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean, example: true })
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Post('image-search')
  @ApiOperation({
    summary: 'Search captured products by uploading a reference image',
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 8 * 1024 * 1024 },
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
    }),
  )
  imageSearch(
    @UploadedFile() image: { buffer: Buffer; mimetype: string } | undefined,
    @Query('limit') limit?: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.productsService.imageSearch(image, {
      limit: Number(limit || 24),
      shopId,
    });
  }

  @Post('image-search/backfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Backfill product image fingerprints for search' })
  backfillImageSearch(@Query('limit') limit?: string) {
    return this.productsService.backfillImageFingerprints(
      Number(limit || 1000),
    );
  }

  @Get('shops/:shopId/duplicate-candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review duplicate and capture-grouping candidates' })
  duplicateCandidates(@Param('shopId') shopId: string, @User() user: any) {
    return this.productsService.duplicateCandidates(
      shopId,
      user.userId,
      user.role,
    );
  }

  @Post('shops/:shopId/duplicate-candidates/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merge one duplicate product into another' })
  mergeDuplicate(
    @Param('shopId') shopId: string,
    @Body() body: { keepProductId: string; removeProductId: string },
    @User() user: any,
  ) {
    return this.productsService.mergeDuplicateProducts(
      shopId,
      body.keepProductId,
      body.removeProductId,
      user.userId,
      user.role,
    );
  }

  @Post('shops/:shopId/duplicate-candidates/keep-separate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm that two matched products are separate' })
  keepDuplicateSeparate(
    @Param('shopId') shopId: string,
    @Body() body: { leftProductId: string; rightProductId: string },
    @User() user: any,
  ) {
    return this.productsService.keepDuplicateProductsSeparate(
      shopId,
      body.leftProductId,
      body.rightProductId,
      user.userId,
      user.role,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product details (public)' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Get(':id/details')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get product full details (owner/admin only)' })
  @ApiResponse({ status: 200, description: 'Full product details' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  findOneWithDetails(@Param('id') id: string, @User() user: any) {
    return this.productsService.findOneWithDetails(id, user.userId, user.role);
  }

  @Patch('shops/:shopId/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (owner/admin only)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @User() user: any,
  ) {
    return this.productsService.update(
      productId,
      updateProductDto,
      user.userId,
      user.role,
    );
  }

  @Delete('shops/:shopId/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SHOP_OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate product (owner/admin only)' })
  @ApiResponse({ status: 200, description: 'Product deactivated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @User() user: any,
  ) {
    return this.productsService.remove(productId, user.userId, user.role);
  }

  @Get('shops/:shopId')
  @ApiOperation({ summary: 'Get products by shop (public)' })
  @ApiResponse({ status: 200, description: 'Shop products list' })
  findByShop(@Param('shopId') shopId: string) {
    return this.productsService.findByShop(shopId);
  }

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update runner listing markup' })
  @ApiResponse({ status: 200, description: 'Listing updated' })
  updateRunnerListing(
    @Param('id') id: string,
    @Body('markup') markup: number,
    @User() user: any,
  ) {
    return this.productsService.updateRunnerListing(id, user.runnerId, markup);
  }
}
