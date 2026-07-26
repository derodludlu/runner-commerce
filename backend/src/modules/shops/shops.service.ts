// src/modules/shops/shops.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { QueryShopDto } from './dto/query-shop.dto';
import { MergeShopDto } from './dto/merge-shop.dto';

@Injectable()
export class ShopsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new shop (SHOP_OWNER only)
   */
  async create(createShopDto: CreateShopDto, userId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!owner) {
      throw new NotFoundException(`Shop owner ${userId} not found`);
    }

    if (owner.status !== 'ACTIVE') {
      throw new ForbiddenException('Shop owner account must be active');
    }

    if (owner.role.name !== 'SHOP_OWNER') {
      throw new ForbiddenException(
        'A shop can only be created for an existing shop owner account',
      );
    }

    const shop = await this.prisma.shop.create({
      data: {
        ...createShopDto,
        ownerId: userId,
        status: 'ACTIVE',
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    return shop;
  }

  /**
   * List all shops (public)
   */
  async findAll(query: QueryShopDto) {
    // ✅ FIX: Set explicit default values
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'createdAt';
    const order = query.order ?? 'desc';
    const search = query.search;
    const status = query.status;

    // Validate sort field (prevent SQL injection)
    const validSortFields = [
      'id',
      'name',
      'phone',
      'status',
      'createdAt',
      'updatedAt',
    ];
    if (!validSortFields.includes(sortBy)) {
      throw new BadRequestException('Invalid sort field');
    }

    // Validate order
    if (!['asc', 'desc'].includes(order)) {
      throw new BadRequestException('Invalid sort order');
    }

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    // Add search filter
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // Add status filter (for admin queries)
    if (status && status !== 'ACTIVE') {
      where.status = status;
    }

    // Convert to string for Prisma
    const orderByString = String(sortBy);

    const shops = await this.prisma.shop.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            products: true,
            runnerAssignments: true,
            whatsappImports: true,
            whatsappGroupMappings: true,
          },
        },
        whatsappGroupMappings: {
          select: {
            id: true,
            groupId: true,
            sourceGroup: true,
            participants: true,
            status: true,
            groupRole: true,
            isPrimarySource: true,
          },
          orderBy: [
            { isPrimarySource: 'desc' },
            { groupRole: 'asc' },
            { sourceGroup: 'asc' },
          ],
        },
      },
      orderBy: { [orderByString]: order },
      skip: Number(offset),
      take: Number(limit),
    });

    const total = await this.prisma.shop.count({ where });

    return {
      data: await this.attachWhatsAppGroupAvatars(shops),
      meta: {
        total,
        limit,
        offset,
        hasNext: Number(offset) + Number(limit) < total,
      },
    };
  }

  /**
   * Get shop by ID (public)
   */
  async findOne(id: string) {
    if (!id) {
      throw new BadRequestException('Shop ID is required');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id, status: 'ACTIVE' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        products: {
          where: { status: 'ACTIVE' },
          take: 10,
          include: {
            listings: {
              take: 1,
              include: {
                runner: {
                  select: {
                    id: true,
                    rating: true,
                  },
                },
              },
            },
          },
        },
        whatsappGroupMappings: {
          select: {
            id: true,
            groupId: true,
            sourceGroup: true,
            participants: true,
            status: true,
            groupRole: true,
            isPrimarySource: true,
          },
          orderBy: [
            { isPrimarySource: 'desc' },
            { groupRole: 'asc' },
            { sourceGroup: 'asc' },
          ],
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${id} not found`);
    }

    return (await this.attachWhatsAppGroupAvatars([shop]))[0];
  }

  /**
   * Get shop by ID with full details (owner/admin only)
   */
  async findOneWithDetails(id: string, userId: string, userRole: string) {
    if (!id) {
      throw new BadRequestException('Shop ID is required');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: {
        owner: true,
        products: {
          include: {
            listings: {
              include: {
                runner: {
                  select: {
                    id: true,
                    user: {
                      select: { name: true, phone: true },
                    },
                  },
                },
              },
            },
          },
        },
        batches: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        whatsappGroupMappings: {
          select: {
            id: true,
            groupId: true,
            sourceGroup: true,
            participants: true,
            status: true,
            groupRole: true,
            isPrimarySource: true,
          },
          orderBy: [
            { isPrimarySource: 'desc' },
            { groupRole: 'asc' },
            { sourceGroup: 'asc' },
          ],
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${id} not found`);
    }

    // Authorization: Only owner or admin can see full details
    if (shop.ownerId !== userId && userRole !== 'ADMIN') {
      return this.findOne(id);
    }

    return (await this.attachWhatsAppGroupAvatars([shop]))[0];
  }

  /**
   * Update shop (owner only)
   */
  async update(id: string, updateShopDto: UpdateShopDto, userId: string) {
    if (!id) {
      throw new BadRequestException('Shop ID is required');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${id} not found`);
    }

    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You can only update your own shop');
    }

    const updatedShop = await this.prisma.shop.update({
      where: { id },
      data: updateShopDto,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    return updatedShop;
  }

  /**
   * Deactivate shop (owner or admin)
   */
  async remove(id: string, userId: string, userRole: string) {
    if (!id) {
      throw new BadRequestException('Shop ID is required');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${id} not found`);
    }

    if (shop.ownerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own shop');
    }

    // Soft delete: Update status instead of hard delete
    const deletedShop = await this.prisma.shop.update({
      where: { id },
      data: { status: 'CLOSED' },
    });

    return {
      message: 'Shop deactivated successfully',
      shop: deletedShop,
    };
  }

  /**
   * Merge a duplicate source shop into a target shop.
   * Admin-only: moves dependent records where possible and removes duplicate
   * records that would violate unique target constraints.
   */
  async mergeInto(sourceId: string, targetId: string, dto: MergeShopDto = {}) {
    if (!sourceId || !targetId) {
      throw new BadRequestException('Source and target shop IDs are required');
    }

    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a shop into itself');
    }

    const [source, target] = await Promise.all([
      this.prisma.shop.findUnique({
        where: { id: sourceId },
        include: {
          _count: {
            select: {
              products: true,
              runnerListings: true,
              runnerAssignments: true,
              whatsappImports: true,
              whatsappGroupMappings: true,
            },
          },
        },
      }),
      this.prisma.shop.findUnique({
        where: { id: targetId },
        include: {
          _count: {
            select: {
              products: true,
              runnerListings: true,
              runnerAssignments: true,
              whatsappImports: true,
              whatsappGroupMappings: true,
            },
          },
        },
      }),
    ]);

    if (!source) {
      throw new NotFoundException(`Source shop ${sourceId} not found`);
    }

    if (!target) {
      throw new NotFoundException(`Target shop ${targetId} not found`);
    }

    const sourceCanonical = this.canonicalShopName(source.name);
    const targetCanonical = this.canonicalShopName(target.name);
    const likelyDuplicate =
      sourceCanonical &&
      targetCanonical &&
      (sourceCanonical === targetCanonical ||
        sourceCanonical.startsWith(`${targetCanonical} `) ||
        targetCanonical.startsWith(`${sourceCanonical} `));

    const result = await this.prisma.$transaction(async (tx) => {
      const deletedRunnerAssignments: string[] = [];
      const deletedCheckpoints: string[] = [];
      const deletedImports: string[] = [];

      const sourceAssignments = await tx.runnerShopLink.findMany({
        where: { shopId: sourceId },
        select: { id: true, runnerId: true },
      });
      for (const assignment of sourceAssignments) {
        const existing = await tx.runnerShopLink.findUnique({
          where: {
            runnerId_shopId: {
              runnerId: assignment.runnerId,
              shopId: targetId,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await tx.runnerShopLink.delete({ where: { id: assignment.id } });
          deletedRunnerAssignments.push(assignment.id);
        } else {
          await tx.runnerShopLink.update({
            where: { id: assignment.id },
            data: { shopId: targetId },
          });
        }
      }

      const sourceCheckpoints = await tx.whatsAppCaptureCheckpoint.findMany({
        where: { shopId: sourceId },
        select: { id: true, groupId: true },
      });
      for (const checkpoint of sourceCheckpoints) {
        const existing = await tx.whatsAppCaptureCheckpoint.findUnique({
          where: {
            shopId_groupId: {
              shopId: targetId,
              groupId: checkpoint.groupId,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await tx.whatsAppCaptureCheckpoint.delete({
            where: { id: checkpoint.id },
          });
          deletedCheckpoints.push(checkpoint.id);
        } else {
          await tx.whatsAppCaptureCheckpoint.update({
            where: { id: checkpoint.id },
            data: { shopId: targetId },
          });
        }
      }

      const sourceImports = await tx.whatsAppImport.findMany({
        where: { shopId: sourceId },
        select: { id: true, messageId: true },
      });
      for (const item of sourceImports) {
        const existing =
          item.messageId &&
          (await tx.whatsAppImport.findUnique({
            where: {
              shopId_messageId: {
                shopId: targetId,
                messageId: item.messageId,
              },
            },
            select: { id: true },
          }));

        if (existing) {
          await tx.whatsAppImport.delete({ where: { id: item.id } });
          deletedImports.push(item.id);
        } else {
          await tx.whatsAppImport.update({
            where: { id: item.id },
            data: { shopId: targetId },
          });
        }
      }

      const [
        products,
        batches,
        runnerListings,
        groupMappings,
        subscriptions,
        invoices,
        discoveredGroups,
        orders,
      ] = await Promise.all([
        tx.product.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
        tx.batch.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
        tx.runnerListing.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
        tx.whatsAppGroupMapping.updateMany({
          where: { shopId: sourceId },
          data: {
            shopId: targetId,
            notes:
              `Merged from duplicate shop "${source.name}". ${dto.reason || ''}`.trim(),
          },
        }),
        tx.subscription.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
        tx.platformInvoice.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
        tx.whatsAppDiscoveredGroup.updateMany({
          where: { importedShopId: sourceId },
          data: { importedShopId: targetId },
        }),
        tx.order.updateMany({
          where: { shopId: sourceId },
          data: { shopId: targetId },
        }),
      ]);

      await tx.shop.delete({ where: { id: sourceId } });

      return {
        products: products.count,
        batches: batches.count,
        runnerListings: runnerListings.count,
        runnerAssignmentsMoved:
          sourceAssignments.length - deletedRunnerAssignments.length,
        runnerAssignmentsDeduped: deletedRunnerAssignments.length,
        whatsappImportsMoved: sourceImports.length - deletedImports.length,
        whatsappImportsDeduped: deletedImports.length,
        captureCheckpointsMoved:
          sourceCheckpoints.length - deletedCheckpoints.length,
        captureCheckpointsDeduped: deletedCheckpoints.length,
        whatsappGroupMappings: groupMappings.count,
        subscriptions: subscriptions.count,
        invoices: invoices.count,
        discoveredGroups: discoveredGroups.count,
        orders: orders.count,
      };
    });

    return {
      message: `Merged duplicate shop "${source.name}" into "${target.name}"`,
      likelyDuplicate,
      source: {
        id: source.id,
        name: source.name,
      },
      target: {
        id: target.id,
        name: target.name,
      },
      moved: result,
    };
  }

  /**
   * Permanently delete shop-owned records (admin-only development control).
   */
  async hardDelete(id: string) {
    if (!id) {
      throw new BadRequestException('Shop ID is required');
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            runnerListings: true,
            runnerAssignments: true,
            whatsappImports: true,
            whatsappGroupMappings: true,
          },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${id} not found`);
    }

    const mappings = await this.prisma.whatsAppGroupMapping.findMany({
      where: { shopId: id },
      select: { groupId: true },
    });
    const groupIds = mappings.map((mapping) => mapping.groupId);

    await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppDiscoveredGroup.updateMany({
        where: { importedShopId: id },
        data: { importedShopId: null },
      });
      await tx.order.updateMany({
        where: { shopId: id },
        data: { shopId: null },
      });
      await tx.shop.delete({
        where: { id },
      });
      if (groupIds.length > 0) {
        await tx.whatsAppDiscoveredGroup.deleteMany({
          where: {
            groupId: { in: groupIds },
          },
        });
      }
    });

    return {
      message: `Shop "${shop.name}" permanently deleted`,
      deleted: {
        shop: 1,
        products: shop._count.products,
        runnerListings: shop._count.runnerListings,
        runnerAssignments: shop._count.runnerAssignments,
        whatsappImports: shop._count.whatsappImports,
        whatsappGroupMappings: shop._count.whatsappGroupMappings,
        discoveredGroups: groupIds.length,
      },
    };
  }

  /**
   * Get shops owned by a specific user
   */
  async findByOwner(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const shops = await this.prisma.shop.findMany({
      where: { ownerId: userId },
      include: {
        _count: {
          select: { products: true, batches: true },
        },
        whatsappGroupMappings: {
          select: {
            id: true,
            groupId: true,
            sourceGroup: true,
            participants: true,
            status: true,
            groupRole: true,
            isPrimarySource: true,
          },
          orderBy: [
            { isPrimarySource: 'desc' },
            { groupRole: 'asc' },
            { sourceGroup: 'asc' },
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.attachWhatsAppGroupAvatars(shops);
  }

  private async attachWhatsAppGroupAvatars<
    T extends { whatsappGroupMappings?: any[] },
  >(shops: T[]) {
    const groupIds = [
      ...new Set(
        shops
          .flatMap((shop) => shop.whatsappGroupMappings || [])
          .map((mapping) => String(mapping.groupId || '').trim())
          .filter(Boolean),
      ),
    ];

    const discoveredGroups =
      groupIds.length > 0
        ? await this.prisma.whatsAppDiscoveredGroup.findMany({
            where: { groupId: { in: groupIds } },
            select: {
              groupId: true,
              name: true,
              participants: true,
              profileImageUrl: true,
              creatorPhone: true,
              groupPurpose: true,
              lastSeenAt: true,
              bridgePresence: {
                where: { isAvailable: true },
                select: {
                  profileImageUrl: true,
                  lastSeenAt: true,
                },
                orderBy: { lastSeenAt: 'desc' },
                take: 1,
              },
            },
          })
        : [];
    const discoveredByGroupId = new Map(
      discoveredGroups.map((group) => [group.groupId, group]),
    );

    return shops.map((shop) => {
      const relatedWhatsAppGroups = (shop.whatsappGroupMappings || [])
        .map((mapping) => {
          const discovered = discoveredByGroupId.get(mapping.groupId);
          const bridgeImage = discovered?.bridgePresence?.find(
            (presence) => presence.profileImageUrl,
          )?.profileImageUrl;
          return {
            id: mapping.id,
            groupId: mapping.groupId,
            name: mapping.sourceGroup || discovered?.name || 'WhatsApp group',
            participants: mapping.participants ?? discovered?.participants ?? 0,
            status: mapping.status,
            groupRole: mapping.groupRole,
            isPrimarySource: mapping.isPrimarySource,
            profileImageUrl: discovered?.profileImageUrl || bridgeImage || null,
            creatorPhone: discovered?.creatorPhone || null,
            groupPurpose: discovered?.groupPurpose || null,
            lastSeenAt: discovered?.lastSeenAt || null,
          };
        })
        .sort((left, right) => {
          if (left.isPrimarySource !== right.isPrimarySource) {
            return left.isPrimarySource ? -1 : 1;
          }
          if (left.status !== right.status) {
            return left.status === 'ACTIVE' ? -1 : 1;
          }
          return String(left.name).localeCompare(String(right.name));
        });

      return {
        ...shop,
        relatedWhatsAppGroups,
        primaryWhatsAppGroup:
          relatedWhatsAppGroups.find((group) => group.isPrimarySource) ||
          relatedWhatsAppGroups[0] ||
          null,
      };
    });
  }

  private canonicalShopName(value: string) {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\b(?:shop|group)\b/g, ' ')
      .replace(/\bg\s*\/\s*s\s*\d+\w*\b/g, ' ')
      .replace(/\bg\s*[-#]?\s*\d+\w*\b/g, ' ')
      .replace(/\bgrp\s*[-#]?\s*\d+\w*\b/g, ' ')
      .replace(/\bgroup\s*[-#]?\s*\d+\w*\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }
}
