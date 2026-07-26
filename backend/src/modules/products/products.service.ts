// src/modules/products/products.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ProductStatus } from './dto/create-product.dto';
import { ImportWhatsAppProductsDto } from './dto/import-whatsapp-products.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private prisma: PrismaService) {}

  async duplicateCandidates(shopId: string, userId: string, userRole: string) {
    await this.assertShopProductManager(shopId, userId, userRole);
    const [products, dismissals] = await Promise.all([
      this.prisma.product.findMany({
        where: { shopId, status: ProductStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          status: true,
          basePrice: true,
          stockQty: true,
          images: true,
          updatedAt: true,
          imageFingerprints: true,
          whatsappImports: {
            orderBy: { receivedAt: 'asc' },
            select: { senderPhone: true, sourceGroup: true, receivedAt: true },
          },
          _count: { select: { listings: true, orderItems: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }),
      this.prisma.productDuplicateReviewDismissal.findMany({
        where: { shopId },
        select: { leftProductId: true, rightProductId: true },
      }),
    ]);
    const dismissedPairs = new Set(
      dismissals.map((item) => `${item.leftProductId}:${item.rightProductId}`),
    );
    const identity = (product: (typeof products)[number]) => {
      const first = product.whatsappImports[0];
      return String(first?.senderPhone || first?.sourceGroup || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    };
    const imageUrls = (value: Prisma.JsonValue) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    const candidates = new Map<string, any>();
    const add = (
      left: (typeof products)[number],
      right: (typeof products)[number],
      reason: string,
      confidence: number,
      distance: number | null,
    ) => {
      if (!identity(left) || identity(left) !== identity(right)) return;
      const [a, b] = [left, right].sort((x, y) => x.id.localeCompare(y.id));
      const key = `${a.id}:${b.id}`;
      if (dismissedPairs.has(key)) return;
      const current = candidates.get(key);
      if (current && current.confidence >= confidence) return;
      const nameSimilarity = this.productNameSimilarity(a.name, b.name);
      candidates.set(key, {
        id: key,
        reason,
        confidence,
        distance,
        nameSimilarity,
        captureGroupingWarning: nameSimilarity < 0.35,
        left: { ...a, images: imageUrls(a.images) },
        right: { ...b, images: imageUrls(b.images) },
      });
    };
    const byUrl = new Map<string, Array<(typeof products)[number]>>();
    for (const product of products) {
      for (const url of imageUrls(product.images)) {
        const list = byUrl.get(url) || [];
        list.push(product);
        byUrl.set(url, list);
      }
    }
    for (const matches of byUrl.values()) {
      for (let i = 0; i < matches.length; i += 1) {
        for (let j = i + 1; j < matches.length; j += 1) {
          add(matches[i], matches[j], 'EXACT_CAPTURED_MEDIA', 1, 0);
        }
      }
    }
    const fingerprints = products.flatMap((product) =>
      product.imageFingerprints.map((fingerprint) => ({
        product,
        ...fingerprint,
      })),
    );
    for (let i = 0; i < fingerprints.length; i += 1) {
      for (let j = i + 1; j < fingerprints.length; j += 1) {
        const left = fingerprints[i];
        const right = fingerprints[j];
        if (left.productId === right.productId) continue;
        const exact = Boolean(left.sha256 && left.sha256 === right.sha256);
        const distance = exact
          ? 0
          : this.hammingHexDistance(left.perceptualHash, right.perceptualHash);
        if (!exact && (distance === null || distance > 6)) continue;
        add(
          left.product,
          right.product,
          exact ? 'EXACT_IMAGE_HASH' : 'PERCEPTUAL_IMAGE_MATCH',
          exact ? 1 : Number((1 - Number(distance) / 32).toFixed(2)),
          distance,
        );
      }
    }
    return {
      data: [...candidates.values()]
        .sort(
          (a, b) =>
            Number(b.captureGroupingWarning) -
              Number(a.captureGroupingWarning) || b.confidence - a.confidence,
        )
        .slice(0, 250),
      total: candidates.size,
      fingerprintedProducts: products.filter(
        (product) => product.imageFingerprints.length > 0,
      ).length,
      activeProducts: products.length,
    };
  }

  async keepDuplicateProductsSeparate(
    shopId: string,
    leftProductId: string,
    rightProductId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertShopProductManager(shopId, userId, userRole);
    if (!leftProductId || !rightProductId || leftProductId === rightProductId) {
      throw new BadRequestException('Choose two different products');
    }
    const [left, right] = [leftProductId, rightProductId].sort();
    const count = await this.prisma.product.count({
      where: { id: { in: [left, right] }, shopId },
    });
    if (count !== 2) {
      throw new NotFoundException('One of the selected products was not found');
    }
    return this.prisma.productDuplicateReviewDismissal.upsert({
      where: {
        shopId_leftProductId_rightProductId: {
          shopId,
          leftProductId: left,
          rightProductId: right,
        },
      },
      update: { reviewedById: userId, reason: 'KEEP_SEPARATE' },
      create: {
        shopId,
        leftProductId: left,
        rightProductId: right,
        reviewedById: userId,
        reason: 'KEEP_SEPARATE',
      },
    });
  }

  async mergeDuplicateProducts(
    shopId: string,
    keepProductId: string,
    removeProductId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertShopProductManager(shopId, userId, userRole);
    if (
      !keepProductId ||
      !removeProductId ||
      keepProductId === removeProductId
    ) {
      throw new BadRequestException('Choose two different products to merge');
    }
    return this.prisma.$transaction(async (tx) => {
      const [keep, remove] = await Promise.all([
        tx.product.findFirst({ where: { id: keepProductId, shopId } }),
        tx.product.findFirst({
          where: { id: removeProductId, shopId, status: ProductStatus.ACTIVE },
          include: { imageFingerprints: true },
        }),
      ]);
      if (!keep || !remove) {
        throw new NotFoundException(
          'One of the selected products was not found',
        );
      }
      const keepImages = this.productImageUrls(keep.images);
      const removeImages = this.productImageUrls(remove.images);
      await tx.product.update({
        where: { id: keep.id },
        data: { images: [...new Set([...keepImages, ...removeImages])] },
      });
      await tx.whatsAppImport.updateMany({
        where: { productId: remove.id },
        data: { productId: keep.id },
      });
      const [sourceListings, targetListings] = await Promise.all([
        tx.runnerListing.findMany({ where: { productId: remove.id } }),
        tx.runnerListing.findMany({
          where: { productId: keep.id },
          select: { runnerId: true },
        }),
      ]);
      const targetRunners = new Set(
        targetListings.map((item) => item.runnerId),
      );
      for (const listing of sourceListings) {
        if (targetRunners.has(listing.runnerId)) {
          await tx.runnerListing.update({
            where: { id: listing.id },
            data: { status: 'ARCHIVED', autoPostApproved: false },
          });
        } else {
          await tx.runnerListing.update({
            where: { id: listing.id },
            data: { productId: keep.id },
          });
          targetRunners.add(listing.runnerId);
        }
      }
      for (const fingerprint of remove.imageFingerprints) {
        await tx.productImageFingerprint.upsert({
          where: {
            productId_imageUrl: {
              productId: keep.id,
              imageUrl: fingerprint.imageUrl,
            },
          },
          update: {
            sha256: fingerprint.sha256,
            perceptualHash: fingerprint.perceptualHash,
            mimetype: fingerprint.mimetype,
            width: fingerprint.width,
            height: fingerprint.height,
          },
          create: {
            productId: keep.id,
            imageUrl: fingerprint.imageUrl,
            imageIndex: fingerprint.imageIndex,
            sha256: fingerprint.sha256,
            perceptualHash: fingerprint.perceptualHash,
            mimetype: fingerprint.mimetype,
            width: fingerprint.width,
            height: fingerprint.height,
          },
        });
      }
      await tx.product.update({
        where: { id: remove.id },
        data: { status: ProductStatus.INACTIVE },
      });
      return {
        action: 'merged',
        keptProductId: keep.id,
        deactivatedProductId: remove.id,
        importsMoved: await tx.whatsAppImport.count({
          where: { productId: keep.id },
        }),
      };
    });
  }

  private async assertShopProductManager(
    shopId: string,
    userId: string,
    userRole: string,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });
    if (!shop) throw new NotFoundException(`Shop ${shopId} not found`);
    if (shop.ownerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'You can only manage your own shop products',
      );
    }
  }

  private productNameSimilarity(left: string, right: string) {
    const tokenize = (value: string) =>
      new Set(
        value
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, ' ')
          .split(/\s+/)
          .filter((token) => token.length > 1),
      );
    const a = tokenize(left);
    const b = tokenize(right);
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter((token) => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
  }

  async findDuplicateByImageUrls(
    imageUrls: string[],
    options: { shopId: string; productIds: string[] },
  ) {
    if (!imageUrls.length || !options.productIds.length) return null;
    await this.ensureProductImageFingerprints({
      shopId: options.shopId,
      maxProducts: 1000,
    });
    const candidates = await this.prisma.productImageFingerprint.findMany({
      where: { productId: { in: options.productIds } },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    let best: {
      productId: string;
      confidence: number;
      reason: string;
      distance: number;
    } | null = null;

    for (const imageUrl of imageUrls) {
      const loaded = await this.loadImageBuffer(imageUrl).catch(() => null);
      if (!loaded?.buffer?.length) continue;
      const incoming = await this.imageFingerprintFromBuffer(
        loaded.buffer,
        loaded.mimetype,
      );
      for (const candidate of candidates) {
        const exact = Boolean(
          incoming.sha256 && candidate.sha256 === incoming.sha256,
        );
        const distance = exact
          ? 0
          : this.hammingHexDistance(
              incoming.perceptualHash,
              candidate.perceptualHash,
            );
        if (!exact && (distance === null || distance > 6)) continue;
        const match = {
          productId: candidate.productId,
          confidence: exact
            ? 1
            : Number(Math.max(0.8, 1 - Number(distance) / 32).toFixed(2)),
          reason: exact
            ? 'EXACT_IMAGE_HASH'
            : `STRICT_PERCEPTUAL_IMAGE_DISTANCE_${distance}`,
          distance: Number(distance),
        };
        if (!best || match.confidence > best.confidence) best = match;
      }
    }
    return best;
  }

  async imageSearch(
    image: { buffer: Buffer; mimetype?: string } | undefined,
    options?: { limit?: number; shopId?: string },
  ) {
    if (!image?.buffer?.length) {
      throw new BadRequestException('Upload one product reference image');
    }

    const fingerprint = await this.imageFingerprintFromBuffer(
      image.buffer,
      image.mimetype,
    );

    if (!fingerprint.perceptualHash && !fingerprint.sha256) {
      throw new BadRequestException('Could not read the uploaded image');
    }

    await this.ensureProductImageFingerprints({
      shopId: options?.shopId,
      maxProducts: 120,
    });

    const limit = Math.min(Math.max(Number(options?.limit || 24), 1), 60);
    const where: Prisma.ProductImageFingerprintWhereInput = {
      product: {
        status: ProductStatus.ACTIVE,
        ...(options?.shopId ? { shopId: options.shopId } : {}),
      },
      OR: [
        ...(fingerprint.sha256 ? [{ sha256: fingerprint.sha256 }] : []),
        { perceptualHash: { not: null } },
      ],
    };

    const candidates = await this.prisma.productImageFingerprint.findMany({
      where,
      take: 2000,
      orderBy: { updatedAt: 'desc' },
      include: {
        product: {
          include: {
            shop: {
              select: { id: true, name: true, phone: true },
            },
            listings: {
              take: 1,
              include: {
                runner: {
                  select: {
                    id: true,
                    rating: true,
                    user: { select: { name: true } },
                  },
                },
              },
            },
            _count: {
              select: { listings: true, reviews: true },
            },
          },
        },
      },
    });

    const bestByProduct = new Map<string, any>();

    const stampedCandidates =
      await this.prisma.whatsAppStampedMediaLog.findMany({
        where: {
          OR: [
            ...(fingerprint.sha256
              ? [
                  { stampedImageHash: fingerprint.sha256 },
                  { sourceImageHash: fingerprint.sha256 },
                ]
              : []),
            { stampedImagePerceptualHash: { not: null } },
            { sourceImagePerceptualHash: { not: null } },
          ],
          ...(options?.shopId
            ? { listing: { product: { shopId: options.shopId } } }
            : {}),
        },
        orderBy: { sentAt: 'desc' },
        take: 2000,
        include: {
          listing: {
            include: {
              runner: {
                select: {
                  id: true,
                  rating: true,
                  user: { select: { name: true } },
                },
              },
              product: {
                include: {
                  shop: { select: { id: true, name: true, phone: true } },
                  listings: {
                    take: 3,
                    orderBy: { createdAt: 'desc' },
                    include: {
                      runner: {
                        select: {
                          id: true,
                          rating: true,
                          user: { select: { name: true } },
                        },
                      },
                    },
                  },
                  _count: { select: { listings: true, reviews: true } },
                },
              },
            },
          },
        },
      });

    for (const candidate of stampedCandidates) {
      const exactStamped = fingerprint.sha256 === candidate.stampedImageHash;
      const exactSource = fingerprint.sha256 === candidate.sourceImageHash;
      const distance =
        exactStamped || exactSource
          ? 0
          : Math.min(
              ...[
                this.hammingHexDistance(
                  fingerprint.perceptualHash,
                  candidate.stampedImagePerceptualHash,
                ),
                this.hammingHexDistance(
                  fingerprint.perceptualHash,
                  candidate.sourceImagePerceptualHash,
                ),
              ].filter((value): value is number => value !== null),
            );
      if (
        !exactStamped &&
        !exactSource &&
        (!Number.isFinite(distance) || distance > 14)
      ) {
        continue;
      }
      const confidence =
        exactStamped || exactSource
          ? 1
          : Math.max(0.5, Number((1 - distance / 32).toFixed(2)));
      const product = candidate.listing.product;
      const match = {
        product,
        listingId: candidate.listingId,
        orderCode: candidate.orderCode || candidate.listing.orderCode,
        matchedImageUrl: candidate.sourceImageUrl,
        confidence,
        distance,
        label:
          confidence >= 0.95
            ? 'Exact'
            : confidence >= 0.75
              ? 'Strong'
              : 'Possible',
        reason: exactStamped
          ? 'EXACT_STAMPED_IMAGE_HASH'
          : exactSource
            ? 'EXACT_SOURCE_IMAGE_HASH'
            : `STAMPED_MEDIA_PERCEPTUAL_DISTANCE_${distance}`,
      };
      const current = bestByProduct.get(product.id);
      if (!current || match.confidence > current.confidence) {
        bestByProduct.set(product.id, match);
      }
    }

    for (const candidate of candidates) {
      const exact =
        fingerprint.sha256 &&
        candidate.sha256 &&
        fingerprint.sha256 === candidate.sha256;
      const distance = exact
        ? 0
        : this.hammingHexDistance(
            fingerprint.perceptualHash,
            candidate.perceptualHash,
          );

      if (!exact && distance === null) continue;
      if (!exact && Number(distance) > 14) continue;

      const confidence = exact
        ? 1
        : Math.max(0.5, Number((1 - Number(distance) / 32).toFixed(2)));
      const match = {
        product: candidate.product,
        matchedImageUrl: candidate.imageUrl,
        imageIndex: candidate.imageIndex,
        confidence,
        distance,
        label:
          exact || confidence >= 0.95
            ? 'Exact'
            : confidence >= 0.75
              ? 'Strong'
              : 'Possible',
        reason: exact ? 'EXACT_IMAGE_HASH' : `PERCEPTUAL_DISTANCE_${distance}`,
      };

      const current = bestByProduct.get(candidate.productId);
      if (!current || match.confidence > current.confidence) {
        bestByProduct.set(candidate.productId, match);
      }
    }

    const results = [...bestByProduct.values()]
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }
        return Number(left.distance || 0) - Number(right.distance || 0);
      })
      .slice(0, limit);

    return {
      query: {
        sha256: fingerprint.sha256,
        perceptualHash: fingerprint.perceptualHash,
      },
      total: results.length,
      results,
    };
  }

  async backfillImageFingerprints(limit = 1000) {
    const indexed = await this.ensureProductImageFingerprints({
      maxProducts: Math.min(Math.max(Number(limit || 1000), 1), 5000),
      refreshExisting: true,
    });

    return {
      message: `Indexed ${indexed.indexed} product image fingerprint${indexed.indexed === 1 ? '' : 's'}`,
      ...indexed,
    };
  }

  /**
   * Create a new product (Shop Owner only, must own the shop)
   */
  async create(
    createProductDto: CreateProductDto,
    userId: string,
    shopId: string,
  ) {
    try {
      this.logger.log(`Creating product for shop ${shopId} by user ${userId}`);

      const shop = await this.prisma.shop.findUnique({
        where: { id: shopId },
      });

      if (!shop) {
        this.logger.warn(`Shop ${shopId} not found`);
        throw new NotFoundException(`Shop ${shopId} not found`);
      }

      if (shop.ownerId !== userId) {
        this.logger.warn(`User ${userId} does not own shop ${shopId}`);
        throw new ForbiddenException(
          'You can only add products to your own shops',
        );
      }

      if (!this.hasProductMedia(createProductDto.images)) {
        throw new BadRequestException(
          'A product needs at least one image or video',
        );
      }

      const existingProduct = await this.prisma.product.findFirst({
        where: {
          name: createProductDto.name,
          shopId,
          status: { not: ProductStatus.INACTIVE },
        },
      });

      if (existingProduct) {
        this.logger.warn(
          `Product with name ${createProductDto.name} already exists in shop ${shopId}`,
        );
        throw new ConflictException(
          'A product with this name already exists in this shop',
        );
      }

      const categoryValue =
        typeof createProductDto.category === 'string'
          ? createProductDto.category
          : undefined;

      const product = await this.prisma.product.create({
        data: {
          name: createProductDto.name,
          description: createProductDto.description,
          basePrice: createProductDto.basePrice,
          stockQty: createProductDto.stockQty,
          shopId,
          status: createProductDto.status || ProductStatus.ACTIVE,
          category: categoryValue,
          images: createProductDto.images as Prisma.InputJsonValue | undefined,
        },
        include: {
          _count: {
            select: { listings: true, orderItems: true },
          },
        },
      });

      this.logger.log(`Successfully created product ${product.id}`);
      return product;
    } catch (error: any) {
      this.logger.error(
        `Failed to create product: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async importWhatsAppProducts(
    shopId: string,
    userId: string,
    dto: ImportWhatsAppProductsDto,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, ownerId: true },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${shopId} not found`);
    }

    if (shop.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only import products to your own shops',
      );
    }

    const cleanItems = dto.items
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        category: item.category?.trim() || undefined,
        description: item.description?.trim() || item.sourceText?.trim(),
        stockQty: Math.max(0, Number(item.stockQty)),
        basePrice: Number(item.basePrice),
        images: this.capturedProductMediaUrls(item.images ?? []),
      }))
      .filter(
        (item) =>
          item.name.length >= 3 &&
          item.basePrice >= 0 &&
          item.images.length > 0,
      );

    if (cleanItems.length === 0) {
      throw new BadRequestException(
        'No valid products with captured product media to import',
      );
    }

    const existingProducts = await this.prisma.product.findMany({
      where: { shopId },
      select: { id: true, name: true },
    });
    const existingByName = new Map(
      existingProducts.map((product) => [
        product.name.trim().toLowerCase(),
        product,
      ]),
    );

    let created = 0;
    let updated = 0;
    const results: Array<{
      id: string;
      name: string;
      action: 'created' | 'updated';
    }> = [];

    for (const chunk of this.chunk(cleanItems, 100)) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of chunk) {
          const existing = existingByName.get(item.name.toLowerCase());
          const data = {
            name: item.name,
            description: item.description,
            basePrice: item.basePrice,
            stockQty: item.stockQty,
            category: item.category,
            status:
              item.stockQty > 0
                ? ProductStatus.ACTIVE
                : ProductStatus.OUT_OF_STOCK,
            images:
              item.images.length > 0
                ? (item.images as Prisma.InputJsonValue)
                : undefined,
          };

          if (existing) {
            const product = await tx.product.update({
              where: { id: existing.id },
              data,
              select: { id: true, name: true },
            });
            updated += 1;
            results.push({ ...product, action: 'updated' });
          } else {
            const product = await tx.product.create({
              data: {
                ...data,
                shopId,
              },
              select: { id: true, name: true },
            });
            created += 1;
            existingByName.set(product.name.trim().toLowerCase(), product);
            results.push({ ...product, action: 'created' });
          }
        }
      });
    }

    return {
      created,
      updated,
      total: results.length,
      results,
    };
  }

  /**
   * List all products with filters (public read access)
   */
  async findAll(query: QueryProductDto) {
    try {
      this.logger.log(`Fetching products with query: ${JSON.stringify(query)}`);

      const {
        search,
        category,
        shopId,
        shop,
        status,
        limit = 10,
        offset = 0,
        sortBy = 'createdAt',
        order = 'desc',
        inStock = false,
      } = query;

      const validSortFields = [
        'id',
        'name',
        'basePrice',
        'stockQty',
        'status',
        'createdAt',
        'updatedAt',
      ];
      if (!validSortFields.includes(sortBy)) {
        throw new BadRequestException('Invalid sort field');
      }

      if (!['asc', 'desc'].includes(order)) {
        throw new BadRequestException('Invalid sort order');
      }

      const where: Record<string, unknown> = {};

      if (search?.trim()) {
        const cleanSearch = search.trim();
        where.OR = [
          { name: { contains: cleanSearch, mode: 'insensitive' } },
          { description: { contains: cleanSearch, mode: 'insensitive' } },
          {
            listings: {
              some: {
                orderCode: { contains: cleanSearch, mode: 'insensitive' },
              },
            },
          },
          {
            whatsappImports: {
              some: {
                caption: { contains: cleanSearch, mode: 'insensitive' },
              },
            },
          },
          {
            shop: {
              name: { contains: cleanSearch, mode: 'insensitive' },
            },
          },
        ];
      }

      if (category) {
        where.category = { contains: category.toLowerCase() };
      }

      const selectedShopId = shopId || shop;
      if (selectedShopId) {
        where.shopId = selectedShopId;
      }

      if (status) {
        where.status = status;
      } else {
        where.status = ProductStatus.ACTIVE;
      }

      if (inStock) {
        where.stockQty = { gt: 0 };
      }

      const orderByString = String(sortBy);
      const orderCodeSearch = search?.trim().match(/^RC-[A-Z0-9-]+$/i)
        ? search.trim()
        : null;

      const products = await this.prisma.product.findMany({
        where,
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          listings: {
            ...(orderCodeSearch
              ? {
                  where: {
                    orderCode: {
                      contains: orderCodeSearch,
                      mode: 'insensitive' as const,
                    },
                  },
                }
              : {}),
            take: 3,
            orderBy: { createdAt: 'desc' },
            include: {
              runner: {
                select: {
                  id: true,
                  rating: true,
                  user: {
                    select: { name: true },
                  },
                },
              },
            },
          },
          whatsappImports: {
            select: { parsedDraft: true, receivedAt: true },
            orderBy: { receivedAt: 'desc' },
            take: 1,
          },
          _count: {
            select: { listings: true, reviews: true },
          },
        },
        orderBy: { [orderByString]: order },
        skip: Number(offset),
        take: Number(limit),
      });

      const total = await this.prisma.product.count({ where });

      this.logger.log(
        `Returning ${products.length} products out of total ${total}`,
      );

      return {
        data: products,
        meta: {
          total,
          limit,
          offset,
          hasNext: Number(offset) + Number(limit) < total,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch products: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get product by ID (public)
   */
  async findOne(id: string) {
    try {
      if (!id) {
        throw new BadRequestException('Product ID is required');
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              phone: true,
              description: true,
              address: true,
            },
          },
          listings: {
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
          whatsappImports: {
            select: { parsedDraft: true, receivedAt: true },
            orderBy: { receivedAt: 'desc' },
            take: 1,
          },
          orderItems: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              order: {
                select: {
                  status: true,
                  createdAt: true,
                  totalAmount: true,
                },
              },
            },
          },
          _count: {
            select: { listings: true, orderItems: true },
          },
        },
      });

      if (!product) {
        this.logger.warn(`Product ${id} not found`);
        throw new NotFoundException(`Product ${id} not found`);
      }

      return product;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch product ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get product details with full info (owner/admin only)
   */
  async findOneWithDetails(id: string, userId: string, userRole: string) {
    try {
      if (!id) {
        throw new BadRequestException('Product ID is required');
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          shop: true,
          listings: {
            include: {
              runner: {
                include: {
                  user: {
                    select: {
                      name: true,
                      phone: true,
                      email: true,
                    },
                  },
                  wallet: true,
                  transactions: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                  },
                },
              },
            },
          },
          orderItems: {
            include: {
              order: {
                include: {
                  customer: {
                    select: {
                      name: true,
                      phone: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!product) {
        this.logger.warn(`Product ${id} not found`);
        throw new NotFoundException(`Product ${id} not found`);
      }

      const shop = await this.prisma.shop.findUnique({
        where: { id: product.shopId },
      });

      if (!shop) {
        this.logger.warn(`Shop ${product.shopId} not found`);
        throw new NotFoundException(`Shop ${product.shopId} not found`);
      }

      if (shop.ownerId !== userId && userRole !== 'ADMIN') {
        return this.findOne(id);
      }

      return product;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch product details ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update product (owner/admin only)
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    userId: string,
    userRole: string,
  ) {
    try {
      if (!id) {
        throw new BadRequestException('Product ID is required');
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: { shop: true },
      });

      if (!product) {
        this.logger.warn(`Product ${id} not found`);
        throw new NotFoundException(`Product ${id} not found`);
      }

      const shop = await this.prisma.shop.findUnique({
        where: { id: product.shopId },
      });

      if (!shop) {
        this.logger.warn(`Shop ${product.shopId} not found`);
        throw new NotFoundException(`Shop ${product.shopId} not found`);
      }

      if (shop.ownerId !== userId && userRole !== 'ADMIN') {
        this.logger.warn(
          `User ${userId} not authorized to update product ${id}`,
        );
        throw new ForbiddenException(
          'You can only update products in your own shops',
        );
      }

      const data: Record<string, unknown> = { ...updateProductDto };
      const nextStatus =
        updateProductDto.status ?? product.status ?? ProductStatus.ACTIVE;
      const nextImages =
        updateProductDto.images === undefined
          ? product.images
          : updateProductDto.images;

      if (
        nextStatus === ProductStatus.ACTIVE &&
        !this.hasProductMedia(nextImages)
      ) {
        throw new BadRequestException(
          'An active product needs at least one image or video',
        );
      }

      if (data.category && Array.isArray(data.category)) {
        data.category = data.category.join(',');
      }

      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data,
        include: {
          _count: {
            select: { listings: true, orderItems: true },
          },
        },
      });

      this.logger.log(`Successfully updated product ${id}`);
      return updatedProduct;
    } catch (error: any) {
      this.logger.error(
        `Failed to update product ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete/deactivate product (owner/admin only)
   */
  async remove(id: string, userId: string, userRole: string) {
    try {
      if (!id) {
        throw new BadRequestException('Product ID is required');
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: { shop: true },
      });

      if (!product) {
        this.logger.warn(`Product ${id} not found`);
        throw new NotFoundException(`Product ${id} not found`);
      }

      const shop = await this.prisma.shop.findUnique({
        where: { id: product.shopId },
      });

      if (!shop) {
        this.logger.warn(`Shop ${product.shopId} not found`);
        throw new NotFoundException(`Shop ${product.shopId} not found`);
      }

      if (shop.ownerId !== userId && userRole !== 'ADMIN') {
        this.logger.warn(
          `User ${userId} not authorized to delete product ${id}`,
        );
        throw new ForbiddenException(
          'You can only delete products from your own shops',
        );
      }

      const deletedProduct = await this.prisma.product.update({
        where: { id },
        data: { status: ProductStatus.INACTIVE },
      });

      this.logger.log(`Successfully deactivated product ${id}`);
      return {
        message: 'Product deactivated successfully',
        product: deletedProduct,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to deactivate product ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get products by shop
   */
  async findByShop(shopId: string, userId?: string, userRole?: string) {
    try {
      const productQuery: any = {
        where: { shopId },
        include: {
          listings: {
            include: {
              runner: {
                select: {
                  id: true,
                  rating: true,
                },
              },
            },
          },
          _count: {
            select: { listings: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      };

      if (!userId || userRole !== 'ADMIN') {
        productQuery.where.status = ProductStatus.ACTIVE;
      }

      const products = await this.prisma.product.findMany(productQuery);

      return products;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch products for shop ${shopId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Manage runner listings for a product
   */
  async updateRunnerListing(
    listingId: string,
    runnerId: string,
    markup: number,
  ) {
    try {
      if (!runnerId) {
        throw new ForbiddenException('Runner profile required');
      }

      if (markup < 0 || markup > 1) {
        throw new BadRequestException('Markup must be between 0 and 1');
      }

      const listing = await this.prisma.runnerListing.findUnique({
        where: { id: listingId },
        include: { product: true },
      });

      if (!listing) {
        this.logger.warn(`Listing ${listingId} not found`);
        throw new NotFoundException(`Listing ${listingId} not found`);
      }

      if (listing.runnerId !== runnerId) {
        this.logger.warn(
          `Runner ${runnerId} not authorized to update listing ${listingId}`,
        );
        throw new ForbiddenException('You can only update your own listings');
      }

      const runnerPrice = listing.product.basePrice * (1 + markup);

      const updatedListing = await this.prisma.runnerListing.update({
        where: { id: listingId },
        data: {
          runnerId,
          markup,
          runnerPrice,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              basePrice: true,
            },
          },
          runner: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      this.logger.log(`Successfully updated runner listing ${listingId}`);
      return updatedListing;
    } catch (error: any) {
      this.logger.error(
        `Failed to update runner listing ${listingId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private capturedProductMediaUrls(mediaUrls: string[]) {
    return [...new Set(mediaUrls.map((url) => String(url || '').trim()))]
      .filter((url) => this.isCapturedProductMediaUrl(url))
      .slice(0, 10);
  }

  private isCapturedProductMediaUrl(url: string) {
    try {
      const parsed = new URL(url);
      const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
      return (
        pathname.startsWith('/uploads/whatsapp-session/') &&
        /\.(?:jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(pathname)
      );
    } catch {
      return false;
    }
  }

  private hasProductMedia(media: unknown): boolean {
    if (!media) return false;
    if (Array.isArray(media))
      return media.some((item) => this.mediaItemUrl(item));

    if (typeof media === 'string') {
      try {
        const parsed = JSON.parse(media);
        return this.hasProductMedia(parsed);
      } catch {
        return Boolean(media.trim());
      }
    }

    return Boolean(this.mediaItemUrl(media));
  }

  private mediaItemUrl(media: unknown) {
    if (typeof media === 'string') return media.trim();
    if (media && typeof media === 'object' && 'url' in media) {
      return String((media as { url?: unknown }).url || '').trim();
    }
    return '';
  }

  private productImageUrls(media: unknown) {
    const values = Array.isArray(media)
      ? media
      : typeof media === 'string'
        ? this.parseJsonOrValue(media)
        : [media];

    return [
      ...new Set(
        (Array.isArray(values) ? values : [values])
          .map((item) => this.mediaItemUrl(item))
          .filter((url) => this.isImageMediaUrl(url)),
      ),
    ].slice(0, 10);
  }

  private parseJsonOrValue(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private isImageMediaUrl(url: string) {
    return Boolean(url) && /\.(?:jpe?g|png|webp|gif)$/i.test(url.split('?')[0]);
  }

  private async ensureProductImageFingerprints(options?: {
    shopId?: string;
    maxProducts?: number;
    refreshExisting?: boolean;
  }) {
    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        ...(options?.shopId ? { shopId: options.shopId } : {}),
        images: { not: Prisma.JsonNull },
      },
      select: {
        id: true,
        images: true,
        imageFingerprints: {
          select: { imageUrl: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(Number(options?.maxProducts || 500), 1), 5000),
    });

    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products) {
      const existing = new Set(
        product.imageFingerprints.map((item) => item.imageUrl),
      );
      const urls = this.productImageUrls(product.images);

      for (let index = 0; index < urls.length; index += 1) {
        const imageUrl = urls[index];
        if (!options?.refreshExisting && existing.has(imageUrl)) {
          skipped += 1;
          continue;
        }

        try {
          const loaded = await this.loadImageBuffer(imageUrl);
          if (!loaded?.buffer?.length) {
            skipped += 1;
            continue;
          }

          const fingerprint = await this.imageFingerprintFromBuffer(
            loaded.buffer,
            loaded.mimetype,
          );
          if (!fingerprint.sha256 && !fingerprint.perceptualHash) {
            skipped += 1;
            continue;
          }

          await this.prisma.productImageFingerprint.upsert({
            where: {
              productId_imageUrl: {
                productId: product.id,
                imageUrl,
              },
            },
            update: {
              imageIndex: index,
              sha256: fingerprint.sha256,
              perceptualHash: fingerprint.perceptualHash,
              mimetype: loaded.mimetype,
              width: fingerprint.width,
              height: fingerprint.height,
            },
            create: {
              productId: product.id,
              imageUrl,
              imageIndex: index,
              sha256: fingerprint.sha256,
              perceptualHash: fingerprint.perceptualHash,
              mimetype: loaded.mimetype,
              width: fingerprint.width,
              height: fingerprint.height,
            },
          });
          indexed += 1;
        } catch (error: any) {
          failed += 1;
          this.logger.warn(
            `Could not fingerprint product image ${imageUrl}: ${error.message}`,
          );
        }
      }
    }

    return { indexed, skipped, failed };
  }

  private async loadImageBuffer(imageUrl: string) {
    const localPath = this.localUploadPathFromUrl(imageUrl);
    if (localPath && existsSync(localPath)) {
      return {
        buffer: await readFile(localPath),
        mimetype: this.mimetypeFromUrl(imageUrl),
      };
    }

    if (/^https?:\/\//i.test(imageUrl)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const contentType =
        response.headers.get('content-type') || this.mimetypeFromUrl(imageUrl);
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimetype: contentType,
      };
    }

    return null;
  }

  private localUploadPathFromUrl(imageUrl: string) {
    try {
      const pathname = imageUrl.startsWith('/uploads/')
        ? imageUrl
        : new URL(imageUrl).pathname;
      const decoded = decodeURIComponent(pathname);
      if (!decoded.startsWith('/uploads/')) return null;

      const relative = decoded
        .replace(/^\/uploads\//, '')
        .replace(/[\\/]+/g, '/');
      if (relative.includes('..')) return null;

      return resolve(process.env.UPLOAD_PATH || './uploads', relative);
    } catch {
      return null;
    }
  }

  private mimetypeFromUrl(imageUrl: string) {
    const clean = imageUrl.split('?')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  private async imageFingerprintFromBuffer(buffer: Buffer, mimetype?: string) {
    const sha256 = buffer.length
      ? crypto.createHash('sha256').update(buffer).digest('hex')
      : null;
    const type = String(mimetype || '').toLowerCase();

    if (!buffer.length || (type && !type.startsWith('image/'))) {
      return { sha256, perceptualHash: null, width: null, height: null };
    }

    try {
      const image = sharp(buffer).rotate();
      const metadata = await image.metadata();
      const raw = await image
        .clone()
        .resize(8, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();
      const average =
        raw.reduce((total, value) => total + Number(value || 0), 0) /
        raw.length;
      const bits = Array.from(raw, (value) => (value >= average ? '1' : '0'));
      const perceptualHash = BigInt(`0b${bits.join('')}`)
        .toString(16)
        .padStart(16, '0');

      return {
        sha256,
        perceptualHash,
        width: metadata.width || null,
        height: metadata.height || null,
      };
    } catch {
      return { sha256, perceptualHash: null, width: null, height: null };
    }
  }

  private hammingHexDistance(left?: string | null, right?: string | null) {
    if (!left || !right) return null;
    const cleanLeft = String(left).replace(/[^a-f0-9]/gi, '');
    const cleanRight = String(right).replace(/[^a-f0-9]/gi, '');
    if (!cleanLeft || cleanLeft.length !== cleanRight.length) return null;

    let distance = 0;
    for (let index = 0; index < cleanLeft.length; index += 1) {
      const xor =
        parseInt(cleanLeft[index], 16) ^ parseInt(cleanRight[index], 16);
      distance += xor.toString(2).replace(/0/g, '').length;
    }

    return distance;
  }
}
