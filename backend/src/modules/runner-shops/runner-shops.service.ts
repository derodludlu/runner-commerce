import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestToJoinShopDto } from './dto/request-to-join.dto';
import { UpdateRunnerShopStatusDto } from './dto/update-runner-shop.dto';
import { UpdateRunnerShopAutomationDto } from './dto/update-runner-shop-automation.dto';
import {
  assertDestinationGroupsAvailableToRunner,
  normalizeDestinationKey,
  parseDestinationGroups,
} from '../../common/whatsapp-destination-reservations';

const RUNNER_SHOP_AUTO_APPROVAL_KEY = 'runnerShopJoinAutoApprovalEnabled';
const LIVE_CAPTURE_SHOP_LIMIT = 30;
const LIVE_CAPTURE_SHOP_STATUSES = ['PENDING', 'APPROVED'];

@Injectable()
export class RunnerShopsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Runner: Request to join a shop
   */
  async requestToJoin(runnerId: string, dto: RequestToJoinShopDto) {
    const { shopId, notes } = dto;

    // Check if shop exists
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.status !== 'ACTIVE') {
      throw new BadRequestException('Shop is not active');
    }

    // Check if already has a request
    const existing = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
    });

    if (existing?.selectedForLive) {
      throw new BadRequestException(
        `Already have a ${existing.status.toLowerCase()} request for this shop`,
      );
    }

    const selectedShopCount = await this.prisma.runnerShopLink.count({
      where: {
        runnerId,
        status: { in: LIVE_CAPTURE_SHOP_STATUSES },
        selectedForLive: true,
      },
    });
    if (selectedShopCount >= LIVE_CAPTURE_SHOP_LIMIT) {
      throw new BadRequestException(
        `Runners can select up to ${LIVE_CAPTURE_SHOP_LIMIT} capture shops`,
      );
    }

    const autoApprove = await this.getSettingBoolean(
      RUNNER_SHOP_AUTO_APPROVAL_KEY,
      false,
    );

    const data = {
      status:
        existing?.status === 'APPROVED'
          ? 'APPROVED'
          : autoApprove
            ? 'APPROVED'
            : 'PENDING',
      approvedAt:
        existing?.approvedAt ||
        (autoApprove || existing?.status === 'APPROVED'
          ? new Date()
          : undefined),
      notes: notes || existing?.notes,
      selectedForLive: true,
    };

    return this.prisma.runnerShopLink.upsert({
      where: { runnerId_shopId: { runnerId, shopId } },
      create: {
        runnerId,
        shopId,
        ...data,
      },
      update: data,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            owner: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        runner: {
          select: {
            id: true,
            rating: true,
            totalOrders: true,
          },
        },
      },
    });
  }

  /**
   * Shop Owner: Approve/Reject runner request
   */
  async updateRunnerStatus(
    shopId: string,
    ownerId: string,
    dto: UpdateRunnerShopStatusDto,
  ) {
    const { runnerId, status, notes } = dto;

    // Verify shop ownership
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, ownerId },
    });

    if (!shop) {
      throw new ForbiddenException('You do not own this shop');
    }

    const link = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Runner-shop relationship not found');
    }

    const updateData: any = {
      status,
      notes: notes || link.notes,
      approvedAt: status === 'APPROVED' ? new Date() : link.approvedAt,
    };

    return this.prisma.runnerShopLink.update({
      where: {
        id: link.id,
      },
      data: updateData,
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
          },
        },
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Shop Owner: Get all runner requests for their shop
   */
  async getShopRunnerRequests(
    shopId: string,
    ownerId: string,
    status?: string,
  ) {
    // Verify shop ownership
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, ownerId },
    });

    if (!shop) {
      throw new ForbiddenException('You do not own this shop');
    }

    const where: any = { shopId };
    if (status) {
      where.status = status;
    }

    return this.prisma.runnerShopLink.findMany({
      where,
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
            _count: {
              select: {
                orders: true,
                listings: true,
                shopAssignments: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  /**
   * Runner: Get all their shop assignments
   */
  async getRunnerShops(
    runnerId: string,
    status?: string,
    selectionScope: 'test' | 'live' | 'all' = 'live',
  ) {
    const where: any = { runnerId };
    if (status) {
      where.status = status;
    }
    if (selectionScope === 'test') {
      where.selectedForTest = true;
    } else if (selectionScope !== 'all') {
      where.selectedForLive = true;
    }

    const assignments = await this.prisma.runnerShopLink.findMany({
      where,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            description: true,
            address: true,
            phone: true,
            owner: {
              select: {
                name: true,
                phone: true,
              },
            },
            _count: {
              select: {
                products: {
                  where: { status: 'ACTIVE' },
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
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return this.attachShopGroupAvatarsToAssignments(assignments);
  }

  async getRunnerDestinationGroups(
    runnerId: string,
    includeCandidates = false,
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: {
        id: true,
        bridgeAccountId: true,
        bridgeAccount: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            lastSeenAt: true,
            sessionName: true,
            workerKey: true,
          },
        },
      },
    });

    if (!runner) {
      throw new NotFoundException('Runner profile not found');
    }

    const runnerGroups = await this.prisma.runnerRepostingGroup.findMany({
      where: {
        runnerId,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        whatsappGroupId: true,
        discoveredGroupId: true,
        groupName: true,
        isTestGroup: true,
        status: true,
        bridgeAccountId: true,
      },
    });

    const liveBridges = await this.resolveLiveBridgesForDestinationGroups(
      [
        runner.bridgeAccountId,
        ...runnerGroups.map((group) => group.bridgeAccountId),
      ].filter((bridgeId): bridgeId is string => Boolean(bridgeId)),
    );
    const liveBridgeIds = liveBridges.map((bridge) => bridge.id);

    const linkedDiscoveredIds = runnerGroups
      .map((group) => group.discoveredGroupId)
      .filter((groupId): groupId is string => Boolean(groupId));
    const linkedWhatsappGroupIds = runnerGroups
      .map((group) => group.whatsappGroupId)
      .filter((groupId): groupId is string => Boolean(groupId));
    const linkedGroupClauses = [
      ...(linkedDiscoveredIds.length > 0
        ? [{ id: { in: linkedDiscoveredIds } }]
        : []),
      ...(linkedWhatsappGroupIds.length > 0
        ? [{ groupId: { in: linkedWhatsappGroupIds } }]
        : []),
    ];

    const liveBridgeCandidateClause =
      liveBridgeIds.length > 0
        ? {
            bridgePresence: {
              some: {
                bridgeAccountId: { in: liveBridgeIds },
                isAvailable: true,
                archivedAt: null,
                bridgeAccount: {
                  archivedAt: null,
                  status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
                },
              },
            },
          }
        : {};

    const groups = await this.prisma.whatsAppDiscoveredGroup.findMany({
      where: includeCandidates
        ? {
            groupPurpose: { in: ['RUNNER_ADVERTISING', 'UNCLASSIFIED'] },
            importedShopId: null,
            archivedAt: null,
            ...(liveBridgeIds.length > 0
              ? {
                  OR: [liveBridgeCandidateClause, ...linkedGroupClauses],
                }
              : {}),
          }
        : {
            groupPurpose: 'RUNNER_ADVERTISING',
            archivedAt: null,
            ...(liveBridgeIds.length > 0
              ? {
                  OR: [liveBridgeCandidateClause, ...linkedGroupClauses],
                }
              : {}),
          },
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        groupId: true,
        name: true,
        participants: true,
        profileImageUrl: true,
        groupPurpose: true,
        importedRunnerAdvertisingAt: true,
        lastSeenAt: true,
        bridgePresence: {
          where:
            liveBridgeIds.length > 0
              ? {
                  bridgeAccountId: { in: liveBridgeIds },
                  archivedAt: null,
                }
              : { archivedAt: null },
          orderBy: [{ lastSeenAt: 'desc' }],
          take: 3,
          select: {
            bridgeAccountId: true,
            name: true,
            participants: true,
            isAvailable: true,
            lastSeenAt: true,
            bridgeAccount: {
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                lastSeenAt: true,
                sessionName: true,
                workerKey: true,
              },
            },
          },
        },
      },
    });

    const runnerGroupByDiscoveredId = new Map(
      runnerGroups
        .filter((group) => group.discoveredGroupId)
        .map((group) => [group.discoveredGroupId as string, group]),
    );
    const runnerGroupByWhatsappId = new Map(
      runnerGroups
        .filter((group) => group.whatsappGroupId)
        .map((group) => [group.whatsappGroupId as string, group]),
    );

    const data = groups.map((group) => {
      const runnerGroup =
        runnerGroupByDiscoveredId.get(group.id) ||
        runnerGroupByWhatsappId.get(group.groupId);
      const sourcePresence =
        group.bridgePresence.find((presence) => presence.isAvailable) ||
        group.bridgePresence[0] ||
        null;
      const sourceBridge = sourcePresence?.bridgeAccount || null;
      return {
        groupId: group.groupId,
        name: sourcePresence?.name || group.name,
        participants: sourcePresence?.participants ?? group.participants,
        profileImageUrl: group.profileImageUrl,
        lastSeenAt: sourcePresence?.lastSeenAt || group.lastSeenAt,
        groupPurpose: group.groupPurpose,
        importedRunnerAdvertisingAt: group.importedRunnerAdvertisingAt,
        isRunnerAdvertising: group.groupPurpose === 'RUNNER_ADVERTISING',
        runnerRepostingGroupId: runnerGroup?.id || null,
        isOwnGroup: Boolean(runnerGroup),
        isTestGroup: Boolean(runnerGroup?.isTestGroup),
        scope: runnerGroup?.isTestGroup ? 'test' : 'live',
        readinessStatus: runnerGroup?.status || null,
        sourceBridge: sourceBridge
          ? {
              id: sourceBridge.id,
              name: sourceBridge.name,
              phone: sourceBridge.phone,
              status: sourceBridge.status,
              lastSeenAt: sourceBridge.lastSeenAt,
              sessionName: sourceBridge.sessionName,
              workerKey: sourceBridge.workerKey,
            }
          : null,
        sourceBridgePresence: sourcePresence
          ? {
              bridgeAccountId: sourcePresence.bridgeAccountId,
              isAvailable: sourcePresence.isAvailable,
              lastSeenAt: sourcePresence.lastSeenAt,
            }
          : null,
      };
    });

    return {
      data,
      total: data.length,
      maxSelectable: 2,
      sourceBridges: liveBridges.map((bridge) => ({
        id: bridge.id,
        name: bridge.name,
        phone: bridge.phone,
        status: bridge.status,
        lastSeenAt: bridge.lastSeenAt,
        sessionName: bridge.sessionName,
        workerKey: bridge.workerKey,
      })),
    };
  }

  private async resolveLiveBridgesForDestinationGroups(
    preferredBridgeAccountIds: string[] = [],
  ) {
    const select = {
      id: true,
      name: true,
      phone: true,
      status: true,
      lastSeenAt: true,
      sessionName: true,
      workerKey: true,
    };

    const preferredIds = [...new Set(preferredBridgeAccountIds)];
    const preferred =
      preferredIds.length > 0
        ? await this.prisma.whatsAppBridgeAccount.findMany({
            where: {
              id: { in: preferredIds },
              archivedAt: null,
            },
            orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
            select,
          })
        : [];

    const active = await this.prisma.whatsAppBridgeAccount.findMany({
      where: {
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select,
    });

    const bridgesById = new Map(
      [...preferred, ...active].map((bridge) => [bridge.id, bridge]),
    );

    return [...bridgesById.values()];
  }

  async updateRunnerDestinationGroupScope(
    runnerId: string,
    groupId: string,
    isTestGroup: boolean,
  ) {
    const cleanGroupId = String(groupId || '').trim();
    if (!cleanGroupId) {
      throw new BadRequestException('Destination group is required');
    }

    const group = await this.prisma.runnerRepostingGroup.findFirst({
      where: {
        runnerId,
        OR: [
          { id: cleanGroupId },
          { whatsappGroupId: cleanGroupId },
          { discoveredGroup: { groupId: cleanGroupId } },
        ],
      },
      include: {
        discoveredGroup: {
          select: {
            groupId: true,
            name: true,
            participants: true,
            profileImageUrl: true,
            lastSeenAt: true,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(
        'This destination group is not linked to your runner profile',
      );
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      if (isTestGroup) {
        await tx.runnerRepostingGroup.updateMany({
          where: {
            runnerId,
            id: { not: group.id },
            isTestGroup: true,
          },
          data: { isTestGroup: false },
        });
      }

      return tx.runnerRepostingGroup.update({
        where: { id: group.id },
        data: { isTestGroup },
        include: {
          discoveredGroup: {
            select: {
              groupId: true,
              name: true,
              participants: true,
              profileImageUrl: true,
              lastSeenAt: true,
            },
          },
        },
      });
    });

    return {
      message: `${saved.groupName} is now a ${saved.isTestGroup ? 'primary' : 'additional'} posting group`,
      data: {
        runnerRepostingGroupId: saved.id,
        groupId: saved.discoveredGroup?.groupId || saved.whatsappGroupId,
        name: saved.discoveredGroup?.name || saved.groupName,
        participants: saved.discoveredGroup?.participants || 0,
        profileImageUrl: saved.discoveredGroup?.profileImageUrl || null,
        lastSeenAt: saved.discoveredGroup?.lastSeenAt || saved.updatedAt,
        isOwnGroup: true,
        isTestGroup: saved.isTestGroup,
        scope: saved.isTestGroup ? 'test' : 'live',
        readinessStatus: saved.status,
      },
    };
  }

  async updateRunnerShopAutomation(
    runnerId: string,
    shopId: string,
    dto: UpdateRunnerShopAutomationDto,
  ) {
    const link = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Not joined to this shop');
    }

    if (link.status !== 'APPROVED') {
      throw new BadRequestException(
        'Automation settings can only be changed for approved shops',
      );
    }

    const minPrice =
      dto.minPrice === undefined
        ? undefined
        : this.cleanOptionalPrice(dto.minPrice);
    const maxPrice =
      dto.maxPrice === undefined
        ? undefined
        : this.cleanOptionalPrice(dto.maxPrice);

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice !== null &&
      maxPrice !== null &&
      maxPrice < minPrice
    ) {
      throw new BadRequestException(
        'Maximum price cannot be below minimum price',
      );
    }

    const destinationGroups =
      dto.destinationGroup === undefined
        ? undefined
        : this.cleanDestinationGroups(dto.destinationGroup);

    if (destinationGroups?.length) {
      await this.assertAllowedDestinationGroups(destinationGroups);
    }

    const effectiveDestinationGroups =
      destinationGroups === undefined
        ? this.cleanDestinationGroups(link.destinationGroup) || []
        : destinationGroups;
    const effectiveAutoPostEnabled =
      dto.autoPostEnabled === undefined
        ? Boolean(link.autoPostEnabled)
        : Boolean(dto.autoPostEnabled);

    if (effectiveAutoPostEnabled && effectiveDestinationGroups.length > 0) {
      await this.assertDestinationGroupsAvailableToRunner(
        runnerId,
        effectiveDestinationGroups,
      );
    }

    const destinationGroup =
      destinationGroups === undefined
        ? undefined
        : this.serializeDestinationGroups(destinationGroups);

    const data: any = {
      ...(dto.autoListEnabled !== undefined
        ? { autoListEnabled: Boolean(dto.autoListEnabled) }
        : {}),
      ...(dto.autoPostEnabled !== undefined
        ? { autoPostEnabled: Boolean(dto.autoPostEnabled) }
        : {}),
      ...(dto.markupPercent !== undefined
        ? { markupPercent: this.clampMarkup(dto.markupPercent) }
        : {}),
      ...(dto.destinationGroup !== undefined ? { destinationGroup } : {}),
      ...(dto.maxPostsPerRun !== undefined
        ? {
            maxPostsPerRun: Math.max(
              1,
              Math.min(Number(dto.maxPostsPerRun), 10),
            ),
          }
        : {}),
      ...(dto.maximumListingAgeDays !== undefined
        ? {
            maximumListingAgeDays: Math.max(
              1,
              Math.min(Number(dto.maximumListingAgeDays), 90),
            ),
          }
        : {}),
      ...(dto.minPrice !== undefined ? { minPrice } : {}),
      ...(dto.maxPrice !== undefined ? { maxPrice } : {}),
      ...(dto.categoryFilter !== undefined
        ? { categoryFilter: this.cleanOptionalText(dto.categoryFilter) }
        : {}),
      ...(dto.requireMedia !== undefined
        ? { requireMedia: Boolean(dto.requireMedia) }
        : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.runnerShopLink.update({
        where: { id: link.id },
        data,
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              description: true,
              address: true,
              phone: true,
              owner: {
                select: {
                  name: true,
                  phone: true,
                },
              },
              products: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  stockQty: true,
                  images: true,
                },
              },
            },
          },
        },
      });
      if (dto.maximumListingAgeDays !== undefined) {
        const maximumListingAgeDays = this.clampListingAgeDays(
          dto.maximumListingAgeDays,
        );
        await tx.runnerListing.updateMany({
          where: { runnerId: link.runnerId, shopId: link.shopId },
          data: { maximumListingAgeDays },
        });
        await this.reviveEligibleInactiveListings(tx, {
          runnerId: link.runnerId,
          shopIds: [link.shopId],
          maximumListingAgeDays,
        });
      }

      if (dto.destinationGroup !== undefined) {
        await tx.runner.update({
          where: { id: runnerId },
          data: { whatsappGroup: destinationGroup },
        });
      }

      return saved;
    });

    if (dto.maximumListingAgeDays !== undefined) {
      await this.markPostingAgeConfirmed(
        runnerId,
        this.clampListingAgeDays(dto.maximumListingAgeDays),
        dto.selectionScope || 'custom',
      );
    }

    return updated;
  }

  private clampListingAgeDays(value: unknown) {
    return Math.max(1, Math.min(Number(value || 14), 90));
  }

  private cleanPhase1Setup(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async markPostingAgeConfirmed(
    runnerId: string,
    days: number,
    scope: 'test' | 'live' | 'all' | 'custom',
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { phase1Setup: true },
    });
    const existing = this.cleanPhase1Setup(runner?.phase1Setup);
    await this.prisma.runner.update({
      where: { id: runnerId },
      data: {
        phase1Setup: {
          ...existing,
          postingAgeConfirmedAt: new Date().toISOString(),
          postingAgeDays: days,
          postingAgeScope: scope,
        },
      },
    });
  }

  private async reviveEligibleInactiveListings(
    tx: Pick<PrismaService, 'runnerListing'>,
    data: {
      runnerId: string;
      shopIds: string[];
      maximumListingAgeDays: number;
    },
  ) {
    const ageCutoff = new Date(
      Date.now() - data.maximumListingAgeDays * 24 * 60 * 60 * 1000,
    );
    return tx.runnerListing.updateMany({
      where: {
        runnerId: data.runnerId,
        shopId: { in: data.shopIds },
        status: 'INACTIVE',
        product: {
          status: 'ACTIVE',
          OR: [
            { sourceRefreshedAt: { gte: ageCutoff } },
            { createdAt: { gte: ageCutoff } },
            { whatsappImports: { some: { receivedAt: { gte: ageCutoff } } } },
          ],
        },
      },
      data: {
        status: 'ACTIVE',
        autoPostApproved: true,
        maximumListingAgeDays: data.maximumListingAgeDays,
        pausedAt: null,
        stoppedAt: null,
      },
    });
  }

  async updateAllRunnerShopAutomation(
    runnerId: string,
    dto: UpdateRunnerShopAutomationDto,
  ) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        ...(dto.selectionScope === 'test'
          ? { selectedForTest: true, selectedForLive: false }
          : dto.selectionScope === 'all'
            ? {}
            : { selectedForLive: true }),
      },
      select: {
        shopId: true,
      },
      orderBy: { joinedAt: 'asc' },
    });

    if (links.length === 0) {
      throw new BadRequestException('No approved shops to update');
    }

    const updated: any[] = [];
    for (const link of links) {
      updated.push(
        await this.updateRunnerShopAutomation(runnerId, link.shopId, dto),
      );
    }

    return {
      message: `Automation settings applied to ${updated.length} approved shop${updated.length === 1 ? '' : 's'}`,
      total: updated.length,
      data: updated,
    };
  }

  async cancelJoinRequest(runnerId: string, shopId: string) {
    const link = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
      include: {
        shop: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Shop request not found');
    }

    if (link.status === 'APPROVED') {
      throw new BadRequestException(
        'Approved shops must be left using the leave shop action',
      );
    }

    if (link.status === 'BLOCKED') {
      throw new BadRequestException(
        'Blocked shop requests cannot be cancelled',
      );
    }

    if (link.selectedForTest) {
      await this.prisma.runnerShopLink.update({
        where: { id: link.id },
        data: { selectedForLive: false },
      });
    } else {
      await this.prisma.runnerShopLink.delete({
        where: { id: link.id },
      });
    }

    return {
      message: `Request for ${link.shop.name} cancelled`,
    };
  }

  async queueCaptureForApprovedShops(runnerId: string, shopIds?: string[]) {
    const requestedShopIds = [...new Set(shopIds || [])].filter(Boolean);
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        selectedForLive: true,
        ...(requestedShopIds.length > 0
          ? { shopId: { in: requestedShopIds } }
          : {}),
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (links.length === 0) {
      throw new BadRequestException(
        requestedShopIds.length > 0
          ? 'No selected approved shops found for this runner'
          : 'This runner has no approved shops to capture',
      );
    }

    const jobId = randomUUID();
    const pendingDir = resolve(
      process.env.WHATSAPP_CAPTURE_OUTBOX_DIR || './whatsapp-capture-outbox',
      'pending',
    );
    await mkdir(pendingDir, { recursive: true });

    const shopPayload = links.map((link) => ({
      id: link.shopId,
      name: link.shop.name,
    }));
    const job = {
      id: jobId,
      runnerId,
      shopIds: shopPayload.map((shop) => shop.id),
      shops: shopPayload,
      mode: 'since-last-capture',
      createdAt: new Date().toISOString(),
    };

    await writeFile(
      resolve(pendingDir, `${jobId}.json`),
      JSON.stringify(job, null, 2),
      'utf8',
    );

    return {
      id: jobId,
      status: 'QUEUED',
      shopCount: shopPayload.length,
      shops: shopPayload,
      message:
        'Capture request queued. Keep npm run whatsapp:session:bridge running.',
    };
  }

  /**
   * Get runner's approved shops (for marketplace filtering)
   */
  async getRunnerApprovedShops(runnerId: string) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        selectedForLive: true,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            description: true,
            phone: true,
            products: {
              where: { status: 'ACTIVE' },
              include: {
                listings: {
                  where: { status: 'ACTIVE' },
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
        },
      },
    });
    const decoratedLinks =
      await this.attachShopGroupAvatarsToAssignments(links);

    // Flatten products from all shops
    const products = decoratedLinks.flatMap((link: any) =>
      link.shop.products.map((product: any) => ({
        ...product,
        shopId: link.shop.id,
        shopName: link.shop.name,
        shopRelatedWhatsAppGroups: link.shop.relatedWhatsAppGroups || [],
        primaryWhatsAppGroup: link.shop.primaryWhatsAppGroup || null,
      })),
    );

    return {
      shops: decoratedLinks.map((link: any) => link.shop),
      products,
      totalShops: decoratedLinks.length,
      totalProducts: products.length,
    };
  }

  /**
   * Runner: Leave a shop
   */
  async leaveShop(runnerId: string, shopId: string) {
    const link = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Not joined to this shop');
    }

    if (link.selectedForTest) {
      await this.prisma.runnerShopLink.update({
        where: { id: link.id },
        data: { selectedForLive: false },
      });
    } else {
      await this.prisma.runnerShopLink.delete({
        where: { id: link.id },
      });
    }

    return { message: 'Successfully left the shop' };
  }

  /**
   * Shop Owner: Block/Remove a runner
   */
  async removeRunner(shopId: string, ownerId: string, runnerId: string) {
    // Verify shop ownership
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, ownerId },
    });

    if (!shop) {
      throw new ForbiddenException('You do not own this shop');
    }

    const link = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId,
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Runner-shop relationship not found');
    }

    await this.prisma.runnerShopLink.delete({
      where: { id: link.id },
    });

    return { message: 'Runner removed from shop' };
  }

  /**
   * Customer: Get available runners for a shop
   */
  async getRunnersForShop(shopId: string) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        shopId,
        status: 'APPROVED',
        runner: {
          status: 'ACTIVE',
        },
      },
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
    });

    return links.map((link: any) => ({
      id: link.runner.id,
      name: link.runner.user.name,
      phone: link.runner.user.phone,
      rating: link.runner.rating,
      totalOrders: link.runner.totalOrders,
      joinedAt: link.joinedAt,
    }));
  }

  /**
   * Customer: Find runners that can fulfill multi-shop order
   */
  async findRunnersForMultiShopOrder(shopIds: string[]) {
    // Find runners approved for ALL shops in the order
    const runnerCounts = await this.prisma.runnerShopLink.groupBy({
      by: ['runnerId'],
      where: {
        shopId: { in: shopIds },
        status: 'APPROVED',
        runner: {
          status: 'ACTIVE',
        },
      },
      _count: {
        runnerId: true,
      },
      having: {
        runnerId: {
          _count: {
            equals: shopIds.length,
          },
        },
      },
    });

    const runnerIds = runnerCounts.map((r: any) => r.runnerId);

    if (runnerIds.length === 0) {
      return {
        singleRunner: null,
        suggestedSplit: [],
      };
    }

    // Get runner details
    const runners = await this.prisma.runner.findMany({
      where: { id: { in: runnerIds } },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    return {
      singleRunner: runners[0] || null,
      suggestedSplit: runners.map((r: any) => ({
        id: r.id,
        name: r.user.name,
        phone: r.user.phone,
        rating: r.rating,
        canHandleAllShops: true,
      })),
    };
  }

  private cleanOptionalText(value?: string | null) {
    const clean = String(value ?? '').trim();
    return clean || null;
  }

  private cleanOptionalPrice(value?: number | null) {
    if (value === null) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Math.round(amount * 100) / 100;
  }

  private clampMarkup(value?: number | null) {
    const markup = Number(value);
    if (!Number.isFinite(markup)) return 0;
    return Math.max(0, Math.min(markup, 0.5));
  }

  private cleanDestinationGroups(value?: string | string[] | null) {
    if (value === undefined) return undefined;

    const groups = Array.from(
      new Set(parseDestinationGroups(value).map((group) => group.trim())),
    );

    if (groups.length > 2) {
      throw new BadRequestException(
        'Select a maximum of two destination WhatsApp groups',
      );
    }

    return groups;
  }

  private serializeDestinationGroups(groups?: string[]) {
    if (!groups || groups.length === 0) return null;
    if (groups.length === 1) return groups[0];
    return JSON.stringify(groups);
  }

  private async attachShopGroupAvatarsToAssignments<T extends { shop?: any }>(
    assignments: T[],
  ) {
    const groupIds = [
      ...new Set(
        assignments
          .flatMap((assignment) => assignment.shop?.whatsappGroupMappings || [])
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

    return assignments.map((assignment) => {
      const relatedWhatsAppGroups = (
        assignment.shop?.whatsappGroupMappings || []
      )
        .map((mapping: any) => {
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
        .sort((left: any, right: any) => {
          if (left.isPrimarySource !== right.isPrimarySource) {
            return left.isPrimarySource ? -1 : 1;
          }
          if (left.status !== right.status) {
            return left.status === 'ACTIVE' ? -1 : 1;
          }
          return String(left.name).localeCompare(String(right.name));
        });

      return {
        ...assignment,
        shop: assignment.shop
          ? {
              ...assignment.shop,
              relatedWhatsAppGroups,
              primaryWhatsAppGroup:
                relatedWhatsAppGroups.find(
                  (group: any) => group.isPrimarySource,
                ) ||
                relatedWhatsAppGroups[0] ||
                null,
            }
          : assignment.shop,
      };
    });
  }

  private async assertAllowedDestinationGroups(destinationGroups: string[]) {
    const groups = await this.prisma.whatsAppDiscoveredGroup.findMany({
      where: { groupPurpose: 'RUNNER_ADVERTISING' },
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
      select: {
        groupId: true,
        name: true,
      },
    });
    const allowedGroups = new Set<string>();
    groups.forEach((group) => {
      allowedGroups.add(group.groupId);
      allowedGroups.add(group.name);
    });

    const hasUnknownGroup = destinationGroups.some(
      (destinationGroup) => !allowedGroups.has(destinationGroup),
    );

    if (hasUnknownGroup) {
      throw new BadRequestException(
        'Select destination WhatsApp groups from imported runner advertising groups',
      );
    }
  }

  /**
   * Enforces the Shared Destination Group Monitor rule: an active auto-post
   * destination may belong to only one runner. Multiple shop assignments for
   * that same runner are allowed because they cannot create cross-runner posts.
   */
  private async assertDestinationGroupsAvailableToRunner(
    runnerId: string,
    destinationGroups: string[],
  ) {
    await assertDestinationGroupsAvailableToRunner(
      this.prisma,
      runnerId,
      destinationGroups,
    );
  }

  private normalizeDestinationKey(value?: string | null) {
    return normalizeDestinationKey(value);
  }

  private async getSettingBoolean(key: string, defaultValue: boolean) {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key },
    });
    if (!setting) return defaultValue;
    return String(setting.value).toLowerCase() === 'true';
  }
}
