import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import { extname, join, relative, resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { ProductStatus } from '../products/dto/create-product.dto';
import { IngestWhatsAppPostDto } from './dto/ingest-whatsapp-post.dto';
import { UpdateWhatsAppImportDto } from './dto/update-whatsapp-import.dto';
import { UpdateCaptureCheckpointDto } from './dto/update-capture-checkpoint.dto';
import { CreateWhatsAppGroupMappingDto } from './dto/create-whatsapp-group-mapping.dto';
import { LinkDiscoveredGroupToShopDto } from './dto/link-discovered-group-to-shop.dto';
import { UpdateWhatsAppGroupMappingDto } from './dto/update-whatsapp-group-mapping.dto';
import { SyncWhatsAppDiscoveredGroupsDto } from './dto/sync-whatsapp-discovered-groups.dto';
import { SyncWhatsAppDiscoveredChannelsDto } from './dto/sync-whatsapp-discovered-channels.dto';
import { IngestWhatsAppOrderRequestDto } from './dto/ingest-whatsapp-order-request.dto';

const TRANSPORT_FEE_RATE = 0;
const WEB_CART_EXPIRY_HOURS = 24;
const CUSTOMER_ORDER_BLOCKED_ROLES = new Set([
  'RUNNER',
  'SHOP_OWNER',
  'ADMIN',
  'SUPERUSER',
]);
const WHATSAPP_REPOSTING_ENABLED_KEY = 'whatsappRepostingEnabled';
const SUPERUSER_SUPPORT_PHONE = '+26876154884';

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

interface ParsedDraft {
  name: string;
  description?: string;
  basePrice: number;
  stockQty: number;
  category?: string;
  images?: string[];
  sourceText?: string;
  aiConfidence?: number;
  aiSource?: string;
  aiTags?: string[];
  colors?: string[];
  sizes?: string[];
  priceConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  priceWarnings?: string[];
  rawPriceCandidates?: Array<{
    label: string;
    value: number;
    source: string;
    confidence: number;
  }>;
  unitPrice?: number;
  stockPrice?: number;
  eachPrice?: number;
  stockIsBulkPrice?: boolean;
  regularUnitPrice?: number;
  bulkUnitPrice?: number;
  bulkQuantity?: number;
  bulkTotal?: number;
  bulkSavings?: number;
  bulkSavingsPerItem?: number;
  bulkSavingsPercent?: number;
}

interface AiProductEnrichment {
  itemName: string;
  description: string;
  category?: string;
  colors?: string[];
  sizes?: string[];
  tags?: string[];
  confidence: number;
  needsReview: boolean;
}

interface VisualSearchCandidate {
  title: string;
  source?: string;
  link?: string;
  price?: string;
}

type WhatsAppImportRecord = Prisma.WhatsAppImportGetPayload<object>;

@Injectable()
export class WhatsAppImportsService {
  private readonly logger = new Logger(WhatsAppImportsService.name);

  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private configService: ConfigService,
  ) {}

  async isWhatsAppOrderTrackingEnabled() {
    const settings = await (this.prisma as any).appSetting.findMany({
      where: {
        key: { in: ['phase2Enabled', 'whatsappOrderTrackingEnabled'] },
      },
    });
    const enabled = new Map(
      settings.map((setting: { key: string; value: string }) => [
        setting.key,
        String(setting.value).toLowerCase() === 'true',
      ]),
    );
    return (
      enabled.get('phase2Enabled') === true &&
      enabled.get('whatsappOrderTrackingEnabled') === true
    );
  }

  private async isWhatsAppRepostingEnabled() {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key: WHATSAPP_REPOSTING_ENABLED_KEY },
      select: { value: true },
    });
    return String(setting?.value || '').toLowerCase() === 'true';
  }

  async ingest(shopId: string, userId: string, dto: IngestWhatsAppPostDto) {
    await this.assertShopOwner(shopId, userId);

    return this.queuePost(shopId, dto);
  }

  async listDiscoveredGroups(
    userId: string,
    userRole: string,
    bridgeAccountId?: string,
    availability?: string,
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const normalizedBridgeAccountId = this.cleanOptionalText(
      bridgeAccountId,
      80,
    );
    const availabilityFilter = this.cleanOptionalText(availability, 40);
    const bridgeOnlineSince = new Date(Date.now() - 5 * 60 * 1000);

    const presenceWhere: Prisma.WhatsAppBridgeGroupPresenceWhereInput = {
      archivedAt: null,
      ...(normalizedBridgeAccountId
        ? { bridgeAccountId: normalizedBridgeAccountId }
        : {}),
      ...(availabilityFilter === 'available'
        ? {
            isAvailable: true,
            bridgeAccount: {
              status: 'ONLINE',
              lastSeenAt: { gte: bridgeOnlineSince },
            },
          }
        : availabilityFilter === 'unavailable'
          ? {
              OR: [
                { isAvailable: false },
                { bridgeAccount: { status: { not: 'ONLINE' } } },
                { bridgeAccount: { lastSeenAt: { lt: bridgeOnlineSince } } },
                { bridgeAccount: { lastSeenAt: null } },
              ],
            }
          : {}),
    };

    const groups = normalizedBridgeAccountId
      ? (
          await this.prisma.whatsAppBridgeGroupPresence.findMany({
            where: presenceWhere,
            orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
            take: 1000,
            include: {
              bridgeAccount: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  status: true,
                  lastSeenAt: true,
                },
              },
              discoveredGroup: true,
            },
          })
        ).map((presence) => {
          const effectivePresence = this.withEffectiveBridgeAvailability(
            presence,
            bridgeOnlineSince,
          );
          return {
            ...presence.discoveredGroup,
            name: presence.name,
            creatorId: presence.creatorId,
            creatorPhone: presence.creatorPhone,
            participants: presence.participants,
            lastSeenAt: presence.lastSeenAt,
            bridgePresence: [effectivePresence],
          };
        })
      : await this.prisma.whatsAppDiscoveredGroup.findMany({
          where: {
            archivedAt: null,
            ...(availabilityFilter === 'available' ||
            availabilityFilter === 'unavailable'
              ? {
                  bridgePresence: {
                    some: {
                      isAvailable: availabilityFilter === 'available',
                      archivedAt: null,
                      ...(availabilityFilter === 'available'
                        ? {
                            bridgeAccount: {
                              status: 'ONLINE',
                              lastSeenAt: { gte: bridgeOnlineSince },
                            },
                          }
                        : {}),
                    },
                  },
                }
              : {}),
          },
          orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
          take: 1000,
          include: {
            bridgePresence: {
              where: { archivedAt: null },
              orderBy: [{ lastSeenAt: 'desc' }],
              take: 10,
              include: {
                bridgeAccount: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    lastSeenAt: true,
                  },
                },
              },
            },
          },
        });

    const importedShopIds = groups
      .map((group) => group.importedShopId)
      .filter((shopId): shopId is string => Boolean(shopId));
    const mappedGroupIds = groups.map((group) => group.groupId);
    const [shops, mappings] = await Promise.all([
      importedShopIds.length > 0
        ? this.prisma.shop.findMany({
            where: { id: { in: importedShopIds } },
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
          })
        : [],
      mappedGroupIds.length > 0
        ? this.prisma.whatsAppGroupMapping.findMany({
            where: { groupId: { in: mappedGroupIds } },
            select: {
              id: true,
              groupId: true,
              shopId: true,
              status: true,
              groupRole: true,
              isPrimarySource: true,
            },
          })
        : [],
    ]);
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    const mappingByGroupId = new Map(
      mappings.map((mapping) => [mapping.groupId, mapping]),
    );

    return {
      data: groups.map((group) => {
        const effectivePresence = (group.bridgePresence || []).map((presence) =>
          this.withEffectiveBridgeAvailability(presence, bridgeOnlineSince),
        );

        return {
          ...group,
          // Historical bridge associations remain in the audit data, but only
          // current relationships belong in normal group discovery results.
          bridgePresence:
            availabilityFilter === 'unavailable'
              ? effectivePresence
              : effectivePresence.filter((presence) => presence.isAvailable),
          importedShop: group.importedShopId
            ? shopById.get(group.importedShopId) || null
            : null,
          mapping: mappingByGroupId.get(group.groupId) || null,
        };
      }),
      total: groups.length,
    };
  }

  async syncDiscoveredGroupsForBridge(dto: SyncWhatsAppDiscoveredGroupsDto) {
    const now = new Date();
    const groups = dto.groups ?? [];
    const bridgeAccountId = this.cleanOptionalText(dto.bridgeAccountId, 80);
    const seenGroupIds: string[] = [];

    if (bridgeAccountId) {
      const bridge = await this.prisma.whatsAppBridgeAccount.findUnique({
        where: { id: bridgeAccountId },
        select: {
          id: true,
          name: true,
          phone: true,
          expectedPhone: true,
          verifiedPhone: true,
          mode: true,
        },
      });
      if (!bridge) {
        throw new BadRequestException('Unknown WhatsApp bridge account');
      }

      const authenticatedPhone =
        this.normalizePhone(dto.authenticatedPhone) ?? null;
      const expectedPhone =
        this.normalizePhone(bridge.expectedPhone) ??
        this.normalizePhone(bridge.phone);
      const hasMismatch =
        Boolean(authenticatedPhone && expectedPhone) &&
        authenticatedPhone !== expectedPhone;

      await this.prisma.whatsAppBridgeAccount.update({
        where: { id: bridgeAccountId },
        data: {
          status: hasMismatch ? 'MISMATCHED' : 'ONLINE',
          lastSeenAt: now,
          ...(authenticatedPhone
            ? {
                verifiedPhone: authenticatedPhone,
                phoneVerifiedAt: now,
                verificationStatus: hasMismatch ? 'MISMATCHED' : 'VERIFIED',
                mismatchReason: hasMismatch
                  ? `Expected ${expectedPhone}, but WhatsApp Web is linked to ${authenticatedPhone}.`
                  : null,
              }
            : {
                verificationStatus: expectedPhone ? 'UNVERIFIED' : 'UNKNOWN',
              }),
        },
      });

      if (hasMismatch) {
        return {
          synced: 0,
          skipped: groups.length,
          syncedAt: now,
          bridgeAccountId,
          bridgeVerification: {
            status: 'MISMATCHED',
            expectedPhone,
            authenticatedPhone,
            message:
              'Wrong WhatsApp number is connected to this bridge. Group sync, capture, and reposting are blocked until the correct number is linked.',
          },
        };
      }
    }

    for (const group of groups) {
      const groupId = this.cleanRequiredText(group.groupId, 160, 'Group id');
      if (!this.isCanonicalWhatsAppGroupId(groupId)) {
        continue;
      }
      const name = this.cleanRequiredText(group.name, 240, 'Group name');
      const participants = Math.max(0, Number(group.participants || 0));
      if (
        this.isPlaceholderWhatsAppGroupName(groupId, name) &&
        participants === 0
      ) {
        continue;
      }
      const creatorId = this.cleanOptionalText(group.creatorId, 160) ?? null;
      const creatorPhone =
        this.normalizePhone(group.creatorPhone) ??
        this.creatorPhoneFromGroupId(groupId);
      const profileImageUrl =
        this.cleanOptionalText(group.profileImageUrl, 500) ?? null;
      const participantPhones = this.cleanParticipantPhones(
        group.participantPhones,
      );
      seenGroupIds.push(groupId);

      const discoveredGroup = await this.prisma.whatsAppDiscoveredGroup.upsert({
        where: { groupId },
        update: {
          name,
          creatorId,
          creatorPhone,
          participants,
          ...(profileImageUrl ? { profileImageUrl } : {}),
          archivedAt: null,
          lastSeenAt: now,
        },
        create: {
          groupId,
          name,
          creatorId,
          creatorPhone,
          participants,
          profileImageUrl,
          lastSeenAt: now,
        },
      });

      if (bridgeAccountId) {
        await this.prisma.whatsAppBridgeGroupPresence.upsert({
          where: {
            bridgeAccountId_groupId: {
              bridgeAccountId,
              groupId,
            },
          },
          update: {
            discoveredGroupId: discoveredGroup.id,
            name,
            creatorId,
            creatorPhone,
            participants,
            ...(profileImageUrl ? { profileImageUrl } : {}),
            isAvailable: true,
            archivedAt: null,
            lastSeenAt: now,
          },
          create: {
            bridgeAccountId,
            discoveredGroupId: discoveredGroup.id,
            groupId,
            name,
            creatorId,
            creatorPhone,
            participants,
            profileImageUrl,
            isAvailable: true,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });
      }

      if (Array.isArray(group.participantPhones)) {
        await this.syncDiscoveredGroupMembers(
          discoveredGroup.id,
          groupId,
          participantPhones,
          now,
        );
      }
    }

    if (bridgeAccountId) {
      await this.prisma.whatsAppBridgeGroupPresence.updateMany({
        where: {
          bridgeAccountId,
          ...(seenGroupIds.length > 0
            ? { groupId: { notIn: seenGroupIds } }
            : {}),
        },
        data: {
          isAvailable: false,
          archivedAt: now,
        },
      });
    }

    const conflictSummary = await this.rebuildCustomerGroupConflicts(now);

    return {
      synced: seenGroupIds.length,
      skipped: Math.max(0, groups.length - seenGroupIds.length),
      syncedAt: now,
      customerGroupConflicts: conflictSummary,
      bridgeAccountId,
      bridgeVerification: bridgeAccountId
        ? {
            status: 'VERIFIED_OR_NOT_REQUIRED',
            authenticatedPhone:
              this.normalizePhone(dto.authenticatedPhone) ?? null,
          }
        : null,
    };
  }

  async listCustomerGroupConflicts(userRole: string, status = 'OPEN') {
    this.assertCanManageWhatsAppDiscovery(userRole);
    const cleanStatus = String(status || 'OPEN')
      .trim()
      .toUpperCase();
    return (this.prisma as any).customerGroupConflict.findMany({
      where: cleanStatus === 'ALL' ? {} : { status: cleanStatus },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async resolveCustomerGroupConflict(
    conflictId: string,
    actorUserId: string,
    userRole: string,
    dto: { runnerId?: string; note?: string },
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);
    const runnerId = this.cleanRequiredText(dto.runnerId, 80, 'Runner id');
    const conflict = await (
      this.prisma as any
    ).customerGroupConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new NotFoundException('Customer group conflict not found');
    }

    if (conflict.status !== 'OPEN') {
      throw new BadRequestException('Only open conflicts can be resolved');
    }

    const runnerIds = Array.isArray(conflict.runnerIds)
      ? conflict.runnerIds.map((id: unknown) => String(id))
      : [];
    if (!runnerIds.includes(runnerId)) {
      throw new BadRequestException(
        'Chosen runner is not part of this conflict',
      );
    }

    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    if (!runner || runner.status !== 'ACTIVE') {
      throw new BadRequestException('Chosen runner is not active');
    }

    const customer = await this.prisma.user.findFirst({
      where: {
        phone: { in: this.phoneCandidates(conflict.customerPhone) },
        role: { name: 'CUSTOMER' },
      },
      select: { id: true },
    });

    const now = new Date();
    const note = this.cleanOptionalText(dto.note, 300);

    const [updated] = await this.prisma.$transaction([
      (this.prisma as any).customerGroupConflict.update({
        where: { id: conflict.id },
        data: {
          status: 'RESOLVED',
          chosenRunnerId: runnerId,
          resolvedById: actorUserId,
          resolvedAt: now,
          resolutionNote: note,
        },
      }),
      ...(customer
        ? [
            this.prisma.customerRunnerPreference.upsert({
              where: {
                customerId_city: {
                  customerId: customer.id,
                  city: conflict.city,
                },
              },
              create: {
                customerId: customer.id,
                city: conflict.city,
                runnerPhone:
                  runner.phone || runner.user?.phone || conflict.customerPhone,
                runnerId,
                status: 'MATCHED',
                matchedAt: now,
              },
              update: {
                runnerPhone:
                  runner.phone || runner.user?.phone || conflict.customerPhone,
                runnerId,
                status: 'MATCHED',
                matchedAt: now,
                replacedAt: now,
              },
            }),
          ]
        : []),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'CUSTOMER_GROUP_CONFLICT_RESOLVED',
          entityType: 'CustomerGroupConflict',
          entityId: conflict.id,
          summary: `${conflict.city} customer group conflict resolved`,
          metadata: {
            customerPhone: conflict.customerPhone,
            city: conflict.city,
            chosenRunnerId: runnerId,
            customerId: customer?.id ?? null,
            note,
          },
        },
      }),
    ]);

    return updated;
  }

  async listDiscoveredChannels(
    userId: string,
    userRole: string,
    bridgeAccountId?: string,
    availability?: string,
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const normalizedBridgeAccountId = this.cleanOptionalText(
      bridgeAccountId,
      80,
    );
    const availabilityFilter = this.cleanOptionalText(availability, 40);
    const bridgeOnlineSince = new Date(Date.now() - 5 * 60 * 1000);

    const channels = await (
      this.prisma as any
    ).whatsAppDiscoveredChannel.findMany({
      where: {
        ...(normalizedBridgeAccountId
          ? { bridgeAccountId: normalizedBridgeAccountId }
          : {}),
        ...(availabilityFilter === 'available'
          ? {
              archivedAt: null,
              bridgeAccount: {
                status: 'ONLINE',
                lastSeenAt: { gte: bridgeOnlineSince },
              },
            }
          : availabilityFilter === 'unavailable'
            ? {
                OR: [
                  { archivedAt: { not: null } },
                  { bridgeAccount: { status: { not: 'ONLINE' } } },
                  { bridgeAccount: { lastSeenAt: { lt: bridgeOnlineSince } } },
                  { bridgeAccount: { lastSeenAt: null } },
                ],
              }
            : {}),
      },
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
      take: 1000,
      include: {
        bridgeAccount: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            lastSeenAt: true,
          },
        },
      },
    });

    return {
      data: channels.map((channel: any) => ({
        ...channel,
        isAvailable:
          !channel.archivedAt &&
          channel.bridgeAccount?.status === 'ONLINE' &&
          channel.bridgeAccount?.lastSeenAt &&
          new Date(channel.bridgeAccount.lastSeenAt) >= bridgeOnlineSince,
      })),
      total: channels.length,
    };
  }

  async syncDiscoveredChannelsForBridge(
    dto: SyncWhatsAppDiscoveredChannelsDto,
  ) {
    const now = new Date();
    const channels = dto.channels ?? [];
    const bridgeAccountId = this.cleanOptionalText(dto.bridgeAccountId, 80);
    const seenChannelIds: string[] = [];

    if (bridgeAccountId) {
      const bridge = await this.prisma.whatsAppBridgeAccount.findUnique({
        where: { id: bridgeAccountId },
        select: { id: true },
      });
      if (!bridge) {
        throw new BadRequestException('Unknown WhatsApp bridge account');
      }

      await this.prisma.whatsAppBridgeAccount.update({
        where: { id: bridgeAccountId },
        data: {
          status: 'ONLINE',
          lastSeenAt: now,
        },
      });
    }

    for (const channel of channels) {
      const channelId = this.cleanRequiredText(
        channel.channelId,
        160,
        'Channel id',
      );
      if (!this.isCanonicalWhatsAppChannelId(channelId)) {
        continue;
      }

      const name = this.cleanRequiredText(channel.name, 240, 'Channel name');
      const description =
        this.cleanOptionalText(channel.description, 1000) ?? null;
      const unreadCount = Math.max(0, Number(channel.unreadCount || 0));
      const subscriberCount =
        channel.subscriberCount === undefined ||
        channel.subscriberCount === null
          ? null
          : Math.max(0, Number(channel.subscriberCount || 0));
      const inviteLink =
        this.cleanOptionalText(channel.inviteLink, 500) ?? null;
      const timestamp = Number(channel.timestamp || 0);
      const lastActivityAt = timestamp > 0 ? new Date(timestamp * 1000) : null;

      seenChannelIds.push(channelId);

      await (this.prisma as any).whatsAppDiscoveredChannel.upsert({
        where: { channelId },
        update: {
          bridgeAccountId,
          name,
          description,
          isReadOnly: Boolean(channel.isReadOnly),
          unreadCount,
          subscriberCount,
          inviteLink,
          lastActivityAt,
          archivedAt: null,
          lastSeenAt: now,
        },
        create: {
          bridgeAccountId,
          channelId,
          name,
          description,
          isReadOnly: Boolean(channel.isReadOnly),
          unreadCount,
          subscriberCount,
          inviteLink,
          lastActivityAt,
          lastSeenAt: now,
        },
      });
    }

    if (bridgeAccountId) {
      await (this.prisma as any).whatsAppDiscoveredChannel.updateMany({
        where: {
          bridgeAccountId,
          ...(seenChannelIds.length > 0
            ? { channelId: { notIn: seenChannelIds } }
            : {}),
        },
        data: { archivedAt: now },
      });
    }

    return {
      synced: seenChannelIds.length,
      skipped: Math.max(0, channels.length - seenChannelIds.length),
      syncedAt: now,
      bridgeAccountId,
    };
  }

  async importDiscoveredGroupAsShop(
    groupId: string,
    userId: string,
    userRole: string,
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const group = await this.prisma.whatsAppDiscoveredGroup.findUnique({
      where: { groupId },
    });

    if (!group) {
      throw new NotFoundException(`WhatsApp group ${groupId} not found`);
    }

    const creatorPhone =
      this.normalizePhone(group.creatorPhone) ??
      this.creatorPhoneFromGroupId(group.groupId) ??
      this.placeholderPhoneFromGroupId(group.groupId);

    const ownerResult = await this.resolveOrCreateShopOwnerFromGroup({
      groupName: group.name,
      creatorPhone,
    });
    const runnerSubmittedDestination =
      await this.runnerSubmittedShoppingDestinationForGroup(group.groupId);
    const shopDraft = this.shopDraftFromDiscoveredGroup(
      group,
      ownerResult.owner.id,
      creatorPhone,
      runnerSubmittedDestination,
    );
    let existingShop = await this.findRelatedShopForGroup(
      shopDraft.name,
      ownerResult.owner.id,
    );
    const reusedGlobalDuplicate = !existingShop;
    if (!existingShop) {
      existingShop = await this.findGlobalRelatedShopForGroup(
        shopDraft.name,
        creatorPhone,
      );
    }
    if (
      existingShop &&
      existingShop.name !== shopDraft.name &&
      this.areLikelySameShopName(existingShop.name, shopDraft.name)
    ) {
      existingShop = await this.prisma.shop.update({
        where: { id: existingShop.id },
        data: { name: shopDraft.name },
        select: {
          id: true,
          name: true,
          phone: true,
          ownerId: true,
        },
      });
    }
    const shop = existingShop
      ? existingShop
      : await this.prisma.shop.create({
          data: shopDraft,
          select: {
            id: true,
            name: true,
            phone: true,
            ownerId: true,
          },
        });
    const existingPrimarySource =
      existingShop &&
      (await this.prisma.whatsAppGroupMapping.findFirst({
        where: {
          shopId: shop.id,
          groupRole: 'SOURCE',
          isPrimarySource: true,
          status: { not: 'INACTIVE' },
          groupId: { not: group.groupId },
        },
        select: { id: true },
      }));
    const importedAsRelatedDestination = Boolean(existingPrimarySource);
    const groupRole = importedAsRelatedDestination
      ? 'SHOP_REPOST_DESTINATION'
      : 'SOURCE';
    const mappingStatus = importedAsRelatedDestination ? 'PAUSED' : 'ACTIVE';
    const isPrimarySource = !importedAsRelatedDestination;
    const mapping = await this.prisma.whatsAppGroupMapping.upsert({
      where: { groupId: group.groupId },
      update: {
        shopId: shop.id,
        sourceGroup: group.name,
        participants: group.participants,
        status: mappingStatus,
        groupRole,
        isPrimarySource,
      },
      create: {
        shopId: shop.id,
        groupId: group.groupId,
        sourceGroup: group.name,
        participants: group.participants,
        status: mappingStatus,
        groupRole,
        isPrimarySource,
        notes: importedAsRelatedDestination
          ? 'Imported as related same-shop destination group. Shop-group reposting is paused until shop owner agreement.'
          : 'Imported from authenticated WhatsApp groups UI as the primary shop source group',
        createdById: userId,
      },
    });

    if (isPrimarySource) {
      await this.prisma.whatsAppGroupMapping.updateMany({
        where: {
          shopId: shop.id,
          id: { not: mapping.id },
        },
        data: { isPrimarySource: false },
      });
    }

    await this.prisma.whatsAppDiscoveredGroup.update({
      where: { groupId: group.groupId },
      data: {
        importedShopId: shop.id,
        groupPurpose: 'SHOP_OWNED',
        importedRunnerAdvertisingAt: null,
      },
    });

    return {
      group: {
        groupId: group.groupId,
        name: group.name,
        creatorPhone,
        participants: group.participants,
      },
      owner: ownerResult.owner,
      ownerCreated: ownerResult.created,
      temporaryPassword: ownerResult.temporaryPassword,
      shop,
      shopCreated: !existingShop,
      reusedGlobalDuplicate: reusedGlobalDuplicate && Boolean(existingShop),
      importedAsRelatedDestination,
      mapping,
    };
  }

  async linkDiscoveredGroupToShop(
    groupId: string,
    userId: string,
    userRole: string,
    dto: LinkDiscoveredGroupToShopDto,
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const [group, shop] = await Promise.all([
      this.prisma.whatsAppDiscoveredGroup.findUnique({
        where: { groupId },
      }),
      this.prisma.shop.findUnique({
        where: { id: dto.shopId },
        select: {
          id: true,
          name: true,
          status: true,
        },
      }),
    ]);

    if (!group) {
      throw new NotFoundException(`WhatsApp group ${groupId} not found`);
    }

    if (!shop) {
      throw new NotFoundException(`Shop ${dto.shopId} not found`);
    }

    if (shop.status !== 'ACTIVE') {
      throw new BadRequestException('Shop is not active');
    }

    const groupRole = dto.groupRole ?? 'SOURCE';
    const isDestination = groupRole === 'SHOP_REPOST_DESTINATION';
    const isPrimarySource = !isDestination && Boolean(dto.isPrimarySource);
    const status = isDestination ? 'PAUSED' : 'ACTIVE';
    const notes = isDestination
      ? 'Linked from authenticated WhatsApp groups as a paused same-shop destination. Shop-group reposting requires shop owner agreement.'
      : 'Linked from authenticated WhatsApp groups as a shop source group.';

    const mapping = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.whatsAppGroupMapping.upsert({
        where: { groupId: group.groupId },
        update: {
          shopId: shop.id,
          sourceGroup: group.name,
          participants: group.participants,
          status,
          groupRole,
          isPrimarySource,
          notes,
        },
        create: {
          shopId: shop.id,
          groupId: group.groupId,
          sourceGroup: group.name,
          participants: group.participants,
          status,
          groupRole,
          isPrimarySource,
          notes,
          createdById: userId,
        },
        include: {
          shop: {
            select: { id: true, name: true },
          },
        },
      });

      if (isPrimarySource) {
        await tx.whatsAppGroupMapping.updateMany({
          where: {
            shopId: shop.id,
            id: { not: saved.id },
          },
          data: { isPrimarySource: false },
        });
      }

      await tx.whatsAppDiscoveredGroup.update({
        where: { groupId: group.groupId },
        data: {
          importedShopId: shop.id,
          groupPurpose: 'SHOP_OWNED',
          importedRunnerAdvertisingAt: null,
        },
      });

      return saved;
    });

    return {
      group: {
        groupId: group.groupId,
        name: group.name,
        participants: group.participants,
      },
      shop,
      mapping,
      message: isDestination
        ? 'Group linked to shop as a paused same-shop destination.'
        : 'Group linked to shop as a source group.',
    };
  }

  async importDiscoveredGroupAsRunnerAdvertising(
    groupId: string,
    userRole: string,
  ) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const group = await this.prisma.whatsAppDiscoveredGroup.findUnique({
      where: { groupId },
      include: {
        bridgePresence: {
          where: { isAvailable: true },
          take: 1,
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`WhatsApp group ${groupId} not found`);
    }

    const existingMapping = await this.prisma.whatsAppGroupMapping.findUnique({
      where: { groupId },
      select: { id: true, shop: { select: { name: true } } },
    });

    if (existingMapping || group.importedShopId) {
      throw new BadRequestException(
        'This group is already linked as a shop-owned WhatsApp group',
      );
    }

    if (group.bridgePresence.length === 0) {
      throw new BadRequestException(
        'Runner advertising groups must be available on a linked bridge',
      );
    }

    const updated = await this.prisma.whatsAppDiscoveredGroup.update({
      where: { groupId },
      data: {
        groupPurpose: 'RUNNER_ADVERTISING',
        importedRunnerAdvertisingAt: new Date(),
      },
      select: {
        groupId: true,
        name: true,
        participants: true,
        groupPurpose: true,
        importedRunnerAdvertisingAt: true,
      },
    });

    return {
      group: updated,
      message: 'Group imported as a runner advertising group.',
    };
  }

  async deleteDiscoveredGroup(groupId: string, userRole: string) {
    this.assertCanManageWhatsAppDiscovery(userRole);

    const group = await this.prisma.whatsAppDiscoveredGroup.findUnique({
      where: { groupId },
      select: { id: true, name: true, groupId: true },
    });

    if (!group) {
      throw new NotFoundException(`WhatsApp group ${groupId} not found`);
    }

    await this.prisma.$transaction([
      this.prisma.whatsAppDiscoveredGroup.update({
        where: { groupId },
        data: {
          archivedAt: new Date(),
          groupPurpose: 'UNCLASSIFIED',
          importedRunnerAdvertisingAt: null,
        },
      }),
      this.prisma.whatsAppBridgeGroupPresence.updateMany({
        where: { groupId },
        data: { archivedAt: new Date(), isAvailable: false },
      }),
    ]);

    return {
      message:
        'Discovered group archived from the synced groups list. Existing shop mappings are unchanged.',
      group,
    };
  }

  async listGroupMappings(
    userId: string,
    userRole: string,
    shopId?: string,
    status?: string,
  ) {
    if (shopId) {
      await this.assertCanManageShop(shopId, userId, userRole);
    }

    const where: Prisma.WhatsAppGroupMappingWhereInput = {
      ...(shopId ? { shopId } : {}),
      ...(status ? { status } : {}),
      ...(this.isAdminRole(userRole)
        ? {}
        : {
            shop: {
              ownerId: userId,
            },
          }),
    };

    const [data, total] = await Promise.all([
      this.prisma.whatsAppGroupMapping.findMany({
        where,
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
        },
        orderBy: [{ status: 'asc' }, { sourceGroup: 'asc' }],
      }),
      this.prisma.whatsAppGroupMapping.count({ where }),
    ]);

    const groupIds = data.map((mapping) => mapping.groupId);
    const discoveredGroups =
      groupIds.length > 0
        ? await this.prisma.whatsAppDiscoveredGroup.findMany({
            where: { groupId: { in: groupIds } },
            select: { groupId: true, profileImageUrl: true },
          })
        : [];
    const profileImageByGroupId = new Map(
      discoveredGroups.map((group) => [group.groupId, group.profileImageUrl]),
    );

    return {
      data: data.map((mapping) => ({
        ...mapping,
        profileImageUrl: profileImageByGroupId.get(mapping.groupId) || null,
      })),
      total,
    };
  }

  async createGroupMapping(
    userId: string,
    userRole: string,
    dto: CreateWhatsAppGroupMappingDto,
  ) {
    await this.assertCanManageActiveShop(dto.shopId, userId, userRole);

    const groupRole = dto.groupRole ?? 'SOURCE';
    const requestedStatus = dto.status ?? 'ACTIVE';
    const data = {
      shopId: dto.shopId,
      groupId: this.cleanRequiredText(dto.groupId, 160, 'Group id'),
      sourceGroup: this.cleanRequiredText(dto.sourceGroup, 240, 'Group name'),
      participants: dto.participants,
      status: requestedStatus,
      groupRole,
      isPrimarySource: groupRole === 'SOURCE' && Boolean(dto.isPrimarySource),
      captureEnabled:
        dto.captureEnabled !== undefined ? Boolean(dto.captureEnabled) : true,
      postingEnabled:
        dto.postingEnabled !== undefined
          ? Boolean(dto.postingEnabled)
          : groupRole === 'SHOP_REPOST_DESTINATION',
      captureLimitPerRun: this.cleanBoundedInt(
        dto.captureLimitPerRun,
        100,
        1,
        2000,
      ),
      listingLimitPerRun: this.cleanBoundedInt(
        dto.listingLimitPerRun,
        20,
        1,
        200,
      ),
      inviteLink: this.cleanOptionalText(dto.inviteLink, 500),
      notes: this.cleanOptionalText(dto.notes, 500),
      createdById: userId,
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.isPrimarySource) {
          await tx.whatsAppGroupMapping.updateMany({
            where: { shopId: data.shopId },
            data: { isPrimarySource: false },
          });
        }

        return tx.whatsAppGroupMapping.create({
          data,
          include: {
            shop: {
              select: { id: true, name: true },
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'This WhatsApp group is already mapped to a shop',
        );
      }

      throw error;
    }
  }

  async updateGroupMapping(
    mappingId: string,
    userId: string,
    userRole: string,
    dto: UpdateWhatsAppGroupMappingDto,
  ) {
    const current = await this.prisma.whatsAppGroupMapping.findUnique({
      where: { id: mappingId },
      select: {
        id: true,
        shopId: true,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `WhatsApp group mapping ${mappingId} not found`,
      );
    }

    await this.assertCanManageShop(current.shopId, userId, userRole);
    if (dto.shopId && dto.shopId !== current.shopId) {
      await this.assertCanManageActiveShop(dto.shopId, userId, userRole);
    }

    const nextGroupRole = dto.groupRole;
    const nextIsPrimarySource =
      nextGroupRole === 'SHOP_REPOST_DESTINATION'
        ? false
        : dto.isPrimarySource !== undefined
          ? Boolean(dto.isPrimarySource)
          : undefined;
    const nextStatus = dto.status !== undefined ? dto.status : undefined;

    const data: Prisma.WhatsAppGroupMappingUpdateInput = {
      ...(dto.shopId ? { shop: { connect: { id: dto.shopId } } } : {}),
      ...(dto.groupId !== undefined
        ? { groupId: this.cleanRequiredText(dto.groupId, 160, 'Group id') }
        : {}),
      ...(dto.sourceGroup !== undefined
        ? {
            sourceGroup: this.cleanRequiredText(
              dto.sourceGroup,
              240,
              'Group name',
            ),
          }
        : {}),
      ...(dto.participants !== undefined
        ? { participants: dto.participants }
        : {}),
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...(dto.groupRole !== undefined ? { groupRole: dto.groupRole } : {}),
      ...(nextIsPrimarySource !== undefined
        ? { isPrimarySource: nextIsPrimarySource }
        : {}),
      ...(dto.captureEnabled !== undefined
        ? { captureEnabled: Boolean(dto.captureEnabled) }
        : {}),
      ...(dto.postingEnabled !== undefined
        ? { postingEnabled: Boolean(dto.postingEnabled) }
        : {}),
      ...(dto.captureLimitPerRun !== undefined
        ? {
            captureLimitPerRun: this.cleanBoundedInt(
              dto.captureLimitPerRun,
              100,
              1,
              2000,
            ),
          }
        : {}),
      ...(dto.listingLimitPerRun !== undefined
        ? {
            listingLimitPerRun: this.cleanBoundedInt(
              dto.listingLimitPerRun,
              20,
              1,
              200,
            ),
          }
        : {}),
      ...(dto.inviteLink !== undefined
        ? { inviteLink: this.cleanOptionalText(dto.inviteLink, 500) ?? null }
        : {}),
      ...(dto.notes !== undefined
        ? { notes: this.cleanOptionalText(dto.notes, 500) ?? null }
        : {}),
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (nextIsPrimarySource) {
          await tx.whatsAppGroupMapping.updateMany({
            where: { shopId: dto.shopId || current.shopId },
            data: { isPrimarySource: false },
          });
        }

        return tx.whatsAppGroupMapping.update({
          where: { id: mappingId },
          data,
          include: {
            shop: {
              select: { id: true, name: true },
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'This WhatsApp group is already mapped to a shop',
        );
      }

      throw error;
    }
  }

  async deactivateGroupMapping(
    mappingId: string,
    userId: string,
    userRole: string,
  ) {
    const current = await this.prisma.whatsAppGroupMapping.findUnique({
      where: { id: mappingId },
      select: {
        id: true,
        shopId: true,
      },
    });

    if (!current) {
      throw new NotFoundException(
        `WhatsApp group mapping ${mappingId} not found`,
      );
    }

    await this.assertCanManageShop(current.shopId, userId, userRole);

    return this.prisma.whatsAppGroupMapping.update({
      where: { id: mappingId },
      data: { status: 'INACTIVE', archivedAt: new Date() },
      include: {
        shop: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async unlinkGroupMapping(
    mappingId: string,
    userId: string,
    userRole: string,
  ) {
    const current = await this.prisma.whatsAppGroupMapping.findUnique({
      where: { id: mappingId },
      select: {
        id: true,
        shopId: true,
        groupId: true,
        sourceGroup: true,
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException(
        `WhatsApp group mapping ${mappingId} not found`,
      );
    }

    await this.assertCanManageShop(current.shopId, userId, userRole);

    await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppGroupMapping.delete({
        where: { id: mappingId },
      });

      await tx.whatsAppDiscoveredGroup.updateMany({
        where: {
          groupId: current.groupId,
          importedShopId: current.shopId,
        },
        data: {
          importedShopId: null,
          groupPurpose: 'UNCLASSIFIED',
          importedRunnerAdvertisingAt: null,
        },
      });
    });

    return {
      message: 'WhatsApp group delinked from shop.',
      group: {
        groupId: current.groupId,
        name: current.sourceGroup,
      },
      shop: current.shop,
    };
  }

  async getActiveGroupMappingsForBridge(bridgeAccountId?: string) {
    const availableGroupIds = bridgeAccountId
      ? (
          await this.prisma.whatsAppBridgeGroupPresence.findMany({
            where: {
              bridgeAccountId,
              isAvailable: true,
              archivedAt: null,
            },
            select: { groupId: true },
          })
        ).map((presence) => presence.groupId)
      : null;
    const mappings = await this.prisma.whatsAppGroupMapping.findMany({
      where: {
        status: 'ACTIVE',
        groupRole: 'SOURCE',
        captureEnabled: true,
        archivedAt: null,
        shop: {
          status: 'ACTIVE',
        },
        ...(availableGroupIds ? { groupId: { in: availableGroupIds } } : {}),
      },
      select: {
        id: true,
        groupId: true,
        sourceGroup: true,
        shopId: true,
        participants: true,
        groupRole: true,
        isPrimarySource: true,
        captureEnabled: true,
        postingEnabled: true,
        captureLimitPerRun: true,
        listingLimitPerRun: true,
        lastCaptureAt: true,
        lastPostAt: true,
        inviteLink: true,
        updatedAt: true,
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { sourceGroup: 'asc' },
    });

    return {
      data: mappings,
      total: mappings.length,
    };
  }

  async ingestBatchFromWebhook(shopId: string, posts: IngestWhatsAppPostDto[]) {
    await this.assertShopExists(shopId);

    if (posts.length === 0) {
      throw new BadRequestException('Send at least one WhatsApp post');
    }

    const results = [];

    for (const post of posts) {
      results.push(await this.queuePost(shopId, post));
    }

    return {
      queued: results.length,
      parsed: results.filter((item) => item.status === 'PARSED').length,
      needsReview: results.filter((item) => item.status === 'NEEDS_REVIEW')
        .length,
      results,
    };
  }

  async ingestOrderRequestFromWebhook(dto: IngestWhatsAppOrderRequestDto) {
    const messageText = String(dto.messageText || '').trim();

    if (!messageText) {
      throw new BadRequestException('messageText is required');
    }

    const skipCommand = this.parseRunnerSkipCommand(messageText);
    if (skipCommand) {
      return this.handleRunnerSkipCommand(skipCommand, dto);
    }

    if (this.isSystemGeneratedOrderMessage(messageText)) {
      return {
        status: 'IGNORED_SYSTEM_MESSAGE',
        orderRequestId: null,
        runnerId: null,
        listingId: null,
        orderCode: this.extractOrderCode(messageText),
        customerReply: null,
        runnerNotification: null,
      };
    }

    if (dto.messageId) {
      const existingByMessage =
        await this.prisma.whatsAppOrderRequest.findUnique({
          where: { messageId: dto.messageId },
          select: {
            id: true,
            runnerId: true,
            listingId: true,
            orderCode: true,
            status: true,
          },
        });

      if (existingByMessage) {
        return {
          status: 'DUPLICATE_MESSAGE',
          orderRequestId: existingByMessage.id,
          runnerId: existingByMessage.runnerId,
          listingId: existingByMessage.listingId,
          orderCode: existingByMessage.orderCode,
          customerReply: null,
          runnerNotification: null,
        };
      }
    }

    const extractedOrderCode = this.extractOrderCode(messageText);
    const isCodeOnlyLookup = this.isOrderCodeOnlyMessage(messageText);
    const customerPhone =
      this.normalizeCustomerPhone(dto.customerPhone) ??
      this.extractCustomerPhoneFromOrderText(messageText);
    const customerName = this.cleanNullable(dto.customerName);
    const recipientPhone =
      this.normalizePhone(dto.recipientPhone) ??
      this.cleanNullable(dto.recipientPhone);
    const customerImageUrls = this.cleanCustomerImageUrls(
      dto.customerImageUrls,
    );
    const customerImageHashes = this.cleanCustomerImageHashes(
      dto.customerImageHashes,
    );
    const stampedMediaMatch = await this.findStampedMediaMatch({
      orderCode: extractedOrderCode,
      imageHashes: customerImageHashes,
    });
    const orderCode =
      extractedOrderCode || stampedMediaMatch?.orderCode || null;
    const blockedCustomerAccount = customerPhone
      ? await this.findBlockedWhatsAppOrderAccount(customerPhone)
      : null;

    if (blockedCustomerAccount && !isCodeOnlyLookup) {
      return {
        status: 'REJECTED_ROLE_PHONE',
        orderRequestId: null,
        basketOrderId: null,
        runnerId: null,
        listingId: null,
        orderCode,
        rejectedRole: blockedCustomerAccount.role.name,
        rejectedUserId: blockedCustomerAccount.id,
        customerReply: this.buildBlockedRoleOrderReply({
          role: blockedCustomerAccount.role.name,
          phone: customerPhone || blockedCustomerAccount.phone || 'this number',
        }),
        customerInteraction: null,
        runnerNotification: null,
      };
    }

    if (!orderCode) {
      const pending = await this.findPendingCustomerOrderConversation({
        customerPhone,
        recipientPhone,
      });

      if (pending) {
        return this.continueCustomerOrderConversation(pending, {
          messageText,
          messageId: dto.messageId,
          customerPhone,
          customerName,
          recipientPhone,
          customerImageUrls,
          customerImageHashes,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        });
      }

      if (customerImageUrls.length > 0 || customerImageHashes.length > 0) {
        return {
          status: 'ORDER_CODE_REQUIRED',
          orderRequestId: null,
          runnerId: null,
          listingId: null,
          orderCode: null,
          customerReply: this.buildOrderCodeRequiredReply(),
          customerInteraction: null,
          runnerNotification: null,
        };
      }

      return {
        status: 'IGNORED_NO_ACTIVE_ORDER',
        orderRequestId: null,
        runnerId: null,
        listingId: null,
        orderCode: null,
        customerReply: null,
        runnerNotification: null,
      };
    }

    const existingPending = isCodeOnlyLookup
      ? null
      : await this.findPendingCustomerOrderConversation({
          customerPhone,
          recipientPhone,
          orderCode,
        });

    if (existingPending) {
      if (customerImageUrls.length > 0 || customerImageHashes.length > 0) {
        return this.continueCustomerOrderConversation(existingPending, {
          messageText,
          messageId: dto.messageId,
          customerPhone,
          customerName,
          recipientPhone,
          customerImageUrls,
          customerImageHashes,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        });
      }

      const selection = this.getStoredCustomerOrderSelection(existingPending);
      const nextField = this.getNextMissingCustomerOrderField(
        selection,
        this.cleanCustomerImageUrls(existingPending.customerImageUrls),
      );
      const awaitingConfirmation =
        existingPending.status === 'AWAITING_CONFIRMATION';

      return {
        status: existingPending.status,
        orderRequestId: existingPending.id,
        runnerId: existingPending.runnerId,
        listingId: existingPending.listingId,
        orderCode: existingPending.orderCode,
        customerReply: awaitingConfirmation
          ? this.buildCustomerConfirmationPrompt({
              orderCode: existingPending.orderCode,
              productName:
                existingPending.listing?.product?.name || 'the selected item',
              selection,
            })
          : this.buildCustomerDetailsPrompt({
              orderCode: existingPending.orderCode,
              productName:
                existingPending.listing?.product?.name || 'the selected item',
              selection,
              customerImageUrls: this.cleanCustomerImageUrls(
                existingPending.customerImageUrls,
              ),
              intro:
                'I already have this item open. Please send the next detail before I notify the runner.',
            }),
        customerInteraction: awaitingConfirmation
          ? this.confirmationInteraction()
          : this.interactionForCustomerField(nextField),
        runnerNotification: null,
      };
    }

    const listing = orderCode
      ? await this.prisma.runnerListing.findUnique({
          where: { orderCode },
          select: {
            id: true,
            runnerId: true,
            orderCode: true,
            markup: true,
            runnerPrice: true,
            runner: {
              select: {
                id: true,
                phone: true,
                bridgeAccountId: true,
                whatsappOrderIntakeEnabled: true,
                whatsappOrderTemplatesVerifiedAt: true,
                whatsappOrderTestedAt: true,
                shippingMode: true,
                supervisionMode: true,
                repostPriceMode: true,
                repostOrderDetailsEnabled: true,
                bridgeAccount: {
                  select: { id: true, status: true },
                },
                subscriptions: {
                  where: {
                    audience: 'RUNNER',
                    status: 'ACTIVE',
                    currentPeriodEnd: { gt: new Date() },
                  },
                  select: {
                    status: true,
                    orderWorkflowAddonEnabled: true,
                    currentPeriodEnd: true,
                  },
                  take: 3,
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
            product: {
              select: {
                id: true,
                shopId: true,
                name: true,
                basePrice: true,
                images: true,
                shop: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                whatsappImports: {
                  select: {
                    caption: true,
                    mediaUrls: true,
                    receivedAt: true,
                  },
                  orderBy: { receivedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        })
      : null;
    const sourceProductPost = listing?.product.whatsappImports?.[0] || null;
    const matchedProductPost =
      listing &&
      (isCodeOnlyLookup ||
        (stampedMediaMatch && customerImageHashes.length > 0))
        ? {
            listing: {
              id: listing.id,
              orderCode: listing.orderCode,
              markup: listing.markup,
              runnerPrice: listing.runnerPrice,
              runner: listing.runner,
              product: {
                id: listing.product.id,
                name: listing.product.name,
                basePrice: listing.product.basePrice,
              },
            },
            caption:
              sourceProductPost?.caption ||
              `${listing.product.name}\nPrice: R ${listing.product.basePrice.toFixed(2)}`,
            mediaUrls:
              Array.isArray(sourceProductPost?.mediaUrls) &&
              sourceProductPost.mediaUrls.length > 0
                ? sourceProductPost.mediaUrls.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : Array.isArray(listing.product.images)
                  ? listing.product.images.filter(
                      (value): value is string => typeof value === 'string',
                    )
                  : [],
            confidence: isCodeOnlyLookup
              ? 1
              : stampedMediaMatch?.confidence || 0,
            reason: isCodeOnlyLookup
              ? 'Exact order-code match'
              : stampedMediaMatch?.reason || 'Matched product media',
          }
        : null;

    if (isCodeOnlyLookup) {
      return {
        status: listing ? 'PRODUCT_LOOKUP' : 'PRODUCT_NOT_FOUND',
        orderRequestId: null,
        basketOrderId: null,
        runnerId: listing?.runnerId || null,
        listingId: listing?.id || null,
        orderCode,
        matchedProductPost,
        customerReply: listing
          ? [
              'Product found. Viewing this product has not placed an order.',
              `START ORDER: ${this.buildWhatsAppStartOrderUrl(recipientPhone, orderCode)}`,
              `Or reply: ORDER ${orderCode}`,
            ].join('\n')
          : `I could not find an active product for ${orderCode}. Please check the code and try again.`,
        customerInteraction: listing
          ? this.productLookupInteraction(orderCode)
          : null,
        runnerNotification: null,
      };
    }
    const fallbackRunner = !listing?.runnerId
      ? await this.findRunnerByPhone(dto.recipientPhone)
      : null;
    const runnerId = listing?.runnerId || fallbackRunner?.id || null;
    const customerAccount = customerPhone
      ? await this.resolveOrCreateWhatsAppCustomer({
          customerPhone,
          customerName,
        })
      : null;
    const data = {
      runnerId,
      listingId: listing?.id || null,
      orderCode,
      customerPhone,
      customerName,
      recipientPhone,
      customerImageUrls,
      customerImageHashes,
      matchedStampedMediaLogId: stampedMediaMatch?.id || null,
      imageMatchConfidence: stampedMediaMatch?.confidence || null,
      imageMatchReason: stampedMediaMatch?.reason || null,
      userId: customerAccount?.user.id ?? null,
      messageText: messageText.slice(0, 4000),
      status: listing ? 'NEW' : 'UNMATCHED',
      auditStatus: listing ? 'CAPTURED' : 'NEEDS_REVIEW',
      reviewReason: listing
        ? null
        : 'No active listing matched this order code',
      confidence: listing ? 1 : 0,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
    };
    const selection = this.parseCustomerOrderSelection(messageText);
    const missingField = this.getNextMissingCustomerOrderField(
      selection,
      data.customerImageUrls,
    );
    const runnerReadiness = this.buildWhatsAppOrderIntakeReadiness(
      listing?.runner || fallbackRunner,
    );

    if (runnerId && !runnerReadiness.ready) {
      const reviewData = {
        ...data,
        status: 'NEEDS_REVIEW',
        auditStatus: 'NEEDS_REVIEW',
        reviewReason: runnerReadiness.blockers.join('; '),
        confidence: listing ? 0.5 : 0,
        conversationState: {
          selection,
          blockers: runnerReadiness.blockers,
          cannedReplies: this.whatsAppOrderCannedReplies(),
        },
      };
      const orderRequest = dto.messageId
        ? await this.prisma.whatsAppOrderRequest.upsert({
            where: { messageId: dto.messageId },
            create: { ...reviewData, messageId: dto.messageId },
            update: reviewData,
          })
        : await this.prisma.whatsAppOrderRequest.create({
            data: reviewData,
          });

      return {
        status: 'NEEDS_REVIEW',
        orderRequestId: orderRequest.id,
        basketOrderId: null,
        runnerId,
        listingId: listing?.id || null,
        orderCode,
        reviewReason: runnerReadiness.blockers.join('; '),
        customerReply:
          'Thanks, I found your request. A Runner Commerce operator or your runner needs to review this before it becomes an active order.',
        customerInteraction: null,
        runnerNotification: null,
      };
    }

    if (listing && missingField) {
      const pendingData = {
        ...data,
        status: 'AWAITING_CUSTOMER_DETAILS',
        expectedField: missingField.toUpperCase(),
        conversationState: selection,
        conversationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastInboundMessageId: dto.messageId || null,
        messageText: this.appendConversationReply('', messageText, null, {
          messageId: dto.messageId,
          receivedAt: data.receivedAt,
        }).slice(0, 4000),
      };

      const pendingOrderRequest = dto.messageId
        ? await this.prisma.whatsAppOrderRequest.upsert({
            where: { messageId: dto.messageId },
            create: {
              ...pendingData,
              messageId: dto.messageId,
            },
            update: pendingData,
          })
        : await this.prisma.whatsAppOrderRequest.create({
            data: pendingData,
          });

      if (stampedMediaMatch) {
        await this.markStampedMediaReturned(stampedMediaMatch.id);
      }

      return {
        status: 'AWAITING_CUSTOMER_DETAILS',
        orderRequestId: pendingOrderRequest.id,
        basketOrderId: null,
        runnerId: pendingOrderRequest.runnerId,
        listingId: pendingOrderRequest.listingId,
        orderCode: pendingOrderRequest.orderCode,
        matchedProductPost,
        customerReply: this.buildCustomerDetailsPrompt({
          orderCode,
          productName: listing.product.name,
          selection,
          customerImageUrls: data.customerImageUrls,
          intro:
            'Thanks, I found your item. Before I notify the runner, I need a few details.',
          account:
            customerAccount?.created && data.customerPhone
              ? {
                  customerPhone: data.customerPhone,
                  temporaryPassword: customerAccount.temporaryPassword,
                }
              : null,
        }),
        customerInteraction: this.interactionForCustomerField(missingField),
        runnerNotification: null,
      };
    }

    if (listing) {
      const confirmationData = {
        ...data,
        status: 'AWAITING_CONFIRMATION',
        expectedField: 'CONFIRM',
        conversationState: selection,
        conversationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastInboundMessageId: dto.messageId || null,
        messageText: this.appendConversationReply('', messageText, null, {
          messageId: dto.messageId,
          receivedAt: data.receivedAt,
        }).slice(0, 4000),
      };
      const pendingOrderRequest = dto.messageId
        ? await this.prisma.whatsAppOrderRequest.upsert({
            where: { messageId: dto.messageId },
            create: { ...confirmationData, messageId: dto.messageId },
            update: confirmationData,
          })
        : await this.prisma.whatsAppOrderRequest.create({
            data: confirmationData,
          });

      if (stampedMediaMatch) {
        await this.markStampedMediaReturned(stampedMediaMatch.id);
      }

      return {
        status: 'AWAITING_CONFIRMATION',
        orderRequestId: pendingOrderRequest.id,
        basketOrderId: null,
        runnerId: pendingOrderRequest.runnerId,
        listingId: pendingOrderRequest.listingId,
        orderCode: pendingOrderRequest.orderCode,
        matchedProductPost,
        customerReply: this.buildCustomerConfirmationPrompt({
          orderCode,
          productName: listing.product.name,
          selection,
        }),
        customerInteraction: this.confirmationInteraction(),
        runnerNotification: null,
      };
    }

    const duplicateOrderRequest = await this.findRecentDuplicateOrderRequest({
      listingId: data.listingId,
      orderCode: data.orderCode,
      customerPhone: data.customerPhone,
      runnerId: data.runnerId,
      receivedAt: data.receivedAt,
    });

    if (duplicateOrderRequest) {
      if (stampedMediaMatch) {
        await this.markStampedMediaReturned(stampedMediaMatch.id);
      }

      return {
        status: 'DUPLICATE_ORDER',
        orderRequestId: duplicateOrderRequest.id,
        runnerId: duplicateOrderRequest.runnerId,
        listingId: duplicateOrderRequest.listingId,
        orderCode: duplicateOrderRequest.orderCode,
        customerReply: null,
        runnerNotification: null,
      };
    }

    const orderRequest = dto.messageId
      ? await this.prisma.whatsAppOrderRequest.upsert({
          where: { messageId: dto.messageId },
          create: {
            ...data,
            messageId: dto.messageId,
          },
          update: data,
        })
      : await this.prisma.whatsAppOrderRequest.create({ data });

    if (stampedMediaMatch) {
      await this.markStampedMediaReturned(stampedMediaMatch.id);
    }

    return {
      status: 'UNMATCHED',
      orderRequestId: orderRequest.id,
      basketOrderId: null,
      runnerId: orderRequest.runnerId,
      listingId: orderRequest.listingId,
      orderCode: orderRequest.orderCode,
      customerReply: this.buildUnmatchedCustomerOrderReply(orderCode, {
        customerPhone: data.customerPhone,
        customerAccountCreated: customerAccount?.created ?? false,
        temporaryPassword: customerAccount?.temporaryPassword ?? null,
      }),
      customerInteraction: null,
      runnerNotification: null,
    };
  }

  async getCaptureStateForBridge(shopId: string, groupId?: string) {
    await this.assertShopExists(shopId);

    const cleanGroupId = this.cleanCheckpointGroupId(groupId);
    const [checkpoint, lastCaptured] = await Promise.all([
      cleanGroupId
        ? this.prisma.whatsAppCaptureCheckpoint.findUnique({
            where: {
              shopId_groupId: {
                shopId,
                groupId: cleanGroupId,
              },
            },
          })
        : null,
      this.prisma.whatsAppImport.findFirst({
        where: { shopId },
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          messageId: true,
          sourceGroup: true,
          status: true,
          receivedAt: true,
          resolutionOutcome: true,
          importedAt: true,
        },
      }),
    ]);

    const checkpointCapturedAt = checkpoint?.lastFullyCapturedAt ?? null;

    return {
      shopId,
      groupId: cleanGroupId,
      checkpoint,
      lastCapturedAt: checkpointCapturedAt ?? lastCaptured?.receivedAt ?? null,
      lastFullyCapturedAt: checkpointCapturedAt,
      lastFullyCapturedMessageId:
        checkpoint?.lastFullyCapturedMessageId ?? null,
      lastCapture: lastCaptured,
    };
  }

  async updateCaptureStateForBridge(
    shopId: string,
    dto: UpdateCaptureCheckpointDto,
  ) {
    await this.assertShopExists(shopId);

    const groupId = this.cleanCheckpointGroupId(dto.groupId);
    if (!groupId) {
      throw new BadRequestException('Capture checkpoint groupId is required');
    }

    const status = dto.status ?? 'SCANNING';
    const cleanSourceGroup = this.cleanOptionalText(dto.sourceGroup, 240);
    const latestStoredCapture =
      status === 'COMPLETED'
        ? await this.findLatestStoredCaptureForCheckpoint(shopId, groupId)
        : null;
    const dtoCapturedAt =
      status === 'COMPLETED' && dto.lastFullyCapturedAt
        ? new Date(dto.lastFullyCapturedAt)
        : null;
    const lastFullyCapturedAt = this.maxDate(
      dtoCapturedAt,
      latestStoredCapture?.receivedAt ?? null,
    );
    const lastFullyCapturedMessageId =
      status === 'COMPLETED'
        ? latestStoredCapture &&
          lastFullyCapturedAt &&
          latestStoredCapture.receivedAt.getTime() ===
            lastFullyCapturedAt.getTime()
          ? latestStoredCapture.messageId
          : this.cleanOptionalText(dto.lastFullyCapturedMessageId, 240)
        : undefined;
    const data = {
      sourceGroup: cleanSourceGroup,
      lastScanStatus: status,
      lastError:
        dto.lastError !== undefined
          ? this.cleanOptionalText(dto.lastError, 500)
          : ['SCANNING', 'COMPLETED'].includes(status)
            ? null
            : undefined,
      lastScanStartedAt: dto.lastScanStartedAt
        ? new Date(dto.lastScanStartedAt)
        : status === 'SCANNING'
          ? new Date()
          : undefined,
      lastScanCompletedAt: dto.lastScanCompletedAt
        ? new Date(dto.lastScanCompletedAt)
        : ['COMPLETED', 'PARTIAL', 'FAILED'].includes(status)
          ? new Date()
          : undefined,
      lastFullyCapturedAt:
        status === 'COMPLETED' ? lastFullyCapturedAt : undefined,
      lastFullyCapturedMessageId,
      messagesScanned: dto.messagesScanned,
      productsCaptured: dto.productsCaptured,
      productsSkipped: dto.productsSkipped,
      productsFailed: dto.productsFailed,
    };

    return this.prisma.whatsAppCaptureCheckpoint.upsert({
      where: {
        shopId_groupId: {
          shopId,
          groupId,
        },
      },
      update: data,
      create: {
        shopId,
        groupId,
        ...data,
      },
    });
  }

  async ingestMetaCloudWebhook(payload: Record<string, unknown>) {
    const posts = this.extractMetaPosts(payload);
    const results = [];
    let ignored = 0;

    for (const post of posts) {
      const shopId = await this.resolveShopIdForWhatsAppPhone(
        post.phoneNumberId,
        post.displayPhoneNumber,
      );

      if (!shopId) {
        ignored += 1;
        this.logger.warn(
          `No shop mapping found for WhatsApp phone ${post.displayPhoneNumber || post.phoneNumberId}`,
        );
        continue;
      }

      results.push(
        await this.queuePost(shopId, {
          caption: post.caption,
          sourceGroup: post.sourceGroup,
          senderPhone: post.senderPhone,
          messageId: post.messageId,
          mediaUrls: [],
          receivedAt: post.receivedAt,
        }),
      );
    }

    return {
      received: posts.length,
      queued: results.length,
      parsed: results.filter((item) => item.status === 'PARSED').length,
      needsReview: results.filter((item) => item.status === 'NEEDS_REVIEW')
        .length,
      ignored,
      results,
    };
  }

  private async queuePost(shopId: string, dto: IngestWhatsAppPostDto) {
    const cleanDto = this.sanitizeIngestDto(dto);
    if (cleanDto.messageId) {
      const existing = await this.prisma.whatsAppImport.findUnique({
        where: {
          shopId_messageId: { shopId, messageId: cleanDto.messageId },
        },
      });
      if (
        existing &&
        ['IMPORTED', 'DUPLICATE', 'RENEWED', 'IGNORED'].includes(
          existing.status,
        )
      ) {
        return existing;
      }
    }
    const capturedMediaUrls = this.capturedProductMediaUrls(
      cleanDto.mediaUrls ?? [],
    );
    const parsedDraft = this.refineParsedDraftName(
      capturedMediaUrls.length > 0
        ? this.parsePost(cleanDto.caption, capturedMediaUrls)
        : null,
      cleanDto,
    );
    const cleanParsedDraft = this.sanitizeJsonValue(parsedDraft);
    const needsReview =
      capturedMediaUrls.length === 0 ||
      !parsedDraft ||
      this.shouldReviewParsedDraft(parsedDraft, {
        ...cleanDto,
        mediaUrls: capturedMediaUrls,
      });
    const data = {
      shopId,
      caption: cleanDto.caption,
      sourceGroup: cleanDto.sourceGroup,
      senderPhone: cleanDto.senderPhone,
      messageId: cleanDto.messageId,
      mediaUrls: capturedMediaUrls as Prisma.InputJsonValue,
      parsedDraft: cleanParsedDraft as unknown as Prisma.InputJsonValue,
      status: needsReview ? 'NEEDS_REVIEW' : 'PARSED',
      receivedAt: cleanDto.receivedAt
        ? new Date(cleanDto.receivedAt)
        : new Date(),
      error: needsReview
        ? capturedMediaUrls.length === 0
          ? 'Captured product image or video is required before import'
          : parsedDraft
            ? 'Review the product name before import'
            : 'Could not find a product name and price'
        : null,
    };

    const result = cleanDto.messageId
      ? await this.prisma.whatsAppImport.upsert({
          where: {
            shopId_messageId: { shopId, messageId: cleanDto.messageId },
          },
          update: data,
          create: data,
        })
      : await this.prisma.whatsAppImport.create({ data });

    if (cleanDto.sourceGroup) {
      await this.prisma.whatsAppGroupMapping.updateMany({
        where: {
          shopId,
          OR: [
            { sourceGroup: cleanDto.sourceGroup },
            { groupId: cleanDto.sourceGroup },
          ],
        },
        data: { lastCaptureAt: data.receivedAt },
      });
    }

    return result;
  }

  async findByShop(
    shopId: string,
    userId: string,
    status?: string,
    limit = 100,
    offset = 0,
  ) {
    await this.assertShopOwner(shopId, userId);

    const where = {
      shopId,
      status: status || undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.whatsAppImport.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: Math.min(Number(limit), 500),
        skip: Math.max(Number(offset), 0),
        include: { product: { select: { id: true, name: true } } },
      }),
      this.prisma.whatsAppImport.count({ where }),
    ]);

    return { data, total };
  }

  async getCaptureStats(shopId: string, userId: string) {
    await this.assertShopOwner(shopId, userId);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      total,
      statusRows,
      lastCaptured,
      lastImported,
      capturedLastHour,
      capturedLastDay,
      recentImports,
      captureCheckpoints,
      duplicatesPrevented,
      productsRenewed,
    ] = await Promise.all([
      this.prisma.whatsAppImport.count({ where: { shopId } }),
      this.prisma.whatsAppImport.groupBy({
        by: ['status'],
        where: { shopId },
        _count: { _all: true },
      }),
      this.prisma.whatsAppImport.findFirst({
        where: { shopId },
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          caption: true,
          status: true,
          sourceGroup: true,
          receivedAt: true,
          mediaUrls: true,
        },
      }),
      this.prisma.whatsAppImport.findFirst({
        where: { shopId, importedAt: { not: null } },
        orderBy: { importedAt: 'desc' },
        select: { id: true, importedAt: true },
      }),
      this.prisma.whatsAppImport.count({
        where: { shopId, receivedAt: { gte: oneHourAgo } },
      }),
      this.prisma.whatsAppImport.count({
        where: { shopId, receivedAt: { gte: oneDayAgo } },
      }),
      this.prisma.whatsAppImport.findMany({
        where: { shopId, receivedAt: { gte: oneDayAgo } },
        orderBy: { receivedAt: 'desc' },
        select: {
          sourceGroup: true,
          mediaUrls: true,
          status: true,
          receivedAt: true,
        },
        take: 1000,
      }),
      this.prisma.whatsAppCaptureCheckpoint.findMany({
        where: { shopId },
        orderBy: [{ updatedAt: 'desc' }],
        take: 20,
      }),
      this.prisma.whatsAppImport.count({
        where: { shopId, resolutionOutcome: 'DUPLICATE' },
      }),
      this.prisma.whatsAppImport.count({
        where: { shopId, resolutionOutcome: 'RENEWED' },
      }),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.map((row) => [row.status, row._count._all]),
    );
    const recentMediaCount = recentImports.reduce(
      (totalMedia, item) =>
        totalMedia + (((item.mediaUrls as string[] | null) ?? []).length || 0),
      0,
    );
    const recentWithMedia = recentImports.filter(
      (item) => ((item.mediaUrls as string[] | null) ?? []).length > 0,
    ).length;
    const sourceGroupCounts = recentImports.reduce(
      (acc: Record<string, number>, item) => {
        const group = item.sourceGroup || 'Unknown source';
        acc[group] = (acc[group] || 0) + 1;
        return acc;
      },
      {},
    );
    const sourceGroups = Object.entries(sourceGroupCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
    const lastCapturedAt = lastCaptured?.receivedAt ?? null;
    const minutesSinceLastCapture = lastCapturedAt
      ? Math.floor((now.getTime() - lastCapturedAt.getTime()) / 60000)
      : null;
    const captureHealth =
      minutesSinceLastCapture === null
        ? 'NO_CAPTURE'
        : minutesSinceLastCapture <= 30
          ? 'ACTIVE'
          : minutesSinceLastCapture <= 360
            ? 'STALE'
            : 'IDLE';

    return {
      total,
      byStatus,
      pendingReview: (byStatus.PARSED || 0) + (byStatus.NEEDS_REVIEW || 0),
      capturedLastHour,
      capturedLastDay,
      recentMediaCount,
      recentWithMedia,
      mediaCoverage:
        capturedLastDay > 0
          ? Math.round((recentWithMedia / capturedLastDay) * 100)
          : 0,
      lastCaptured: lastCaptured
        ? {
            id: lastCaptured.id,
            status: lastCaptured.status,
            sourceGroup: lastCaptured.sourceGroup,
            receivedAt: lastCaptured.receivedAt,
            mediaCount:
              ((lastCaptured.mediaUrls as string[] | null) ?? []).length || 0,
            captionPreview: lastCaptured.caption.slice(0, 160),
          }
        : null,
      lastImportedAt: lastImported?.importedAt ?? null,
      minutesSinceLastCapture,
      captureHealth,
      sourceGroups,
      captureCheckpoints,
      duplicatesPrevented,
      productsRenewed,
    };
  }

  async importSelected(shopId: string, userId: string, ids: string[]) {
    await this.assertShopOwner(shopId, userId);

    if (ids.length === 0) {
      throw new BadRequestException('Select at least one WhatsApp post');
    }

    const imports = await this.prisma.whatsAppImport.findMany({
      where: {
        shopId,
        id: { in: ids },
        status: { in: ['PARSED', 'NEEDS_REVIEW'] },
      },
    });

    const importDrafts = imports
      .map((item) => ({
        item,
        draft: item.parsedDraft as unknown as ParsedDraft | null,
        mediaUrls: this.capturedProductMediaUrls(
          (item.mediaUrls as string[] | null) ?? [],
        ),
      }))
      .filter(
        (
          entry,
        ): entry is {
          item: (typeof imports)[number];
          draft: ParsedDraft;
          mediaUrls: string[];
        } =>
          Boolean(
            entry.mediaUrls.length > 0 &&
            entry.draft?.name &&
            entry.draft.basePrice >= 0,
          ),
      );

    if (importDrafts.length === 0) {
      throw new BadRequestException(
        'No parsed product drafts with captured product media to import',
      );
    }

    let created = 0;
    let updated = 0;
    let duplicates = 0;
    let renewed = 0;
    const results: Array<{
      id: string;
      name: string;
      action: 'created' | 'updated' | 'duplicate' | 'renewed';
      importId: string;
    }> = [];

    for (const chunk of this.chunk(importDrafts, 50)) {
      for (const { item, draft } of chunk) {
        const resolved = await this.importSingleDraft(item.id, shopId, draft);
        const product = resolved.product;

        if (resolved.action !== 'created') {
          updated += 1;
          if (resolved.action === 'duplicate') duplicates += 1;
          if (resolved.action === 'renewed') renewed += 1;
          results.push({
            id: product.id,
            name: product.name,
            action: resolved.action,
            importId: item.id,
          });
        } else {
          created += 1;
          results.push({
            id: product.id,
            name: product.name,
            action: 'created',
            importId: item.id,
          });
        }
      }
    }

    return {
      created,
      updated,
      duplicates,
      renewed,
      total: results.length,
      results,
    };
  }

  async processAutomationForBridge(limit = 100) {
    const maxItems = Math.max(1, Math.min(Number(limit) || 100, 500));
    const autoEnrich =
      this.configService.get<string>('WHATSAPP_AUTO_ENRICH_ENABLED') !==
      'false';
    const autoImport =
      this.configService.get<string>('WHATSAPP_AUTO_IMPORT_ENABLED') !==
      'false';
    const autoListings =
      this.configService.get<string>(
        'WHATSAPP_AUTO_CREATE_LISTINGS_ENABLED',
      ) !== 'false';
    const autoApproveRepost =
      this.configService.get<string>('WHATSAPP_AUTO_APPROVE_REPOST_ENABLED') !==
      'false';
    const autoEnableRunnerPosting =
      this.configService.get<string>('WHATSAPP_AUTO_ENABLE_RUNNER_POSTING') ===
        'true' && (await this.isWhatsAppRepostingEnabled());
    const defaultMarkup = this.clampMarkup(
      Number(this.configService.get('WHATSAPP_AUTO_RUNNER_MARKUP') || 0.3),
    );
    const minConfidence = Number(
      this.configService.get('WHATSAPP_AUTO_IMPORT_MIN_CONFIDENCE') || 0.55,
    );
    const listingProductsPerLink = Math.max(
      1,
      Math.min(
        Number(
          this.configService.get('WHATSAPP_AUTO_LISTING_PRODUCTS_PER_LINK') ||
            500,
        ),
        5000,
      ),
    );
    const imports = await this.prisma.whatsAppImport.findMany({
      where: {
        status: { in: ['PARSED', 'NEEDS_REVIEW'] },
        productId: null,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { receivedAt: 'asc' },
      take: maxItems,
    });

    const summary = {
      scanned: imports.length,
      enriched: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      listingsCreated: 0,
      listingsUpdated: 0,
      listingsAutoApproved: 0,
      runnersEnabled: 0,
      duplicatesPrevented: 0,
      productsRenewed: 0,
      failures: [] as Array<{ importId: string; message: string }>,
    };

    if (!autoImport) {
      return {
        ...summary,
        message: 'Automatic import is disabled',
      };
    }

    if (autoEnableRunnerPosting) {
      summary.runnersEnabled += await this.enableConfiguredRunnerPosting();
    }

    if (autoApproveRepost) {
      summary.listingsAutoApproved +=
        await this.approveExistingRunnerListings();
    }

    let enrichmentUnavailable = false;

    for (const item of imports) {
      try {
        let current: WhatsAppImportRecord = item;
        const mediaUrls = this.capturedProductMediaUrls(
          (current.mediaUrls as string[] | null) ?? [],
        );
        const currentDraft =
          (current.parsedDraft as unknown as ParsedDraft | null) ??
          this.parsePost(current.caption, mediaUrls);

        if (mediaUrls.length === 0) {
          summary.skipped += 1;
          await this.markAutomationReview(
            current.id,
            'Automation skipped: captured product image or video is missing',
          );
          continue;
        }

        if (autoEnrich && !enrichmentUnavailable && mediaUrls.length > 0) {
          const needsEnrichment =
            current.status === 'NEEDS_REVIEW' ||
            !currentDraft?.description ||
            (currentDraft?.name
              ? this.isWeakProductName(currentDraft.name)
              : true);

          if (needsEnrichment) {
            try {
              current = await this.enrichExistingImport(current);
              summary.enriched += 1;
            } catch (error) {
              const message = this.errorMessage(error);
              if (this.isEnrichmentProviderUnavailable(message)) {
                enrichmentUnavailable = true;
              }
              this.logger.warn(
                `Automatic enrichment skipped for import ${current.id}: ${message}`,
              );
            }
          }
        }

        const draft =
          (current.parsedDraft as unknown as ParsedDraft | null) ??
          this.parsePost(current.caption, mediaUrls);

        if (!draft?.name || !draft.basePrice || Number(draft.basePrice) <= 0) {
          summary.skipped += 1;
          await this.markAutomationReview(
            current.id,
            'Automation skipped: missing product name or price',
          );
          continue;
        }

        if (
          typeof draft.aiConfidence === 'number' &&
          draft.aiConfidence < minConfidence &&
          this.shouldReviewParsedDraft(draft, {
            caption: current.caption,
            mediaUrls,
          })
        ) {
          summary.skipped += 1;
          await this.markAutomationReview(
            current.id,
            `Automation skipped: confidence ${Math.round(
              draft.aiConfidence * 100,
            )}% below threshold`,
          );
          continue;
        }

        const resolved = await this.importSingleDraft(
          current.id,
          current.shopId,
          draft,
        );
        const product = resolved.product;
        summary.imported += 1;
        if (resolved.action === 'duplicate') summary.duplicatesPrevented += 1;
        if (resolved.action === 'renewed') summary.productsRenewed += 1;

        if (autoListings) {
          const listingResult = await this.createAutomaticRunnerListings({
            productId: product.id,
            shopId: current.shopId,
            basePrice: product.basePrice,
            category: product.category,
            images: product.images as string[] | null,
            defaultMarkup,
            autoPostApproved: autoApproveRepost,
            autoEnableRunnerPosting,
          });
          summary.listingsCreated += listingResult.created;
          summary.listingsUpdated += listingResult.updated;
          summary.runnersEnabled += listingResult.runnersEnabled;
        }
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          importId: item.id,
          message: this.errorMessage(error),
        });
        await this.markAutomationReview(
          item.id,
          `Automation failed: ${this.errorMessage(error)}`,
        );
      }
    }

    if (autoListings) {
      const listingResult = await this.createListingsForApprovedShopProducts({
        productsPerLink: listingProductsPerLink,
        defaultMarkup,
        autoPostApproved: autoApproveRepost,
        autoEnableRunnerPosting,
      });
      summary.listingsCreated += listingResult.created;
      summary.listingsUpdated += listingResult.updated;
      summary.runnersEnabled += listingResult.runnersEnabled;
    }

    return summary;
  }

  private isEnrichmentProviderUnavailable(message: string) {
    const clean = message.toLowerCase();
    return (
      clean.includes('no product visual enrichment provider is available') ||
      clean.includes('insufficient_quota') ||
      clean.includes('exceeded your current quota') ||
      clean.includes('quota') ||
      clean.includes('429')
    );
  }

  async updateQueuedImport(
    shopId: string,
    importId: string,
    userId: string,
    dto: UpdateWhatsAppImportDto,
  ) {
    await this.assertShopOwner(shopId, userId);

    const existing = await this.prisma.whatsAppImport.findFirst({
      where: { id: importId, shopId },
    });

    if (!existing) {
      throw new NotFoundException(`WhatsApp import ${importId} not found`);
    }

    const currentDraft = existing.parsedDraft as unknown as ParsedDraft | null;
    const capturedMediaUrls = this.capturedProductMediaUrls(
      (existing.mediaUrls as string[] | null) ?? [],
    );
    const nextDraft = dto.parsedDraft
      ? {
          ...(currentDraft ?? {}),
          ...dto.parsedDraft,
          name: dto.parsedDraft.name?.trim() ?? currentDraft?.name,
          description:
            dto.parsedDraft.description ?? currentDraft?.description ?? '',
          basePrice: dto.parsedDraft.basePrice ?? currentDraft?.basePrice ?? 0,
          stockQty: Math.max(
            1,
            dto.parsedDraft.stockQty ?? currentDraft?.stockQty ?? 1,
          ),
          category: dto.parsedDraft.category ?? currentDraft?.category,
          images: capturedMediaUrls,
          sourceText: currentDraft?.sourceText ?? existing.caption,
        }
      : currentDraft;

    const hasValidDraft = Boolean(
      capturedMediaUrls.length > 0 &&
      nextDraft?.name &&
      nextDraft.basePrice > 0,
    );
    const status = dto.status ?? (hasValidDraft ? 'PARSED' : 'NEEDS_REVIEW');

    if (status === 'PARSED' && !hasValidDraft) {
      throw new BadRequestException(
        'A parsed WhatsApp product needs captured media, a name, and a price',
      );
    }

    return this.prisma.whatsAppImport.update({
      where: { id: importId },
      data: {
        parsedDraft: nextDraft as unknown as Prisma.InputJsonValue,
        status,
        error:
          status === 'NEEDS_REVIEW'
            ? capturedMediaUrls.length === 0
              ? 'Captured product image or video is required before import'
              : 'Review the product name and price before import'
            : null,
      },
    });
  }

  async enrichQueuedImport(shopId: string, importId: string, userId: string) {
    await this.assertShopOwner(shopId, userId);

    const existing = await this.prisma.whatsAppImport.findFirst({
      where: { id: importId, shopId },
    });

    if (!existing) {
      throw new NotFoundException(`WhatsApp import ${importId} not found`);
    }

    return this.enrichExistingImport(existing);
  }

  private async enrichExistingImport(existing: WhatsAppImportRecord) {
    const mediaUrls = this.capturedProductMediaUrls(
      (existing.mediaUrls as string[] | null) ?? [],
    );
    if (mediaUrls.length === 0) {
      throw new BadRequestException('AI enrichment needs captured images');
    }

    const currentDraft =
      (existing.parsedDraft as unknown as ParsedDraft | null) ??
      this.parsePost(existing.caption, mediaUrls);

    const enrichment = await this.enrichProductDraft({
      caption: existing.caption,
      mediaUrls,
      currentDraft,
    });

    const nextDraft: ParsedDraft = {
      ...(currentDraft ?? {
        basePrice: this.extractPrice(existing.caption) ?? 0,
        stockQty: 1,
        images: mediaUrls,
        sourceText: existing.caption,
      }),
      name: enrichment.itemName,
      description: enrichment.description,
      category: enrichment.category || currentDraft?.category,
      images: mediaUrls,
      sourceText: existing.caption,
      aiConfidence: enrichment.confidence,
      aiSource: enrichment.source,
      aiTags: enrichment.tags ?? [],
      colors: enrichment.colors ?? [],
      sizes: enrichment.sizes ?? currentDraft?.sizes,
    };
    const needsReview =
      enrichment.needsReview ||
      enrichment.confidence <
        Number(
          this.configService.get('OPENAI_PRODUCT_ENRICHMENT_CONFIDENCE') || 0.7,
        ) ||
      this.shouldReviewParsedDraft(nextDraft, {
        caption: existing.caption,
        mediaUrls,
      });

    return this.prisma.whatsAppImport.update({
      where: { id: existing.id },
      data: {
        parsedDraft: this.sanitizeJsonValue(
          nextDraft,
        ) as unknown as Prisma.InputJsonValue,
        status: needsReview ? 'NEEDS_REVIEW' : 'PARSED',
        error: needsReview
          ? 'Review AI-enriched product details before import'
          : null,
      },
    });
  }

  private async importSingleDraft(
    importId: string,
    shopId: string,
    draft: ParsedDraft,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-import:${shopId}`}))`;
      const item = await tx.whatsAppImport.findUnique({
        where: { id: importId },
        select: {
          id: true,
          productId: true,
          status: true,
          mediaUrls: true,
          senderPhone: true,
          sourceGroup: true,
          receivedAt: true,
          resolutionOutcome: true,
        },
      });

      if (!item) {
        throw new NotFoundException(`WhatsApp import ${importId} not found`);
      }

      if (
        ['IMPORTED', 'DUPLICATE', 'RENEWED'].includes(item.status) &&
        item.productId
      ) {
        return {
          product: await tx.product.findUniqueOrThrow({
            where: { id: item.productId },
          }),
          action:
            item.resolutionOutcome === 'DUPLICATE'
              ? ('duplicate' as const)
              : item.resolutionOutcome === 'RENEWED'
                ? ('renewed' as const)
                : ('updated' as const),
        };
      }

      const mediaUrls = this.capturedProductMediaUrls(
        (item.mediaUrls as string[] | null) ?? [],
      );
      const productData = this.productDataFromDraft(draft, mediaUrls);

      const duplicate = item.productId
        ? null
        : await this.resolveDuplicateProduct({
            shopId,
            senderPhone: item.senderPhone,
            sourceGroup: item.sourceGroup,
            mediaUrls,
            draftName: draft.name,
          });
      if (duplicate) {
        const renewalDays = Math.max(
          1,
          Number(
            this.configService.get('WHATSAPP_DUPLICATE_RENEWAL_DAYS') || 3,
          ),
        );
        const ageDays =
          (item.receivedAt.getTime() - duplicate.lastRefreshedAt.getTime()) /
          (24 * 60 * 60 * 1000);
        const renewed = ageDays >= renewalDays;
        const product = await tx.product.update({
          where: { id: duplicate.productId },
          data: {
            ...productData,
            sourceRefreshedAt: renewed
              ? item.receivedAt
              : duplicate.lastRefreshedAt,
          },
        });
        await tx.whatsAppImport.update({
          where: { id: importId },
          data: {
            productId: product.id,
            status: renewed ? 'RENEWED' : 'DUPLICATE',
            importedAt: new Date(),
            resolutionOutcome: renewed ? 'RENEWED' : 'DUPLICATE',
            matchedImportId: duplicate.importId,
            matchedProductId: product.id,
            matchConfidence: duplicate.confidence,
            matchAgeDays: Number(Math.max(0, ageDays).toFixed(2)),
            matchReason: duplicate.reason,
            resolvedAt: new Date(),
            error: null,
          },
        });
        return {
          product,
          action: renewed ? ('renewed' as const) : ('duplicate' as const),
        };
      }

      const product = item.productId
        ? await tx.product.update({
            where: { id: item.productId },
            data: productData,
          })
        : await tx.product.create({
            data: {
              ...productData,
              shopId,
              sourceRefreshedAt: item.receivedAt,
            },
          });

      await tx.whatsAppImport.update({
        where: { id: importId },
        data: {
          productId: product.id,
          status: 'IMPORTED',
          importedAt: new Date(),
          error: null,
          resolutionOutcome: item.productId ? 'UPDATED' : 'CREATED',
          resolvedAt: new Date(),
        },
      });

      return {
        product,
        action: item.productId ? ('updated' as const) : ('created' as const),
      };
    });
  }

  private async resolveDuplicateProduct(input: {
    shopId: string;
    senderPhone: string | null;
    sourceGroup: string | null;
    mediaUrls: string[];
    draftName: string;
  }) {
    const senderPhone = this.normalizeDuplicateIdentity(input.senderPhone);
    const sourceGroup = this.normalizeDuplicateIdentity(input.sourceGroup);
    if (!senderPhone && !sourceGroup) return null;
    const products = (
      await this.prisma.product.findMany({
        where: {
          shopId: input.shopId,
          status: 'ACTIVE',
          whatsappImports: { some: {} },
        },
        select: {
          id: true,
          name: true,
          sourceRefreshedAt: true,
          whatsappImports: {
            orderBy: { receivedAt: 'asc' },
            select: {
              id: true,
              receivedAt: true,
              senderPhone: true,
              sourceGroup: true,
            },
          },
        },
        take: 1000,
      })
    ).filter((product) =>
      product.whatsappImports.some((item) =>
        senderPhone
          ? this.normalizeDuplicateIdentity(item.senderPhone) === senderPhone
          : this.normalizeDuplicateIdentity(item.sourceGroup) === sourceGroup,
      ),
    );
    if (!products.length) return null;
    const imageMatch = await this.productsService.findDuplicateByImageUrls(
      input.mediaUrls,
      {
        shopId: input.shopId,
        productIds: products.map((product) => product.id),
      },
    );
    if (!imageMatch) return null;
    const product = products.find(
      (candidate) => candidate.id === imageMatch.productId,
    );
    if (!product) return null;
    const nameSimilarity = this.productNameSimilarity(
      input.draftName,
      product.name,
    );
    const minimumNameSimilarity =
      imageMatch.reason === 'EXACT_IMAGE_HASH' ? 0.35 : 0.65;
    if (nameSimilarity < minimumNameSimilarity) {
      return null;
    }
    const original = product.whatsappImports[0];
    if (!original) return null;
    return {
      productId: product.id,
      importId: original.id,
      confidence: imageMatch.confidence,
      reason: imageMatch.reason,
      lastRefreshedAt:
        product.sourceRefreshedAt ||
        product.whatsappImports[product.whatsappImports.length - 1].receivedAt,
    };
  }

  private normalizeDuplicateIdentity(value?: string | null) {
    const clean = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return clean || null;
  }

  private productNameSimilarity(left: string, right: string) {
    const tokens = (value: string) =>
      new Set(
        value
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, ' ')
          .split(/\s+/)
          .filter((token) => token.length > 1),
      );
    const a = tokens(left);
    const b = tokens(right);
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter((token) => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
  }

  private async createAutomaticRunnerListings({
    productId,
    shopId,
    basePrice,
    category,
    images,
    defaultMarkup,
    autoPostApproved,
    autoEnableRunnerPosting,
  }: {
    productId: string;
    shopId: string;
    basePrice: number;
    category?: string | null;
    images?: string[] | null;
    defaultMarkup: number;
    autoPostApproved: boolean;
    autoEnableRunnerPosting: boolean;
  }) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        shopId,
        status: 'APPROVED',
        autoListEnabled: true,
        runner: {
          status: 'ACTIVE',
        },
      },
      select: {
        runnerId: true,
        autoPostEnabled: true,
        markupPercent: true,
        destinationGroup: true,
        minPrice: true,
        maxPrice: true,
        categoryFilter: true,
        requireMedia: true,
        maximumListingAgeDays: true,
        runner: {
          select: {
            id: true,
            autoPostEnabled: true,
            repostingStatus: true,
            whatsappGroup: true,
          },
        },
      },
    });

    let created = 0;
    let updated = 0;
    let runnersEnabled = 0;
    const suppressedRunnerIds =
      links.length > 0
        ? new Set(
            (
              await this.prisma.runnerListingSuppression.findMany({
                where: {
                  productId,
                  runnerId: {
                    in: links.map((link) => link.runnerId),
                  },
                },
                select: { runnerId: true },
              })
            ).map((item) => item.runnerId),
          )
        : new Set<string>();
    const productForSkipReference =
      links.length > 0
        ? await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
              name: true,
              images: true,
              imageFingerprints: true,
              whatsappImports: {
                select: { mediaUrls: true },
                orderBy: { receivedAt: 'desc' },
                take: 1,
              },
            },
          })
        : null;
    const productImageHashes = productForSkipReference
      ? this.productImageHashesForSkipLog(
          productForSkipReference.imageFingerprints,
        )
      : [];
    const productImageUrls = productForSkipReference
      ? this.productImageUrlsForSkipLog(productForSkipReference)
      : [];

    for (const link of links) {
      if (suppressedRunnerIds.has(link.runnerId)) {
        continue;
      }

      const skipMatch = await this.findRunnerSkippedItemMatch({
        runnerId: link.runnerId,
        productId,
        shopId,
        imageHashes: productImageHashes,
      });
      if (skipMatch) {
        await this.suppressRunnerProductFromSkipMatch({
          runnerId: link.runnerId,
          productId,
          shopId,
          reason: 'Matched a Runner skipped item image',
          productName: productForSkipReference?.name || null,
          productImageUrls,
          productImageHashes,
          matchedSkippedItemId: skipMatch.id,
          matchScore: skipMatch.score,
        });
        suppressedRunnerIds.add(link.runnerId);
        continue;
      }

      if (
        !this.runnerShopAutomationMatchesProduct(link, {
          basePrice,
          category,
          images,
        })
      ) {
        continue;
      }

      const markup = this.clampMarkup(
        typeof link.markupPercent === 'number'
          ? link.markupPercent
          : defaultMarkup,
      );
      const runnerPrice =
        Math.round(Number(basePrice) * (1 + markup) * 100) / 100;
      const runnerRepostingActive = link.runner.repostingStatus === 'ACTIVE';
      const listingAutoPostApproved =
        autoPostApproved &&
        runnerRepostingActive &&
        Boolean(link.autoPostEnabled);
      const existing = await this.prisma.runnerListing.findUnique({
        where: {
          runnerId_productId: {
            runnerId: link.runnerId,
            productId,
          },
        },
        select: { id: true },
      });

      await this.prisma.runnerListing.upsert({
        where: {
          runnerId_productId: {
            runnerId: link.runnerId,
            productId,
          },
        },
        update: {
          status: 'ACTIVE',
          shopId,
          markup,
          runnerPrice,
          autoPostApproved: listingAutoPostApproved,
          maximumListingAgeDays: link.maximumListingAgeDays,
        },
        create: {
          runnerId: link.runnerId,
          productId,
          shopId,
          markup,
          runnerPrice,
          status: 'ACTIVE',
          autoPostApproved: listingAutoPostApproved,
          orderCode: this.createOrderCode(),
          maximumListingAgeDays: link.maximumListingAgeDays,
        },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }

      if (
        autoEnableRunnerPosting &&
        (link.destinationGroup || link.runner.whatsappGroup) &&
        runnerRepostingActive &&
        link.autoPostEnabled &&
        !link.runner.autoPostEnabled
      ) {
        await this.prisma.runner.update({
          where: { id: link.runner.id },
          data: { autoPostEnabled: true },
        });
        runnersEnabled += 1;
      }
    }

    return { created, updated, runnersEnabled };
  }

  private async createListingsForApprovedShopProducts({
    productsPerLink,
    defaultMarkup,
    autoPostApproved,
    autoEnableRunnerPosting,
  }: {
    productsPerLink: number;
    defaultMarkup: number;
    autoPostApproved: boolean;
    autoEnableRunnerPosting: boolean;
  }) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        status: 'APPROVED',
        autoListEnabled: true,
        runner: {
          status: 'ACTIVE',
        },
      },
      select: {
        runnerId: true,
        shopId: true,
        minPrice: true,
        maxPrice: true,
        categoryFilter: true,
        requireMedia: true,
        runner: {
          select: {
            id: true,
            autoPostEnabled: true,
            whatsappGroup: true,
          },
        },
      },
      take: 1000,
    });

    let created = 0;
    let updated = 0;
    let runnersEnabled = 0;

    for (const link of links) {
      const existingListings = await this.prisma.runnerListing.findMany({
        where: { runnerId: link.runnerId },
        select: { productId: true },
      });
      const suppressedListings =
        await this.prisma.runnerListingSuppression.findMany({
          where: { runnerId: link.runnerId },
          select: { productId: true },
        });
      const listedProductIds = existingListings.map(
        (listing) => listing.productId,
      );
      const suppressedProductIds = suppressedListings.map(
        (listing) => listing.productId,
      );
      const excludedProductIds = [
        ...new Set([...listedProductIds, ...suppressedProductIds]),
      ];
      const basePriceFilter = {
        ...(link.minPrice !== null && link.minPrice !== undefined
          ? { gte: link.minPrice }
          : {}),
        ...(link.maxPrice !== null && link.maxPrice !== undefined
          ? { lte: link.maxPrice }
          : {}),
      };
      const products = await this.prisma.product.findMany({
        where: {
          shopId: link.shopId,
          status: 'ACTIVE',
          stockQty: { gt: 0 },
          ...(Object.keys(basePriceFilter).length > 0
            ? { basePrice: basePriceFilter }
            : {}),
          ...(link.categoryFilter
            ? { category: { contains: link.categoryFilter } }
            : {}),
          ...(excludedProductIds.length > 0
            ? { id: { notIn: excludedProductIds } }
            : {}),
        },
        select: {
          id: true,
          shopId: true,
          basePrice: true,
          category: true,
          images: true,
        },
        orderBy: { createdAt: 'desc' },
        take: productsPerLink * 3,
      });

      const eligibleProducts = products
        .filter((product) =>
          this.runnerShopAutomationMatchesProduct(link, {
            basePrice: product.basePrice,
            category: product.category,
            images: product.images as string[] | null,
          }),
        )
        .slice(0, productsPerLink);

      for (const product of eligibleProducts) {
        const listingResult = await this.createAutomaticRunnerListings({
          productId: product.id,
          shopId: product.shopId,
          basePrice: product.basePrice,
          category: product.category,
          images: product.images as string[] | null,
          defaultMarkup,
          autoPostApproved,
          autoEnableRunnerPosting,
        });
        created += listingResult.created;
        updated += listingResult.updated;
        runnersEnabled += listingResult.runnersEnabled;
      }
    }

    return { created, updated, runnersEnabled };
  }

  private async enableConfiguredRunnerPosting() {
    const result = await this.prisma.runner.updateMany({
      where: {
        status: 'ACTIVE',
        repostingStatus: 'ACTIVE',
        autoPostEnabled: false,
        whatsappGroup: { not: null },
      },
      data: { autoPostEnabled: true },
    });

    return result.count;
  }

  private async approveExistingRunnerListings() {
    const result = await this.prisma.runnerListing.updateMany({
      where: {
        status: 'ACTIVE',
        autoPostApproved: false,
        runner: {
          status: 'ACTIVE',
          repostingStatus: 'ACTIVE',
          autoPostEnabled: true,
        },
      },
      data: { autoPostApproved: true },
    });

    return result.count;
  }

  private runnerShopAutomationMatchesProduct(
    link: {
      minPrice?: number | null;
      maxPrice?: number | null;
      categoryFilter?: string | null;
      requireMedia?: boolean | null;
    },
    product: {
      basePrice: number;
      category?: string | null;
      images?: string[] | null;
    },
  ) {
    const basePrice = Number(product.basePrice || 0);

    if (link.minPrice !== null && link.minPrice !== undefined) {
      if (basePrice < Number(link.minPrice)) return false;
    }

    if (link.maxPrice !== null && link.maxPrice !== undefined) {
      if (basePrice > Number(link.maxPrice)) return false;
    }

    if (link.categoryFilter) {
      const category = String(product.category || '').toLowerCase();
      if (!category.includes(String(link.categoryFilter).toLowerCase())) {
        return false;
      }
    }

    if (link.requireMedia !== false) {
      const mediaUrls = Array.isArray(product.images) ? product.images : [];
      if (this.capturedProductMediaUrls(mediaUrls).length === 0) {
        return false;
      }
    }

    return true;
  }

  private async markAutomationReview(importId: string, message: string) {
    await this.prisma.whatsAppImport.update({
      where: { id: importId },
      data: {
        status: 'NEEDS_REVIEW',
        error: message.slice(0, 500),
      },
    });
  }

  private clampMarkup(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(value, 1));
  }

  async enrichSelectedImports(shopId: string, userId: string, ids: string[]) {
    await this.assertShopOwner(shopId, userId);

    if (ids.length === 0) {
      throw new BadRequestException('Select at least one WhatsApp post');
    }

    const uniqueIds = [...new Set(ids)];
    const results = [];
    const failed: Array<{ id: string; message: string }> = [];

    for (const id of uniqueIds) {
      try {
        results.push(await this.enrichQueuedImport(shopId, id, userId));
      } catch (error) {
        failed.push({
          id,
          message:
            error instanceof Error ? error.message : 'AI enrichment failed',
        });
      }
    }

    return {
      enriched: results.length,
      failed,
      results,
    };
  }

  private productDataFromDraft(draft: ParsedDraft, mediaUrls: string[]) {
    const capturedMediaUrls = this.capturedProductMediaUrls(mediaUrls);
    const stockQty = this.cleanProductStockQty(draft.stockQty);

    if (capturedMediaUrls.length === 0) {
      throw new BadRequestException(
        'WhatsApp product import requires a captured product image or video',
      );
    }

    return {
      name: draft.name.trim(),
      description: draft.description?.trim() || draft.sourceText?.trim(),
      basePrice: Number(draft.basePrice),
      stockQty,
      category: draft.category?.trim() || undefined,
      status: stockQty > 0 ? ProductStatus.ACTIVE : ProductStatus.OUT_OF_STOCK,
      images: capturedMediaUrls as Prisma.InputJsonValue,
    };
  }

  private cleanProductStockQty(value: unknown) {
    const stockQty = Number(value);
    if (!Number.isFinite(stockQty) || stockQty <= 0 || stockQty > 100000) {
      return 1;
    }
    return Math.floor(stockQty);
  }

  private parsePost(caption: string, mediaUrls: string[]): ParsedDraft | null {
    const normalized = this.normalizeCurrencyText(
      this.normalizePostText(caption),
    )
      .replace(/[🔥📦💰✅❌]/g, ' ')
      .replace(/\r/g, '')
      .trim();
    const captionPricing = this.parseCaptionPricing(normalized);
    const priceMatch = this.extractPriceMatch(normalized);

    if (!captionPricing.basePrice && !priceMatch) return null;

    const stockMatch = this.extractStockQuantityMatch(normalized);
    const categoryMatch = normalized.match(
      /(?:category|cat)\s*[:\-]\s*([^\n|]+)/i,
    );
    const imageUrls =
      normalized
        .match(/https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s]+)?/gi)
        ?.slice(0, 10) ?? [];

    const lines = this.captionSegments(normalized);
    const nameSource =
      lines.find(
        (line) =>
          !this.isProductMetadataLine(line) &&
          !this.isColorSizeLine(line) &&
          !this.looksLikeSizeOnlyLine(line),
      ) ||
      lines[0] ||
      '';

    const extractedName = nameSource
      .replace(/(?:\b(?:R|ZAR|E|SZL)|\$)\s*\d+(?:[.,]\d{1,2})?/gi, '')
      .replace(/\b(?:stock|qty|quantity|available)\s*[:=\-]?\s*\d+/gi, '')
      .replace(
        /\b(?:each|ea|price|now|sale|special|from)\s*[:=\-]?\s*\d+(?:[.,]\d{1,2})?\b/gi,
        '',
      )
      .replace(/\b\d+\s*(?:left|in stock|pcs|bags|boxes)\b/gi, '')
      .replace(/\b(?:free\s+size|available\s+sizes?|size\s+only)\b/gi, '')
      .replace(/category\s*[:\-].*/i, '')
      .replace(/\s[-|]\s*/g, ' ')
      .replace(/[-|]\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const basePrice =
      captionPricing.basePrice ?? this.priceFromMatch(priceMatch!);
    const name = this.isWeakCaptionName(extractedName)
      ? this.fallbackCaptionName(captionPricing, basePrice)
      : extractedName;

    if (name.length < 3) return null;
    const description = this.buildStructuredCaptionDescription(
      lines,
      nameSource,
      captionPricing,
      basePrice,
    );

    return {
      name,
      description,
      basePrice,
      stockQty: stockMatch ? Math.max(1, Number(stockMatch[1])) : 1,
      category: categoryMatch?.[1]?.trim(),
      images: [...mediaUrls, ...imageUrls].slice(0, 10),
      sourceText: caption,
      priceConfidence: captionPricing.priceConfidence,
      priceWarnings: captionPricing.priceWarnings,
      rawPriceCandidates: captionPricing.rawPriceCandidates,
      unitPrice: captionPricing.unitPrice ?? undefined,
      stockPrice: captionPricing.stockPrice ?? undefined,
      eachPrice: captionPricing.eachPrice ?? undefined,
      stockIsBulkPrice: captionPricing.stockIsBulkPrice || undefined,
      regularUnitPrice: captionPricing.regularUnitPrice ?? undefined,
      bulkUnitPrice: captionPricing.bulkUnitPrice ?? undefined,
      bulkQuantity: captionPricing.bulkQuantity ?? undefined,
      bulkTotal: captionPricing.bulkTotal ?? undefined,
      bulkSavings: captionPricing.bulkSavings || undefined,
      bulkSavingsPerItem: captionPricing.bulkSavingsPerItem || undefined,
      bulkSavingsPercent: captionPricing.bulkSavingsPercent || undefined,
    };
  }

  private async enrichProductWithVision({
    apiKey,
    caption,
    mediaUrls,
    currentDraft,
    visualSearchCandidates = [],
  }: {
    apiKey: string;
    caption: string;
    mediaUrls: string[];
    currentDraft: ParsedDraft | null;
    visualSearchCandidates?: VisualSearchCandidate[];
  }): Promise<AiProductEnrichment> {
    const model =
      this.configService.get<string>('OPENAI_PRODUCT_ENRICHMENT_MODEL') ||
      'gpt-4.1-mini';
    const imageContent = await this.buildOpenAiImageContent(
      mediaUrls.slice(0, 4),
    );

    if (imageContent.length === 0) {
      throw new BadRequestException('No local image files available to enrich');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  'You are enriching WhatsApp fashion marketplace product posts.',
                  'Use the images as the primary source of truth. Use the caption only for price, sizes, and hints.',
                  'Return a concise sellable product name and a separate customer-facing description.',
                  'Do not use generic names like New Arrival, New Arrived, Restored, Available, or Size M to 2XL as the itemName.',
                  'Treat compact 4+ digit prices such as R9999 as decimal prices such as R99.99, especially in sale or bulk special lines.',
                  'For bulk specials, describe the quantity, unit price, and savings when the current draft contains that information.',
                  'When visual search candidates are provided, use them as hints only. Do not copy brand names unless they are clearly visible in the image or caption.',
                  'If the exact product type is uncertain, use a cautious but useful descriptive name and set needsReview true.',
                  `Caption: ${caption}`,
                  `Current draft: ${JSON.stringify(currentDraft ?? {})}`,
                  `Visual search candidates: ${JSON.stringify(
                    visualSearchCandidates.slice(0, 8),
                  )}`,
                ].join('\n'),
              },
              ...imageContent,
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'product_enrichment',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                itemName: {
                  type: 'string',
                  description: 'Specific product name, 3 to 10 words.',
                },
                description: {
                  type: 'string',
                  description:
                    'One or two concise sentences describing visible item details.',
                },
                category: { type: 'string' },
                colors: {
                  type: 'array',
                  items: { type: 'string' },
                },
                sizes: {
                  type: 'array',
                  items: { type: 'string' },
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                needsReview: { type: 'boolean' },
              },
              required: [
                'itemName',
                'description',
                'category',
                'colors',
                'sizes',
                'tags',
                'confidence',
                'needsReview',
              ],
            },
          },
        },
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new BadRequestException(
        `AI enrichment failed: HTTP ${response.status} ${body.slice(0, 300)}`,
      );
    }

    const parsed = JSON.parse(body);
    const outputText =
      parsed.output_text ??
      parsed.output
        ?.flatMap((item: any) => item.content ?? [])
        ?.find((content: any) => content.type === 'output_text')?.text;

    if (!outputText) {
      throw new BadRequestException('AI enrichment returned no product text');
    }

    const enrichment = JSON.parse(outputText) as AiProductEnrichment;

    return {
      itemName: this.sanitizeText(enrichment.itemName).slice(0, 200),
      description: this.sanitizeText(enrichment.description).slice(0, 500),
      category: this.sanitizeText(enrichment.category || '').slice(0, 100),
      colors: (enrichment.colors ?? []).map((item) =>
        this.sanitizeText(item).slice(0, 40),
      ),
      sizes: (enrichment.sizes ?? []).map((item) =>
        this.sanitizeText(item).slice(0, 40),
      ),
      tags: (enrichment.tags ?? []).map((item) =>
        this.sanitizeText(item).slice(0, 40),
      ),
      confidence: Math.max(0, Math.min(1, Number(enrichment.confidence || 0))),
      needsReview: Boolean(enrichment.needsReview),
    };
  }

  private async enrichProductDraft({
    caption,
    mediaUrls,
    currentDraft,
  }: {
    caption: string;
    mediaUrls: string[];
    currentDraft: ParsedDraft | null;
  }): Promise<AiProductEnrichment & { source: string }> {
    const provider = (
      this.configService.get<string>('PRODUCT_VISUAL_SEARCH_PROVIDER') || 'auto'
    ).toLowerCase();
    const errors: string[] = [];
    const visualSearchCandidates: VisualSearchCandidate[] = [];

    if (provider === 'auto' || provider === 'serpapi-google-lens') {
      const apiKey = this.configService.get<string>('SERPAPI_API_KEY');
      if (apiKey) {
        try {
          const enrichment = await this.enrichProductWithSerpApiGoogleLens({
            apiKey,
            caption,
            mediaUrls,
            currentDraft,
          });
          return { ...enrichment, source: 'serpapi-google-lens' };
        } catch (error) {
          errors.push(`Google Lens search: ${this.errorMessage(error)}`);
        }
      }
    }

    if (provider === 'auto' || provider === 'google-vision-web') {
      const apiKey = this.configService.get<string>(
        'GOOGLE_CLOUD_VISION_API_KEY',
      );
      if (apiKey) {
        try {
          const candidates = await this.fetchGoogleVisionWebCandidates({
            apiKey,
            mediaUrls,
          });
          visualSearchCandidates.push(...candidates);
          if (provider === 'google-vision-web') {
            return {
              ...this.enrichmentFromVisualSearchCandidates({
                candidates,
                caption,
                currentDraft,
                source: 'Google Vision Web Detection',
              }),
              source: 'google-vision-web',
            };
          }
        } catch (error) {
          errors.push(
            `Google Vision web detection: ${this.errorMessage(error)}`,
          );
        }
      }
    }

    if (provider === 'auto' || provider === 'openai-vision') {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (apiKey) {
        try {
          const enrichment = await this.enrichProductWithVision({
            apiKey,
            caption,
            mediaUrls,
            currentDraft,
            visualSearchCandidates,
          });
          return { ...enrichment, source: 'openai-vision' };
        } catch (error) {
          errors.push(`OpenAI vision: ${this.errorMessage(error)}`);
        }
      }
    }

    throw new BadRequestException(
      [
        'No product visual enrichment provider is available.',
        'Configure SERPAPI_API_KEY for Google Lens-style product search, GOOGLE_CLOUD_VISION_API_KEY for official Google web detection, or OPENAI_API_KEY for vision enrichment.',
        errors.length > 0 ? `Attempted providers: ${errors.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  private async enrichProductWithSerpApiGoogleLens({
    apiKey,
    caption,
    mediaUrls,
    currentDraft,
  }: {
    apiKey: string;
    caption: string;
    mediaUrls: string[];
    currentDraft: ParsedDraft | null;
  }) {
    const imageUrl = this.publicImageUrlFromMediaUrl(mediaUrls[0]);
    if (!imageUrl) {
      throw new BadRequestException(
        'Google Lens search needs a public product image URL. Set WHATSAPP_PUBLIC_UPLOAD_BASE_URL, for example an ngrok URL pointing to the backend uploads.',
      );
    }

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_lens');
    url.searchParams.set('url', imageUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('country', 'za');

    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok) {
      throw new BadRequestException(
        `Google Lens search failed: HTTP ${response.status} ${body.slice(
          0,
          300,
        )}`,
      );
    }

    const data = JSON.parse(body);
    const candidates = this.extractSerpApiLensCandidates(data);
    if (candidates.length === 0) {
      throw new BadRequestException('Google Lens search returned no matches');
    }

    return this.enrichmentFromVisualSearchCandidates({
      candidates,
      caption,
      currentDraft,
      source: 'Google Lens search',
    });
  }

  private async fetchGoogleVisionWebCandidates({
    apiKey,
    mediaUrls,
  }: {
    apiKey: string;
    mediaUrls: string[];
  }) {
    const file = await this.localUploadPathFromUrl(mediaUrls[0]);
    if (!file) {
      throw new BadRequestException(
        'Google Vision web detection needs a local captured image file',
      );
    }

    const bytes = await readFile(file);
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
        apiKey,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: bytes.toString('base64') },
              features: [{ type: 'WEB_DETECTION', maxResults: 10 }],
            },
          ],
        }),
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw new BadRequestException(
        `Google Vision web detection failed: HTTP ${response.status} ${body.slice(
          0,
          300,
        )}`,
      );
    }

    const data = JSON.parse(body);
    const detection = data.responses?.[0]?.webDetection ?? {};
    const entityCandidates = (detection.webEntities ?? [])
      .map((entity: any) => ({
        title: String(entity.description || '').trim(),
        source: 'Google Vision web entity',
      }))
      .filter((item: VisualSearchCandidate) => item.title);
    const pageCandidates = (detection.pagesWithMatchingImages ?? [])
      .map((page: any) => ({
        title: String(page.pageTitle || '').trim(),
        source: String(page.fullMatchingImages?.[0]?.url || page.url || ''),
        link: page.url,
      }))
      .filter((item: VisualSearchCandidate) => item.title);

    return this.dedupeVisualSearchCandidates([
      ...entityCandidates,
      ...pageCandidates,
    ]);
  }

  private extractSerpApiLensCandidates(data: any) {
    const sections = [
      ...(data.visual_matches ?? []),
      ...(data.exact_matches ?? []),
      ...(data.products ?? []),
      ...(data.product_results ?? []),
      ...(data.related_searches ?? []),
    ];

    return this.dedupeVisualSearchCandidates(
      sections
        .map((item: any) => ({
          title: String(item.title || item.query || item.name || '').trim(),
          source: String(item.source || item.displayed_link || '').trim(),
          link: item.link || item.url,
          price: item.price?.extracted_value
            ? String(item.price.extracted_value)
            : String(item.price || '').trim(),
        }))
        .filter((item: VisualSearchCandidate) => item.title),
    );
  }

  private enrichmentFromVisualSearchCandidates({
    candidates,
    caption,
    currentDraft,
    source,
  }: {
    candidates: VisualSearchCandidate[];
    caption: string;
    currentDraft: ParsedDraft | null;
    source: string;
  }): AiProductEnrichment {
    const bestTitle =
      candidates
        .map((candidate) => this.productNameFromSearchTitle(candidate.title))
        .find((title) => title && !this.isWeakProductName(title)) ||
      currentDraft?.name ||
      this.firstReviewableLine(caption) ||
      'Fashion item';
    const cleanName = this.sanitizeText(bestTitle).slice(0, 200);
    const category = this.categoryFromName(cleanName, caption);
    const tags = this.dedupeStrings([
      category,
      ...candidates
        .slice(0, 5)
        .flatMap((candidate) => this.keywordsFromTitle(candidate.title)),
    ]).slice(0, 10);
    const visibleHints = this.dedupeStrings(
      candidates
        .slice(0, 4)
        .map((candidate) => this.productNameFromSearchTitle(candidate.title))
        .filter(Boolean),
    );
    const description =
      visibleHints.length > 1
        ? `Visual search suggests this is a ${cleanName}. Similar matches include ${visibleHints
            .slice(1, 4)
            .join(', ')}.`
        : `Visual search suggests this is a ${cleanName}. Review the images and caption before publishing.`;

    return {
      itemName: cleanName,
      description: this.sanitizeText(description).slice(0, 500),
      category,
      colors: currentDraft?.colors ?? [],
      sizes: currentDraft?.sizes ?? [],
      tags,
      confidence: source.includes('Lens') ? 0.72 : 0.62,
      needsReview: true,
    };
  }

  private async buildOpenAiImageContent(mediaUrls: string[]) {
    const content: Array<{ type: 'input_image'; image_url: string }> = [];

    for (const mediaUrl of mediaUrls) {
      const file = await this.localUploadPathFromUrl(mediaUrl);
      if (!file) continue;

      const bytes = await readFile(file);
      const mimeType = this.mimeTypeForFile(file);
      if (!mimeType.startsWith('image/')) continue;
      content.push({
        type: 'input_image',
        image_url: `data:${mimeType};base64,${bytes.toString('base64')}`,
      });
    }

    return content;
  }

  private async localUploadPathFromUrl(mediaUrl: string) {
    try {
      const parsed = new URL(mediaUrl);
      if (parsed.pathname.includes('..')) return null;
      if (!parsed.pathname.startsWith('/uploads/')) return null;

      const uploadRoot = resolve(
        this.configService.get<string>('UPLOAD_PATH') || './uploads',
      );
      const relativePath = decodeURIComponent(
        parsed.pathname.replace(/^\/uploads\//, ''),
      );
      const candidate = resolve(join(uploadRoot, relativePath));
      const rel = relative(uploadRoot, candidate);

      if (rel.startsWith('..') || rel === '') return null;

      return candidate;
    } catch {
      return null;
    }
  }

  private publicImageUrlFromMediaUrl(mediaUrl?: string) {
    if (!mediaUrl) return null;

    try {
      const parsed = new URL(mediaUrl);
      const publicBase =
        this.configService.get<string>('WHATSAPP_PUBLIC_UPLOAD_BASE_URL') ||
        this.configService.get<string>('PUBLIC_BACKEND_URL') ||
        '';

      if (publicBase) {
        const base = new URL(publicBase);
        return new URL(parsed.pathname + parsed.search, base).toString();
      }

      if (
        ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) ||
        parsed.hostname.endsWith('.local')
      ) {
        return null;
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }

  private productNameFromSearchTitle(title: string) {
    return this.sanitizeText(title)
      .replace(/\s+[|-]\s+.*$/g, '')
      .replace(/\b(?:buy|shop|online|sale|price|shipping|delivery)\b/gi, ' ')
      .replace(/\b(?:amazon|ebay|takealot|temu|shein|aliexpress)\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private keywordsFromTitle(title: string) {
    const stopWords = new Set([
      'buy',
      'shop',
      'online',
      'sale',
      'price',
      'shipping',
      'delivery',
      'women',
      'mens',
      'men',
      'ladies',
      'girls',
      'boys',
    ]);

    return this.productNameFromSearchTitle(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !stopWords.has(word));
  }

  private categoryFromName(name: string, caption: string) {
    const text = `${name} ${caption}`.toLowerCase();
    const rules: Array<[RegExp, string]> = [
      [/\b(dress|gown|skirt|jumpsuit|romper)\b/, 'Fashion'],
      [/\b(shoe|sneaker|heel|sandal|boot|slipper)\b/, 'Footwear'],
      [/\b(bag|handbag|purse|wallet|backpack)\b/, 'Bags'],
      [/\b(top|shirt|blouse|tee|t-shirt|jersey)\b/, 'Tops'],
      [/\b(jean|pants|trouser|legging|shorts)\b/, 'Bottoms'],
      [/\b(jacket|coat|hoodie|cardigan)\b/, 'Outerwear'],
      [/\b(watch|bracelet|necklace|earring|ring)\b/, 'Accessories'],
      [/\b(phone|laptop|speaker|charger|earphone)\b/, 'Electronics'],
    ];

    return rules.find(([pattern]) => pattern.test(text))?.[1] || 'Fashion';
  }

  private isWeakProductName(name: string) {
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
    return (
      normalized.length < 4 ||
      [
        'new arrive',
        'new arrival',
        'new arrivals',
        'new arrived',
        'available',
        'restock',
        'restocked',
      ].includes(normalized)
    );
  }

  private dedupeVisualSearchCandidates(candidates: VisualSearchCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = candidate.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private dedupeStrings(values: Array<string | undefined | null>) {
    const seen = new Set<string>();
    return values
      .map((value) => this.sanitizeText(value || '').trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private mimeTypeForFile(filePath: string) {
    const extension = extname(filePath).toLowerCase();
    if (extension === '.png') return 'image/png';
    if (extension === '.webp') return 'image/webp';
    if (extension === '.gif') return 'image/gif';
    if (extension === '.mp4') return 'video/mp4';
    if (extension === '.webm') return 'video/webm';
    if (extension === '.mov') return 'video/quicktime';
    return 'image/jpeg';
  }

  private captionSegments(text: string) {
    const segments: string[] = [];

    for (const rawLine of String(text || '').split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const starred = Array.from(line.matchAll(/\*+([^*]+)\*+/g))
        .map((match) => match[1]?.trim())
        .filter(Boolean);

      if (starred.length > 0) {
        segments.push(...starred);
        continue;
      }

      segments.push(
        ...line
          .split(/\s{2,}|\s*[|•]\s*/)
          .map((part) =>
            part
              .replace(/^[-•*]\s*/, '')
              .replace(/\*/g, '')
              .trim(),
          )
          .filter(Boolean),
      );
    }

    return segments;
  }

  private parseCaptionPricing(text: string) {
    const segments = this.captionSegments(text);
    const stockPrice = this.priceForLabel(segments, ['stock', 'cost']);
    const eachPrice = this.priceForLabel(segments, ['each', 'ea', 'retail']);
    const standardPrice = this.priceForLabel(segments, [
      'price',
      'now',
      'sale',
      'special',
      'from',
    ]);
    const bulkSpecials = this.extractBulkSpecials(segments);
    const rawPriceCandidates = this.extractPriceCandidates(text);
    const firstPrice = rawPriceCandidates[0]?.value ?? null;
    const sizes = this.extractSizeText(segments);
    const colorSizes = this.extractColorSizeLines(segments);
    const packText = this.extractPackText(segments);
    const packQuantity = this.extractPackQuantity(segments);
    const strongestBulk = bulkSpecials[0];
    const stockIsBulkPrice = Boolean(
      stockPrice && eachPrice && stockPrice < eachPrice && !strongestBulk,
    );
    const suspiciousStandardPrice =
      standardPrice !== null &&
      standardPrice !== undefined &&
      strongestBulk &&
      strongestBulk.unitPrice >= 10 &&
      standardPrice < strongestBulk.unitPrice * 0.5;
    const priceWarnings: string[] = [];

    if (suspiciousStandardPrice) {
      priceWarnings.push(
        `Ignored suspicious low labelled price R ${this.formatMoney(
          standardPrice,
        )} because the same caption has a stronger bulk price ${strongestBulk.quantity} for R ${this.formatMoney(
          strongestBulk.totalPrice,
        )}.`,
      );
    }

    const regularUnitPrice =
      eachPrice ??
      (suspiciousStandardPrice ? null : standardPrice) ??
      (!strongestBulk && !packQuantity ? stockPrice : null) ??
      (!strongestBulk ? firstPrice : null);
    const bulkQuantity =
      strongestBulk?.quantity ??
      (stockPrice && packQuantity ? packQuantity : null);
    const bulkUnitPrice =
      strongestBulk?.unitPrice ??
      (stockPrice && (bulkQuantity || stockIsBulkPrice) ? stockPrice : null);
    const bulkTotal =
      strongestBulk?.totalPrice ??
      (bulkUnitPrice && bulkQuantity
        ? roundMoney(bulkUnitPrice * bulkQuantity)
        : null);
    const regularBulkTotal =
      regularUnitPrice && bulkQuantity
        ? roundMoney(regularUnitPrice * bulkQuantity)
        : null;
    const bulkSavings =
      regularBulkTotal && bulkTotal
        ? roundMoney(Math.max(0, regularBulkTotal - bulkTotal))
        : 0;
    const bulkSavingsPerItem =
      bulkSavings > 0 && bulkQuantity
        ? roundMoney(bulkSavings / bulkQuantity)
        : stockIsBulkPrice && regularUnitPrice && bulkUnitPrice
          ? roundMoney(Math.max(0, regularUnitPrice - bulkUnitPrice))
          : 0;
    const bulkSavingsPercent =
      bulkSavings > 0 && regularBulkTotal
        ? Math.round((bulkSavings / regularBulkTotal) * 100)
        : bulkSavingsPerItem > 0 && regularUnitPrice
          ? Math.round((bulkSavingsPerItem / regularUnitPrice) * 100)
          : 0;
    const basePrice =
      strongestBulk?.totalPrice ??
      (stockPrice && packQuantity ? bulkTotal : null) ??
      stockPrice ??
      eachPrice ??
      (suspiciousStandardPrice ? null : standardPrice) ??
      bulkUnitPrice ??
      firstPrice;
    const priceConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      priceWarnings.length > 0
        ? 'LOW'
        : stockPrice || eachPrice || standardPrice || strongestBulk
          ? 'HIGH'
          : firstPrice
            ? 'MEDIUM'
            : 'LOW';

    return {
      stockPrice,
      eachPrice,
      stockIsBulkPrice,
      standardPrice,
      bulkSpecials,
      colorSizes,
      basePrice,
      unitPrice: regularUnitPrice ?? bulkUnitPrice ?? basePrice ?? null,
      regularUnitPrice,
      bulkUnitPrice,
      bulkQuantity,
      bulkTotal,
      bulkSavings,
      bulkSavingsPerItem,
      bulkSavingsPercent,
      priceConfidence,
      priceWarnings,
      rawPriceCandidates,
      sizes,
      packText,
    };
  }

  private priceForLabel(segments: string[], labels: string[]) {
    for (const segment of segments) {
      const labelPattern = labels.join('|');
      const match = segment.match(
        new RegExp(
          `\\b(?:${labelPattern})\\b\\s*[:=.\\-]?\\s*(?:(?:R|ZAR|E|SZL)|\\$)?\\s*(\\d+(?:[.,]\\d{1,2})?)`,
          'i',
        ),
      );
      if (match) {
        const remainder = segment.slice((match.index ?? 0) + match[0].length);
        if (/^\s*(?:for|x|@)\b/i.test(remainder)) continue;
        return this.parseMoneyToken(match[1]);
      }
    }

    return null;
  }

  private extractBulkSpecials(segments: string[]) {
    const specials: Array<{
      quantity: number;
      totalPrice: number;
      unitPrice: number;
      source: string;
    }> = [];

    const pushSpecial = (
      quantityToken: string,
      priceToken: string,
      source: string,
    ) => {
      const quantity = quantityToken
        .split('+')
        .map((part) => Number(part.trim()))
        .reduce((total, part) => total + (Number.isFinite(part) ? part : 0), 0);
      const totalPrice = this.parseMoneyToken(priceToken);
      if (!quantity || !totalPrice) return;
      specials.push({
        quantity,
        totalPrice,
        unitPrice: roundMoney(totalPrice / quantity),
        source,
      });
    };

    for (const segment of segments) {
      for (const match of segment.matchAll(
        /\b(\d{1,3})\s*(?:for|x|@)\s*(?:[^\w\s]{0,6}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
      )) {
        pushSpecial(match[1], match[2], segment);
      }

      for (const match of segment.matchAll(
        /\b(?:\d+\s*)?packs?\s*\(\s*(\d{1,3})\s*(?:pcs?|pieces?|pc)\s*inside\s*\)(?:[^\dA-Za-z]{0,12}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
      )) {
        pushSpecial(match[1], match[2], segment);
      }

      for (const match of segment.matchAll(
        /\b(\d{1,2}(?:\s*\+\s*\d{1,2})+)(?:[^\dA-Za-z]{0,12}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
      )) {
        pushSpecial(match[1], match[2], segment);
      }
    }

    const unique = new Map<string, (typeof specials)[number]>();
    for (const special of specials) {
      const key = `${special.quantity}:${special.totalPrice}:${special.source.toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, special);
    }

    return [...unique.values()];
  }

  private extractSizeText(segments: string[]) {
    const sizeSegment =
      segments.find((segment) => /\bsizes?\b/i.test(segment)) ||
      segments.find((segment) =>
        /^(?:free\s+size|[xsml]{1,3}\s*(?:-|to|and)\s*[0-9xsml]|[0-9]{1,2}\s*(?:-|to)\s*[0-9]{1,2})/i.test(
          segment,
        ),
      );
    if (!sizeSegment) return undefined;

    return sizeSegment
      .replace(/\b(?:available\s+)?sizes?\b\s*[:=\-]?/i, '')
      .replace(/\bsize\s+only\b\s*[:,=\-]?/i, '')
      .replace(/\bfree\s+size\b/i, 'Free size')
      .replace(/\s+\.\s*to\s*\.\s+/gi, '-')
      .replace(/\s+\.\s+/g, '-')
      .replace(/\s+\bto\b\s+/gi, '-')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private extractColorSizeLines(segments: string[]) {
    return segments
      .filter((segment) => this.isColorSizeLine(segment))
      .map((segment) =>
        segment
          .replace(/\s*=\s*/g, ': ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      );
  }

  private isColorSizeLine(line: string) {
    const clean = line.trim();
    const label = clean.split('=')[0]?.trim().toLowerCase() || '';
    if (
      /^(capacity|usb|type|tye|input|output|code|price|stock|each|size)$/i.test(
        label,
      )
    ) {
      return false;
    }

    return /^[a-z][a-z\s]{1,30}\s*=\s*(?:free\s+size|(?:[xsml]{1,3}|\d{1,2})(?:\s*(?:-|\/|,|and)\s*(?:[xsml]{1,3}|\d{1,2}))*\s*(?:xl)?)/i.test(
      clean,
    );
  }

  private normalizeCurrencyText(text: string) {
    return String(text || '')
      .replace(/[⁰₀]/g, '0')
      .replace(/[¹₁]/g, '1')
      .replace(/[²₂]/g, '2')
      .replace(/[³₃]/g, '3')
      .replace(/[⁴₄]/g, '4')
      .replace(/[⁵₅]/g, '5')
      .replace(/[⁶₆]/g, '6')
      .replace(/[⁷₇]/g, '7')
      .replace(/[⁸₈]/g, '8')
      .replace(/[⁹₉]/g, '9')
      .replace(/[🅡Ⓡ®]/g, 'R')
      .replace(/\uFE0F/g, '')
      .replace(/\p{Emoji_Modifier}/gu, '')
      .replace(/[\uDFFB-\uDFFF]/g, '')
      .replace(/[👉➡➜➔→]+/g, ' ')
      .replace(/\bR\s*R\s*(\d)/gi, 'R $1')
      .replace(/\bR\s*[.:]\s*(\d)/gi, 'R $1')
      .replace(/\bR\s+(\d)/gi, 'R $1')
      .replace(/\b(PRICE|P)\s*R\b/gi, 'PRICE R')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private extractPackText(segments: string[]) {
    const packSegment = segments.find((segment) =>
      /^\d+\s*(?:pcs?|pieces?|pc)\b/i.test(segment),
    );
    if (!packSegment) return undefined;

    return packSegment
      .replace(/\bpcs?\b/i, 'pcs')
      .replace(/\bpieces?\b/i, 'pcs')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private extractPackQuantity(segments: string[]) {
    const packSegment = segments.find((segment) =>
      /^\d+\s*(?:pcs?|pieces?|pc)\b/i.test(segment),
    );
    const quantity = Number(packSegment?.match(/^(\d{1,3})/)?.[1] || 0);
    return quantity > 1 ? quantity : null;
  }

  private extractStockQuantityMatch(text: string) {
    return (
      text.match(
        /(?:qty|quantity|available|units?)\s*[:=\-]?\s*(\d{1,6})\b/i,
      ) ||
      text.match(
        /\bstock\s*[:=\-]?\s*(\d{1,6})\s*(?:left|pcs|units?|available)\b/i,
      ) ||
      text.match(/(\d{1,6})\s*(?:left|in stock|bags|boxes)\b/i)
    );
  }

  private isWeakCaptionName(name: string) {
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
    return (
      normalized.length < 3 ||
      /^(stock|each|ea|price|size|sizes?|available|new arrival|new arrivals?)$/i.test(
        normalized,
      )
    );
  }

  private fallbackCaptionName(
    pricing: ReturnType<WhatsAppImportsService['parseCaptionPricing']>,
    basePrice: number,
  ) {
    const packPrefix = pricing.packText ? `${pricing.packText} ` : '';
    return `${packPrefix}WhatsApp Item R ${this.formatMoney(basePrice)}`.trim();
  }

  private buildStructuredCaptionDescription(
    lines: string[],
    nameSource: string,
    pricing: ReturnType<WhatsAppImportsService['parseCaptionPricing']>,
    basePrice: number,
  ) {
    const details: string[] = [];
    const seen = new Set<string>();

    const pushDetail = (value?: string | null) => {
      const clean = String(value || '').trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      details.push(clean);
    };

    if (pricing.packText) pushDetail(`Pack: ${pricing.packText}.`);
    if (pricing.sizes) pushDetail(`Sizes: ${pricing.sizes}.`);
    if (pricing.colorSizes.length > 0) {
      pushDetail(`Available colours/sizes: ${pricing.colorSizes.join('; ')}.`);
    }
    if (pricing.regularUnitPrice) {
      pushDetail(
        pricing.stockIsBulkPrice
          ? `Each/Retail price: R ${this.formatMoney(
              pricing.regularUnitPrice,
            )}.`
          : `Unit price: R ${this.formatMoney(pricing.regularUnitPrice)}.`,
      );
    }
    if (
      pricing.stockIsBulkPrice &&
      pricing.bulkUnitPrice &&
      !pricing.bulkQuantity
    ) {
      pushDetail(
        `Stock/Bulk price: R ${this.formatMoney(
          pricing.bulkUnitPrice,
        )} per item.`,
      );
      if (pricing.bulkSavingsPerItem > 0) {
        pushDetail(
          `Stock/Bulk saving: R ${this.formatMoney(
            pricing.bulkSavingsPerItem,
          )} per item (${pricing.bulkSavingsPercent}% off the each price).`,
        );
      }
    }
    if (pricing.bulkQuantity && pricing.bulkTotal && pricing.bulkUnitPrice) {
      pushDetail(
        `Bulk price: ${pricing.bulkQuantity} for R ${this.formatMoney(
          pricing.bulkTotal,
        )} (R ${this.formatMoney(pricing.bulkUnitPrice)} each).`,
      );
      if (pricing.bulkSavings > 0) {
        pushDetail(
          `Bulk saving: R ${this.formatMoney(
            pricing.bulkSavings,
          )} total (R ${this.formatMoney(
            pricing.bulkSavingsPerItem,
          )} per item, ${pricing.bulkSavingsPercent}% off).`,
        );
      }
    }
    if (
      pricing.stockPrice !== null &&
      pricing.stockPrice !== undefined &&
      pricing.stockPrice !== pricing.bulkUnitPrice
    ) {
      pushDetail(`Stock price: R ${this.formatMoney(pricing.stockPrice)}.`);
    }
    if (
      pricing.eachPrice !== null &&
      pricing.eachPrice !== undefined &&
      pricing.eachPrice !== pricing.regularUnitPrice
    ) {
      pushDetail(
        `Each/Retail price: R ${this.formatMoney(pricing.eachPrice)}.`,
      );
    }
    if (
      pricing.standardPrice !== null &&
      pricing.standardPrice !== undefined &&
      pricing.standardPrice !== pricing.stockPrice &&
      pricing.standardPrice !== pricing.eachPrice &&
      pricing.standardPrice !== pricing.regularUnitPrice
    ) {
      pushDetail(`Price: R ${this.formatMoney(pricing.standardPrice)}.`);
    }
    if (
      pricing.stockPrice === null &&
      pricing.eachPrice === null &&
      pricing.standardPrice === null &&
      !pricing.bulkTotal
    ) {
      pushDetail(`Price: R ${this.formatMoney(basePrice)}.`);
    }
    if (pricing.priceWarnings.length > 0) {
      pushDetail(
        `Price warning: Captured automatically; please confirm the final price before payment.`,
      );
    }

    for (const line of lines) {
      if (line === nameSource) continue;
      if (
        this.isProductMetadataLine(line) ||
        this.looksLikeSizeOnlyLine(line) ||
        this.isColorSizeLine(line)
      ) {
        continue;
      }
      pushDetail(this.normalizeSpecialLine(line, basePrice));
    }

    return details.join('\n');
  }

  private extractPrice(text: string) {
    return this.extractPriceCandidates(text)[0]?.value ?? null;
  }

  private extractPriceMatch(text: string) {
    return (
      text.match(/(?:\b(?:R|ZAR|E|SZL)|\$)\s*\.?\s*(\d+(?:[.,]\d{1,2})?)/i) ||
      text.match(
        /(\d+(?:[.,]\d{1,2})?)\s*(?:rand|rands|emalangeni|lilangeni|each|only|ea)\b/i,
      ) ||
      text.match(
        /\b(?:price|now|sale|special|was|from)\D{0,16}(\d{2,5})(?:[.,]\d{1,2})?\b/i,
      ) ||
      text.match(/(?:^|\n|\s)(\d{2,5})(?:[.,]\d{1,2})?\s*(?:\/-|\.00)?(?:\s|$)/)
    );
  }

  private extractPriceCandidates(text: string) {
    const normalized = this.normalizeCurrencyText(text);
    const candidates: Array<{
      label: string;
      value: number;
      source: string;
      confidence: number;
      index: number;
    }> = [];
    const pushCandidate = (
      label: string,
      token: string,
      source: string,
      confidence: number,
      index: number,
    ) => {
      const value = this.parseMoneyToken(token);
      if (!Number.isFinite(value) || value <= 0 || value > 100000) return;
      candidates.push({
        label,
        value: roundMoney(value),
        source: source.trim().slice(0, 160),
        confidence,
        index,
      });
    };

    for (const match of normalized.matchAll(
      /\b(\d{1,3})\s*(?:for|x|@)\s*(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      pushCandidate('bulkTotal', match[2], match[0], 95, match.index ?? 0);
    }

    for (const match of normalized.matchAll(
      /\b(stock|cost|each|ea|retail|price|now|sale|special|from)\b\s*[:=. -]?\s*(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      const remainder = normalized.slice((match.index ?? 0) + match[0].length);
      if (/^\s*(?:for|x|@)\b/i.test(remainder)) continue;
      pushCandidate(
        match[1].toLowerCase(),
        match[2],
        match[0],
        90,
        match.index ?? 0,
      );
    }

    for (const match of normalized.matchAll(
      /(?:\b(?:R|ZAR|E|SZL)|\$)\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      pushCandidate('currency', match[1], match[0], 70, match.index ?? 0);
    }

    for (const match of normalized.matchAll(
      /\b(\d+(?:[.,]\d{1,2})?)\s*(?:rand|rands|emalangeni|lilangeni|each|only|ea)\b/gi,
    )) {
      pushCandidate('suffix', match[1], match[0], 60, match.index ?? 0);
    }

    const unique = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const key = `${candidate.label}:${candidate.value}:${candidate.source.toLowerCase()}`;
      const previous = unique.get(key);
      if (!previous || candidate.confidence > previous.confidence) {
        unique.set(key, candidate);
      }
    }

    return [...unique.values()]
      .sort(
        (left, right) =>
          right.confidence - left.confidence || left.index - right.index,
      )
      .map(({ index: _index, ...candidate }) => candidate);
  }

  private priceFromMatch(match: RegExpMatchArray) {
    return this.parseMoneyToken(match[1]);
  }

  private parseMoneyToken(value: string) {
    const clean = String(value || '')
      .replace(/\s+/g, '')
      .replace(',', '.');
    if (!clean) return 0;
    if (clean.includes('.')) return Number(clean);

    const digits = clean.replace(/\D/g, '');
    if (digits.length === 4 && digits.endsWith('00')) return Number(digits);
    if (digits.length >= 4) return Number(digits) / 100;
    return Number(digits);
  }

  private normalizeSpecialLine(line: string, basePrice: number) {
    const match = line.match(
      /\b(\d+)\s*(?:for|x|@)\s*(?:(?:\b(?:R|ZAR|E|SZL)|\$)\s*)?(\d+(?:[.,]\d{1,2})?)\b/i,
    );
    const isSpecial = /\b(?:sale|bulk|special|promo|deal|discount|for)\b/i.test(
      line,
    );

    if (!match || !isSpecial) return line;

    const quantity = Number(match[1]);
    const specialTotalPrice = this.parseMoneyToken(match[2]);

    if (!quantity || !specialTotalPrice) return line;

    const specialUnitPrice = roundMoney(specialTotalPrice / quantity);
    const savedEach = Math.max(0, basePrice - specialUnitPrice);
    const discountPercent =
      basePrice > 0 ? Math.round((savedEach / basePrice) * 100) : 0;
    const savings =
      savedEach > 0
        ? ` (save R ${this.formatMoney(savedEach)} each${
            discountPercent > 0 ? `, ${discountPercent}% off` : ''
          })`
        : '';

    return `Sale/Bulk special: ${quantity} for R ${this.formatMoney(
      specialTotalPrice,
    )} (R ${this.formatMoney(specialUnitPrice)} each)${savings}.`;
  }

  private formatMoney(value: number) {
    return Number(value).toFixed(2);
  }

  private refineParsedDraftName(
    draft: ParsedDraft | null,
    dto: IngestWhatsAppPostDto,
  ) {
    if (!draft) return null;

    const normalizedName = draft.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const genericNames = new Set([
      'new arrive',
      'new arrival',
      'new arrivals',
      'new arrived',
      'new stock',
      'available',
      'restored',
    ]);

    if (!genericNames.has(normalizedName)) return draft;

    const suffix =
      dto.messageId
        ?.replace(/[^a-zA-Z0-9]/g, '')
        .slice(-6)
        .toUpperCase() ||
      String(Date.parse(dto.receivedAt ?? '') || Date.now()).slice(-6);

    return {
      ...draft,
      name: `New Arrival R ${this.formatMoney(draft.basePrice)} ${suffix}`,
    };
  }

  private shouldReviewParsedDraft(
    draft: ParsedDraft,
    dto: IngestWhatsAppPostDto,
  ) {
    const normalizedName = draft.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const sourceName = this.firstReviewableLine(dto.caption);
    const normalizedSourceName = sourceName
      ?.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const weakNames = new Set([
      'new arrive',
      'new arrival',
      'new arrivals',
      'new arrived',
      'new stock',
      'available',
      'restored',
    ]);

    if (weakNames.has(normalizedName)) return true;
    if (normalizedSourceName && weakNames.has(normalizedSourceName))
      return true;
    if (draft.priceConfidence === 'LOW') return true;
    if ((draft.priceWarnings?.length ?? 0) > 0) return true;
    if (this.looksLikeSizeOnlyLine(draft.name)) return true;
    if (sourceName && this.looksLikeSizeOnlyLine(sourceName)) return true;
    if (draft.name.length < 8 && (dto.mediaUrls?.length ?? 0) > 0) return true;

    return false;
  }

  private firstReviewableLine(text: string) {
    return this.normalizePostText(text)
      .split('\n')
      .map((line) =>
        line
          .replace(/^[-•*]\s*/, '')
          .replace(/\*/g, '')
          .trim(),
      )
      .find((line) => line && !this.isProductMetadataLine(line));
  }

  private isProductMetadataLine(line: string) {
    return (
      /^(price|stock|each|ea|qty|quantity|category|cat)\s*[:\-]?/i.test(line) ||
      /^\[WhatsApp media/i.test(line) ||
      /^(?:(?:R|ZAR|E|SZL)|\$)\s*\d+(?:[.,]\d{1,2})?$/i.test(line)
    );
  }

  private looksLikeSizeOnlyLine(line: string) {
    return /^sizes?\b/i.test(line) || /^size\s+[xsml0-9\s.,/-]+$/i.test(line);
  }

  private normalizePostText(text: string) {
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ŘŔŖ]/g, 'R')
      .replace(/[řŕŗ]/g, 'r')
      .replace(/[ĚËÈÉÊ]/g, 'E')
      .replace(/[ěëèéê]/g, 'e')
      .replace(/[ÏÍÌÎ]/g, 'I')
      .replace(/[ïíìî]/g, 'i')
      .replace(/[ÅÄÁÀÂÃ]/g, 'A')
      .replace(/[åäáàâã]/g, 'a')
      .replace(/[ČĆĈĊ]/g, 'C')
      .replace(/[čćĉċ]/g, 'c')
      .replace(/[ŜŠŚ]/g, 'S')
      .replace(/[ŝšś]/g, 's')
      .replace(/[ẄŴ]/g, 'W')
      .replace(/[ẅŵ]/g, 'w')
      .replace(/[Ť]/g, 'T')
      .replace(/[ť]/g, 't')
      .replace(/[ĽŁ]/g, 'L')
      .replace(/[ľł]/g, 'l')
      .replace(/[ẒŽŹ]/g, 'Z')
      .replace(/[ẓžź]/g, 'z');
  }

  private capturedProductMediaUrls(mediaUrls: string[]) {
    return this.dedupeStrings(mediaUrls)
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

  private sanitizeIngestDto(dto: IngestWhatsAppPostDto): IngestWhatsAppPostDto {
    return {
      ...dto,
      caption: this.sanitizeText(dto.caption),
      sourceGroup: dto.sourceGroup
        ? this.sanitizeText(dto.sourceGroup)
        : undefined,
      senderPhone: dto.senderPhone
        ? this.sanitizeText(dto.senderPhone)
        : undefined,
      messageId: dto.messageId ? this.sanitizeText(dto.messageId) : undefined,
      mediaUrls: dto.mediaUrls?.map((url) => this.sanitizeText(url)),
    };
  }

  private sanitizeJsonValue<T>(value: T): T {
    if (typeof value === 'string') return this.sanitizeText(value) as T;
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonValue(item)) as T;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          this.sanitizeJsonValue(entry),
        ]),
      ) as T;
    }
    return value;
  }

  private sanitizeText(value: string) {
    let output = '';

    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
      const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;

      if (isHighSurrogate) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          output += value[index] + value[index + 1];
          index += 1;
        }
        continue;
      }

      if (isLowSurrogate || code === 0) continue;

      output += value[index];
    }

    return output;
  }

  private cleanCheckpointGroupId(value?: string) {
    const clean = this.cleanOptionalText(value, 160);
    return clean || null;
  }

  private maxDate(...dates: Array<Date | null | undefined>) {
    const validDates = dates.filter(
      (date): date is Date =>
        date instanceof Date && Number.isFinite(date.getTime()),
    );
    if (validDates.length === 0) return undefined;
    return validDates.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  private async findLatestStoredCaptureForCheckpoint(
    shopId: string,
    groupId: string,
  ) {
    const mapping = await this.prisma.whatsAppGroupMapping.findFirst({
      where: { shopId, groupId },
      select: { sourceGroup: true },
    });

    return this.prisma.whatsAppImport.findFirst({
      where: {
        shopId,
        OR: [
          { messageId: { contains: groupId } },
          ...(mapping?.sourceGroup
            ? [{ sourceGroup: mapping.sourceGroup }]
            : []),
        ],
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        messageId: true,
        receivedAt: true,
      },
    });
  }

  private cleanOptionalText(value: string | undefined, maxLength: number) {
    const clean = value ? this.sanitizeText(String(value)).trim() : '';
    return clean ? clean.slice(0, maxLength) : undefined;
  }

  private cleanNullable(value: string | undefined, maxLength = 160) {
    return this.cleanOptionalText(value, maxLength) ?? null;
  }

  private cleanBoundedInt(
    value: unknown,
    defaultValue: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? defaultValue);
    if (!Number.isFinite(parsed)) return defaultValue;
    return Math.max(min, Math.min(Math.round(parsed), max));
  }

  private withEffectiveBridgeAvailability<
    T extends {
      isAvailable: boolean;
      bridgeAccount?: {
        status?: string | null;
        lastSeenAt?: Date | string | null;
      } | null;
    },
  >(presence: T, onlineSince: Date): T {
    const bridge = presence.bridgeAccount;
    const lastSeenAt = bridge?.lastSeenAt ? new Date(bridge.lastSeenAt) : null;
    const bridgeIsFresh =
      bridge?.status === 'ONLINE' &&
      lastSeenAt instanceof Date &&
      Number.isFinite(lastSeenAt.getTime()) &&
      lastSeenAt >= onlineSince;

    return {
      ...presence,
      isAvailable: Boolean(presence.isAvailable && bridgeIsFresh),
    };
  }

  private cleanCustomerImageUrls(value?: unknown) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((url) => String(url || '').trim())
              .filter(
                (url) =>
                  url.startsWith('/uploads/') || url.includes('/uploads/'),
              ),
          ),
        ].slice(0, 6)
      : [];
  }

  private mergeCustomerImageUrls(...values: unknown[]) {
    return this.cleanCustomerImageUrls(values.flatMap((value) => value));
  }

  private parseRunnerSkipCommand(value: string) {
    const text = this.sanitizeText(value || '').trim();
    const match = text.match(
      /^\s*skip\s+(?:like|item|product)?\s*[:=-]?\s*(RC-?[A-Z0-9]{6,10})\b(.*)$/i,
    );
    if (!match) return null;

    const rawCode = match[1].toUpperCase();
    const orderCode = rawCode.startsWith('RC-')
      ? rawCode
      : `RC-${rawCode.slice(2)}`;

    return {
      orderCode,
      reason: this.cleanNullable(match[2], 240),
      raw: text,
    };
  }

  private async handleRunnerSkipCommand(
    command: { orderCode: string; reason: string | null; raw: string },
    dto: IngestWhatsAppOrderRequestDto,
  ) {
    const senderPhone =
      this.normalizePhone(dto.customerPhone) ??
      this.normalizeCustomerPhone(dto.customerPhone);
    const recipientPhone =
      this.normalizePhone(dto.recipientPhone) ??
      this.normalizeCustomerPhone(dto.recipientPhone);
    const runner = await this.findRunnerForSkipCommand(
      senderPhone,
      recipientPhone,
    );

    if (!runner) {
      return {
        status: 'SKIP_COMMAND_REJECTED_UNKNOWN_RUNNER',
        orderRequestId: null,
        runnerId: null,
        listingId: null,
        orderCode: command.orderCode,
        customerReply:
          'I received the skip command, but could not match this WhatsApp number to an active runner.',
        runnerNotification: null,
      };
    }

    const listing = await this.prisma.runnerListing.findFirst({
      where: {
        runnerId: runner.id,
        orderCode: command.orderCode,
      },
      include: {
        product: {
          include: {
            shop: { select: { id: true, name: true } },
            imageFingerprints: true,
            whatsappImports: {
              select: { mediaUrls: true, parsedDraft: true, receivedAt: true },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!listing) {
      return {
        status: 'SKIP_COMMAND_REJECTED_UNKNOWN_CODE',
        orderRequestId: null,
        runnerId: runner.id,
        listingId: null,
        orderCode: command.orderCode,
        customerReply: `I could not find active runner code ${command.orderCode}. Check the code and send Skip Like again.`,
        runnerNotification: null,
      };
    }

    const productImageUrls = this.productImageUrlsForSkipLog(listing.product);
    const productImageHashes = this.productImageHashesForSkipLog(
      listing.product.imageFingerprints,
    );
    const matchedSkippedItem = await this.findRunnerSkippedItemMatch({
      runnerId: runner.id,
      productId: listing.productId,
      shopId: listing.product.shopId,
      imageHashes: productImageHashes,
    });
    const now = new Date();

    const skippedItem = await this.prisma.$transaction(async (tx) => {
      await tx.runnerListingSuppression.upsert({
        where: {
          runnerId_productId: {
            runnerId: runner.id,
            productId: listing.productId,
          },
        },
        update: {
          shopId: listing.product.shopId,
          reason: command.reason || 'Runner skip command',
        },
        create: {
          runnerId: runner.id,
          productId: listing.productId,
          shopId: listing.product.shopId,
          reason: command.reason || 'Runner skip command',
        },
      });

      await tx.runnerListing.update({
        where: { id: listing.id },
        data: {
          status: 'STOPPED',
          autoPostApproved: false,
          stoppedAt: now,
        },
      });

      await tx.whatsAppOrderRequest.updateMany({
        where: {
          runnerId: runner.id,
          listingId: listing.id,
          status: { in: ['NEW', 'PENDING', 'NEEDS_REVIEW'] },
        },
        data: {
          status: 'REJECTED',
          auditStatus: 'RUNNER_SKIPPED',
          reviewReason: command.reason || 'Runner marked item as do not buy',
          failedReason: 'Runner does not buy this item',
        },
      });

      return (tx as any).runnerSkippedItem.upsert({
        where: {
          runnerId_productId: {
            runnerId: runner.id,
            productId: listing.productId,
          },
        },
        update: {
          listingId: listing.id,
          shopId: listing.product.shopId,
          orderCode: listing.orderCode,
          sourceMessageId: dto.messageId || null,
          reason: command.reason,
          productName: listing.product.name,
          productImageUrls,
          productImageHashes,
          matchedSkippedItemId: matchedSkippedItem?.id || null,
          matchScore: matchedSkippedItem?.score || null,
          status: 'ACTIVE',
          skippedAt: now,
        },
        create: {
          runnerId: runner.id,
          productId: listing.productId,
          listingId: listing.id,
          shopId: listing.product.shopId,
          orderCode: listing.orderCode,
          sourceMessageId: dto.messageId || null,
          reason: command.reason,
          productName: listing.product.name,
          productImageUrls,
          productImageHashes,
          matchedSkippedItemId: matchedSkippedItem?.id || null,
          matchScore: matchedSkippedItem?.score || null,
          status: 'ACTIVE',
          skippedAt: now,
        },
      });
    });

    return {
      status: 'SKIP_COMMAND_ACCEPTED',
      skippedItemId: skippedItem.id,
      orderRequestId: null,
      runnerId: runner.id,
      listingId: listing.id,
      productId: listing.productId,
      shopId: listing.product.shopId,
      orderCode: listing.orderCode,
      customerReply: `Saved. Runner will skip ${listing.product.name} and block similar reposts going forward.`,
      runnerNotification: null,
    };
  }

  private async findRunnerForSkipCommand(
    senderPhone?: string | null,
    recipientPhone?: string | null,
  ) {
    const phones = [
      ...this.phoneCandidates(senderPhone || ''),
      ...this.phoneCandidates(recipientPhone || ''),
    ];
    if (phones.length === 0) return null;

    return this.prisma.runner.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { phone: { in: phones } },
          { user: { phone: { in: phones } } },
          { bridgeAccount: { phone: { in: phones } } },
          { bridgeAccount: { verifiedPhone: { in: phones } } },
        ],
      },
      select: { id: true },
    });
  }

  private productImageUrlsForSkipLog(product: {
    images?: unknown;
    whatsappImports?: Array<{ mediaUrls?: unknown }> | null;
  }) {
    return this.mergeCustomerImageUrls(
      Array.isArray(product.images) ? product.images : [],
      product.whatsappImports?.flatMap((item) =>
        Array.isArray(item.mediaUrls) ? item.mediaUrls : [],
      ) || [],
    );
  }

  private productImageHashesForSkipLog(
    fingerprints: Array<{
      imageUrl?: string | null;
      sha256?: string | null;
      perceptualHash?: string | null;
      mimetype?: string | null;
    }>,
  ) {
    return fingerprints
      .map((fingerprint) => {
        const item: {
          url?: string;
          sha256?: string;
          perceptualHash?: string;
          mimetype?: string;
        } = {};
        if (fingerprint.imageUrl) item.url = fingerprint.imageUrl;
        if (fingerprint.sha256) item.sha256 = fingerprint.sha256;
        if (fingerprint.perceptualHash) {
          item.perceptualHash = fingerprint.perceptualHash;
        }
        if (fingerprint.mimetype) item.mimetype = fingerprint.mimetype;
        return item;
      })
      .filter((item) => item.sha256 || item.perceptualHash)
      .slice(0, 12);
  }

  private async suppressRunnerProductFromSkipMatch(data: {
    runnerId: string;
    productId: string;
    shopId?: string | null;
    reason: string;
    productName?: string | null;
    productImageUrls: string[];
    productImageHashes: Array<{
      url?: string | null;
      sha256?: string | null;
      perceptualHash?: string | null;
      mimetype?: string | null;
    }>;
    matchedSkippedItemId: string;
    matchScore: number;
  }) {
    const now = new Date();
    await this.prisma.runnerListingSuppression.upsert({
      where: {
        runnerId_productId: {
          runnerId: data.runnerId,
          productId: data.productId,
        },
      },
      update: {
        shopId: data.shopId || null,
        reason: data.reason,
      },
      create: {
        runnerId: data.runnerId,
        productId: data.productId,
        shopId: data.shopId || null,
        reason: data.reason,
      },
    });

    await (this.prisma as any).runnerSkippedItem.upsert({
      where: {
        runnerId_productId: {
          runnerId: data.runnerId,
          productId: data.productId,
        },
      },
      update: {
        shopId: data.shopId || null,
        source: 'AUTO_IMAGE_MATCH',
        reason: data.reason,
        productName: data.productName || null,
        productImageUrls: data.productImageUrls,
        productImageHashes: data.productImageHashes,
        matchedSkippedItemId: data.matchedSkippedItemId,
        matchScore: data.matchScore,
        status: 'ACTIVE',
        skippedAt: now,
      },
      create: {
        runnerId: data.runnerId,
        productId: data.productId,
        shopId: data.shopId || null,
        source: 'AUTO_IMAGE_MATCH',
        reason: data.reason,
        productName: data.productName || null,
        productImageUrls: data.productImageUrls,
        productImageHashes: data.productImageHashes,
        matchedSkippedItemId: data.matchedSkippedItemId,
        matchScore: data.matchScore,
        status: 'ACTIVE',
        skippedAt: now,
      },
    });
  }
  private async findRunnerSkippedItemMatch(data: {
    runnerId: string;
    productId: string;
    shopId?: string | null;
    imageHashes: Array<{
      sha256?: string | null;
      perceptualHash?: string | null;
    }>;
  }) {
    if (data.imageHashes.length === 0) return null;

    const skippedItems = await (this.prisma as any).runnerSkippedItem.findMany({
      where: {
        runnerId: data.runnerId,
        productId: { not: data.productId },
        status: 'ACTIVE',
        ...(data.shopId ? { shopId: data.shopId } : {}),
      },
      orderBy: { skippedAt: 'desc' },
      take: 200,
    });
    const incomingSha = new Set(
      data.imageHashes.map((item) => item.sha256).filter(Boolean),
    );
    const incomingPerceptual = data.imageHashes
      .map((item) => item.perceptualHash)
      .filter((hash): hash is string => Boolean(hash));

    let best: { id: string; score: number } | null = null;
    for (const skippedItem of skippedItems) {
      const hashes = Array.isArray(skippedItem.productImageHashes)
        ? skippedItem.productImageHashes
        : [];
      for (const hash of hashes) {
        if (hash?.sha256 && incomingSha.has(hash.sha256)) {
          return { id: skippedItem.id, score: 1 };
        }
        if (!hash?.perceptualHash) continue;
        for (const incomingHash of incomingPerceptual) {
          const distance = this.hammingHexDistance(
            incomingHash,
            hash.perceptualHash,
          );
          if (distance === null || distance > 8) continue;
          const score = Math.max(0.75, roundMoney(1 - distance / 32));
          if (!best || score > best.score) {
            best = { id: skippedItem.id, score };
          }
        }
      }
    }

    return best;
  }
  private cleanCustomerImageHashes(value?: unknown) {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const sha256 = String(record.sha256 || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-f0-9]/g, '');
        const perceptualHash = String(record.perceptualHash || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-f0-9]/g, '');
        const url = String(record.url || '').trim();
        const mimetype = String(record.mimetype || '')
          .trim()
          .slice(0, 80);

        if (!sha256 && !perceptualHash) return null;

        return {
          ...(url ? { url } : {}),
          ...(sha256.length === 64 ? { sha256 } : {}),
          ...(perceptualHash.length > 0
            ? { perceptualHash: perceptualHash.slice(0, 32) }
            : {}),
          ...(mimetype ? { mimetype } : {}),
        };
      })
      .filter(
        (
          item,
        ): item is {
          url?: string;
          sha256?: string;
          perceptualHash?: string;
          mimetype?: string;
        } => Boolean(item),
      )
      .slice(0, 6);
  }

  private mergeCustomerImageHashes(...values: unknown[]) {
    const clean = this.cleanCustomerImageHashes(
      values.flatMap((value) => value),
    );
    const seen = new Set<string>();

    return clean.filter((item) => {
      const key = `${item.sha256 || ''}:${item.perceptualHash || ''}:${item.url || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async findStampedMediaMatch(data: {
    orderCode: string | null;
    imageHashes: Array<{
      url?: string;
      sha256?: string;
      perceptualHash?: string;
      mimetype?: string;
    }>;
  }) {
    if (!data.orderCode && data.imageHashes.length === 0) return null;

    const exactHashes = [
      ...new Set(
        data.imageHashes
          .map((item) => item.sha256)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const perceptualHashes = [
      ...new Set(
        data.imageHashes
          .map((item) => item.perceptualHash)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const recentSince = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    if (exactHashes.length > 0) {
      const exact = await this.prisma.whatsAppStampedMediaLog.findFirst({
        where: {
          ...(data.orderCode ? { orderCode: data.orderCode } : {}),
          sentAt: { gte: recentSince },
          OR: [
            { stampedImageHash: { in: exactHashes } },
            { sourceImageHash: { in: exactHashes } },
          ],
        },
        orderBy: { sentAt: 'desc' },
        select: {
          id: true,
          orderCode: true,
          listingId: true,
          runnerId: true,
          stampedImageHash: true,
          sourceImageHash: true,
        },
      });

      if (exact) {
        return {
          id: exact.id,
          orderCode: exact.orderCode,
          listingId: exact.listingId,
          runnerId: exact.runnerId,
          confidence: 1,
          reason: exactHashes.includes(exact.stampedImageHash || '')
            ? 'EXACT_STAMPED_IMAGE_HASH'
            : 'EXACT_SOURCE_IMAGE_HASH',
        };
      }
    }

    if (perceptualHashes.length === 0) return null;

    const candidates = await this.prisma.whatsAppStampedMediaLog.findMany({
      where: {
        ...(data.orderCode ? { orderCode: data.orderCode } : {}),
        sentAt: { gte: recentSince },
        OR: [
          { stampedImagePerceptualHash: { not: null } },
          { sourceImagePerceptualHash: { not: null } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: data.orderCode ? 100 : 500,
      select: {
        id: true,
        orderCode: true,
        listingId: true,
        runnerId: true,
        stampedImagePerceptualHash: true,
        sourceImagePerceptualHash: true,
      },
    });

    let best: {
      id: string;
      orderCode: string | null;
      listingId: string;
      runnerId: string;
      distance: number;
      reason: string;
    } | null = null;

    for (const candidate of candidates) {
      for (const incomingHash of perceptualHashes) {
        for (const target of [
          {
            value: candidate.stampedImagePerceptualHash,
            reason: 'PERCEPTUAL_STAMPED_IMAGE_HASH',
          },
          {
            value: candidate.sourceImagePerceptualHash,
            reason: 'PERCEPTUAL_SOURCE_IMAGE_HASH',
          },
        ]) {
          const distance = this.hammingHexDistance(incomingHash, target.value);
          if (distance === null) continue;
          if (!best || distance < best.distance) {
            best = {
              id: candidate.id,
              orderCode: candidate.orderCode,
              listingId: candidate.listingId,
              runnerId: candidate.runnerId,
              distance,
              reason: target.reason,
            };
          }
        }
      }
    }

    if (!best) return null;

    const maxDistance = data.orderCode ? 14 : 8;
    if (best.distance > maxDistance) return null;

    return {
      id: best.id,
      orderCode: best.orderCode,
      listingId: best.listingId,
      runnerId: best.runnerId,
      confidence: Math.max(0.55, roundMoney(1 - best.distance / 32)),
      reason: `${best.reason}_DISTANCE_${best.distance}`,
    };
  }

  private async markStampedMediaReturned(stampedMediaLogId: string) {
    await this.prisma.whatsAppStampedMediaLog.update({
      where: { id: stampedMediaLogId },
      data: {
        returnedCount: { increment: 1 },
        lastReturnedAt: new Date(),
      },
    });
  }

  private hammingHexDistance(left?: string | null, right?: string | null) {
    if (!left || !right) return null;

    try {
      const a = BigInt(`0x${left}`);
      const b = BigInt(`0x${right}`);
      let xor = a ^ b;
      let distance = 0;
      while (xor > 0n) {
        distance += Number(xor & 1n);
        xor >>= 1n;
      }
      return distance;
    } catch {
      return null;
    }
  }

  private normalizeCustomerPhone(value?: string | null) {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw || /@(?:lid|g\.us)\b/i.test(raw)) return null;

    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 12) return null;
    if (digits.startsWith('120363')) return null;

    if (digits.length === 8) return `+268${digits}`;
    if (digits.startsWith('268') && digits.length === 11) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 10) {
      return `+27${digits.slice(1)}`;
    }
    if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;

    return null;
  }

  private extractCustomerPhoneFromOrderText(messageText: string) {
    const text = this.sanitizeText(messageText);
    const patterns = [
      /\b(?:customer|client|buyer|from|whatsapp|wa|phone|number|cell)\s*(?:whatsapp|wa|phone|number|cell)?\s*[:=-]\s*(\+?\d[\d\s().-]{6,20}\d)/i,
      /\b(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{8,15})\b/i,
      /\b(\+?268[\s.-]?\d{8})\b/i,
      /\b(\+?27[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const phone = this.normalizeCustomerPhone(match?.[1]);
      if (phone) return phone;
    }

    return null;
  }

  private isSystemGeneratedOrderMessage(value: string) {
    const text = this.sanitizeText(value).toLowerCase();

    return [
      'thanks, your order request has been received',
      'the runner has been notified',
      'new runner commerce order request',
      'captured order request',
      'runner notification queued',
      'request id:',
      'customer message:',
      'before i notify the runner',
      'please reply with the size',
      'please reply with the color',
      'please reply with the quantity',
      'your new runner commerce customer account has been initiated',
    ].some((marker) => text.includes(marker));
  }

  private async findRecentDuplicateOrderRequest(data: {
    listingId: string | null;
    orderCode: string | null;
    customerPhone: string | null;
    runnerId: string | null;
    receivedAt: Date;
  }) {
    if (!data.orderCode) return null;

    const duplicateWindowHours = Number(
      this.configService.get('WHATSAPP_ORDER_DUPLICATE_WINDOW_HOURS') || 12,
    );
    const since = new Date(
      data.receivedAt.getTime() -
        Math.max(1, duplicateWindowHours) * 60 * 60 * 1000,
    );

    return this.prisma.whatsAppOrderRequest.findFirst({
      where: {
        orderCode: data.orderCode,
        status: { not: 'AWAITING_CUSTOMER_DETAILS' },
        ...(data.listingId ? { listingId: data.listingId } : {}),
        ...(data.customerPhone
          ? { customerPhone: data.customerPhone }
          : data.runnerId
            ? { runnerId: data.runnerId }
            : {}),
        receivedAt: { gte: since },
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        runnerId: true,
        listingId: true,
        orderCode: true,
        status: true,
      },
    });
  }

  private async findPendingCustomerOrderConversation(data: {
    customerPhone: string | null;
    recipientPhone: string | null;
    orderCode?: string | null;
  }) {
    if (!data.customerPhone && !data.orderCode) return null;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.whatsAppOrderRequest.findFirst({
      where: {
        status: { in: ['AWAITING_CUSTOMER_DETAILS', 'AWAITING_CONFIRMATION'] },
        OR: [
          { conversationExpiresAt: { gte: new Date() } },
          { conversationExpiresAt: null, receivedAt: { gte: since } },
        ],
        ...(data.orderCode ? { orderCode: data.orderCode } : {}),
        ...(data.customerPhone ? { customerPhone: data.customerPhone } : {}),
        ...(data.recipientPhone ? { recipientPhone: data.recipientPhone } : {}),
      },
      include: {
        listing: {
          select: {
            id: true,
            runnerId: true,
            runnerPrice: true,
            runner: {
              select: {
                phone: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
            product: {
              select: {
                id: true,
                shopId: true,
                name: true,
                basePrice: true,
                shop: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async continueCustomerOrderConversation(
    pending: NonNullable<
      Awaited<
        ReturnType<
          WhatsAppImportsService['findPendingCustomerOrderConversation']
        >
      >
    >,
    incoming: {
      messageText: string;
      messageId?: string;
      customerPhone: string | null;
      customerName: string | null;
      recipientPhone: string | null;
      customerImageUrls: string[];
      customerImageHashes: Array<{
        url?: string;
        sha256?: string;
        perceptualHash?: string;
        mimetype?: string;
      }>;
      receivedAt: Date;
    },
  ) {
    if (
      incoming.messageId &&
      (pending.lastInboundMessageId === incoming.messageId ||
        pending.messageText.includes(`Message id: ${incoming.messageId}`))
    ) {
      const selection = this.getStoredCustomerOrderSelection(pending);
      const awaitingConfirmation = pending.status === 'AWAITING_CONFIRMATION';
      return {
        status: 'DUPLICATE_MESSAGE',
        orderRequestId: pending.id,
        runnerId: pending.runnerId,
        listingId: pending.listingId,
        orderCode: pending.orderCode,
        customerReply: awaitingConfirmation
          ? this.buildCustomerConfirmationPrompt({
              orderCode: pending.orderCode,
              productName:
                pending.listing?.product?.name || 'the selected item',
              selection,
            })
          : this.buildCustomerDetailsPrompt({
              orderCode: pending.orderCode,
              productName:
                pending.listing?.product?.name || 'the selected item',
              selection,
              customerImageUrls: this.cleanCustomerImageUrls(
                pending.customerImageUrls,
              ),
              intro:
                'I already received that reply. Please send the next missing detail.',
            }),
        customerInteraction: awaitingConfirmation
          ? this.confirmationInteraction()
          : this.interactionForCustomerField(
              this.getNextMissingCustomerOrderField(
                selection,
                this.cleanCustomerImageUrls(pending.customerImageUrls),
              ),
            ),
        runnerNotification: null,
      };
    }

    const normalizedReply = this.normalizeCustomerInteractionReply(
      incoming.messageText,
    );
    const command = this.customerConversationCommand(normalizedReply);
    let existingSelection = this.getStoredCustomerOrderSelection(pending);

    if (pending.status === 'AWAITING_CONFIRMATION') {
      if (command === 'cancel') {
        await this.prisma.whatsAppOrderRequest.update({
          where: { id: pending.id },
          data: {
            status: 'CANCELLED',
            expectedField: 'CANCELLED',
            lastInboundMessageId: incoming.messageId || null,
          },
        });
        return {
          status: 'CANCELLED',
          orderRequestId: pending.id,
          runnerId: pending.runnerId,
          listingId: pending.listingId,
          orderCode: pending.orderCode,
          customerReply:
            `Order ${pending.orderCode || ''} was cancelled. The runner was not notified.`.trim(),
          customerInteraction: null,
          runnerNotification: null,
        };
      }

      const editField = this.customerEditField(normalizedReply);
      if (pending.expectedField === 'EDIT_FIELD' && editField) {
        existingSelection = {
          ...existingSelection,
          ...(editField === 'size' ? { size: null } : {}),
          ...(editField === 'color' ? { color: null } : {}),
          ...(editField === 'quantity'
            ? { quantity: 1, quantityProvided: false }
            : {}),
        };
        await this.prisma.whatsAppOrderRequest.update({
          where: { id: pending.id },
          data: {
            status: 'AWAITING_CUSTOMER_DETAILS',
            expectedField: editField.toUpperCase(),
            conversationState: existingSelection,
            lastInboundMessageId: incoming.messageId || null,
          },
        });
        return {
          status: 'AWAITING_CUSTOMER_DETAILS',
          orderRequestId: pending.id,
          runnerId: pending.runnerId,
          listingId: pending.listingId,
          orderCode: pending.orderCode,
          customerReply: this.buildCustomerDetailsPrompt({
            orderCode: pending.orderCode,
            productName: pending.listing?.product?.name || 'the selected item',
            selection: existingSelection,
            customerImageUrls: this.cleanCustomerImageUrls(
              pending.customerImageUrls,
            ),
            intro: `Okay, let us change the ${editField}.`,
          }),
          customerInteraction: this.interactionForCustomerField(editField),
          runnerNotification: null,
        };
      }

      if (command === 'edit') {
        await this.prisma.whatsAppOrderRequest.update({
          where: { id: pending.id },
          data: {
            expectedField: 'EDIT_FIELD',
            lastInboundMessageId: incoming.messageId || null,
          },
        });
        return {
          status: 'AWAITING_CONFIRMATION',
          orderRequestId: pending.id,
          runnerId: pending.runnerId,
          listingId: pending.listingId,
          orderCode: pending.orderCode,
          customerReply:
            'What would you like to change? Reply SIZE, COLOR, or QUANTITY.',
          customerInteraction: this.editInteraction(),
          runnerNotification: null,
        };
      }

      if (command !== 'confirm') {
        return {
          status: 'AWAITING_CONFIRMATION',
          orderRequestId: pending.id,
          runnerId: pending.runnerId,
          listingId: pending.listingId,
          orderCode: pending.orderCode,
          customerReply: this.buildCustomerConfirmationPrompt({
            orderCode: pending.orderCode,
            productName: pending.listing?.product?.name || 'the selected item',
            selection: existingSelection,
          }),
          customerInteraction: this.confirmationInteraction(),
          runnerNotification: null,
        };
      }
    }

    const confirmed =
      pending.status === 'AWAITING_CONFIRMATION' && command === 'confirm';
    const pendingCustomerImageUrls = this.cleanCustomerImageUrls(
      pending.customerImageUrls,
    );
    const missingField = this.getNextMissingCustomerOrderField(
      existingSelection,
      pendingCustomerImageUrls,
    );
    if (
      missingField === 'quantity' &&
      !this.hasExplicitCustomerQuantity(normalizedReply)
    ) {
      await this.prisma.whatsAppOrderRequest.update({
        where: { id: pending.id },
        data: {
          lastInboundMessageId: incoming.messageId || null,
          updatedAt: new Date(),
        },
      });
      return {
        status: 'AWAITING_CUSTOMER_DETAILS',
        orderRequestId: pending.id,
        runnerId: pending.runnerId,
        listingId: pending.listingId,
        orderCode: pending.orderCode,
        customerReply:
          `I have saved the color as ${existingSelection.color || 'not set'}. ` +
          `"${normalizedReply}" is not a valid quantity. Reply with a number, for example: 1, 2, or 3.`,
        customerInteraction: this.interactionForCustomerField('quantity'),
        runnerNotification: null,
      };
    }
    const conversationText = this.appendConversationReply(
      pending.messageText,
      normalizedReply,
      missingField,
      {
        messageId: incoming.messageId,
        receivedAt: incoming.receivedAt,
      },
    ).slice(0, 4000);
    const selection = this.applyCustomerReplyToSelection(
      existingSelection,
      normalizedReply,
      missingField,
    );
    const customerImageUrls = this.mergeCustomerImageUrls(
      pending.customerImageUrls,
      incoming.customerImageUrls,
    );
    const customerImageHashes = this.mergeCustomerImageHashes(
      pending.customerImageHashes,
      incoming.customerImageHashes,
    );
    const stampedMediaMatch = await this.findStampedMediaMatch({
      orderCode: pending.orderCode,
      imageHashes: customerImageHashes,
    });
    const nextMissingField = this.getNextMissingCustomerOrderField(
      selection,
      customerImageUrls,
    );

    await this.prisma.whatsAppOrderRequest.update({
      where: { id: pending.id },
      data: {
        messageText: conversationText,
        customerName: incoming.customerName || pending.customerName,
        customerPhone: incoming.customerPhone || pending.customerPhone,
        recipientPhone: incoming.recipientPhone || pending.recipientPhone,
        customerImageUrls,
        customerImageHashes,
        matchedStampedMediaLogId:
          stampedMediaMatch?.id || pending.matchedStampedMediaLogId,
        imageMatchConfidence:
          stampedMediaMatch?.confidence || pending.imageMatchConfidence,
        imageMatchReason: stampedMediaMatch?.reason || pending.imageMatchReason,
        status: nextMissingField
          ? 'AWAITING_CUSTOMER_DETAILS'
          : 'AWAITING_CONFIRMATION',
        expectedField: nextMissingField
          ? nextMissingField.toUpperCase()
          : 'CONFIRM',
        conversationState: selection,
        conversationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastInboundMessageId: incoming.messageId || null,
        updatedAt: new Date(),
      },
    });

    if (stampedMediaMatch) {
      await this.markStampedMediaReturned(stampedMediaMatch.id);
    }

    if (nextMissingField || !pending.listing) {
      return {
        status: 'AWAITING_CUSTOMER_DETAILS',
        orderRequestId: pending.id,
        runnerId: pending.runnerId,
        listingId: pending.listingId,
        orderCode: pending.orderCode,
        customerReply: this.buildCustomerDetailsPrompt({
          orderCode: pending.orderCode,
          productName: pending.listing?.product?.name || 'the selected item',
          selection,
          customerImageUrls,
          intro:
            'Got it. One more detail is needed before I notify the runner.',
        }),
        customerInteraction: this.interactionForCustomerField(nextMissingField),
        runnerNotification: null,
      };
    }

    if (!confirmed) {
      return {
        status: 'AWAITING_CONFIRMATION',
        orderRequestId: pending.id,
        runnerId: pending.runnerId,
        listingId: pending.listingId,
        orderCode: pending.orderCode,
        customerReply: this.buildCustomerConfirmationPrompt({
          orderCode: pending.orderCode,
          productName: pending.listing.product.name,
          selection,
        }),
        customerInteraction: this.confirmationInteraction(),
        runnerNotification: null,
      };
    }

    const basket = await this.attachOrderRequestToCustomerBasket({
      orderRequestId: pending.id,
      runnerId: pending.listing.runnerId,
      listingId: pending.listing.id,
      productId: pending.listing.product.id,
      customerPhone: incoming.customerPhone || pending.customerPhone,
      customerUserId: pending.userId,
      customerName: incoming.customerName || pending.customerName,
      messageText: conversationText,
      orderCode: pending.orderCode,
      runnerPrice: pending.listing.runnerPrice,
      shopPrice: pending.listing.product.basePrice,
      shopId: pending.listing.product.shopId,
      selectedSize: selection.size,
      selectedColor: selection.color,
      quantity: selection.quantity,
      customerNote: selection.note,
      customerImageUrls,
    });

    if (pending.listing.runner.user.id) {
      await this.createRunnerOrderNotification({
        userId: pending.listing.runner.user.id,
        orderRequestId: pending.id,
        basketOrderId: basket?.orderId || null,
        orderCode: pending.orderCode,
        customerPhone: incoming.customerPhone || pending.customerPhone,
        customerName: incoming.customerName || pending.customerName,
        customerAccountCreated: false,
        productName: pending.listing.product.name,
        shopName: pending.listing.product.shop.name,
      });
    }

    const runnerPhone = this.cleanNullable(
      pending.listing.runner.phone || pending.listing.runner.user.phone,
    );

    return {
      status: 'MATCHED',
      orderRequestId: pending.id,
      basketOrderId: basket?.orderId || null,
      runnerId: pending.runnerId,
      listingId: pending.listingId,
      orderCode: pending.orderCode,
      customerReply: this.buildCustomerOrderReply({
        orderCode: pending.orderCode,
        productName: pending.listing.product.name,
        runnerName: pending.listing.runner.user.name,
        runnerPhone,
        selectedSize: selection.size,
        selectedColor: selection.color,
        quantity: selection.quantity,
        customerPhone: incoming.customerPhone || pending.customerPhone,
        customerAccountCreated: false,
        temporaryPassword: null,
      }),
      runnerNotification:
        runnerPhone && basket
          ? {
              phone: runnerPhone,
              message: this.buildRunnerOrderNotificationMessage({
                orderRequestId: pending.id,
                orderCode: pending.orderCode,
                customerPhone: incoming.customerPhone || pending.customerPhone,
                customerName: incoming.customerName || pending.customerName,
                basketOrderId: basket.orderId,
                selectedSize: selection.size,
                selectedColor: selection.color,
                quantity: selection.quantity,
                productName: pending.listing.product.name,
                customerImageUrls,
              }),
              imageUrl: this.primaryCustomerImageLink(customerImageUrls),
            }
          : null,
    };
  }

  private appendConversationReply(
    existingText: string,
    replyText: string,
    missingField: string | null,
    meta: {
      messageId?: string;
      receivedAt: Date;
    },
  ) {
    const cleanReply = this.sanitizeText(replyText).trim();
    const hasFieldLabel =
      /\b(?:size|colou?r|quantity|qty|qnty)\s*[:=-]?\s*/i.test(cleanReply);
    const labelledReply =
      hasFieldLabel || !missingField
        ? cleanReply
        : missingField === 'size'
          ? `Size: ${cleanReply}`
          : missingField === 'color'
            ? `Color: ${cleanReply}`
            : missingField === 'quantity'
              ? `Quantity: ${cleanReply}`
              : cleanReply;
    const header = [
      `Customer reply at ${meta.receivedAt.toISOString()}`,
      meta.messageId ? `Message id: ${meta.messageId}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    return [existingText, header, labelledReply].filter(Boolean).join('\n\n');
  }

  private getStoredCustomerOrderSelection(orderRequest: {
    conversationState?: unknown;
    messageText: string;
  }) {
    const state = orderRequest.conversationState;
    if (state && typeof state === 'object' && !Array.isArray(state)) {
      const value = state as Record<string, unknown>;
      const quantity = Number(value.quantity || 1);
      return {
        size: this.cleanNullable(String(value.size || ''), 40),
        color: this.cleanNullable(String(value.color || ''), 80),
        quantity:
          Number.isFinite(quantity) && quantity > 0
            ? Math.min(Math.floor(quantity), 999)
            : 1,
        quantityProvided: value.quantityProvided === true,
        note: this.cleanNullable(String(value.note || ''), 500),
      };
    }
    return this.parseCustomerOrderSelection(orderRequest.messageText);
  }

  private normalizeCustomerInteractionReply(messageText: string) {
    const clean = this.sanitizeText(messageText).trim();
    const quantity = clean.match(/^order:qty:(\d{1,3})$/i)?.[1];
    if (quantity) return `Quantity: ${quantity}`;
    return clean;
  }

  private isOrderCodeOnlyMessage(messageText: string) {
    return /^(?:order\s*code\s*:?\s*)?RC-[A-Z0-9]{6,10}[.!]?$/i.test(
      this.sanitizeText(messageText).trim(),
    );
  }

  private productLookupInteraction(orderCode: string | null) {
    if (!orderCode) return null;
    return {
      type: 'buttons',
      title: 'Product found',
      footer: 'Viewing a product does not place an order.',
      alwaysSendText: true,
      buttons: [{ id: `order:start:${orderCode}`, title: 'Start order' }],
    };
  }

  private buildWhatsAppStartOrderUrl(
    recipientPhone: string | null,
    orderCode: string | null,
  ) {
    const digits = String(recipientPhone || '').replace(/\D/g, '');
    if (!digits || !orderCode) return `ORDER ${orderCode || ''}`.trim();
    return `https://wa.me/${digits}?text=${encodeURIComponent(`ORDER ${orderCode}`)}`;
  }

  private applyCustomerReplyToSelection(
    existing: {
      size: string | null;
      color: string | null;
      quantity: number;
      quantityProvided: boolean;
      note: string | null;
    },
    reply: string,
    expectedField: string | null,
  ) {
    if (!expectedField) return existing;
    const parsed = this.parseCustomerOrderSelection(reply);
    const rawValue = reply
      .replace(/^\s*(?:size|colou?r|quantity|qty|qnty)\s*[:=-]?\s*/i, '')
      .trim();

    if (expectedField === 'size') {
      return {
        ...existing,
        size: parsed.size || this.cleanNullable(rawValue, 40),
      };
    }
    if (expectedField === 'color') {
      return {
        ...existing,
        color: parsed.color || this.cleanNullable(rawValue, 80),
      };
    }
    if (expectedField === 'quantity') {
      return {
        ...existing,
        quantity: this.parseCustomerQuantity(reply),
        quantityProvided: this.hasExplicitCustomerQuantity(reply),
      };
    }
    return existing;
  }

  private customerConversationCommand(messageText: string) {
    const value = messageText.trim().toLowerCase();
    if (['order:confirm', 'confirm', 'yes', 'correct'].includes(value)) {
      return 'confirm';
    }
    if (['order:edit', 'edit', 'change'].includes(value)) return 'edit';
    if (['order:cancel', 'cancel', 'stop'].includes(value)) return 'cancel';
    return null;
  }

  private customerEditField(messageText: string) {
    const value = messageText.trim().toLowerCase();
    if (['order:edit:size', 'size'].includes(value)) return 'size';
    if (['order:edit:color', 'color', 'colour'].includes(value)) return 'color';
    if (['order:edit:quantity', 'quantity', 'qty'].includes(value)) {
      return 'quantity';
    }
    return null;
  }

  private interactionForCustomerField(field: string | null) {
    if (field !== 'quantity') return null;
    return {
      type: 'buttons',
      title: 'Choose quantity',
      footer: 'You can also type another quantity.',
      buttons: [
        { id: 'order:qty:1', title: '1' },
        { id: 'order:qty:2', title: '2' },
        { id: 'order:qty:3', title: '3' },
      ],
    };
  }

  private confirmationInteraction() {
    return {
      type: 'buttons',
      title: 'Confirm order',
      footer: 'The runner is notified only after confirmation.',
      buttons: [
        { id: 'order:confirm', title: 'Confirm' },
        { id: 'order:edit', title: 'Edit' },
        { id: 'order:cancel', title: 'Cancel' },
      ],
    };
  }

  private editInteraction() {
    return {
      type: 'buttons',
      title: 'Edit order',
      buttons: [
        { id: 'order:edit:size', title: 'Size' },
        { id: 'order:edit:color', title: 'Color' },
        { id: 'order:edit:quantity', title: 'Quantity' },
      ],
    };
  }

  private buildCustomerConfirmationPrompt(data: {
    orderCode: string | null;
    productName: string;
    selection: {
      size: string | null;
      color: string | null;
      quantity: number;
    };
  }) {
    return [
      'Please confirm your order details:',
      data.orderCode ? `Order code: ${data.orderCode}` : '',
      `Item: ${data.productName}`,
      `Size: ${data.selection.size || 'Not set'}`,
      `Color: ${data.selection.color || 'Not set'}`,
      `Quantity: ${data.selection.quantity}`,
      'Reply CONFIRM to send it to the runner, EDIT to change it, or CANCEL.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseCustomerOrderSelection(messageText: string) {
    const text = this.sanitizeText(messageText);
    const size = this.cleanNullable(
      this.matchCustomerField(text, [
        /\bsize\s*[:=-]\s*([^\n,;]+)/i,
        /\bsize\s+([a-z0-9+/-]{1,12})\b/i,
      ]) ?? undefined,
      40,
    );
    const color = this.cleanNullable(
      this.matchCustomerField(text, [
        /\bcolou?r\s*[:=-]\s*([^\n,;]+)/i,
        /\bcolou?r\s+([a-z][a-z\s/-]{1,30})\b/i,
      ]) ?? undefined,
      80,
    );
    const quantity = this.parseCustomerQuantity(text);

    return {
      size,
      color,
      quantity,
      quantityProvided: this.hasExplicitCustomerQuantity(text),
      note: this.cleanNullable(text, 500),
    };
  }

  private matchCustomerField(text: string, patterns: RegExp[]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1]
          .replace(/\b(?:quantity|qty|color|colour|size|order code)\b.*$/i, '')
          .trim();
      }
    }

    return null;
  }

  private parseCustomerQuantity(text: string) {
    const match =
      text.match(/\b(?:quantity|qty|qnty)\s*[:=-]?\s*(\d{1,3})\b/i) ||
      text.match(/\bx\s*(\d{1,3})\b/i) ||
      text.trim().match(/^(\d{1,3})$/);
    const quantity = match?.[1] ? Number(match[1]) : 1;

    return Number.isFinite(quantity) && quantity > 0
      ? Math.min(Math.floor(quantity), 999)
      : 1;
  }

  private hasExplicitCustomerQuantity(text: string) {
    return (
      /\b(?:quantity|qty|qnty)\s*[:=-]?\s*\d{1,3}\b/i.test(text) ||
      /\bx\s*\d{1,3}\b/i.test(text) ||
      /^\d{1,3}$/.test(text.trim())
    );
  }

  private getNextMissingCustomerOrderField(
    selection: {
      size: string | null;
      color: string | null;
      quantity: number;
      quantityProvided: boolean;
    },
    customerImageUrls: string[] = [],
  ) {
    if (!selection.size) return 'size';
    if (!selection.color) return 'color';
    if (!selection.quantityProvided) return 'quantity';
    if (this.cleanCustomerImageUrls(customerImageUrls).length === 0) {
      return 'image';
    }
    return null;
  }

  private buildCustomerDetailsPrompt(data: {
    orderCode: string | null;
    productName: string;
    selection: {
      size: string | null;
      color: string | null;
      quantity: number;
      quantityProvided: boolean;
    };
    customerImageUrls: string[];
    intro: string;
    account?: {
      customerPhone: string;
      temporaryPassword: string | null;
    } | null;
  }) {
    const cleanCustomerImageUrls = this.cleanCustomerImageUrls(
      data.customerImageUrls,
    );
    const nextField = this.getNextMissingCustomerOrderField(
      data.selection,
      cleanCustomerImageUrls,
    );
    const captured = [
      data.selection.size ? `Size: ${data.selection.size}` : '',
      data.selection.color ? `Color: ${data.selection.color}` : '',
      data.selection.quantityProvided
        ? `Quantity: ${data.selection.quantity}`
        : '',
      cleanCustomerImageUrls.length > 0
        ? `Image: received (${cleanCustomerImageUrls.length})`
        : '',
    ].filter(Boolean);
    const nextPrompt =
      nextField === 'size'
        ? `Please reply with the size, for example: Size M or Size 38.`
        : nextField === 'color'
          ? `Please reply with the color, for example: Color black.`
          : nextField === 'quantity'
            ? `Please reply with the quantity, for example: Quantity 2.`
            : nextField === 'image'
              ? `Please send the item picture/screenshot you want the runner to buy. You can send the image alone.`
              : '';

    return [
      data.intro,
      data.orderCode ? `Order code: ${data.orderCode}` : '',
      `Item: ${data.productName}`,
      captured.length ? `Captured so far: ${captured.join(', ')}` : '',
      nextPrompt,
      data.account
        ? this.buildCustomerAccountInitiatedMessage({
            customerPhone: data.account.customerPhone,
            temporaryPassword: data.account.temporaryPassword,
          })
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildCustomerAccountInitiatedMessage(data: {
    customerPhone: string;
    temporaryPassword: string | null;
  }) {
    return [
      `Your new Runner Commerce customer account has been initiated.`,
      `Login phone: ${data.customerPhone}`,
      data.temporaryPassword
        ? `Temporary password: ${data.temporaryPassword}`
        : 'Use password reset to set your password.',
      `Please change this password after login.`,
    ].join('\n');
  }

  private buildOrderCodeRequiredReply() {
    const supportText = encodeURIComponent(
      'I need help finding my runner or order code',
    );
    const supportDigits = SUPERUSER_SUPPORT_PHONE.replace(/\D/g, '');
    return [
      '------------------',
      'ORDER CODE NEEDED',
      '------------------',
      '',
      'Please send the RC order code shown on the product post, for example RC-ABC123.',
      'That lets me find the item and the correct runner.',
      '',
      `Support: https://wa.me/${supportDigits}?text=${supportText}`,
    ].join('\n');
  }

  private async findBlockedWhatsAppOrderAccount(customerPhone: string) {
    const phone = this.normalizeCustomerPhone(customerPhone);
    if (!phone) return null;

    return this.prisma.user.findFirst({
      where: {
        phone: { in: this.phoneCandidates(phone) },
        role: {
          name: { in: [...CUSTOMER_ORDER_BLOCKED_ROLES] },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  private buildBlockedRoleOrderReply(data: { role: string; phone: string }) {
    const roleLabel = data.role
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

    return [
      'This order was not accepted.',
      `The WhatsApp number ${data.phone} is registered as a ${roleLabel} account on Runner Commerce.`,
      'Please order using a separate customer WhatsApp number because one phone number cannot be logged in as different user types.',
    ].join('\n');
  }

  private async resolveOrCreateWhatsAppCustomer({
    customerPhone,
    customerName,
  }: {
    customerPhone: string;
    customerName: string | null;
  }) {
    const phone = this.normalizeCustomerPhone(customerPhone);
    if (!phone) return null;

    const existing = await this.prisma.user.findFirst({
      where: {
        phone: { in: this.phoneCandidates(phone) },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (existing) {
      if (CUSTOMER_ORDER_BLOCKED_ROLES.has(existing.role.name)) {
        throw new BadRequestException(
          'This WhatsApp number belongs to a Runner Commerce staff or business account and cannot be used as a customer account.',
        );
      }

      return {
        user: existing,
        created: false,
        temporaryPassword: null,
      };
    }

    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'CUSTOMER' },
      select: { id: true },
    });

    if (!customerRole) {
      throw new BadRequestException('CUSTOMER role is missing');
    }

    const customerDisplayName =
      this.cleanNullable(customerName ?? undefined, 120) ||
      `WhatsApp Customer ${phone.slice(-4)}`;

    const temporaryPassword = `RC-${randomBytes(6).toString('base64url')}`;

    try {
      const user = await this.prisma.user.create({
        data: {
          name: customerDisplayName,
          phone,
          email: null,
          passwordHash: await bcrypt.hash(temporaryPassword, 10),
          roleId: customerRole.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      return {
        user,
        created: true,
        temporaryPassword,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const user = await this.prisma.user.findFirst({
          where: {
            phone: { in: this.phoneCandidates(phone) },
          },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        });

        if (user) {
          if (CUSTOMER_ORDER_BLOCKED_ROLES.has(user.role.name)) {
            throw new BadRequestException(
              'This WhatsApp number belongs to a Runner Commerce staff or business account and cannot be used as a customer account.',
            );
          }

          return {
            user,
            created: false,
            temporaryPassword: null,
          };
        }
      }

      throw error;
    }
  }

  private async attachOrderRequestToCustomerBasket(data: {
    orderRequestId: string;
    runnerId: string;
    listingId: string;
    productId: string;
    customerPhone: string | null;
    customerUserId: string | null;
    customerName: string | null;
    messageText: string;
    orderCode: string | null;
    runnerPrice: number;
    shopPrice: number;
    shopId: string;
    selectedSize: string | null;
    selectedColor: string | null;
    quantity: number;
    customerNote: string | null;
    customerImageUrls: string[];
  }) {
    const customerPhone = data.customerPhone;
    if (!customerPhone) return null;

    return this.prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: {
          runnerId: data.runnerId,
          customerPhone,
          status: 'WHATSAPP_BASKET',
        },
        include: {
          items: {
            select: {
              id: true,
              listingId: true,
              quantity: true,
              unitPrice: true,
              selectedSize: true,
              selectedColor: true,
              customerImageUrls: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const shippingAddress = {
        street: 'WhatsApp basket',
        city: 'To be confirmed',
        state: '',
        zipCode: '',
        country: 'Eswatini',
        source: 'WHATSAPP',
        customerName: data.customerName || '',
      };
      const notes = [
        'WhatsApp customer basket grouped automatically.',
        data.orderCode ? `Latest order code: ${data.orderCode}` : '',
        `Latest WhatsApp request: ${data.messageText}`,
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 2000);

      const order =
        existingOrder ||
        (await tx.order.create({
          data: {
            customerPhone,
            customerId: data.customerUserId,
            runnerId: data.runnerId,
            shopId: null,
            status: 'WHATSAPP_BASKET',
            totalAmount: 0,
            subtotal: 0,
            tax: 0,
            shippingFee: 0,
            shippingAddress,
            fulfillmentMethod: 'TO_BE_CONFIRMED',
            procurementCity: 'TO_BE_CONFIRMED',
            notes,
          },
        }));

      const currentItems = existingOrder?.items ?? [];
      const existingItem = currentItems.find(
        (item) =>
          item.listingId === data.listingId &&
          (item.selectedSize || '') === (data.selectedSize || '') &&
          (item.selectedColor || '') === (data.selectedColor || ''),
      );

      if (existingItem) {
        await tx.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + data.quantity,
            customerNote: data.customerNote,
            customerImageUrls: this.mergeCustomerImageUrls(
              existingItem.customerImageUrls,
              data.customerImageUrls,
            ),
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            listingId: data.listingId,
            productId: data.productId,
            quantity: data.quantity,
            unitPrice: data.runnerPrice,
            shopPrice: data.shopPrice,
            commission: data.runnerPrice - data.shopPrice,
            selectedSize: data.selectedSize,
            selectedColor: data.selectedColor,
            customerNote: data.customerNote,
            customerImageUrls:
              data.customerImageUrls.length > 0
                ? data.customerImageUrls
                : undefined,
            status: 'REQUESTED',
          },
        });
      }

      await this.syncWebCartItemFromWhatsAppBasket(tx, data);

      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          shopPrice: true,
          selectedSize: true,
          selectedColor: true,
          customerImageUrls: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      });
      const subtotal = roundMoney(
        items.reduce(
          (total, item) => total + item.quantity * item.unitPrice,
          0,
        ),
      );
      const shippingFee = roundMoney(
        items.reduce(
          (total, item) =>
            total + item.quantity * item.shopPrice * TRANSPORT_FEE_RATE,
          0,
        ),
      );

      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal,
          shippingFee,
          totalAmount: roundMoney(subtotal + shippingFee),
          ...(data.customerUserId && !order.customerId
            ? { customerId: data.customerUserId }
            : {}),
          notes,
          updatedAt: new Date(),
        },
      });

      await tx.whatsAppOrderRequest.update({
        where: { id: data.orderRequestId },
        data: {
          orderId: order.id,
          status: 'CONVERTED',
          auditStatus: 'CONVERTED',
        },
      });

      return {
        orderId: order.id,
        itemCount: items.length,
        totalQuantity: items.reduce(
          (total, item) => total + Number(item.quantity || 0),
          0,
        ),
        totalAmount: roundMoney(subtotal + shippingFee),
        items: items.map((item) => ({
          name: item.product?.name || 'Item',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
          customerImageUrls: this.cleanCustomerImageUrls(
            item.customerImageUrls,
          ),
        })),
      };
    });
  }

  private async syncWebCartItemFromWhatsAppBasket(
    tx: any,
    data: {
      customerUserId: string | null;
      listingId: string;
      productId: string;
      quantity: number;
      customerImageUrls: string[];
    },
  ) {
    if (!data.customerUserId) return;

    let cart = await tx.cart.findUnique({
      where: { customerId: data.customerUserId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!cart) {
      cart = await tx.cart.create({
        data: {
          customerId: data.customerUserId,
          status: 'ACTIVE',
          expiresAt: new Date(
            Date.now() + WEB_CART_EXPIRY_HOURS * 60 * 60 * 1000,
          ),
        },
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      });
    } else if (
      cart.status !== 'ACTIVE' ||
      (cart.expiresAt && cart.expiresAt <= new Date())
    ) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      cart = await tx.cart.update({
        where: { id: cart.id },
        data: {
          status: 'ACTIVE',
          expiresAt: new Date(
            Date.now() + WEB_CART_EXPIRY_HOURS * 60 * 60 * 1000,
          ),
        },
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      });
    }

    const existingCartItem = await tx.cartItem.findFirst({
      where: {
        cartId: cart.id,
        listingId: data.listingId,
      },
      select: {
        id: true,
        quantity: true,
        customerImageUrls: true,
      },
    });

    if (existingCartItem) {
      await tx.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + data.quantity,
          customerImageUrls: this.mergeCustomerImageUrls(
            existingCartItem.customerImageUrls,
            data.customerImageUrls,
          ),
        },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          listingId: data.listingId,
          productId: data.productId,
          quantity: data.quantity,
          customerImageUrls:
            data.customerImageUrls.length > 0
              ? data.customerImageUrls
              : undefined,
        },
      });
    }
  }

  private async createRunnerOrderNotification(data: {
    userId: string;
    orderRequestId: string;
    basketOrderId: string | null;
    orderCode: string | null;
    customerPhone: string | null;
    customerName: string | null;
    customerAccountCreated: boolean;
    productName: string;
    shopName: string;
  }) {
    await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: `New WhatsApp order ${data.orderCode || ''}`.trim(),
        message: [
          `${data.customerName || data.customerPhone || 'A customer'} requested ${data.productName}.`,
          `Shop: ${data.shopName}`,
        ].join('\n'),
        type: 'ORDER',
        channel: 'IN_APP',
        status: 'DELIVERED',
        sentAt: new Date(),
        metadata: {
          source: 'WHATSAPP_ORDER_REQUEST',
          orderRequestId: data.orderRequestId,
          basketOrderId: data.basketOrderId,
          orderCode: data.orderCode,
          customerPhone: data.customerPhone,
          customerAccountCreated: data.customerAccountCreated,
          productName: data.productName,
          shopName: data.shopName,
        },
      },
    });
  }

  private buildCustomerOrderReply(data: {
    orderCode: string | null;
    productName: string;
    runnerName: string;
    runnerPhone: string | null;
    selectedSize: string | null;
    selectedColor: string | null;
    quantity: number;
    customerPhone: string | null;
    customerAccountCreated: boolean;
    temporaryPassword: string | null;
  }) {
    return [
      `Thanks, your item has been added to your order basket.`,
      data.orderCode ? `Order code: ${data.orderCode}` : '',
      `Item: ${data.productName}`,
      `Runner: ${data.runnerName}`,
      data.runnerPhone
        ? `Runner WhatsApp: ${this.whatsappLink(data.runnerPhone)}`
        : '',
      `Size: ${data.selectedSize || 'To be confirmed'}`,
      `Color: ${data.selectedColor || 'To be confirmed'}`,
      `Quantity: ${data.quantity}`,
      data.customerAccountCreated && data.customerPhone
        ? this.buildCustomerAccountInitiatedMessage({
            customerPhone: data.customerPhone,
            temporaryPassword: data.temporaryPassword,
          })
        : '',
      `The runner has been notified and will confirm availability, payment, and delivery details.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildUnmatchedCustomerOrderReply(
    orderCode: string | null,
    account?: {
      customerPhone: string | null;
      customerAccountCreated: boolean;
      temporaryPassword: string | null;
    },
  ) {
    return [
      `Thanks, your message was received.`,
      orderCode ? `Order code: ${orderCode}` : '',
      `We could not match this code to an active runner listing yet. Please check the code or send a screenshot of the product post.`,
      account?.customerAccountCreated && account.customerPhone
        ? this.buildCustomerAccountInitiatedMessage({
            customerPhone: account.customerPhone,
            temporaryPassword: account.temporaryPassword,
          })
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildRunnerOrderNotificationMessage(data: {
    orderRequestId: string;
    orderCode: string | null;
    customerPhone: string | null;
    customerName: string | null;
    basketOrderId: string | null;
    selectedSize: string | null;
    selectedColor: string | null;
    quantity: number;
    productName: string;
    customerImageUrls: string[];
  }) {
    const customerContact = data.customerPhone
      ? `${data.customerPhone} (${this.whatsappLink(data.customerPhone)})`
      : 'Unknown';
    const image = this.primaryCustomerImageLink(data.customerImageUrls);

    return [
      `New order`,
      data.orderCode ? `Order code: ${data.orderCode}` : '',
      `Customer WhatsApp: ${customerContact}`,
      `Item: ${data.productName}`,
      data.selectedSize ? `Size: ${data.selectedSize}` : '',
      data.selectedColor ? `Color: ${data.selectedColor}` : '',
      `Quantity: ${data.quantity}`,
      image ? `Image: attached` : '',
      data.basketOrderId ? `Basket: ${data.basketOrderId}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private primaryCustomerImageLink(customerImageUrls: string[]) {
    return this.customerImageLink(
      this.cleanCustomerImageUrls(customerImageUrls)[0],
    );
  }

  private buildRunnerCartSummaryMessage(data: {
    basketOrderId: string | null;
    orderCode: string | null;
    customerPhone: string | null;
    itemCount: number;
    totalQuantity: number;
    totalAmount: number;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      selectedSize: string | null;
      selectedColor: string | null;
      customerImageUrls: string[];
    }>;
  }) {
    const customerContact = data.customerPhone
      ? `${data.customerPhone} (${this.whatsappLink(data.customerPhone)})`
      : 'Unknown';
    const lines = data.items.slice(0, 12).map((item, index) => {
      const details = [
        item.selectedSize ? `Size ${item.selectedSize}` : '',
        item.selectedColor ? `Color ${item.selectedColor}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const image = this.customerImageLink(item.customerImageUrls[0]);

      return `${index + 1}. ${item.name} x${item.quantity}${details ? ` (${details})` : ''} - ${this.formatRand(item.unitPrice)}${image ? `\n   Image: ${image}` : ''}`;
    });

    return [
      `Cart order summary`,
      data.orderCode ? `Latest order code: ${data.orderCode}` : '',
      data.basketOrderId ? `Basket: ${data.basketOrderId}` : '',
      `Customer WhatsApp: ${customerContact}`,
      `Items: ${data.itemCount}`,
      `Total quantity: ${data.totalQuantity}`,
      `Total: ${this.formatRand(data.totalAmount)}`,
      '',
      ...lines,
      data.items.length > lines.length
        ? `+ ${data.items.length - lines.length} more item(s)`
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  private formatRand(value: number) {
    return `R ${Number(value || 0).toFixed(2)}`;
  }

  private whatsappLink(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : value;
  }

  private customerImageLink(value?: string | null) {
    if (!value) return null;
    const publicUrl = this.publicImageUrlFromMediaUrl(value);
    if (publicUrl) return publicUrl;

    if (value.startsWith('/uploads/')) {
      const publicBase =
        this.configService.get<string>('WHATSAPP_PUBLIC_UPLOAD_BASE_URL') ||
        this.configService.get<string>('PUBLIC_BACKEND_URL') ||
        'http://localhost:3001';

      try {
        return new URL(value, publicBase).toString();
      } catch {
        return value;
      }
    }

    return value;
  }

  private extractOrderCode(value: string) {
    const match = this.sanitizeText(value).match(/\bRC-[A-Z0-9]{6,10}\b/i);
    return match ? match[0].toUpperCase() : null;
  }

  private createOrderCode() {
    return `RC-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private buildWhatsAppOrderIntakeReadiness(
    runner?: {
      id?: string | null;
      bridgeAccountId?: string | null;
      whatsappOrderIntakeEnabled?: boolean | null;
      whatsappOrderTemplatesVerifiedAt?: Date | null;
      whatsappOrderTestedAt?: Date | null;
      shippingMode?: string | null;
      supervisionMode?: string | null;
      bridgeAccount?: { id?: string | null; status?: string | null } | null;
      subscriptions?: Array<{
        status: string;
        orderWorkflowAddonEnabled: boolean;
        currentPeriodEnd: Date;
      }>;
    } | null,
  ) {
    const blockers: string[] = [];
    if (!runner?.id) blockers.push('Runner could not be resolved');
    const hasOrderWorkflowAddon = Boolean(
      runner?.subscriptions?.some(
        (subscription) =>
          subscription.status === 'ACTIVE' &&
          subscription.orderWorkflowAddonEnabled &&
          subscription.currentPeriodEnd > new Date(),
      ),
    );
    if (!hasOrderWorkflowAddon) {
      blockers.push('Active Phase 2 order workflow add-on required');
    }
    if (!runner?.whatsappOrderIntakeEnabled) {
      blockers.push('Per-runner WhatsApp order intake is off');
    }
    if (!runner?.bridgeAccountId) {
      blockers.push('Linked WhatsApp bridge required');
    } else if (runner.bridgeAccount?.status !== 'ONLINE') {
      blockers.push('Linked WhatsApp bridge should be online');
    }
    if (!runner?.whatsappOrderTemplatesVerifiedAt) {
      blockers.push('Customer reply templates must be verified');
    }
    if (!runner?.whatsappOrderTestedAt) {
      blockers.push('Successful test intake required');
    }
    if (
      ['PROVIDER_RATE_QUOTE', 'PROVIDER_LABELS'].includes(
        runner?.shippingMode || '',
      )
    ) {
      blockers.push(
        'Provider shipping mode is not enabled for standard intake',
      );
    }
    if ((runner?.supervisionMode || 'SUPERVISED') !== 'SUPERVISED') {
      blockers.push('Supervised mode is required for early-access intake');
    }

    return { ready: blockers.length === 0, blockers };
  }

  private whatsAppOrderCannedReplies() {
    return {
      missingSize: 'Please reply with the size you want.',
      missingColor: 'Please reply with the colour you want.',
      missingQuantity: 'Please reply with the quantity you want.',
      confirm: 'Reply YES to confirm, EDIT to change details, or CANCEL.',
      cancel: 'No problem, this request has been cancelled.',
      handoff:
        'A runner or support operator will review this before it becomes an active order.',
    };
  }

  private async findRunnerByPhone(value?: string) {
    const normalized = this.normalizePhone(value);
    if (!normalized) return null;

    return this.prisma.runner.findFirst({
      where: {
        OR: [
          { phone: { in: this.phoneCandidates(normalized) } },
          {
            user: {
              phone: { in: this.phoneCandidates(normalized) },
            },
          },
        ],
      },
      select: {
        id: true,
        bridgeAccountId: true,
        whatsappOrderIntakeEnabled: true,
        whatsappOrderTemplatesVerifiedAt: true,
        whatsappOrderTestedAt: true,
        shippingMode: true,
        supervisionMode: true,
        bridgeAccount: {
          select: { id: true, status: true },
        },
        subscriptions: {
          where: {
            audience: 'RUNNER',
            status: 'ACTIVE',
            currentPeriodEnd: { gt: new Date() },
          },
          select: {
            status: true,
            orderWorkflowAddonEnabled: true,
            currentPeriodEnd: true,
          },
          take: 3,
        },
      },
    });
  }

  private cleanRequiredText(
    value: string | undefined,
    maxLength: number,
    label: string,
  ) {
    const clean = this.cleanOptionalText(value, maxLength);
    if (!clean) throw new BadRequestException(`${label} is required`);
    return clean;
  }

  private extractMetaPosts(payload: Record<string, unknown>) {
    const entries = Array.isArray((payload as any).entry)
      ? (payload as any).entry
      : [];
    const posts: Array<{
      caption: string;
      sourceGroup: string;
      senderPhone?: string;
      messageId?: string;
      receivedAt?: string;
      phoneNumberId?: string;
      displayPhoneNumber?: string;
    }> = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value ?? {};
        const metadata = value.metadata ?? {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactName = contacts[0]?.profile?.name;
        const displayPhoneNumber = metadata.display_phone_number;
        const phoneNumberId = metadata.phone_number_id;

        for (const message of messages) {
          const caption = this.extractMetaMessageText(message);

          if (!caption) continue;

          const receivedAt = message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : undefined;
          const mediaNote = this.extractMetaMediaNote(message);

          posts.push({
            caption: mediaNote ? `${caption}\n\n${mediaNote}` : caption,
            sourceGroup: contactName
              ? `WhatsApp Forward from ${contactName}`
              : `WhatsApp ${displayPhoneNumber || phoneNumberId || 'Business'}`,
            senderPhone: message.from,
            messageId: message.id,
            receivedAt,
            phoneNumberId,
            displayPhoneNumber,
          });
        }
      }
    }

    return posts;
  }

  private extractMetaMessageText(message: any): string | null {
    if (message?.text?.body) return String(message.text.body);

    const mediaCaption =
      message?.image?.caption ||
      message?.video?.caption ||
      message?.document?.caption;

    if (mediaCaption) return String(mediaCaption);

    return null;
  }

  private extractMetaMediaNote(message: any): string | null {
    const media =
      message?.image ??
      message?.video ??
      message?.document ??
      message?.audio ??
      null;

    if (!media?.id) return null;

    return `[WhatsApp media ${message.type || 'file'} id: ${media.id}]`;
  }

  private async resolveShopIdForWhatsAppPhone(
    phoneNumberId?: string,
    displayPhoneNumber?: string,
  ) {
    const configuredMap = this.configService.get<string>(
      'WHATSAPP_PHONE_SHOP_MAP',
    );

    if (configuredMap) {
      try {
        const map = JSON.parse(configuredMap) as Record<string, string>;
        const mapped =
          (phoneNumberId && map[phoneNumberId]) ||
          (displayPhoneNumber && map[displayPhoneNumber]);

        if (mapped) return mapped;
      } catch {
        this.logger.warn('WHATSAPP_PHONE_SHOP_MAP is not valid JSON');
      }
    }

    if (!displayPhoneNumber) return null;

    const phoneCandidates = [
      displayPhoneNumber,
      `+${displayPhoneNumber}`,
      displayPhoneNumber.replace(/\s+/g, ''),
      `+${displayPhoneNumber.replace(/\s+/g, '')}`,
    ];

    const shop = await this.prisma.shop.findFirst({
      where: { phone: { in: phoneCandidates } },
      select: { id: true },
    });

    return shop?.id ?? null;
  }

  private async assertShopOwner(shopId: string, userId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop) throw new NotFoundException(`Shop ${shopId} not found`);
    if (shop.ownerId !== userId) {
      throw new ForbiddenException('You can only manage your own shop imports');
    }
  }

  private assertCanManageWhatsAppDiscovery(userRole: string) {
    if (!this.isAdminRole(userRole)) {
      throw new ForbiddenException(
        'Only admins can import authenticated WhatsApp groups as shops',
      );
    }
  }

  private async resolveOrCreateShopOwnerFromGroup({
    groupName,
    creatorPhone,
  }: {
    groupName: string;
    creatorPhone: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: {
        phone: { in: this.phoneCandidates(creatorPhone) },
        role: { name: 'SHOP_OWNER' },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (existing) {
      return {
        owner: existing,
        created: false,
        temporaryPassword: null,
      };
    }

    const shopOwnerRole = await this.prisma.role.findUnique({
      where: { name: 'SHOP_OWNER' },
      select: { id: true },
    });

    if (!shopOwnerRole) {
      throw new BadRequestException('SHOP_OWNER role is missing');
    }

    const temporaryPassword =
      this.configService.get<string>('WHATSAPP_CREATED_SHOP_OWNER_PASSWORD') ||
      `Shop-${randomBytes(5).toString('hex')}`;
    const owner = await this.prisma.user.create({
      data: {
        name: `${this.suggestShopNameFromGroup(groupName)} Owner`,
        phone: creatorPhone,
        email: null,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        roleId: shopOwnerRole.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    return {
      owner,
      created: true,
      temporaryPassword,
    };
  }

  private shopDraftFromDiscoveredGroup(
    group: {
      groupId: string;
      name: string;
    },
    ownerId: string,
    creatorPhone: string,
    procurementCity?: string | null,
  ) {
    const name =
      this.suggestShopNameFromGroup(group.name) ||
      `WhatsApp Shop ${group.groupId}`;
    const phone =
      this.normalizePhone(creatorPhone) ??
      this.creatorPhoneFromGroupId(group.groupId) ??
      '+26876154884';

    return {
      name,
      description: `Products captured from WhatsApp group "${group.name}"`,
      phone,
      address: 'WhatsApp Group',
      ownerId,
      status: 'ACTIVE',
      procurementCity:
        this.cleanNullable(procurementCity || undefined) || 'DURBAN',
    };
  }

  private async runnerSubmittedShoppingDestinationForGroup(groupId: string) {
    const links = await this.prisma.runnerSubmittedShopLink.findMany({
      where: {
        status: { in: ['JOINED_PENDING_REVIEW', 'APPROVED'] },
        notes: { contains: `Joined WhatsApp group id: ${groupId}` },
      },
      include: {
        runner: {
          select: {
            serviceArea: true,
            phase1Setup: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    for (const link of links) {
      const noteDestination = this.extractSubmittedLinkDestination(link.notes);
      const runnerDestination = this.runnerShoppingDestination(link.runner);
      const destination = this.cleanNullable(
        noteDestination || runnerDestination || undefined,
      );
      if (destination) return destination;
    }

    return null;
  }

  private extractSubmittedLinkDestination(notes?: string | null) {
    const match = String(notes || '').match(/^Shopping destination:\s*(.+)$/im);
    return this.cleanNullable(match?.[1] || undefined);
  }

  private runnerShoppingDestination(runner?: {
    phase1Setup?: unknown;
    serviceArea?: string | null;
  }) {
    const setup =
      runner?.phase1Setup && typeof runner.phase1Setup === 'object'
        ? (runner.phase1Setup as Record<string, unknown>)
        : {};
    return (
      this.cleanNullable(String(setup.shopTown || '')) ||
      this.cleanNullable(String(setup.shoppingDestination || '')) ||
      this.cleanNullable(runner?.serviceArea || undefined)
    );
  }

  private async findRelatedShopForGroup(
    groupShopName: string,
    ownerId: string,
  ) {
    const canonicalName = this.canonicalShopGroupName(groupShopName);
    if (!canonicalName) return null;
    const ownerShops = await this.prisma.shop.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        phone: true,
        ownerId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return (
      ownerShops.find(
        (shop) => this.canonicalShopGroupName(shop.name) === canonicalName,
      ) ??
      ownerShops.find((shop) =>
        this.areLikelySameShopName(shop.name, groupShopName),
      ) ??
      null
    );
  }

  private async findGlobalRelatedShopForGroup(
    groupShopName: string,
    creatorPhone: string,
  ) {
    const canonicalName = this.canonicalShopGroupName(groupShopName);
    const phoneCandidates = this.phoneCandidates(creatorPhone);
    if (!canonicalName || phoneCandidates.length === 0) return null;

    const shops = await this.prisma.shop.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { phone: { in: phoneCandidates } },
          { owner: { phone: { in: phoneCandidates } } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        ownerId: true,
        owner: {
          select: {
            phone: true,
          },
        },
        _count: {
          select: {
            whatsappGroupMappings: true,
            whatsappImports: true,
            products: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    const matches = shops
      .filter(
        (shop) =>
          this.hasMatchingPhone(shop.phone, creatorPhone) ||
          this.hasMatchingPhone(shop.owner?.phone, creatorPhone),
      )
      .filter(
        (shop) =>
          this.canonicalShopGroupName(shop.name) === canonicalName ||
          this.areLikelySameShopName(shop.name, groupShopName),
      );

    if (matches.length === 0) return null;

    const [best] = matches.sort((left, right) => {
      const leftScore =
        left._count.whatsappGroupMappings * 10 +
        left._count.whatsappImports * 3 +
        left._count.products;
      const rightScore =
        right._count.whatsappGroupMappings * 10 +
        right._count.whatsappImports * 3 +
        right._count.products;
      return rightScore - leftScore;
    });

    return {
      id: best.id,
      name: best.name,
      phone: best.phone,
      ownerId: best.ownerId,
    };
  }

  private areLikelySameShopName(left: string, right: string) {
    const leftCanonical = this.canonicalShopGroupName(left);
    const rightCanonical = this.canonicalShopGroupName(right);
    if (!leftCanonical || !rightCanonical) return false;
    if (leftCanonical === rightCanonical) return true;

    const [shorter, longer] =
      leftCanonical.length <= rightCanonical.length
        ? [leftCanonical, rightCanonical]
        : [rightCanonical, leftCanonical];
    if (shorter.length < 8) return false;

    return longer.startsWith(`${shorter} `) || longer.startsWith(`${shorter}-`);
  }

  private hasMatchingPhone(left?: string | null, right?: string | null) {
    const leftCandidates = new Set(this.phoneCandidates(left || ''));
    return this.phoneCandidates(right || '').some((phone) =>
      leftCandidates.has(phone),
    );
  }

  private canonicalShopGroupName(value: string) {
    return this.cleanShopName(value)
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

  private cleanShopName(value: string) {
    return this.sanitizeText(value || '')
      .replace(/[^\p{L}\p{N}\s.'&/-]/gu, ' ')
      .replace(/\b(?:shop|group|g\/s)\b/gi, (match) => match)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private suggestShopNameFromGroup(value: string) {
    return this.cleanShopName(value)
      .replace(/\bg\s*\/\s*s\s*\d+\w*\b/gi, ' ')
      .replace(/\bg\s*[-#]?\s*\d+\w*\b$/gi, ' ')
      .replace(/\bgrp\s*[-#]?\s*\d+\w*\b$/gi, ' ')
      .replace(/\bgroup\s*[-#]?\s*\d+\w*\b$/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private normalizePhone(value?: string | null) {
    const raw = String(value || '').trim();
    if (/@(?:lid|g\.us)\b/i.test(raw)) return null;

    const digits = raw.replace(/[^\d]/g, '');
    if (
      digits.length < 8 ||
      digits.length > 15 ||
      digits.startsWith('120363')
    ) {
      return null;
    }
    return `+${digits}`;
  }

  private creatorPhoneFromGroupId(groupId?: string | null) {
    const firstPart = String(groupId || '')
      .split('@')[0]
      ?.split('-')[0];
    return this.normalizePhone(firstPart);
  }

  private isCanonicalWhatsAppGroupId(groupId?: string | null) {
    return /^\d{8,}(?:-\d+)?@g\.us$/i.test(String(groupId || '').trim());
  }

  private isCanonicalWhatsAppChannelId(channelId?: string | null) {
    return /^\d{6,}@(?:\w*newsletter|newsletter)$/i.test(
      String(channelId || '').trim(),
    );
  }

  private isPlaceholderWhatsAppGroupName(groupId: string, name: string) {
    return name === groupId || /^120\d+@g\.us$/i.test(name);
  }

  private placeholderPhoneFromGroupId(groupId?: string | null) {
    const digits = String(groupId || '').replace(/[^\d]/g, '');
    const stableDigits = (digits || '0').slice(-10).padStart(10, '0');
    return `+999${stableDigits}`;
  }

  private phoneCandidates(value: string) {
    const normalized = this.normalizePhone(value);
    if (!normalized) return [];
    const digits = normalized.replace(/[^\d]/g, '');
    return [normalized, digits, `+${digits}`];
  }

  private cleanParticipantPhones(value?: string[] | null) {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((phone) => this.normalizePhone(phone))
          .filter((phone): phone is string => Boolean(phone)),
      ),
    );
  }

  private async syncDiscoveredGroupMembers(
    discoveredGroupId: string,
    groupId: string,
    participantPhones: string[],
    seenAt: Date,
  ) {
    if (participantPhones.length === 0) {
      await (this.prisma as any).whatsAppDiscoveredGroupMember.updateMany({
        where: { groupId, status: 'ACTIVE' },
        data: { status: 'INACTIVE', archivedAt: seenAt, lastSeenAt: seenAt },
      });
      return;
    }

    await this.prisma.$transaction([
      ...participantPhones.map((phone) =>
        (this.prisma as any).whatsAppDiscoveredGroupMember.upsert({
          where: { groupId_phone: { groupId, phone } },
          update: {
            discoveredGroupId,
            status: 'ACTIVE',
            archivedAt: null,
            lastSeenAt: seenAt,
          },
          create: {
            discoveredGroupId,
            groupId,
            phone,
            status: 'ACTIVE',
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
          },
        }),
      ),
      (this.prisma as any).whatsAppDiscoveredGroupMember.updateMany({
        where: {
          groupId,
          status: 'ACTIVE',
          phone: { notIn: participantPhones },
        },
        data: { status: 'INACTIVE', archivedAt: seenAt, lastSeenAt: seenAt },
      }),
    ]);
  }

  private async rebuildCustomerGroupConflicts(now = new Date()) {
    const [groups, members, links] = await Promise.all([
      this.prisma.whatsAppDiscoveredGroup.findMany({
        where: { groupPurpose: 'RUNNER_ADVERTISING', archivedAt: null },
        select: { groupId: true, name: true },
      }),
      (this.prisma as any).whatsAppDiscoveredGroupMember.findMany({
        where: {
          status: 'ACTIVE',
          discoveredGroup: {
            groupPurpose: 'RUNNER_ADVERTISING',
            archivedAt: null,
          },
        },
        select: {
          phone: true,
          groupId: true,
          discoveredGroup: { select: { name: true } },
        },
      }),
      this.prisma.runnerShopLink.findMany({
        where: {
          status: 'APPROVED',
          autoPostEnabled: true,
          destinationGroup: { not: null },
          runner: { status: 'ACTIVE' },
        },
        select: {
          runnerId: true,
          destinationGroup: true,
          runner: { select: { user: { select: { name: true, phone: true } } } },
          shop: { select: { procurementCity: true } },
        },
      }),
    ]);

    const canonicalByAlias = new Map<string, string>();
    const groupNameById = new Map<string, string>();
    for (const group of groups) {
      const canonical = this.normalizeDestinationKey(group.groupId);
      canonicalByAlias.set(canonical, group.groupId);
      canonicalByAlias.set(
        this.normalizeDestinationKey(group.name),
        group.groupId,
      );
      groupNameById.set(group.groupId, group.name);
    }

    const groupContexts = new Map<
      string,
      Array<{ city: string; runnerId: string; runnerName: string | null }>
    >();
    for (const link of links) {
      const city = String(link.shop?.procurementCity || 'DURBAN').toUpperCase();
      const destinations = this.parseDestinationGroups(link.destinationGroup);
      for (const destination of destinations) {
        const canonical =
          canonicalByAlias.get(this.normalizeDestinationKey(destination)) ||
          destination;
        const rows = groupContexts.get(canonical) || [];
        rows.push({
          city,
          runnerId: link.runnerId,
          runnerName:
            link.runner?.user?.name || link.runner?.user?.phone || null,
        });
        groupContexts.set(canonical, rows);
      }
    }

    const byPhoneCity = new Map<
      string,
      {
        customerPhone: string;
        city: string;
        runnerIds: Set<string>;
        groups: Map<string, any>;
      }
    >();

    for (const member of members) {
      const customerPhone = this.normalizeCustomerPhone(member.phone);
      if (!customerPhone?.startsWith('+268')) continue;

      const contexts = groupContexts.get(member.groupId) || [];
      for (const context of contexts) {
        const key = `${customerPhone}:${context.city}`;
        const row = byPhoneCity.get(key) || {
          customerPhone,
          city: context.city,
          runnerIds: new Set<string>(),
          groups: new Map<string, any>(),
        };
        row.runnerIds.add(context.runnerId);
        row.groups.set(`${member.groupId}:${context.runnerId}`, {
          groupId: member.groupId,
          groupName:
            member.discoveredGroup?.name ||
            groupNameById.get(member.groupId) ||
            member.groupId,
          runnerId: context.runnerId,
          runnerName: context.runnerName,
        });
        byPhoneCity.set(key, row);
      }
    }

    const activeKeys: string[] = [];
    let opened = 0;
    for (const row of byPhoneCity.values()) {
      if (row.runnerIds.size <= 1) continue;
      activeKeys.push(`${row.customerPhone}:${row.city}`);
      const runnerIds = [...row.runnerIds].sort();
      const groupsPayload = [...row.groups.values()].sort((a, b) =>
        String(a.groupName).localeCompare(String(b.groupName)),
      );
      await (this.prisma as any).customerGroupConflict.upsert({
        where: {
          customerPhone_city: {
            customerPhone: row.customerPhone,
            city: row.city,
          },
        },
        update: {
          status: 'OPEN',
          runnerIds,
          groups: groupsPayload,
          chosenRunnerId: null,
          resolvedById: null,
          resolvedAt: null,
          resolutionNote: null,
          lastSeenAt: now,
        },
        create: {
          customerPhone: row.customerPhone,
          city: row.city,
          status: 'OPEN',
          runnerIds,
          groups: groupsPayload,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      opened += 1;
    }

    const openConflicts = await (
      this.prisma as any
    ).customerGroupConflict.findMany({
      where: { status: 'OPEN' },
      select: { id: true, customerPhone: true, city: true },
    });
    const activeKeySet = new Set(activeKeys);
    const clearedIds = openConflicts
      .filter(
        (conflict: any) =>
          !activeKeySet.has(`${conflict.customerPhone}:${conflict.city}`),
      )
      .map((conflict: any) => conflict.id);
    if (clearedIds.length > 0) {
      await (this.prisma as any).customerGroupConflict.updateMany({
        where: { id: { in: clearedIds } },
        data: {
          status: 'CLEARED',
          resolvedAt: now,
          resolutionNote: 'No longer found in multiple active runner groups.',
        },
      });
    }

    return { opened, cleared: clearedIds.length };
  }

  private parseDestinationGroups(value?: string | null) {
    const clean = String(value || '').trim();
    if (!clean) return [];
    if (clean.startsWith('[')) {
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item || '').trim())
            .filter(Boolean);
        }
      } catch {
        return [clean];
      }
    }
    return clean
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeDestinationKey(value?: string | null) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private async assertCanManageShop(
    shopId: string,
    userId: string,
    userRole: string,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop) throw new NotFoundException(`Shop ${shopId} not found`);
    if (!this.isAdminRole(userRole) && shop.ownerId !== userId) {
      throw new ForbiddenException('You can only manage your own shop groups');
    }
  }

  private async assertCanManageActiveShop(
    shopId: string,
    userId: string,
    userRole: string,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        ownerId: true,
        status: true,
      },
    });

    if (!shop) throw new NotFoundException(`Shop ${shopId} not found`);
    if (shop.status !== 'ACTIVE') {
      throw new BadRequestException(
        'WhatsApp groups can only be mapped to an active shop',
      );
    }
    if (!this.isAdminRole(userRole) && shop.ownerId !== userId) {
      throw new ForbiddenException('You can only manage your own shop groups');
    }
  }

  private isAdminRole(userRole: string) {
    return ['ADMIN', 'SUPERUSER'].includes(userRole);
  }

  private async assertShopExists(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true },
    });

    if (!shop) throw new NotFoundException(`Shop ${shopId} not found`);
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
