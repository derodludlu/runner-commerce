// src/modules/runner/runner.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterRunnerDto } from './dto/register-runner.dto';
import { UpdateRunnerProfileDto } from './dto/update-runner-profile.dto';
import { ApplyRepostPriceFormatDto } from './dto/apply-repost-price-format.dto';
import { UpdateListingRepostControlDto } from './dto/update-listing-repost-control.dto';
import { ConvertWhatsAppOrderRequestDto } from './dto/convert-whatsapp-order-request.dto';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { Prisma } from '@prisma/client';
import { assertDestinationGroupsAvailableToRunner } from '../../common/whatsapp-destination-reservations';

const TRANSPORT_FEE_RATE = 0;
const SAFE_AUTO_REPOST_INTERVAL_MINUTES = 30;
const SAFE_MAX_POSTS_PER_RUN = 10;

function safeAutoRepostIntervalMinutes(value: unknown) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed)
    ? Math.max(SAFE_AUTO_REPOST_INTERVAL_MINUTES, parsed)
    : SAFE_AUTO_REPOST_INTERVAL_MINUTES;
}

function safeMaxPostsPerRun(value: unknown) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(SAFE_MAX_POSTS_PER_RUN, parsed))
    : SAFE_MAX_POSTS_PER_RUN;
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampNumber(
  value: number,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

@Injectable()
export class RunnerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Register as a runner
   */
  async register(userId: string, dto: RegisterRunnerDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: {
          select: { name: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role.name !== 'CUSTOMER') {
      throw new ForbiddenException(
        'Only customer accounts can apply to become runners',
      );
    }

    // Check if user is already a runner
    const existingRunner = await this.prisma.runner.findUnique({
      where: { userId },
    });

    if (existingRunner) {
      throw new ConflictException('You are already registered as a runner');
    }

    // Create runner profile
    const runner = await this.prisma.runner.create({
      data: {
        user: { connect: { id: userId } },
        vehicleType: dto.vehicleType,
        vehicleNumber: dto.vehicleNumber,
        phone: dto.phone,
        serviceArea: dto.serviceArea,
        publicCode: await this.createUniqueRunnerPublicCode(),
        status: 'PENDING', // Requires admin approval
        trialStatus: 'TRIAL_PENDING_SETUP',
        subscriptionStatus: 'PENDING_SUBSCRIPTION',
        repostingStatus: 'NOT_STARTED',
        // 移除userId字段，改用user关系
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Create wallet for runner using the correct model name
    await this.prisma.runnerWallet.create({
      data: {
        runnerId: runner.id,
        balance: 0,
        pending: 0,
      },
    });

    return runner;
  }

  async getPublicRunnerByCode(runnerCode: string, orderCode?: string) {
    const publicCode = this.normalizeRunnerPublicCode(runnerCode);
    if (!publicCode) throw new NotFoundException('Runner link not found');

    const runner = await this.prisma.runner.findUnique({
      where: { publicCode },
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true },
        },
        serviceCities: {
          where: { active: true },
          orderBy: { city: 'asc' },
        },
      },
    });

    if (!runner || runner.status !== 'ACTIVE') {
      throw new NotFoundException('Runner link not found');
    }

    await this.ensureOrderCodesForRunner(runner.id);
    const cleanOrderCode = String(orderCode || '').trim().toUpperCase();
    const where: Prisma.RunnerListingWhereInput = {
      runnerId: runner.id,
      status: 'ACTIVE',
      product: { status: 'ACTIVE', stockQty: { gt: 0 } },
      ...(cleanOrderCode ? { orderCode: cleanOrderCode } : {}),
    };

    const listings = await this.prisma.runnerListing.findMany({
      where,
      include: this.publicListingInclude(),
      orderBy: cleanOrderCode ? { createdAt: 'desc' } : { updatedAt: 'desc' },
      take: cleanOrderCode ? 1 : 80,
    });

    const whatsappDigits = String(
      runner.phone || runner.user?.phone || '',
    ).replace(/\D/g, '');

    return {
      runner: {
        id: runner.id,
        publicCode: runner.publicCode,
        name: runner.user?.name || 'Runner',
        phone: runner.phone || runner.user?.phone || null,
        whatsappLink: whatsappDigits ? `https://wa.me/${whatsappDigits}` : null,
        serviceArea: runner.serviceArea,
        vehicleType: runner.vehicleType,
        rating: runner.rating,
        serviceCities: runner.serviceCities,
      },
      listings,
      deepLinkOrderCode: cleanOrderCode || null,
    };
  }

  /**
   * Get runner profile by user ID
   */
  async getRunnerByUserId(userId: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        wallet: true,
        _count: {
          select: {
            listings: true,
            orders: true,
          },
        },
      },
    });

    if (!runner) {
      return null;
    }

    const destinationGroupRefs = this.parseDestinationGroupRefs(
      runner.whatsappGroup,
    );
    const discoveredGroups =
      destinationGroupRefs.length > 0
        ? await this.prisma.whatsAppDiscoveredGroup.findMany({
            where: {
              OR: [
                { groupId: { in: destinationGroupRefs } },
                { name: { in: destinationGroupRefs } },
              ],
            },
            select: { groupId: true, name: true },
          })
        : [];
    const destinationNameByRef = new Map<string, string>();
    for (const group of discoveredGroups) {
      destinationNameByRef.set(group.groupId, group.name);
      destinationNameByRef.set(group.name, group.name);
    }

    return {
      ...runner,
      destinationGroupNames: destinationGroupRefs.map(
        (group) => destinationNameByRef.get(group) || group,
      ),
    };
  }

  private parseDestinationGroupRefs(value?: string | null) {
    const clean = String(value || '').trim();
    if (!clean) return [];

    if (clean.startsWith('[')) {
      try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return parsed
            .map((group) => String(group || '').trim())
            .filter(Boolean);
        }
      } catch {
        return [clean];
      }
    }

    return clean
      .split(',')
      .map((group) => group.trim())
      .filter(Boolean);
  }

  async getAutomationMetrics(
    runnerId: string,
    options: {
      intervalMinutes?: number;
      hours?: number;
      selectionScope?: 'test' | 'live';
    } = {},
  ) {
    const intervalMinutes = clampNumber(
      Number(options.intervalMinutes),
      30,
      30,
      60,
    );
    const hours = clampNumber(Number(options.hours), 24, 6, 72);
    const intervalMs = intervalMinutes * 60 * 1000;
    const now = new Date();
    const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const bucketStartMs = Math.floor(since.getTime() / intervalMs) * intervalMs;

    const assignments = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        ...(options.selectionScope === 'test'
          ? { selectedForTest: true }
          : options.selectionScope === 'live'
            ? { selectedForLive: true }
            : {}),
      },
      select: {
        shopId: true,
        autoListEnabled: true,
        autoPostEnabled: true,
        destinationGroup: true,
        shop: { select: { id: true, name: true } },
      },
    });
    const repostingGroups = await this.prisma.runnerRepostingGroup.findMany({
      where: { runnerId, status: 'READY_FOR_REPOSTING' },
      select: {
        id: true,
        whatsappGroupId: true,
        groupName: true,
        isTestGroup: true,
        status: true,
        discoveredGroup: { select: { groupId: true, name: true } },
      },
    });
    const destinationGroupAliases = (group: any) =>
      [
        group.whatsappGroupId,
        group.discoveredGroup?.groupId,
        group.discoveredGroup?.name,
        group.groupName,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    const readyDestinationGroupIds = repostingGroups.flatMap((group) =>
      destinationGroupAliases(group),
    );
    const parseConfiguredDestinationGroups = (value: unknown) => {
      const raw = String(value || '').trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
          : [raw];
      } catch {
        return raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    };
    const shopIds = [...new Set(assignments.map((link) => link.shopId))];
    const shopScopeWhere =
      shopIds.length > 0 ? { shopId: { in: shopIds } } : { shopId: '__none__' };
    const repostLogShopScopeWhere =
      shopIds.length > 0
        ? { listing: { shopId: { in: shopIds } } }
        : { listing: { shopId: '__none__' } };
    const configuredDestinationGroupIds = [
      ...new Set([
        ...assignments.flatMap((assignment) =>
          parseConfiguredDestinationGroups(assignment.destinationGroup),
        ),
        ...readyDestinationGroupIds,
      ]),
    ];

    const [imports, listings, repostLogs, checkpoints, pendingRepostListings] =
      await Promise.all([
        shopIds.length > 0
          ? this.prisma.whatsAppImport.findMany({
              where: {
                shopId: { in: shopIds },
                receivedAt: { gte: new Date(bucketStartMs) },
              },
              select: {
                id: true,
                shopId: true,
                sourceGroup: true,
                status: true,
                receivedAt: true,
                importedAt: true,
              },
            })
          : [],
        this.prisma.runnerListing.findMany({
          where: {
            runnerId,
            ...shopScopeWhere,
            createdAt: { gte: new Date(bucketStartMs) },
          },
          select: {
            id: true,
            shopId: true,
            status: true,
            autoPostApproved: true,
            createdAt: true,
          },
        }),
        this.prisma.whatsAppRepostLog.findMany({
          where: {
            runnerId,
            ...repostLogShopScopeWhere,
            OR: [
              { postedAt: { gte: new Date(bucketStartMs) } },
              { lastAttemptAt: { gte: new Date(bucketStartMs) } },
              { failedAt: { gte: new Date(bucketStartMs) } },
            ],
          },
          select: {
            id: true,
            status: true,
            postedAt: true,
            lastAttemptAt: true,
            failedAt: true,
            captionStatus: true,
            captionVerifiedAt: true,
            captionFallbackSent: true,
            nextRetryAt: true,
            retryCount: true,
            error: true,
            groupIdOrName: true,
            bridgeAccountId: true,
            listing: {
              select: {
                shopId: true,
                shop: { select: { name: true } },
              },
            },
          },
        }),
        shopIds.length > 0
          ? this.prisma.whatsAppCaptureCheckpoint.findMany({
              where: { shopId: { in: shopIds } },
              orderBy: [{ lastScanCompletedAt: 'desc' }, { updatedAt: 'desc' }],
              select: {
                shopId: true,
                groupId: true,
                sourceGroup: true,
                lastFullyCapturedMessageId: true,
                lastFullyCapturedAt: true,
                lastScanStartedAt: true,
                lastScanCompletedAt: true,
                lastScanStatus: true,
                messagesScanned: true,
                productsCaptured: true,
                productsSkipped: true,
                productsFailed: true,
                lastError: true,
              },
            })
          : [],
        this.prisma.runnerListing.findMany({
          where: {
            runnerId,
            ...shopScopeWhere,
            status: 'ACTIVE',
            autoPostApproved: true,
          },
          select: {
            id: true,
            shopId: true,
            createdAt: true,
            maximumListingAgeDays: true,
            product: {
              select: {
                sourceRefreshedAt: true,
                whatsappImports: {
                  select: { receivedAt: true },
                  orderBy: { receivedAt: 'desc' },
                  take: 1,
                },
              },
            },
            repostLogs: {
              select: {
                groupIdOrName: true,
                status: true,
                postedAt: true,
              },
            },
          },
        }),
      ]);
    const autoPostShopIds = new Set(
      assignments
        .filter((assignment) => assignment.autoPostEnabled)
        .map((assignment) => assignment.shopId),
    );
    const pendingRepostCount =
      configuredDestinationGroupIds.length === 0
        ? 0
        : pendingRepostListings.filter((listing) => {
            if (!listing.shopId || !autoPostShopIds.has(listing.shopId)) {
              return false;
            }

            const sourceDate = this.listingSourceDate(listing);
            const maximumAgeMs =
              Math.max(1, Number(listing.maximumListingAgeDays || 14)) *
              24 *
              60 *
              60 *
              1000;
            if (
              !sourceDate ||
              now.getTime() - sourceDate.getTime() > maximumAgeMs
            ) {
              return false;
            }

            return configuredDestinationGroupIds.some((groupId) => {
              const latestLog = listing.repostLogs
                .filter((log) => log.groupIdOrName === groupId)
                .sort(
                  (left, right) =>
                    right.postedAt.getTime() - left.postedAt.getTime(),
                )[0];
              if (!latestLog) return true;
              if (latestLog.status !== 'POSTED') return true;

              return Boolean(
                listing.product.sourceRefreshedAt &&
                listing.product.sourceRefreshedAt.getTime() >
                  latestLog.postedAt.getTime(),
              );
            });
          }).length;

    const checkpointGroupIds = [
      ...new Set(
        checkpoints
          .map((checkpoint) => String(checkpoint.groupId || '').trim())
          .filter(Boolean),
      ),
    ];
    const [checkpointMappings, checkpointDiscoveredGroups, importStats] =
      await Promise.all([
        checkpointGroupIds.length > 0
          ? this.prisma.whatsAppGroupMapping.findMany({
              where: { groupId: { in: checkpointGroupIds } },
              select: { groupId: true, sourceGroup: true, shopId: true },
            })
          : [],
        checkpointGroupIds.length > 0
          ? this.prisma.whatsAppDiscoveredGroup.findMany({
              where: { groupId: { in: checkpointGroupIds } },
              select: { groupId: true, name: true },
            })
          : [],
        shopIds.length > 0
          ? this.prisma.whatsAppImport.groupBy({
              by: ['shopId', 'sourceGroup'],
              where: { shopId: { in: shopIds } },
              _count: { _all: true },
              _max: { receivedAt: true, importedAt: true },
            })
          : [],
      ]);
    const checkpointMappingByGroupId = new Map(
      checkpointMappings.map((mapping) => [mapping.groupId, mapping]),
    );
    const checkpointDiscoveredByGroupId = new Map(
      checkpointDiscoveredGroups.map((group) => [group.groupId, group]),
    );
    const importStatsByShop = new Map<string, typeof importStats>();
    for (const stat of importStats) {
      const list = importStatsByShop.get(stat.shopId) || [];
      list.push(stat);
      importStatsByShop.set(stat.shopId, list);
    }

    const buckets = new Map<string, any>();
    for (
      let startMs = bucketStartMs;
      startMs < now.getTime();
      startMs += intervalMs
    ) {
      const endMs = startMs + intervalMs;
      const key = new Date(startMs).toISOString();
      buckets.set(key, {
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        captured: 0,
        capturePending: 0,
        captureImported: 0,
        captureFailed: 0,
        listingsCreated: 0,
        listingsAutoApproved: 0,
        reposted: 0,
        repostFailed: 0,
        repostRetryAttempts: 0,
        repostRecovered: 0,
        repostStillFailed: 0,
        repostWaitingRetry: 0,
      });
    }

    const bucketFor = (date?: Date | null) => {
      if (!date) return null;
      const startMs = Math.floor(date.getTime() / intervalMs) * intervalMs;
      const key = new Date(startMs).toISOString();
      if (!buckets.has(key)) return null;
      return buckets.get(key);
    };

    for (const item of imports) {
      const bucket = bucketFor(item.receivedAt);
      if (!bucket) continue;
      bucket.captured += 1;
      if (item.status === 'IMPORTED') bucket.captureImported += 1;
      else if (item.status === 'FAILED' || item.status === 'REJECTED') {
        bucket.captureFailed += 1;
      } else {
        bucket.capturePending += 1;
      }
    }

    for (const listing of listings) {
      const bucket = bucketFor(listing.createdAt);
      if (!bucket) continue;
      bucket.listingsCreated += 1;
      if (listing.autoPostApproved) bucket.listingsAutoApproved += 1;
    }

    for (const log of repostLogs) {
      const state = this.repostLogState(log);
      const eventAt = log.lastAttemptAt || log.failedAt || log.postedAt;
      const bucket = bucketFor(eventAt);
      if (!bucket) continue;
      bucket.reposted += state.posted;
      bucket.repostFailed += state.failedAttempts;
      bucket.repostRetryAttempts += state.retryAttempts;
      bucket.repostRecovered += state.recoveredAfterRetry;
      bucket.repostStillFailed += state.stillFailed;
      bucket.repostWaitingRetry += state.waitingRetry;
    }

    const latestCaptureAt =
      imports
        .map((item) => item.receivedAt?.getTime() || 0)
        .sort((a, b) => b - a)[0] || null;
    const latestRepostAt =
      repostLogs
        .map(
          (item) =>
            item.lastAttemptAt?.getTime() ||
            item.failedAt?.getTime() ||
            item.postedAt?.getTime() ||
            0,
        )
        .sort((a, b) => b - a)[0] || null;

    const totals = [...buckets.values()].reduce(
      (acc, bucket) => ({
        captured: acc.captured + bucket.captured,
        captureImported: acc.captureImported + bucket.captureImported,
        capturePending: acc.capturePending + bucket.capturePending,
        captureFailed: acc.captureFailed + bucket.captureFailed,
        listingsCreated: acc.listingsCreated + bucket.listingsCreated,
        listingsAutoApproved:
          acc.listingsAutoApproved + bucket.listingsAutoApproved,
        reposted: acc.reposted + bucket.reposted,
        repostFailed: acc.repostFailed + bucket.repostFailed,
        repostRetryAttempts:
          acc.repostRetryAttempts + bucket.repostRetryAttempts,
        repostRecovered: acc.repostRecovered + bucket.repostRecovered,
        repostStillFailed: acc.repostStillFailed + bucket.repostStillFailed,
        repostWaitingRetry: acc.repostWaitingRetry + bucket.repostWaitingRetry,
      }),
      {
        captured: 0,
        captureImported: 0,
        capturePending: 0,
        captureFailed: 0,
        listingsCreated: 0,
        listingsAutoApproved: 0,
        reposted: 0,
        repostFailed: 0,
        repostRetryAttempts: 0,
        repostRecovered: 0,
        repostStillFailed: 0,
        repostWaitingRetry: 0,
      },
    );

    const rollingMonthStart = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const [historicalSuccessfulReposts, runnerPostingSettings] =
      await Promise.all([
        this.prisma.whatsAppRepostLog.findMany({
          where: {
            runnerId,
            ...repostLogShopScopeWhere,
            status: 'POSTED',
            postedAt: { gte: rollingMonthStart, lte: now },
          },
          select: {
            postedAt: true,
            groupIdOrName: true,
          },
        }),
        this.prisma.runner.findUnique({
          where: { id: runnerId },
          select: {
            autoPostIntervalMinutes: true,
            maxPostsPerRun: true,
          },
        }),
      ]);

    const configuredIntervalMinutes = safeAutoRepostIntervalMinutes(
      runnerPostingSettings?.autoPostIntervalMinutes,
    );
    const configuredMaxPostsPerRun = safeMaxPostsPerRun(
      runnerPostingSettings?.maxPostsPerRun,
    );
    const configuredIntervalMs = configuredIntervalMinutes * 60 * 1000;
    const roundMetric = (value: number) => Math.round(value * 10) / 10;
    const buildPostingPeriod = (key: string, label: string, days: number) => {
      const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const logs = historicalSuccessfulReposts.filter(
        (log) => log.postedAt >= from && log.postedAt <= now,
      );
      const activeDays = new Set(
        logs.map((log) => log.postedAt.toISOString().slice(0, 10)),
      );
      const postingSlots = new Set(
        logs.map((log) =>
          String(Math.floor(log.postedAt.getTime() / configuredIntervalMs)),
        ),
      );
      const destinationGroups = new Set(
        logs
          .map((log) => String(log.groupIdOrName || '').trim())
          .filter(Boolean),
      );
      const total = logs.length;
      const averagePerDay = total / days;
      const averagePerActiveDay =
        activeDays.size > 0 ? total / activeDays.size : 0;
      const averagePerPostingSlot =
        postingSlots.size > 0 ? total / postingSlots.size : 0;

      return {
        key,
        label,
        from: from.toISOString(),
        to: now.toISOString(),
        days,
        total,
        activeDays: activeDays.size,
        postingSlots: postingSlots.size,
        destinationGroups: destinationGroups.size,
        averagePerDay: roundMetric(averagePerDay),
        averagePerActiveDay: roundMetric(averagePerActiveDay),
        averagePerPostingSlot: roundMetric(averagePerPostingSlot),
        averageSlotUtilizationPercent: roundMetric(
          (averagePerPostingSlot / configuredMaxPostsPerRun) * 100,
        ),
      };
    };
    const postingTrends = {
      definition:
        'One post is one successfully reposted listing delivered to one destination group. Failed attempts and retries are excluded.',
      currentSettings: {
        intervalMinutes: configuredIntervalMinutes,
        maxPostsPerRun: configuredMaxPostsPerRun,
      },
      periods: [
        buildPostingPeriod('DAILY', 'Last 24 hours', 1),
        buildPostingPeriod('WEEKLY', 'Last 7 days', 7),
        buildPostingPeriod('MONTHLY', 'Last 30 days', 30),
      ],
    };

    const shopNameById = new Map(
      assignments.map((assignment) => [
        assignment.shopId,
        assignment.shop.name,
      ]),
    );
    const destinationRefs = [
      ...new Set([
        ...repostLogs
          .map((log) => String(log.groupIdOrName || '').trim())
          .filter(Boolean),
        ...configuredDestinationGroupIds,
      ]),
    ];
    const destinationGroupIds = destinationRefs.filter((group) =>
      group.endsWith('@g.us'),
    );
    const [discoveredDestinations, mappedDestinations] =
      destinationGroupIds.length > 0
        ? await Promise.all([
            this.prisma.whatsAppDiscoveredGroup.findMany({
              where: { groupId: { in: destinationGroupIds } },
              select: { groupId: true, name: true },
            }),
            this.prisma.whatsAppGroupMapping.findMany({
              where: { groupId: { in: destinationGroupIds } },
              select: { groupId: true, sourceGroup: true },
            }),
          ])
        : [[], []];
    const destinationNameById = new Map<string, string>();
    for (const group of mappedDestinations) {
      destinationNameById.set(group.groupId, group.sourceGroup);
    }
    for (const group of discoveredDestinations) {
      destinationNameById.set(group.groupId, group.name);
    }
    for (const group of repostingGroups) {
      const displayName =
        group.discoveredGroup?.name ||
        group.groupName ||
        group.whatsappGroupId ||
        group.discoveredGroup?.groupId ||
        'Posting group';
      for (const alias of destinationGroupAliases(group)) {
        destinationNameById.set(alias, displayName);
      }
    }

    const lastCompletedHourEndMs =
      Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000;
    const lastCompletedHourStartMs = lastCompletedHourEndMs - 60 * 60 * 1000;
    const lastCompletedHourStart = new Date(lastCompletedHourStartMs);
    const lastCompletedHourEnd = new Date(lastCompletedHourEndMs);
    const sourceGroupIdByShopAndName = new Map<string, string>();
    for (const checkpoint of checkpoints) {
      if (!checkpoint.sourceGroup) continue;
      sourceGroupIdByShopAndName.set(
        `${checkpoint.shopId}:${checkpoint.sourceGroup}`,
        checkpoint.groupId,
      );
    }

    const captureByGroup = new Map<string, any>();
    for (const item of imports) {
      const time = item.receivedAt?.getTime() || 0;
      if (time < lastCompletedHourStartMs || time >= lastCompletedHourEndMs) {
        continue;
      }
      const shopName = shopNameById.get(item.shopId) || 'Unknown shop';
      const groupName = item.sourceGroup || shopName;
      const key = `${item.shopId}:${groupName}`;
      const row = captureByGroup.get(key) || {
        shopId: item.shopId,
        shopName,
        groupName,
        groupId: sourceGroupIdByShopAndName.get(`${item.shopId}:${groupName}`),
        captured: 0,
        imported: 0,
        pending: 0,
        failed: 0,
      };
      row.captured += 1;
      if (item.status === 'IMPORTED') row.imported += 1;
      else if (item.status === 'FAILED' || item.status === 'REJECTED') {
        row.failed += 1;
      } else {
        row.pending += 1;
      }
      captureByGroup.set(key, row);
    }

    const repostByGroup = new Map<string, any>();
    for (const log of repostLogs) {
      const eventAt = log.lastAttemptAt || log.failedAt || log.postedAt;
      const time = eventAt?.getTime() || 0;
      if (time < lastCompletedHourStartMs || time >= lastCompletedHourEndMs) {
        continue;
      }
      const shopId = log.listing?.shopId || 'unknown';
      const shopName = log.listing?.shop?.name || 'Unknown shop';
      const groupIdOrName = String(log.groupIdOrName || '').trim();
      const groupName =
        destinationNameById.get(groupIdOrName) ||
        groupIdOrName ||
        'Unknown destination';
      const groupId = groupIdOrName.endsWith('@g.us') ? groupIdOrName : null;
      const key = `${shopId}:${groupIdOrName || groupName}`;
      const row = repostByGroup.get(key) || {
        shopId,
        shopName,
        groupName,
        groupId,
        groupIdOrName,
        posted: 0,
        failedAttempts: 0,
        retryAttempts: 0,
        recovered: 0,
        stillFailed: 0,
        waitingRetry: 0,
      };
      const state = this.repostLogState(log);
      row.posted += state.posted;
      row.failedAttempts += state.failedAttempts;
      row.retryAttempts += state.retryAttempts;
      row.recovered += state.recoveredAfterRetry;
      row.stillFailed += state.stillFailed;
      row.waitingRetry += state.waitingRetry;
      repostByGroup.set(key, row);
    }

    const captureBySourceGroup = new Map<string, any>();
    const shopTotals = new Map<string, any>();
    for (const assignment of assignments) {
      shopTotals.set(assignment.shopId, {
        shopId: assignment.shopId,
        shopName: assignment.shop.name,
        autoListEnabled: assignment.autoListEnabled,
        autoPostEnabled: assignment.autoPostEnabled,
        captured: 0,
        imported: 0,
        pending: 0,
        captureFailed: 0,
        listingsCreated: 0,
        listingsAutoApproved: 0,
        reposted: 0,
        repostFailed: 0,
        repostRetryAttempts: 0,
        repostRecovered: 0,
        repostStillFailed: 0,
        repostWaitingRetry: 0,
      });
    }

    for (const item of imports) {
      const shopName = shopNameById.get(item.shopId) || 'Unknown shop';
      const groupName = item.sourceGroup || shopName;
      const groupId = sourceGroupIdByShopAndName.get(
        `${item.shopId}:${groupName}`,
      );
      const key = `${item.shopId}:${groupName}`;
      const row = captureBySourceGroup.get(key) || {
        shopId: item.shopId,
        shopName,
        groupName,
        groupId,
        captured: 0,
        imported: 0,
        pending: 0,
        failed: 0,
      };
      const shopTotal =
        shopTotals.get(item.shopId) ||
        shopTotals
          .set(item.shopId, {
            shopId: item.shopId,
            shopName,
            autoListEnabled: false,
            autoPostEnabled: false,
            captured: 0,
            imported: 0,
            pending: 0,
            captureFailed: 0,
            listingsCreated: 0,
            listingsAutoApproved: 0,
            reposted: 0,
            repostFailed: 0,
            repostRetryAttempts: 0,
            repostRecovered: 0,
            repostStillFailed: 0,
            repostWaitingRetry: 0,
          })
          .get(item.shopId);

      row.captured += 1;
      shopTotal.captured += 1;
      if (item.status === 'IMPORTED') {
        row.imported += 1;
        shopTotal.imported += 1;
      } else if (item.status === 'FAILED' || item.status === 'REJECTED') {
        row.failed += 1;
        shopTotal.captureFailed += 1;
      } else {
        row.pending += 1;
        shopTotal.pending += 1;
      }
      captureBySourceGroup.set(key, row);
    }

    for (const listing of listings) {
      const shopId = listing.shopId || 'unknown';
      const shopTotal =
        shopTotals.get(shopId) ||
        shopTotals
          .set(shopId, {
            shopId,
            shopName: shopNameById.get(shopId) || 'Unknown shop',
            autoListEnabled: false,
            autoPostEnabled: false,
            captured: 0,
            imported: 0,
            pending: 0,
            captureFailed: 0,
            listingsCreated: 0,
            listingsAutoApproved: 0,
            reposted: 0,
            repostFailed: 0,
            repostRetryAttempts: 0,
            repostRecovered: 0,
            repostStillFailed: 0,
            repostWaitingRetry: 0,
          })
          .get(shopId);
      shopTotal.listingsCreated += 1;
      if (listing.autoPostApproved) shopTotal.listingsAutoApproved += 1;
    }

    const repostByDestinationGroup = new Map<string, any>();
    for (const log of repostLogs) {
      const shopId = log.listing?.shopId || 'unknown';
      const shopName = log.listing?.shop?.name || 'Unknown shop';
      const groupIdOrName = String(log.groupIdOrName || '').trim();
      const groupName =
        destinationNameById.get(groupIdOrName) ||
        groupIdOrName ||
        'Unknown destination';
      const groupId = groupIdOrName.endsWith('@g.us') ? groupIdOrName : null;
      const key = `${shopId}:${groupIdOrName || groupName}`;
      const row = repostByDestinationGroup.get(key) || {
        shopId,
        shopName,
        groupName,
        groupId,
        groupIdOrName,
        posted: 0,
        failedAttempts: 0,
        retryAttempts: 0,
        recovered: 0,
        stillFailed: 0,
        waitingRetry: 0,
      };
      const shopTotal =
        shopTotals.get(shopId) ||
        shopTotals
          .set(shopId, {
            shopId,
            shopName,
            autoListEnabled: false,
            autoPostEnabled: false,
            captured: 0,
            imported: 0,
            pending: 0,
            captureFailed: 0,
            listingsCreated: 0,
            listingsAutoApproved: 0,
            reposted: 0,
            repostFailed: 0,
            repostRetryAttempts: 0,
            repostRecovered: 0,
            repostStillFailed: 0,
            repostWaitingRetry: 0,
          })
          .get(shopId);
      const state = this.repostLogState(log);
      row.posted += state.posted;
      row.failedAttempts += state.failedAttempts;
      row.retryAttempts += state.retryAttempts;
      row.recovered += state.recoveredAfterRetry;
      row.stillFailed += state.stillFailed;
      row.waitingRetry += state.waitingRetry;
      shopTotal.reposted += state.posted;
      shopTotal.repostFailed += state.failedAttempts;
      shopTotal.repostRetryAttempts += state.retryAttempts;
      shopTotal.repostRecovered += state.recoveredAfterRetry;
      shopTotal.repostStillFailed += state.stillFailed;
      shopTotal.repostWaitingRetry += state.waitingRetry;
      repostByDestinationGroup.set(key, row);
    }

    const repostingGroupByAlias = new Map<string, any>();
    const repostByRepostingGroup = new Map<string, any>();
    const ensureRepostingGroupMetric = (
      key: string,
      group?: any,
      raw?: string,
    ) => {
      const aliases = group ? destinationGroupAliases(group) : [];
      const primaryRef =
        aliases.find((alias) => alias.endsWith('@g.us')) || raw || key;
      const groupName = group
        ? destinationNameById.get(primaryRef) ||
          group.discoveredGroup?.name ||
          group.groupName ||
          primaryRef
        : destinationNameById.get(String(raw || '').trim()) ||
          raw ||
          'Unknown destination';
      const row = repostByRepostingGroup.get(key) || {
        id: group?.id || key,
        groupName,
        groupId: primaryRef && primaryRef.endsWith('@g.us') ? primaryRef : null,
        groupIdOrName: primaryRef,
        role: group
          ? group.isTestGroup
            ? 'Primary'
            : 'Additional'
          : 'Unknown',
        status: group?.status || 'LOGGED_ONLY',
        shopsPosted: 0,
        shopIds: new Set<string>(),
        posted: 0,
        failedAttempts: 0,
        retryAttempts: 0,
        recovered: 0,
        stillFailed: 0,
        waitingRetry: 0,
        latestRepostAt: null,
      };
      repostByRepostingGroup.set(key, row);
      return row;
    };
    for (const group of repostingGroups) {
      for (const alias of destinationGroupAliases(group)) {
        repostingGroupByAlias.set(alias, group);
      }
      ensureRepostingGroupMetric(group.id, group);
    }
    for (const log of repostLogs) {
      const groupIdOrName = String(log.groupIdOrName || '').trim();
      const group = repostingGroupByAlias.get(groupIdOrName);
      const key = group?.id || groupIdOrName || 'unknown';
      const row = ensureRepostingGroupMetric(key, group, groupIdOrName);
      const state = this.repostLogState(log);
      row.posted += state.posted;
      row.failedAttempts += state.failedAttempts;
      row.retryAttempts += state.retryAttempts;
      row.recovered += state.recoveredAfterRetry;
      row.stillFailed += state.stillFailed;
      row.waitingRetry += state.waitingRetry;
      const shopId = log.listing?.shopId;
      if (shopId) row.shopIds.add(shopId);
      const eventAt = log.lastAttemptAt || log.failedAt || log.postedAt;
      if (eventAt && (!row.latestRepostAt || eventAt > row.latestRepostAt)) {
        row.latestRepostAt = eventAt;
      }
    }
    const repostByRepostingGroupRows = [...repostByRepostingGroup.values()].map(
      (row) => ({
        ...row,
        shopsPosted: row.shopIds.size,
        shopIds: undefined,
        latestRepostAt: row.latestRepostAt
          ? row.latestRepostAt.toISOString()
          : null,
      }),
    );

    const byShopSort = (a: any, b: any) =>
      String(a.shopName).localeCompare(String(b.shopName)) ||
      String(a.groupName || '').localeCompare(String(b.groupName || ''));

    const checkpointImportSummary = (checkpoint: any) => {
      const mapping = checkpointMappingByGroupId.get(checkpoint.groupId);
      const discovered = checkpointDiscoveredByGroupId.get(checkpoint.groupId);
      const displayName =
        mapping?.sourceGroup ||
        discovered?.name ||
        checkpoint.sourceGroup ||
        checkpoint.groupId;
      const candidates = new Set(
        [
          checkpoint.sourceGroup,
          checkpoint.groupId,
          mapping?.sourceGroup,
          discovered?.name,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      );
      const stats = importStatsByShop.get(checkpoint.shopId) || [];
      const matchedStats = stats.filter((stat) =>
        candidates.has(String(stat.sourceGroup || '').trim()),
      );
      const sourceStats = matchedStats.length > 0 ? matchedStats : [];
      const totalImported = sourceStats.reduce(
        (sum, stat) => sum + Number(stat._count?._all || 0),
        0,
      );
      const latestImportAt = sourceStats.reduce<Date | null>((latest, stat) => {
        const value = stat._max?.receivedAt || stat._max?.importedAt || null;
        if (!value) return latest;
        if (!latest || value.getTime() > latest.getTime()) return value;
        return latest;
      }, null);

      return {
        sourceGroupName: displayName,
        totalImported,
        latestImportAt: latestImportAt ? latestImportAt.toISOString() : null,
      };
    };

    return {
      scope: { type: 'RUNNER', runnerId },
      selectionScope: options.selectionScope || 'all',
      intervalMinutes,
      hours,
      generatedAt: now.toISOString(),
      range: {
        from: new Date(bucketStartMs).toISOString(),
        to: now.toISOString(),
      },
      lastCompletedHour: {
        from: lastCompletedHourStart.toISOString(),
        to: lastCompletedHourEnd.toISOString(),
        captureByGroup: [...captureByGroup.values()].sort(byShopSort),
        repostByGroup: [...repostByGroup.values()].sort(byShopSort),
      },
      shopGroupMetrics: {
        from: new Date(bucketStartMs).toISOString(),
        to: now.toISOString(),
        shopTotals: [...shopTotals.values()].sort((a, b) =>
          String(a.shopName).localeCompare(String(b.shopName)),
        ),
        captureBySourceGroup: [...captureBySourceGroup.values()].sort(
          byShopSort,
        ),
        repostByDestinationGroup: [...repostByDestinationGroup.values()].sort(
          byShopSort,
        ),
        repostByRepostingGroup: repostByRepostingGroupRows.sort(
          (a, b) =>
            String(a.role).localeCompare(String(b.role)) ||
            String(a.groupName).localeCompare(String(b.groupName)),
        ),
      },
      postingTrends,
      shops: assignments.map((assignment) => ({
        id: assignment.shop.id,
        name: assignment.shop.name,
        autoListEnabled: assignment.autoListEnabled,
        autoPostEnabled: assignment.autoPostEnabled,
        destinationGroup: assignment.destinationGroup,
      })),
      summary: {
        ...totals,
        approvedShops: assignments.length,
        pendingAutoPostListings: pendingRepostCount,
        latestCaptureAt: latestCaptureAt
          ? new Date(latestCaptureAt).toISOString()
          : null,
        latestRepostAt: latestRepostAt
          ? new Date(latestRepostAt).toISOString()
          : null,
      },
      checkpoints: checkpoints.map((checkpoint) => ({
        ...checkpoint,
        shopName:
          assignments.find(
            (assignment) => assignment.shopId === checkpoint.shopId,
          )?.shop.name || 'Unknown shop',
        ...checkpointImportSummary(checkpoint),
      })),
      buckets: [...buckets.values()],
    };
  }

  async updateProfile(userId: string, dto: UpdateRunnerProfileDto) {
    const runner = await this.prisma.runner.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!runner) {
      throw new NotFoundException('Runner profile not found');
    }

    const cleanOptional = (value?: string) => {
      if (value === undefined) return undefined;
      const trimmed = String(value).trim();
      return trimmed || null;
    };

    const cleanRequired = (value: string | undefined, label: string) => {
      if (value === undefined) return undefined;
      const trimmed = String(value).trim();
      if (!trimmed) {
        throw new BadRequestException(`${label} cannot be blank`);
      }
      return trimmed;
    };

    const name = cleanRequired(dto.name, 'Name');
    const phone = cleanRequired(dto.phone, 'Phone number');
    if (
      String((dto as any).repostPriceMode || '').toUpperCase() ===
      'FEE_BREAKDOWN'
    ) {
      throw new BadRequestException(
        'Fee breakdown captions are temporarily suspended. Use TOTAL_ONLY or STOCK_EACH_TOTALS.',
      );
    }

    const existingPhase1Setup =
      runner.phase1Setup &&
      typeof runner.phase1Setup === 'object' &&
      !Array.isArray(runner.phase1Setup)
        ? (runner.phase1Setup as Record<string, unknown>)
        : {};

    if (phone) {
      const existingUser = await this.prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Phone number is already in use');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (name !== undefined || phone !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(phone !== undefined ? { phone } : {}),
          },
        });
      }

      await tx.runner.update({
        where: { id: runner.id },
        data: {
          ...(dto.vehicleType !== undefined
            ? { vehicleType: cleanOptional(dto.vehicleType) }
            : {}),
          ...(dto.vehicleNumber !== undefined
            ? { vehicleNumber: cleanOptional(dto.vehicleNumber) }
            : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(dto.serviceArea !== undefined
            ? { serviceArea: cleanOptional(dto.serviceArea) }
            : {}),
          ...(dto.whatsappGroup !== undefined
            ? { whatsappGroup: cleanOptional(dto.whatsappGroup) }
            : {}),
          ...(dto.autoPostEnabled !== undefined
            ? { autoPostEnabled: Boolean(dto.autoPostEnabled) }
            : {}),
          ...(dto.autoPostIntervalMinutes !== undefined
            ? {
                autoPostIntervalMinutes: safeAutoRepostIntervalMinutes(
                  dto.autoPostIntervalMinutes,
                ),
              }
            : {}),
          ...(dto.maxPostsPerRun !== undefined
            ? { maxPostsPerRun: safeMaxPostsPerRun(dto.maxPostsPerRun) }
            : {}),
          ...(dto.repostPriceMode !== undefined
            ? { repostPriceMode: dto.repostPriceMode }
            : {}),
          ...(dto.repostOrderDetailsEnabled !== undefined
            ? {
                repostOrderDetailsEnabled: Boolean(
                  dto.repostOrderDetailsEnabled,
                ),
              }
            : {}),
          ...(dto.repostFeePercentageEnabled !== undefined
            ? {
                repostFeePercentageEnabled: Boolean(
                  dto.repostFeePercentageEnabled,
                ),
              }
            : {}),
          ...(dto.repostOriginalPricePerImageEnabled !== undefined
            ? {
                phase1Setup: {
                  ...existingPhase1Setup,
                  repostOriginalPricePerImageEnabled: Boolean(
                    dto.repostOriginalPricePerImageEnabled,
                  ),
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    });

    return this.getRunnerByUserId(userId);
  }

  async applyRepostPriceFormat(userId: string, dto: ApplyRepostPriceFormatDto) {
    const runner = await this.prisma.runner.findUnique({
      where: { userId },
      select: { id: true, repostPriceMode: true },
    });

    if (!runner) {
      throw new NotFoundException('Runner profile not found');
    }
    if (
      String((dto as any).repostPriceMode || '').toUpperCase() ===
      'FEE_BREAKDOWN'
    ) {
      throw new BadRequestException(
        'Fee breakdown captions are temporarily suspended. Use TOTAL_ONLY or STOCK_EACH_TOTALS.',
      );
    }

    const repostPriceMode = dto.repostPriceMode || runner.repostPriceMode;
    const now = new Date();

    const applyResult = await this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.runner.update({
        where: { id: runner.id },
        data: { repostPriceMode },
      });
      const pending = await tx.runnerListing.count({
        where: {
          runnerId: runner.id,
          status: 'ACTIVE',
          autoPostApproved: true,
          lastPostedAt: null,
        },
      });
      const refreshed = await tx.runnerListing.updateMany({
        where: {
          runnerId: runner.id,
          status: 'ACTIVE',
          autoPostApproved: true,
          lastPostedAt: null,
        },
        data: { updatedAt: now },
      });
      const retried = await tx.whatsAppRepostLog.updateMany({
        where: {
          runnerId: runner.id,
          status: 'FAILED',
          listing: {
            status: 'ACTIVE',
            autoPostApproved: true,
          },
        },
        data: {
          retryCount: 0,
          nextRetryAt: now,
          captionStatus: 'UNKNOWN',
          captionVerifiedAt: null,
          captionFallbackSent: false,
        },
      });

      return {
        profile: updatedProfile,
        pendingListings: pending,
        refreshedListings: refreshed.count,
        retriedFailures: retried.count,
      };
    });

    return {
      repostPriceMode: applyResult.profile.repostPriceMode,
      pendingListings: applyResult.pendingListings,
      refreshedListings: applyResult.refreshedListings,
      retriedFailures: applyResult.retriedFailures,
      message: `Applied ${applyResult.profile.repostPriceMode} to ${applyResult.pendingListings} pending repost${applyResult.pendingListings === 1 ? '' : 's'}`,
    };
  }

  /**
   * Get runner's listings with products
   */
  async getListingSummary(runnerId: string) {
    const listings = await this.prisma.runnerListing.findMany({
      where: { runnerId, status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        status: true,
        autoPostApproved: true,
        lastPostedAt: true,
        createdAt: true,
        product: {
          select: {
            shop: { select: { id: true, name: true } },
            whatsappImports: {
              select: { receivedAt: true },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
        repostLogs: {
          where: { status: 'FAILED' },
          select: { id: true },
          take: 1,
        },
      },
    });
    const now = Date.now();
    const recentCutoff = now - 24 * 60 * 60 * 1000;
    const oldCutoff = now - 14 * 24 * 60 * 60 * 1000;
    const active = listings.filter((item) => item.status === 'ACTIVE');
    const byShop = new Map<
      string,
      { shopId: string; shopName: string; count: number }
    >();
    for (const listing of active) {
      const shop = listing.product.shop;
      const current = byShop.get(shop.id) || {
        shopId: shop.id,
        shopName: shop.name,
        count: 0,
      };
      current.count += 1;
      byShop.set(shop.id, current);
    }
    return {
      totalActive: active.length,
      paused: listings.filter(
        (item) =>
          item.status === 'PAUSED' ||
          (item.status === 'ACTIVE' && !item.autoPostApproved),
      ).length,
      pendingReposting: active.filter(
        (item) => item.autoPostApproved && !item.lastPostedAt,
      ).length,
      recentlyReposted: active.filter(
        (item) =>
          item.lastPostedAt && item.lastPostedAt.getTime() >= recentCutoff,
      ).length,
      requiringAttention: active.filter((item) => item.repostLogs.length > 0)
        .length,
      oldProducts: active.filter((item) => {
        const capturedAt =
          item.product.whatsappImports[0]?.receivedAt || item.createdAt;
        return capturedAt.getTime() < oldCutoff;
      }).length,
      byShop: [...byShop.values()].sort((a, b) => b.count - a.count),
    };
  }

  async getListingRepostStatus(runnerId: string, destinationGroup?: string) {
    const requested = String(destinationGroup || '').trim();
    if (!requested) {
      return {
        scope: { type: 'RUNNER', runnerId },
        destinationGroup: null,
        destinationName: null,
        eligible: 0,
        posted: 0,
        notPosted: 0,
      };
    }

    const discovered = await this.prisma.whatsAppDiscoveredGroup.findFirst({
      where: {
        OR: [{ groupId: requested }, { name: requested }],
      },
      select: { groupId: true, name: true },
    });
    const canonicalGroup = discovered?.groupId || requested;
    const aliases = [
      ...new Set(
        [requested, discovered?.groupId, discovered?.name].filter(
          Boolean,
        ) as string[],
      ),
    ];
    const eligible = await this.prisma.runnerListing.findMany({
      where: {
        runnerId,
        status: 'ACTIVE',
        autoPostApproved: true,
      },
      select: {
        id: true,
        repostLogs: {
          where: {
            status: 'POSTED',
            groupIdOrName: { in: aliases },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    const posted = eligible.filter(
      (listing) => listing.repostLogs.length > 0,
    ).length;

    return {
      scope: { type: 'RUNNER', runnerId },
      destinationGroup: canonicalGroup,
      destinationName: discovered?.name || requested,
      eligible: eligible.length,
      posted,
      notPosted: eligible.length - posted,
    };
  }

  async getListings(
    runnerId: string,
    options?: {
      search?: string;
      page?: number;
      limit?: number;
      paginated?: boolean;
      capturedFrom?: string;
      capturedTo?: string;
      status?: string;
      captionIssue?: boolean;
    },
  ) {
    await this.ensureOrderCodesForRunner(runnerId);

    const search = String(options?.search || '').trim();
    const page = Math.max(1, Number(options?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(options?.limit || 40)));
    const paginated = Boolean(options?.paginated);
    const where: Prisma.RunnerListingWhereInput = { runnerId };
    if (options?.status) where.status = String(options.status).toUpperCase();
    if (options?.captionIssue) {
      where.repostLogs = {
        some: {
          OR: [
            {
              captionStatus: {
                in: ['UNKNOWN', 'FAILED', 'ATTACHED_UNVERIFIED'],
              },
            },
            { status: 'FAILED' },
          ],
        },
      };
    }
    const capturedFrom = this.validDate(options?.capturedFrom);
    const capturedTo = this.validDate(options?.capturedTo);
    const capturedDateRange = {
      ...(capturedFrom ? { gte: capturedFrom } : {}),
      ...(capturedTo ? { lte: capturedTo } : {}),
    };

    if (Object.keys(capturedDateRange).length > 0) {
      where.OR = [
        { createdAt: capturedDateRange },
        { product: { sourceRefreshedAt: capturedDateRange } },
        {
          product: {
            whatsappImports: {
              some: { receivedAt: capturedDateRange },
            },
          },
        },
      ];
    }

    if (search) {
      const searchedCaptureDay = /^\d{4}-\d{2}-\d{2}$/.test(search)
        ? {
            gte: new Date(`${search}T00:00:00.000Z`),
            lte: new Date(`${search}T23:59:59.999Z`),
          }
        : null;
      where.AND = [
        {
          OR: [
            { orderCode: { contains: search, mode: 'insensitive' } },
            {
              product: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
            {
              product: {
                description: { contains: search, mode: 'insensitive' },
              },
            },
            {
              product: {
                category: { contains: search, mode: 'insensitive' },
              },
            },
            {
              product: {
                shop: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
            {
              product: {
                whatsappImports: {
                  some: {
                    sourceGroup: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            },
            {
              product: {
                whatsappImports: {
                  some: {
                    caption: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            },
            {
              repostLogs: {
                some: {
                  groupIdOrName: { contains: search, mode: 'insensitive' },
                },
              },
            },
            {
              runner: {
                user: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
            {
              runner: {
                phone: { contains: search, mode: 'insensitive' },
              },
            },
            ...(searchedCaptureDay
              ? [
                  { createdAt: searchedCaptureDay },
                  { product: { sourceRefreshedAt: searchedCaptureDay } },
                  {
                    product: {
                      whatsappImports: {
                        some: { receivedAt: searchedCaptureDay },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      ];
    }

    const total = paginated
      ? await this.prisma.runnerListing.count({ where })
      : undefined;

    const listings = await this.prisma.runnerListing.findMany({
      where,
      include: {
        product: {
          include: {
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
                parsedDraft: true,
                sourceGroup: true,
                importedAt: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
        repostLogs: {
          select: {
            id: true,
            groupIdOrName: true,
            status: true,
            postedAt: true,
            jobId: true,
            bridgeAccountId: true,
            lastAttemptAt: true,
            failedAt: true,
            captionStatus: true,
            captionVerifiedAt: true,
            captionFallbackSent: true,
          },
          orderBy: { postedAt: 'desc' },
          take: 20,
        },
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
      orderBy: { createdAt: 'desc' },
      ...(paginated
        ? {
            skip: (page - 1) * limit,
            take: limit,
          }
        : {}),
    });

    const rawGroups = [
      ...new Set(
        listings.flatMap((listing) =>
          listing.repostLogs.map((log) => log.groupIdOrName),
        ),
      ),
    ];
    const discoveredGroups = rawGroups.length
      ? await this.prisma.whatsAppDiscoveredGroup.findMany({
          where: { groupId: { in: rawGroups } },
          select: { groupId: true, name: true },
        })
      : [];
    const groupNames = new Map(
      discoveredGroups.map((group) => [group.groupId, group.name]),
    );

    const data = listings.map((listing) => {
      const sourcePost = listing.product.whatsappImports[0] || null;
      const sourceDate = this.listingSourceDate(listing);
      const postedLog =
        listing.repostLogs.find((log) => log.status === 'POSTED') ||
        listing.repostLogs[0] ||
        null;

      return {
        ...listing,
        repostLogs: listing.repostLogs.map((log) => ({
          ...log,
          groupId: log.groupIdOrName.includes('@g.us')
            ? log.groupIdOrName
            : null,
          groupName:
            groupNames.get(log.groupIdOrName) ||
            (log.groupIdOrName.includes('@g.us')
              ? 'Unknown WhatsApp Group'
              : log.groupIdOrName),
        })),
        searchMeta: {
          shopName:
            listing.shop?.name || listing.product.shop?.name || 'Unknown shop',
          sourceGroup: sourcePost?.sourceGroup || null,
          runnerName:
            listing.runner.user?.name ||
            listing.runner.phone ||
            listing.runner.user?.email ||
            'Runner',
          capturedAt: sourceDate,
          repostedAt: postedLog?.postedAt || listing.lastPostedAt || null,
          repostedGroup: postedLog
            ? groupNames.get(postedLog.groupIdOrName) ||
              (postedLog.groupIdOrName.includes('@g.us')
                ? 'Unknown WhatsApp Group'
                : postedLog.groupIdOrName)
            : null,
          repostedGroupId: postedLog?.groupIdOrName || null,
        },
      };
    });

    if (!paginated) {
      return data;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
        hasMore: page * limit < (total || 0),
      },
    };
  }

  private validDate(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private listingSourceDate(listing: {
    createdAt?: Date | string | null;
    product?: {
      sourceRefreshedAt?: Date | string | null;
      whatsappImports?: Array<{ receivedAt?: Date | string | null }>;
    } | null;
  }) {
    const candidates = [
      listing.product?.sourceRefreshedAt,
      listing.product?.whatsappImports?.[0]?.receivedAt,
      listing.createdAt,
    ]
      .map((value) => (value ? new Date(value) : null))
      .filter((value): value is Date => {
        if (!value) return false;
        return !Number.isNaN(value.getTime());
      })
      .sort((left, right) => right.getTime() - left.getTime());

    return candidates[0] || null;
  }

  /**
   * Create or update a listing (add markup to product)
   */
  async createOrUpdateListing(
    runnerId: string,
    productId: string,
    markup: number,
  ) {
    // Validate markup (0-100%)
    if (markup < 0 || markup > 1) {
      throw new NotFoundException('Markup must be between 0 and 1 (0-100%)');
    }

    // Get product base price
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const approvedShop = await this.prisma.runnerShopLink.findUnique({
      where: {
        runnerId_shopId: {
          runnerId,
          shopId: product.shopId,
        },
      },
    });

    if (!approvedShop || approvedShop.status !== 'APPROVED') {
      throw new ForbiddenException(
        'You can only promote products from approved shops',
      );
    }

    const suppressed = await this.prisma.runnerListingSuppression.findUnique({
      where: {
        runnerId_productId: {
          runnerId,
          productId,
        },
      },
      select: { reason: true },
    });
    if (suppressed) {
      throw new BadRequestException(
        suppressed.reason || 'Runner has marked this product as do not buy',
      );
    }

    // Calculate runner price with markup
    const runnerPrice = product.basePrice * (1 + markup);

    // Upsert listing
    const listing = await this.prisma.runnerListing.upsert({
      where: {
        runnerId_productId: {
          runnerId,
          productId,
        },
      },
      update: {
        markup,
        runnerPrice,
        status: 'ACTIVE',
        shopId: product.shopId,
      },
      create: {
        runnerId,
        productId,
        shopId: product.shopId,
        markup,
        runnerPrice,
        status: 'ACTIVE',
        orderCode: this.createOrderCode(),
      },
      include: {
        product: {
          include: {
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
                parsedDraft: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!listing.orderCode) {
      return this.assignOrderCodeToListing(listing.id, {
        product: {
          include: {
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
                parsedDraft: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      });
    }

    return listing;
  }

  async updateListingAutoPost(
    runnerId: string,
    listingId: string,
    autoPostApproved: boolean,
  ) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      select: { id: true, runnerId: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.runnerId !== runnerId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    return this.prisma.runnerListing.update({
      where: { id: listingId },
      data: {
        autoPostApproved: Boolean(autoPostApproved),
        status: autoPostApproved ? 'ACTIVE' : 'PAUSED',
        ...(autoPostApproved
          ? { startedAt: new Date(), pausedAt: null, stoppedAt: null }
          : { pausedAt: new Date() }),
      },
      include: {
        product: {
          include: {
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
                parsedDraft: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  }

  async recoverListingCaptionsAutomatically(
    runnerId: string,
    listingIds: string[],
  ) {
    const cleanIds = [...new Set(listingIds || [])]
      .filter(Boolean)
      .slice(0, 200);
    if (cleanIds.length === 0) {
      throw new BadRequestException(
        'Select at least one caption-problem listing',
      );
    }
    const owned = await this.prisma.runnerListing.findMany({
      where: { id: { in: cleanIds }, runnerId },
      select: { id: true },
    });
    if (owned.length !== cleanIds.length) {
      throw new ForbiddenException(
        'One or more listings do not belong to this runner',
      );
    }
    const now = new Date();
    const [listings, logs] = await this.prisma.$transaction([
      this.prisma.runnerListing.updateMany({
        where: { id: { in: cleanIds }, runnerId },
        data: { status: 'ACTIVE', autoPostApproved: true },
      }),
      this.prisma.whatsAppRepostLog.updateMany({
        where: {
          runnerId,
          listingId: { in: cleanIds },
          OR: [
            {
              captionStatus: {
                in: ['UNKNOWN', 'FAILED', 'ATTACHED_UNVERIFIED'],
              },
            },
            { status: 'FAILED' },
          ],
        },
        data: {
          status: 'FAILED',
          error: 'Caption delivery recovery requested by runner',
          retryCount: 0,
          nextRetryAt: now,
          captionStatus: 'FAILED',
          captionVerifiedAt: null,
          captionFallbackSent: false,
        },
      }),
    ]);
    return {
      listingsMarked: listings.count,
      repostDestinationsQueued: logs.count,
      message: `${listings.count} listing${listings.count === 1 ? '' : 's'} marked for automatic caption recovery`,
    };
  }

  async updateListingRepostControl(
    runnerId: string,
    listingId: string,
    dto: UpdateListingRepostControlDto,
  ) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      select: { id: true, runnerId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.runnerId !== runnerId) {
      throw new ForbiddenException('You can only control your own listings');
    }

    const now = new Date();
    const scheduledStartAt = dto.scheduledStartAt
      ? new Date(dto.scheduledStartAt)
      : null;
    if (
      dto.action === 'SCHEDULE' &&
      (!scheduledStartAt || scheduledStartAt <= now)
    ) {
      throw new BadRequestException('Choose a future reposting start date');
    }

    const actionData: Record<string, unknown> = {
      START_NOW: {
        status: 'ACTIVE',
        autoPostApproved: true,
        startedAt: now,
        pausedAt: null,
        stoppedAt: null,
        scheduledStartAt: null,
      },
      SCHEDULE: {
        status: 'SCHEDULED',
        autoPostApproved: true,
        scheduledStartAt,
        pausedAt: null,
        stoppedAt: null,
      },
      PAUSE: { status: 'PAUSED', autoPostApproved: false, pausedAt: now },
      RESUME: {
        status: 'ACTIVE',
        autoPostApproved: true,
        startedAt: now,
        pausedAt: null,
        stoppedAt: null,
      },
      STOP: { status: 'STOPPED', autoPostApproved: false, stoppedAt: now },
    };

    return this.prisma.runnerListing.update({
      where: { id: listingId },
      data: {
        ...(actionData[dto.action] as Prisma.RunnerListingUpdateInput),
        ...(dto.repostFrequencyMinutes !== undefined
          ? { repostFrequencyMinutes: dto.repostFrequencyMinutes }
          : {}),
        ...(dto.maximumListingAgeDays !== undefined
          ? { maximumListingAgeDays: dto.maximumListingAgeDays }
          : {}),
        ...(dto.expiryDate !== undefined
          ? { expiryDate: new Date(dto.expiryDate) }
          : {}),
      },
      include: {
        product: {
          include: {
            shop: { select: { id: true, name: true } },
            whatsappImports: {
              select: {
                caption: true,
                mediaUrls: true,
                parsedDraft: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  }

  /**
   * Delete a listing
   */
  async skipListing(runnerId: string, listingId: string, reason?: string) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      include: {
        product: {
          include: {
            shop: { select: { id: true, name: true } },
            imageFingerprints: true,
            whatsappImports: {
              select: { mediaUrls: true, receivedAt: true },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.runnerId !== runnerId) {
      throw new ForbiddenException('You can only skip your own listings');
    }

    const cleanReason =
      this.cleanText(reason)?.slice(0, 240) || 'Runner UI skip';
    const productImageUrls = this.productMediaUrls(listing.product);
    const productImageHashes = this.productImageHashesForSkipLog(
      listing.product.imageFingerprints,
    );
    const now = new Date();

    const skippedItem = await this.prisma.$transaction(async (tx) => {
      await tx.runnerListingSuppression.upsert({
        where: {
          runnerId_productId: {
            runnerId,
            productId: listing.productId,
          },
        },
        update: {
          shopId: listing.product.shopId,
          reason: cleanReason,
        },
        create: {
          runnerId,
          productId: listing.productId,
          shopId: listing.product.shopId,
          reason: cleanReason,
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
          runnerId,
          listingId: listing.id,
          status: { in: ['NEW', 'PENDING', 'NEEDS_REVIEW'] },
        },
        data: {
          status: 'REJECTED',
          auditStatus: 'RUNNER_SKIPPED',
          reviewReason: cleanReason,
          failedReason: 'Runner does not buy this item',
        },
      });

      return (tx as any).runnerSkippedItem.upsert({
        where: {
          runnerId_productId: {
            runnerId,
            productId: listing.productId,
          },
        },
        update: {
          listingId: listing.id,
          shopId: listing.product.shopId,
          orderCode: listing.orderCode,
          source: 'RUNNER_UI',
          reason: cleanReason,
          productName: listing.product.name,
          productImageUrls,
          productImageHashes,
          status: 'ACTIVE',
          skippedAt: now,
        },
        create: {
          runnerId,
          productId: listing.productId,
          listingId: listing.id,
          shopId: listing.product.shopId,
          orderCode: listing.orderCode,
          source: 'RUNNER_UI',
          reason: cleanReason,
          productName: listing.product.name,
          productImageUrls,
          productImageHashes,
          status: 'ACTIVE',
          skippedAt: now,
        },
      });
    });

    return {
      message: 'Product marked as do not buy and saved to Runner skip list',
      skippedItem,
      listingId: listing.id,
      productId: listing.productId,
      orderCode: listing.orderCode,
    };
  }
  async deleteListing(runnerId: string, listingId: string) {
    const listing = await this.prisma.runnerListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        runnerId: true,
        productId: true,
        shopId: true,
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.runnerId !== runnerId) {
      throw new NotFoundException('You can only delete your own listings');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.runnerListingSuppression.upsert({
        where: {
          runnerId_productId: {
            runnerId,
            productId: listing.productId,
          },
        },
        update: {
          shopId: listing.shopId,
          reason: 'manual-delete',
        },
        create: {
          runnerId,
          productId: listing.productId,
          shopId: listing.shopId,
          reason: 'manual-delete',
        },
      });

      await tx.runnerListing.delete({
        where: { id: listingId },
      });
    });

    return {
      message:
        'Listing deleted successfully and suppressed from automatic relisting',
    };
  }

  async deleteListingsOlderThan(runnerId: string, days: number) {
    const cleanDays = Math.max(1, Math.min(Number(days || 1), 365));
    return this.deleteListingsOlderThanCutoff(
      runnerId,
      new Date(Date.now() - cleanDays * 24 * 60 * 60 * 1000),
      `${cleanDays} day${cleanDays === 1 ? '' : 's'}`,
      'listing',
    );
  }

  async deleteListingsOlderThanHours(runnerId: string, hours: number) {
    const cleanHours = Math.max(1, Math.min(Number(hours || 1), 24 * 365));
    return this.deleteListingsOlderThanCutoff(
      runnerId,
      new Date(Date.now() - cleanHours * 60 * 60 * 1000),
      `${cleanHours} hour${cleanHours === 1 ? '' : 's'}`,
      'listing',
    );
  }

  async deleteListingsOlderThanCapture(runnerId: string, days: number) {
    const cleanDays = Math.max(1, Math.min(Number(days || 1), 365));
    return this.deleteListingsOlderThanCutoff(
      runnerId,
      new Date(Date.now() - cleanDays * 24 * 60 * 60 * 1000),
      `${cleanDays} day${cleanDays === 1 ? '' : 's'}`,
      'capture',
    );
  }

  async deleteListingsOlderThanCaptureHours(runnerId: string, hours: number) {
    const cleanHours = Math.max(1, Math.min(Number(hours || 1), 24 * 365));
    return this.deleteListingsOlderThanCutoff(
      runnerId,
      new Date(Date.now() - cleanHours * 60 * 60 * 1000),
      `${cleanHours} hour${cleanHours === 1 ? '' : 's'}`,
      'capture',
    );
  }

  private async deleteListingsOlderThanCutoff(
    runnerId: string,
    cutoff: Date,
    ageLabel: string,
    basis: 'listing' | 'capture',
  ) {
    const oldListingsWhere =
      basis === 'capture'
        ? {
            runnerId,
            product: {
              whatsappImports: {
                some: {
                  receivedAt: {
                    lt: cutoff,
                  },
                },
              },
            },
          }
        : {
            runnerId,
            createdAt: {
              lt: cutoff,
            },
          };
    const latestCaptureListings =
      basis === 'capture'
        ? await this.prisma.runnerListing.findMany({
            where: oldListingsWhere,
            select: {
              id: true,
              product: {
                select: {
                  whatsappImports: {
                    orderBy: { receivedAt: 'desc' },
                    take: 1,
                    select: { receivedAt: true },
                  },
                },
              },
              _count: {
                select: {
                  orderItems: true,
                },
              },
            },
          })
        : [];
    const captureListingIds =
      basis === 'capture'
        ? latestCaptureListings
            .filter((listing) => {
              const latestReceivedAt =
                listing.product.whatsappImports[0]?.receivedAt;
              return latestReceivedAt && latestReceivedAt < cutoff;
            })
            .map((listing) => listing.id)
        : [];
    const finalOldListingsWhere =
      basis === 'capture'
        ? {
            runnerId,
            id: {
              in: captureListingIds,
            },
          }
        : oldListingsWhere;

    const [protectedListings, deletableListings] = await Promise.all([
      this.prisma.runnerListing.count({
        where: {
          ...finalOldListingsWhere,
          orderItems: {
            some: {},
          },
        },
      }),
      this.prisma.runnerListing.findMany({
        where: {
          ...finalOldListingsWhere,
          orderItems: {
            none: {},
          },
        },
        select: {
          id: true,
          runnerId: true,
          productId: true,
          shopId: true,
        },
      }),
    ]);

    const result = await this.prisma.$transaction(async (tx) => {
      if (deletableListings.length > 0) {
        await tx.runnerListingSuppression.createMany({
          data: deletableListings.map((listing) => ({
            runnerId: listing.runnerId,
            productId: listing.productId,
            shopId: listing.shopId,
            reason: `${basis}-age-cleanup`,
          })),
          skipDuplicates: true,
        });
      }

      return tx.runnerListing.deleteMany({
        where: {
          id: {
            in: deletableListings.map((listing) => listing.id),
          },
        },
      });
    });

    return {
      deleted: result.count,
      protected: protectedListings,
      suppressed: deletableListings.length,
      cutoff,
      basis,
      message: `Deleted ${result.count} listing${result.count === 1 ? '' : 's'} where ${basis === 'capture' ? 'the source post is' : 'the listing is'} older than ${ageLabel} and suppressed them from automatic relisting${protectedListings ? `; kept ${protectedListings} with order history` : ''}`,
    };
  }

  /**
   * Queue selected listings for the WhatsApp session bridge to post with media captions.
   */
  async queueWhatsAppSessionRepost(
    runnerId: string,
    listingIds: string[],
    groupIdOrName: string,
    captionOverrides?: Record<string, string>,
    imageOverrides?: Record<string, string[]>,
    forceRepost = false,
  ) {
    const cleanListingIds = [...new Set(listingIds || [])].filter(Boolean);
    const cleanGroup = String(groupIdOrName || '').trim();

    if (cleanListingIds.length === 0) {
      throw new BadRequestException('Select at least one listing to repost');
    }

    if (!cleanGroup) {
      throw new BadRequestException('WhatsApp group id or name is required');
    }

    await this.assertRunnerCanPostToDestination(runnerId, cleanGroup);

    const listings = await this.prisma.runnerListing.findMany({
      where: {
        id: { in: cleanListingIds },
        runnerId,
      },
      select: {
        id: true,
      },
    });

    if (listings.length !== cleanListingIds.length) {
      throw new ForbiddenException(
        'One or more listings do not belong to this runner',
      );
    }

    const cleanCaptionOverrides = Object.fromEntries(
      Object.entries(captionOverrides || {})
        .filter(([listingId]) => cleanListingIds.includes(listingId))
        .map(([listingId, caption]) => [
          listingId,
          String(caption || '')
            .trim()
            .slice(0, 2500),
        ])
        .filter(([, caption]) => caption),
    );

    const cleanImageOverrides = Object.fromEntries(
      Object.entries(imageOverrides || {})
        .filter(
          ([listingId, images]) =>
            cleanListingIds.includes(listingId) && Array.isArray(images),
        )
        .map(([listingId, images]) => [
          listingId,
          Array.from(
            new Set(
              images
                .filter((image) => typeof image === 'string')
                .map((image) => image.trim())
                .filter(Boolean),
            ),
          ),
        ])
        .filter(([, images]) => images.length > 0),
    );

    const jobId = randomUUID();
    const pendingDir = resolve(
      process.env.WHATSAPP_REPOST_OUTBOX_DIR || './whatsapp-outbox',
      'pending',
    );
    await mkdir(pendingDir, { recursive: true });

    const job = {
      id: jobId,
      runnerId,
      listingIds: cleanListingIds,
      groupIdOrName: cleanGroup,
      captionOverrides: cleanCaptionOverrides,
      imageOverrides: cleanImageOverrides,
      forceRepost,
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
      listingCount: cleanListingIds.length,
      groupIdOrName: cleanGroup,
      message:
        'Queued for WhatsApp session bridge. Keep npm run whatsapp:session:bridge running.',
    };
  }

  private async assertRunnerCanPostToDestination(
    runnerId: string,
    destinationGroup: string,
  ) {
    await assertDestinationGroupsAvailableToRunner(this.prisma, runnerId, [
      destinationGroup,
    ]);
  }

  async getOrderRequests(runnerId: string) {
    return this.prisma.whatsAppOrderRequest.findMany({
      where: { runnerId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            items: {
              include: {
                listing: {
                  include: {
                    product: {
                      include: {
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
        },
        listing: {
          include: {
            product: {
              include: {
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
            shop: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        matchedStampedMediaLog: {
          select: {
            id: true,
            orderCode: true,
            groupIdOrName: true,
            sourceImageUrl: true,
            imageIndex: true,
            sentAt: true,
            returnedCount: true,
            lastReturnedAt: true,
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async getShoppingList(runnerId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { runnerId },
          {
            items: {
              some: {
                listing: { runnerId },
              },
            },
          },
        ],
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED'],
        },
      },
      select: {
        id: true,
        customerPhone: true,
        customerId: true,
        status: true,
        customerPaymentStatus: true,
        runnerPurchaseStatus: true,
        procurementCity: true,
        procurementTripCode: true,
        shippingAddress: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          where: {
            listing: { runnerId },
            status: {
              notIn: ['CANCELLED', 'UNAVAILABLE', 'DELIVERED', 'PACKED'],
            },
          },
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                        phone: true,
                        address: true,
                      },
                    },
                    whatsappImports: {
                      select: {
                        mediaUrls: true,
                        receivedAt: true,
                      },
                      orderBy: { receivedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
            product: {
              include: {
                shop: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    address: true,
                  },
                },
                whatsappImports: {
                  select: {
                    mediaUrls: true,
                    receivedAt: true,
                  },
                  orderBy: { receivedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const shops = new Map<string, any>();
    let totalItems = 0;
    let totalQuantity = 0;
    let totalShopCost = 0;
    let totalRunnerValue = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const product = item.product || item.listing?.product;
        if (!product) continue;

        const shop = product.shop || item.listing?.product?.shop;
        const shopId = shop?.id || 'unknown-shop';
        const shopName = shop?.name || 'Unknown shop';
        const productImages = this.productMediaUrls(product);
        const customerImages = this.cleanImageUrls(item.customerImageUrls);
        const quantity = Number(item.quantity || 0);
        const shopCost = roundMoney(Number(item.shopPrice || 0) * quantity);
        const runnerValue = roundMoney(Number(item.unitPrice || 0) * quantity);

        if (!shops.has(shopId)) {
          shops.set(shopId, {
            shop: {
              id: shopId,
              name: shopName,
              phone: shop?.phone || null,
              address: shop?.address || null,
            },
            itemCount: 0,
            totalQuantity: 0,
            totalShopCost: 0,
            totalRunnerValue: 0,
            lines: new Map<string, any>(),
          });
        }

        const shopGroup = shops.get(shopId);
        const lineKey = [
          product.id,
          item.selectedSize || '',
          item.selectedColor || '',
          item.shopPrice,
        ].join('|');

        if (!shopGroup.lines.has(lineKey)) {
          shopGroup.lines.set(lineKey, {
            key: lineKey,
            productId: product.id,
            productName: product.name,
            category: product.category,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
            quantity: 0,
            shopUnitPrice: item.shopPrice,
            runnerUnitPrice: item.unitPrice,
            shopCost: 0,
            runnerValue: 0,
            statusCounts: {},
            productImages,
            customerImages: [],
            itemIds: [],
            customers: [],
          });
        }

        const line = shopGroup.lines.get(lineKey);
        line.quantity += quantity;
        line.shopCost = roundMoney(line.shopCost + shopCost);
        line.runnerValue = roundMoney(line.runnerValue + runnerValue);
        line.itemIds.push(item.id);
        line.statusCounts[item.status] =
          Number(line.statusCounts[item.status] || 0) + 1;
        line.customerImages = this.dedupeStrings([
          ...line.customerImages,
          ...customerImages,
        ]).slice(0, 8);
        line.customers.push({
          orderId: order.id,
          orderStatus: order.status,
          orderItemId: item.id,
          itemStatus: item.status,
          customerName:
            order.customer?.name ||
            this.customerNameFromShippingAddress(order.shippingAddress) ||
            'Customer',
          customerPhone: order.customerPhone || order.customer?.phone || null,
          quantity,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
          customerNote: item.customerNote,
          customerImageUrls: customerImages,
          customerPaymentStatus: order.customerPaymentStatus,
          createdAt: order.createdAt,
        });

        shopGroup.itemCount += 1;
        shopGroup.totalQuantity += quantity;
        shopGroup.totalShopCost = roundMoney(
          shopGroup.totalShopCost + shopCost,
        );
        shopGroup.totalRunnerValue = roundMoney(
          shopGroup.totalRunnerValue + runnerValue,
        );

        totalItems += 1;
        totalQuantity += quantity;
        totalShopCost = roundMoney(totalShopCost + shopCost);
        totalRunnerValue = roundMoney(totalRunnerValue + runnerValue);
      }
    }

    const data = [...shops.values()]
      .map((shopGroup) => ({
        ...shopGroup,
        lines: [...shopGroup.lines.values()].sort((a, b) =>
          a.productName.localeCompare(b.productName),
        ),
      }))
      .sort((a, b) => a.shop.name.localeCompare(b.shop.name));

    return {
      generatedAt: new Date(),
      summary: {
        shopCount: data.length,
        itemCount: totalItems,
        totalQuantity,
        totalShopCost,
        totalRunnerValue,
        expectedRunnerFee: roundMoney(totalRunnerValue - totalShopCost),
      },
      data,
    };
  }

  async updateShoppingListItemsStatus(
    runnerId: string,
    itemIds: string[],
    status: string,
  ) {
    const cleanItemIds = [...new Set(itemIds || [])].filter(Boolean);
    const cleanStatus = String(status || '')
      .trim()
      .toUpperCase();
    const allowedStatuses = new Set([
      'REQUESTED',
      'BOUGHT',
      'UNAVAILABLE',
      'PACKED',
    ]);

    if (cleanItemIds.length === 0) {
      throw new BadRequestException('Select at least one shopping list item');
    }

    if (!allowedStatuses.has(cleanStatus)) {
      throw new BadRequestException('Invalid shopping list item status');
    }

    const items = await this.prisma.orderItem.findMany({
      where: {
        id: { in: cleanItemIds },
        listing: { runnerId },
      },
      select: {
        id: true,
        orderId: true,
      },
    });

    if (items.length !== cleanItemIds.length) {
      throw new ForbiddenException(
        'One or more shopping list items do not belong to this runner',
      );
    }

    const orderIds = [...new Set(items.map((item) => item.orderId))];

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { id: { in: cleanItemIds } },
        data: { status: cleanStatus },
      });

      for (const orderId of orderIds) {
        const orderItems = await tx.orderItem.findMany({
          where: {
            orderId,
            listing: { runnerId },
          },
          select: { status: true },
        });
        const allBought =
          orderItems.length > 0 &&
          orderItems.every((item) =>
            ['BOUGHT', 'PACKED'].includes(item.status),
          );
        const anyBought = orderItems.some((item) =>
          ['BOUGHT', 'PACKED'].includes(item.status),
        );

        await tx.order.update({
          where: { id: orderId },
          data: {
            runnerPurchaseStatus: allBought
              ? 'BOUGHT'
              : anyBought
                ? 'PARTIALLY_BOUGHT'
                : 'NOT_BOUGHT',
            runnerBoughtAt: allBought ? new Date() : null,
          },
        });
      }
    });

    return {
      updated: cleanItemIds.length,
      status: cleanStatus,
    };
  }

  async getCustomerPackingList(runnerId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { runnerId },
          {
            items: {
              some: {
                listing: { runnerId },
              },
            },
          },
        ],
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED'],
        },
      },
      select: {
        id: true,
        customerPhone: true,
        customerId: true,
        status: true,
        customerPaymentStatus: true,
        shippingAddress: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          where: {
            listing: { runnerId },
            status: {
              notIn: ['CANCELLED', 'UNAVAILABLE', 'DELIVERED'],
            },
          },
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                    whatsappImports: {
                      select: {
                        mediaUrls: true,
                        receivedAt: true,
                      },
                      orderBy: { receivedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
            product: {
              include: {
                shop: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                whatsappImports: {
                  select: {
                    mediaUrls: true,
                    receivedAt: true,
                  },
                  orderBy: { receivedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const customers = new Map<string, any>();
    let totalCustomers = 0;
    let totalItems = 0;
    let totalQuantity = 0;

    for (const order of orders) {
      const customerPhone =
        order.customerPhone || order.customer?.phone || null;
      const customerName =
        order.customer?.name ||
        this.customerNameFromShippingAddress(order.shippingAddress) ||
        customerPhone ||
        'Customer';
      const customerKey =
        customerPhone || order.customerId || order.customer?.id || order.id;

      if (!customers.has(customerKey)) {
        customers.set(customerKey, {
          customerKey,
          customerName,
          customerPhone,
          orderIds: new Set<string>(),
          itemCount: 0,
          totalQuantity: 0,
          shopCount: 0,
          shops: new Map<string, any>(),
          latestOrderAt: order.createdAt,
        });
        totalCustomers += 1;
      }

      const customerGroup = customers.get(customerKey);
      customerGroup.orderIds.add(order.id);
      if (order.createdAt > customerGroup.latestOrderAt) {
        customerGroup.latestOrderAt = order.createdAt;
      }

      for (const item of order.items) {
        const product = item.product || item.listing?.product;
        if (!product) continue;

        const shop = product.shop || item.listing?.product?.shop;
        const shopId = shop?.id || 'unknown-shop';
        const shopName = shop?.name || 'Unknown shop';
        const quantity = Number(item.quantity || 0);
        const imageUrls = this.dedupeStrings([
          ...this.cleanImageUrls(item.customerImageUrls),
          ...this.productMediaUrls(product),
        ]).slice(0, 8);

        if (!customerGroup.shops.has(shopId)) {
          customerGroup.shops.set(shopId, {
            shopId,
            shopName,
            items: [],
          });
        }

        customerGroup.shops.get(shopId).items.push({
          orderId: order.id,
          orderItemId: item.id,
          productId: product.id,
          productName: product.name,
          quantity,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
          customerNote: item.customerNote,
          status: item.status,
          imageUrls,
          customerPaymentStatus: order.customerPaymentStatus,
          createdAt: order.createdAt,
        });

        customerGroup.itemCount += 1;
        customerGroup.totalQuantity += quantity;
        totalItems += 1;
        totalQuantity += quantity;
      }
    }

    const data = [...customers.values()]
      .map((customer) => {
        const shops = [...customer.shops.values()]
          .map((shop) => ({
            ...shop,
            items: shop.items.sort((a: any, b: any) =>
              a.productName.localeCompare(b.productName),
            ),
          }))
          .sort((a, b) => a.shopName.localeCompare(b.shopName));

        return {
          ...customer,
          orderIds: [...customer.orderIds],
          shopCount: shops.length,
          shops,
        };
      })
      .filter((customer) => customer.itemCount > 0)
      .sort((a, b) => {
        const nameCompare = a.customerName.localeCompare(b.customerName);
        if (nameCompare !== 0) return nameCompare;
        return String(a.customerPhone || '').localeCompare(
          String(b.customerPhone || ''),
        );
      });

    return {
      generatedAt: new Date(),
      summary: {
        customerCount: data.length,
        itemCount: totalItems,
        totalQuantity,
      },
      data,
    };
  }

  async updateOrderRequestStatus(
    runnerId: string,
    orderRequestId: string,
    status: string,
  ) {
    const cleanStatus = String(status || '')
      .trim()
      .toUpperCase();
    const allowedStatuses = new Set([
      'NEW',
      'UNMATCHED',
      'CONTACTED',
      'CONVERTED',
      'CLOSED',
    ]);

    if (!allowedStatuses.has(cleanStatus)) {
      throw new BadRequestException('Invalid WhatsApp order request status');
    }

    const orderRequest = await this.prisma.whatsAppOrderRequest.findFirst({
      where: {
        id: orderRequestId,
        runnerId,
      },
      select: {
        id: true,
        orderId: true,
        status: true,
      },
    });

    if (!orderRequest) {
      throw new NotFoundException('WhatsApp order request not found');
    }

    if (orderRequest.orderId && cleanStatus !== 'CONVERTED') {
      throw new BadRequestException(
        'Converted WhatsApp requests stay linked to their order',
      );
    }

    return this.prisma.whatsAppOrderRequest.update({
      where: { id: orderRequest.id },
      data: { status: cleanStatus },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            items: {
              include: {
                listing: {
                  include: {
                    product: {
                      include: {
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
        },
        listing: {
          include: {
            product: {
              include: {
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
            shop: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async convertOrderRequest(
    runnerId: string,
    orderRequestId: string,
    dto: ConvertWhatsAppOrderRequestDto,
  ) {
    const orderRequest = await this.prisma.whatsAppOrderRequest.findFirst({
      where: {
        id: orderRequestId,
        runnerId,
      },
      include: {
        listing: {
          include: {
            product: true,
            runner: true,
          },
        },
      },
    });

    if (!orderRequest) {
      throw new NotFoundException('WhatsApp order request not found');
    }

    if (orderRequest.orderId) {
      throw new ConflictException('This WhatsApp request is already an order');
    }

    const listing = orderRequest.listing;
    if (!listing) {
      throw new BadRequestException(
        'This WhatsApp request is not matched to a listing',
      );
    }

    if (listing.runnerId !== runnerId) {
      throw new ForbiddenException('You can only convert your own requests');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('This listing is not active');
    }

    if (listing.runner?.status !== 'ACTIVE') {
      throw new BadRequestException('Runner profile is not active');
    }

    const quantity = Math.max(1, Number(dto.quantity || 1));
    const selection = this.parseCustomerOrderSelection(
      orderRequest.messageText,
    );
    if (listing.product.stockQty < quantity) {
      throw new BadRequestException(
        `Insufficient stock for "${listing.product.name}"`,
      );
    }

    const subtotal = roundMoney(listing.runnerPrice * quantity);
    const tax = 0;
    const shippingFee = roundMoney(
      listing.product.basePrice * TRANSPORT_FEE_RATE * quantity,
    );
    const totalAmount = roundMoney(subtotal + tax + shippingFee);
    const customerPhone =
      this.cleanPhone(dto.customerPhone) ||
      this.cleanPhone(orderRequest.customerPhone);

    if (!customerPhone) {
      throw new BadRequestException('Customer phone is required');
    }

    const shippingAddress = {
      street: this.cleanText(dto.street) || 'WhatsApp order',
      city: this.cleanText(dto.city) || 'To be confirmed',
      state: '',
      zipCode: '',
      country: 'Eswatini',
      source: 'WHATSAPP',
      customerName:
        this.cleanText(dto.customerName) ||
        this.cleanText(orderRequest.customerName) ||
        '',
    };

    const notes = [
      this.cleanText(dto.notes),
      `WhatsApp request: ${orderRequest.messageText}`,
      orderRequest.orderCode ? `Order code: ${orderRequest.orderCode}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000);

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          customerPhone,
          customerId: null,
          runnerId,
          shopId: listing.product.shopId,
          status: 'ORDER_CONFIRMED',
          totalAmount,
          subtotal,
          tax,
          shippingFee,
          shippingAddress,
          fulfillmentMethod: 'TO_BE_CONFIRMED',
          procurementCity: 'TO_BE_CONFIRMED',
          notes,
          items: {
            create: [
              {
                listingId: listing.id,
                productId: listing.productId,
                quantity,
                unitPrice: listing.runnerPrice,
                shopPrice: listing.product.basePrice,
                commission: listing.runnerPrice - listing.product.basePrice,
                selectedSize: this.cleanText(dto.size) || selection.size,
                selectedColor: this.cleanText(dto.color) || selection.color,
                customerNote: selection.note,
              },
            ],
          },
        },
        include: {
          items: {
            include: {
              listing: {
                include: {
                  product: {
                    include: {
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
          },
        },
      });

      const updated = await tx.product.updateMany({
        where: {
          id: listing.productId,
          stockQty: { gte: quantity },
        },
        data: {
          stockQty: { decrement: quantity },
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          `Insufficient stock for "${listing.product.name}"`,
        );
      }

      await tx.inventoryReservation.create({
        data: {
          productId: listing.productId,
          orderId: createdOrder.id,
          quantity,
          status: 'CONFIRMED',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.whatsAppOrderRequest.update({
        where: { id: orderRequest.id },
        data: {
          orderId: createdOrder.id,
          status: 'CONVERTED',
        },
      });

      return createdOrder;
    });

    return order;
  }

  async submitRunnerWhatsAppOrder(
    runnerId: string,
    input: string,
    runnerPhone?: string | null,
  ) {
    const parsed = this.parseRunnerSubmittedOrder(input);
    if (!parsed.customerPhone) {
      throw new BadRequestException(
        'Customer phone is missing. Start with: ORDER FOR <customer phone>',
      );
    }
    if (!parsed.orderCode) {
      throw new BadRequestException(
        'Order code is missing. Add a line like: CODE: RC-1234ABCD',
      );
    }

    const listing = await this.prisma.runnerListing.findFirst({
      where: {
        runnerId,
        orderCode: parsed.orderCode,
      },
      include: {
        product: {
          include: {
            shop: { select: { id: true, name: true } },
          },
        },
        runner: true,
      },
    });

    if (!listing) {
      throw new BadRequestException(
        `I could not find order code ${parsed.orderCode}. Check the code from the repost and try again.`,
      );
    }
    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Order code ${parsed.orderCode} is not active for ordering.`,
      );
    }
    if (listing.runner?.status !== 'ACTIVE') {
      throw new BadRequestException('Runner profile is not active.');
    }

    const quantity = Math.max(1, parsed.quantity || 1);
    if (listing.product.stockQty < quantity) {
      throw new BadRequestException(
        `Insufficient stock for "${listing.product.name}". Available stock is ${listing.product.stockQty}.`,
      );
    }

    const customerPhone = this.cleanPhone(parsed.customerPhone);
    if (!customerPhone) {
      throw new BadRequestException(
        'Customer phone is invalid. Use a WhatsApp number such as +26876123456.',
      );
    }

    const existingOrder = await this.findOpenRunnerCustomerOrder(
      runnerId,
      customerPhone,
    );
    const subtotalDelta = roundMoney(listing.runnerPrice * quantity);
    const shippingDelta = roundMoney(
      listing.product.basePrice * TRANSPORT_FEE_RATE * quantity,
    );
    const note = [
      parsed.note,
      `Runner-submitted WhatsApp order: ${parsed.raw}`,
      `Order code: ${parsed.orderCode}`,
      runnerPhone ? `Submitted by runner WhatsApp: ${runnerPhone}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = existingOrder
        ? await tx.order.update({
            where: { id: existingOrder.id },
            data: {
              subtotal: { increment: subtotalDelta },
              shippingFee: { increment: shippingDelta },
              totalAmount: {
                increment: roundMoney(subtotalDelta + shippingDelta),
              },
              notes: this.appendOrderNote(existingOrder.notes, note),
            },
          })
        : await tx.order.create({
            data: {
              customerPhone,
              customerId: null,
              runnerId,
              shopId: listing.product.shopId,
              status: 'ORDER_CONFIRMED',
              totalAmount: roundMoney(subtotalDelta + shippingDelta),
              subtotal: subtotalDelta,
              tax: 0,
              shippingFee: shippingDelta,
              shippingAddress: {
                street: 'WhatsApp order',
                city: 'To be confirmed',
                state: '',
                zipCode: '',
                country: 'Eswatini',
                source: 'RUNNER_WHATSAPP',
                customerName: parsed.customerName || '',
              },
              fulfillmentMethod: 'TO_BE_CONFIRMED',
              procurementCity: 'TO_BE_CONFIRMED',
              notes: note,
            },
          });

      const matchingItem = await tx.orderItem.findFirst({
        where: {
          orderId: order.id,
          listingId: listing.id,
          selectedSize: parsed.size || null,
          selectedColor: parsed.color || null,
          status: { notIn: ['CANCELLED', 'UNAVAILABLE', 'DELIVERED'] },
        },
        select: { id: true },
      });

      if (matchingItem) {
        await tx.orderItem.update({
          where: { id: matchingItem.id },
          data: {
            quantity: { increment: quantity },
            customerNote: parsed.note || undefined,
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            listingId: listing.id,
            productId: listing.productId,
            quantity,
            unitPrice: listing.runnerPrice,
            shopPrice: listing.product.basePrice,
            commission: listing.runnerPrice - listing.product.basePrice,
            selectedSize: parsed.size || null,
            selectedColor: parsed.color || null,
            customerNote: parsed.note || parsed.raw.slice(0, 500),
            status: 'REQUESTED',
          },
        });
      }

      const updated = await tx.product.updateMany({
        where: {
          id: listing.productId,
          stockQty: { gte: quantity },
        },
        data: { stockQty: { decrement: quantity } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          `Insufficient stock for "${listing.product.name}".`,
        );
      }

      await tx.inventoryReservation.create({
        data: {
          productId: listing.productId,
          orderId: order.id,
          quantity,
          status: 'CONFIRMED',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const orderRequest = await tx.whatsAppOrderRequest.create({
        data: {
          runnerId,
          listingId: listing.id,
          orderId: order.id,
          orderCode: parsed.orderCode,
          customerPhone,
          customerName: parsed.customerName || null,
          recipientPhone: runnerPhone || null,
          messageText: parsed.raw,
          status: 'CONVERTED',
          confidence: 1,
          receivedAt: new Date(),
        },
      });

      const refreshedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      return { order: refreshedOrder || order, orderRequest };
    });

    return {
      createdNewOrder: !existingOrder,
      order: result.order,
      orderRequest: result.orderRequest,
      listing,
      quantity,
      customerPhone,
      customerName: parsed.customerName || null,
      size: parsed.size || null,
      color: parsed.color || null,
    };
  }

  private async findOpenRunnerCustomerOrder(
    runnerId: string,
    customerPhone: string,
  ) {
    return this.prisma.order.findFirst({
      where: {
        runnerId,
        customerPhone,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED'] },
        runnerPurchaseStatus: { not: 'BOUGHT' },
      },
      select: { id: true, notes: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private parseRunnerSubmittedOrder(input: string) {
    const raw = String(input || '').trim();
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const field = (names: string[]) => {
      const pattern = new RegExp(
        `^(?:${names.join('|')})\\s*[:=-]\\s*(.+)$`,
        'i',
      );
      const match = lines.map((line) => line.match(pattern)).find(Boolean);
      return match?.[1]?.trim() || null;
    };
    const customerLine =
      raw.match(
        /\b(?:ORDER\s+FOR|ADD\s+(?:TO\s+)?ORDER\s+FOR)\s+([+\d][\d\s().-]{6,})/i,
      )?.[1] || field(['CUSTOMER', 'CUSTOMER PHONE', 'PHONE', 'FOR']);
    const orderCode =
      field(['CODE', 'ORDER CODE']) ||
      raw.match(/\bRC-[A-Z0-9-]{4,}\b/i)?.[0] ||
      null;
    const quantityText =
      field(['QTY', 'QUANTITY']) ||
      raw.match(/\b(?:QTY|QUANTITY)\s+(\d{1,3})\b/i)?.[1] ||
      null;

    return {
      raw,
      customerPhone: this.cleanPhone(customerLine),
      customerName: this.cleanText(field(['NAME', 'CUSTOMER NAME'])),
      orderCode: orderCode ? orderCode.toUpperCase() : null,
      quantity: clampNumber(Number(quantityText || 1), 1, 1, 999),
      size: this.cleanText(field(['SIZE'])),
      color: this.cleanText(field(['COLOR', 'COLOUR'])),
      note: this.cleanText(field(['NOTE', 'NOTES'])),
    };
  }

  private appendOrderNote(
    existing: string | null | undefined,
    addition: string,
  ) {
    const cleanAddition = this.cleanText(addition);
    if (!cleanAddition) return existing || null;
    return [existing, cleanAddition]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 4000);
  }

  private cleanText(value?: string | null) {
    const clean = String(value || '').trim();
    return clean || null;
  }

  private customerNameFromShippingAddress(value: any) {
    if (!value || typeof value !== 'object') return null;
    return this.cleanText(value.customerName || value.name);
  }

  private productMediaUrls(product: any) {
    const images = this.cleanImageUrls(product?.images);
    const importImages = this.cleanImageUrls(
      product?.whatsappImports?.[0]?.mediaUrls,
    );

    return this.dedupeStrings([...images, ...importImages]).slice(0, 8);
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
  private cleanImageUrls(value?: unknown) {
    if (!Array.isArray(value)) return [];

    return this.dedupeStrings(
      value
        .map((url) => String(url || '').trim())
        .filter(Boolean)
        .filter(
          (url) => url.startsWith('/uploads/') || url.includes('/uploads/'),
        ),
    ).slice(0, 8);
  }

  private dedupeStrings(values: string[]) {
    return [
      ...new Set(values.map((value) => String(value || '').trim())),
    ].filter(Boolean);
  }

  private cleanPhone(value?: string | null) {
    const digits = String(value || '').replace(/[^\d+]/g, '');
    return digits || null;
  }

  private parseCustomerOrderSelection(messageText: string) {
    const text = String(messageText || '').trim();
    const size = this.cleanText(
      this.matchCustomerField(text, [
        /\bsize\s*[:=-]\s*([^\n,;]+)/i,
        /\bsize\s+([a-z0-9+/-]{1,12})\b/i,
      ]),
    );
    const color = this.cleanText(
      this.matchCustomerField(text, [
        /\bcolou?r\s*[:=-]\s*([^\n,;]+)/i,
        /\bcolou?r\s+([a-z][a-z\s/-]{1,30})\b/i,
      ]),
    );

    return {
      size,
      color,
      note: this.cleanText(text)?.slice(0, 500) || null,
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

  private createOrderCode() {
    return `RC-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  private normalizeRunnerPublicCode(value?: string | null) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 32);
  }

  private createRunnerPublicCodeCandidate() {
    return `RUN-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }

  private async createUniqueRunnerPublicCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicCode = this.createRunnerPublicCodeCandidate();
      const existing = await this.prisma.runner.findUnique({
        where: { publicCode },
        select: { id: true },
      });
      if (!existing) return publicCode;
    }
    return `RUN-${Date.now().toString(36).toUpperCase()}`;
  }

  private publicListingInclude() {
    return {
      product: {
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              procurementCity: true,
            },
          },
          whatsappImports: {
            select: {
              caption: true,
              mediaUrls: true,
              parsedDraft: true,
              sourceGroup: true,
              importedAt: true,
              receivedAt: true,
            },
            orderBy: { receivedAt: 'desc' as const },
            take: 1,
          },
        },
      },
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
    };
  }

  private async ensureOrderCodesForRunner(runnerId: string) {
    const listings = await this.prisma.runnerListing.findMany({
      where: {
        runnerId,
        orderCode: null,
      },
      select: { id: true },
      take: 100,
    });

    for (const listing of listings) {
      await this.assignOrderCodeToListing(listing.id).catch(() => undefined);
    }
  }

  private async assignOrderCodeToListing(listingId: string, include?: any) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.runnerListing.update({
          where: { id: listingId },
          data: { orderCode: this.createOrderCode() },
          ...(include ? { include } : {}),
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private repostLogState(log: {
    status?: string | null;
    retryCount?: number | null;
    nextRetryAt?: Date | null;
  }) {
    const status = String(log.status || '').toUpperCase();
    const retryAttempts = Math.max(0, Number(log.retryCount || 0));
    const posted = status === 'POSTED' ? 1 : 0;
    const stillFailed = status === 'FAILED' ? 1 : 0;

    return {
      posted,
      failedAttempts: stillFailed,
      retryAttempts,
      recoveredAfterRetry: posted && retryAttempts > 0 ? 1 : 0,
      stillFailed,
      waitingRetry:
        stillFailed && log.nextRetryAt && log.nextRetryAt > new Date() ? 1 : 0,
    };
  }

  /**
   * Get runner's earnings and stats
   */
  async getEarnings(runnerId: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        wallet: true,
        transactions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          where: { status: 'COMPLETED' },
          select: {
            id: true,
            totalAmount: true,
            createdAt: true,
          },
          take: 10,
        },
      },
    });

    if (!runner) {
      throw new NotFoundException('Runner not found');
    }

    // Calculate total earnings from completed orders
    const completedOrders = await this.prisma.order.findMany({
      where: {
        runnerId,
        status: 'COMPLETED',
      },
      select: {
        totalAmount: true,
      },
    });

    const totalRevenue = completedOrders.reduce(
      (sum: number, order: any) => sum + order.totalAmount,
      0,
    );

    return {
      wallet: runner.wallet,
      totalRevenue,
      totalOrders: runner.totalOrders,
      rating: runner.rating,
      recentTransactions: runner.transactions,
      recentOrders: runner.orders,
    };
  }

  /**
   * Get available products for runner to promote
   */
  async getSkippedItems(runnerId: string, limit = 100) {
    const take = clampNumber(Number(limit), 100, 1, 500);
    return (this.prisma as any).runnerSkippedItem.findMany({
      where: {
        runnerId,
        status: 'ACTIVE',
      },
      orderBy: [{ skippedAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }
  async getAvailableProducts(runnerId: string, limit = 20) {
    const approvedShopLinks = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
      },
      select: { shopId: true },
    });
    const approvedShopIds = approvedShopLinks.map((link) => link.shopId);

    if (approvedShopIds.length === 0) {
      return [];
    }

    // Get products that runner hasn't listed yet
    const runnerListings = await this.prisma.runnerListing.findMany({
      where: { runnerId },
      select: { productId: true },
    });

    const listedProductIds = runnerListings.map((l: any) => l.productId);
    const suppressedProducts =
      await this.prisma.runnerListingSuppression.findMany({
        where: { runnerId },
        select: { productId: true },
      });
    const unavailableProductIds = [
      ...new Set([
        ...listedProductIds,
        ...suppressedProducts.map((item) => item.productId),
      ]),
    ];

    const products = await this.prisma.product.findMany({
      where: {
        id: { notIn: unavailableProductIds },
        shopId: { in: approvedShopIds },
        status: 'ACTIVE',
        stockQty: { gt: 0 },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            listings: true,
          },
        },
        whatsappImports: {
          select: {
            caption: true,
            mediaUrls: true,
            parsedDraft: true,
            receivedAt: true,
          },
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return products;
  }
}
