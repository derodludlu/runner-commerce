import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RunnerService } from '../runner/runner.service';
import { BillingService } from '../billing/billing.service';
import { assertDestinationGroupsAvailableToRunner } from '../../common/whatsapp-destination-reservations';
import { stat, unlink, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const DEFAULT_RUNNER_SOURCE_SHOP_LIMIT = 30;
const PHASE1_TEST_OFFER_DAYS = 7;
const PHASE1_SHOP_PAGE_SIZE = 50;
const PHASE1_SHOP_ALL_LIMIT = 150;
const DEFAULT_LIVE_GROUP_LIMIT = 2;
const PHASE1_TEST_SHOP_NOTE = 'Phase 1 shop selection';
const PHASE1_LIVE_SHOP_NOTE = 'Phase 1 expanded shop selection';
const PHASE1_TEST_SHOP_NOTE_PREFIX = PHASE1_TEST_SHOP_NOTE;
const TRIAL_DAYS = 14;
const SUPERUSER_SUPPORT_PHONE = '+26876154884';
const BOT_FOLLOWUP_STALE_MS = 2 * 60 * 60 * 1000;
const BOT_SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const BOT_MAX_UNEXPECTED_REPLIES = 2;
const RUNNER_SHOP_AUTO_APPROVAL_KEY = 'runnerShopJoinAutoApprovalEnabled';
const WHATSAPP_ORDER_TRACKING_KEY = 'whatsappOrderTrackingEnabled';
const PHASE_2_ENABLED_KEY = 'phase2Enabled';
const WHATSAPP_REPOSTING_ENABLED_KEY = 'whatsappRepostingEnabled';
const RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY = 'runnerBotBridgeAccountId';
const BRIDGE_ONLINE_HEARTBEAT_MS = 5 * 60 * 1000;
const MAINTENANCE_FLAG = resolve(
  process.cwd(),
  '..',
  '.runner-commerce-maintenance',
);

const ACTIVE_SHOP_STATUSES = ['PENDING', 'APPROVED'];
const ACTIVE_GROUP_STATUSES = [
  'GROUP_LINK_RECEIVED',
  'JOIN_ATTEMPT_STARTED',
  'JOINED_GROUP',
  'ADMIN_STATUS_PENDING',
  'RUNNER_CONFIRMED_ADMIN',
  'ADMIN_VERIFIED',
  'BOT_NOT_ADMIN',
  'READY_FOR_REPOSTING',
];

type RepostCommand =
  | 'REGISTER'
  | 'PROCEED'
  | 'EXIT'
  | 'SKIP'
  | 'WALKTHROUGH'
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'STOP'
  | 'STATUS'
  | 'GROUPS'
  | 'SHOPS'
  | 'SETUP'
  | 'ADMIN_DONE'
  | 'SUBMIT_SHOP_LINKS'
  | 'CONNECT_REPOSTING_GROUP'
  | 'HOW_IT_WORKS'
  | 'HELP'
  | 'SUPPORT'
  | 'ORDERS'
  | 'BUYING'
  | 'PACKING'
  | 'BACKLOG'
  | 'SET_DATE'
  | 'SET_MARKUP'
  | 'SET_AGE'
  | 'STATS'
  | 'MENU'
  | 'BILLING'
  | 'PLANS'
  | 'PAY'
  | 'CAPTIONS';

@Injectable()
export class Phase1Service {
  constructor(
    private prisma: PrismaService,
    private runnerService?: RunnerService,
    private billingService?: BillingService,
  ) {}

  parseCommand(input: string): RepostCommand | null {
    const text = String(input || '')
      .trim()
      .toLowerCase();
    if (!text) return null;

    const menuCommands: Record<string, RepostCommand> = {
      '1': 'WALKTHROUGH',
      '2': 'REGISTER',
      '3': 'SHOPS',
      '4': 'SUBMIT_SHOP_LINKS',
      '5': 'CONNECT_REPOSTING_GROUP',
      '6': 'STATUS',
      '7': 'SUPPORT',
    };
    if (menuCommands[text]) return menuCommands[text];

    const exact = text.toUpperCase().replace(/\s+/g, '_');
    if (
      [
        'REGISTER',
        'PROCEED',
        'EXIT',
        'SKIP',
        'WALKTHROUGH',
        'START',
        'PAUSE',
        'RESUME',
        'STOP',
        'STATUS',
        'GROUPS',
        'SHOPS',
        'SETUP',
        'ADMIN_DONE',
        'SUBMIT_SHOP_LINKS',
        'CONNECT_REPOSTING_GROUP',
        'HOW_IT_WORKS',
        'HELP',
        'SUPPORT',
        'ORDERS',
        'ORDER',
        'ORDER_HELP',
        'BUY_LIST',
        'BUYING_LIST',
        'SHOP_LIST',
        'SHOPPING_LIST',
        'PACK_LIST',
        'PACKING_LIST',
        'CUSTOMERS',
        'BACKLOG',
        'SET_DATE',
        'SET_MARKUP',
        'AGE',
        'SET_AGE',
        'ITEM_AGE',
        'MAX_AGE',
        'MAXIMUM_AGE',
        'STATS',
        'STATISTICS',
        'METRICS',
        'REPORT',
        'MENU',
        'MAIN',
        'MAIN_MENU',
        'BILLING',
        'PLANS',
        'CAPTION',
        'CAPTIONS',
        'PAY',
        'PAY_STATUS',
      ].includes(exact)
    ) {
      if (exact === 'PAY_STATUS') return 'PAY';
      if (['CAPTION', 'CAPTIONS'].includes(exact)) return 'CAPTIONS';
      if (['AGE', 'ITEM_AGE', 'MAX_AGE', 'MAXIMUM_AGE'].includes(exact)) {
        return 'SET_AGE';
      }
      if (['STATISTICS', 'METRICS', 'REPORT'].includes(exact)) {
        return 'STATS';
      }
      if (['MAIN', 'MAIN_MENU'].includes(exact)) return 'MENU';
      return ['ORDER', 'ORDER_HELP'].includes(exact)
        ? 'ORDERS'
        : ['BUY_LIST', 'BUYING_LIST', 'SHOP_LIST', 'SHOPPING_LIST'].includes(
              exact,
            )
          ? 'BUYING'
          : ['PACK_LIST', 'PACKING_LIST', 'CUSTOMERS'].includes(exact)
            ? 'PACKING'
            : (exact as RepostCommand);
    }

    if (
      /start over|start afresh|restart registration|reset registration|fresh registration/i.test(
        text,
      )
    ) {
      return 'REGISTER';
    }

    if (
      /^start\b|start reposting|new products|last week|from yesterday/.test(
        text,
      )
    )
      return 'START';
    if (/^pause\b|pause my reposts|hold repost/.test(text)) return 'PAUSE';
    if (/^resume\b|continue repost/.test(text)) return 'RESUME';
    if (/^stop\b|stop all repost/.test(text)) return 'STOP';
    if (/^(stats?|metrics?|report)\b|posting stats|posting metrics/.test(text))
      return 'STATS';
    if (/^captions?\b/.test(text)) return 'CAPTIONS';
    if (
      /^(age|set age|item age|max age|maximum age)\b|older than \d+/.test(text)
    )
      return 'SET_AGE';
    if (/status|progress|settings|frequency|cadence|how.*going/.test(text))
      return 'STATUS';
    if (/groups|my reposting groups|show my groups/.test(text)) return 'GROUPS';
    if (
      /live shops|shops live|live setup|show all shops|all shops|more shops|next shops/.test(
        text,
      )
    )
      return 'SHOPS';
    if (/shop links|missing shop|supplier links|submit supplier/.test(text))
      return 'SUBMIT_SHOP_LINKS';
    if (
      /shops|shop groups|show my shops|available shops|view available/.test(
        text,
      )
    )
      return 'SHOPS';
    if (/walk ?through|practical guide|full guide|step by step/.test(text))
      return 'WALKTHROUGH';
    if (/setup|onboarding|guide|next step/.test(text)) return 'SETUP';
    if (/admin done|bot is admin|made.*admin|admin confirmed/.test(text))
      return 'ADMIN_DONE';
    if (/register|join|sign ?up|become a runner/.test(text)) return 'REGISTER';
    if (/proceed|continue|carry on|go ahead/.test(text)) return 'PROCEED';
    if (/exit|cancel|quit|stop registration|leave setup/.test(text))
      return 'EXIT';
    if (/skip|not now|later/.test(text)) return 'SKIP';
    if (/submit shop|shop links|send shop|supplier links/.test(text))
      return 'SUBMIT_SHOP_LINKS';
    if (/connect.*group|reposting group|advertising group/.test(text))
      return 'CONNECT_REPOSTING_GROUP';
    if (/how.*works|learn|explain|what.*runner commerce/.test(text))
      return 'HOW_IT_WORKS';
    if (/^(orders?|order help|how to order)$/i.test(text)) return 'ORDERS';
    if (/^(order for|add order|add to order)\b/i.test(text)) return 'ORDERS';
    if (/^(buy list|buying list|shop list|shopping list)$/i.test(text))
      return 'BUYING';
    if (/^shop\s+\d+(?:\s+(?:bought|unavailable|reset))?$/i.test(text))
      return 'BUYING';
    if (/^(pack list|packing list|customers)$/i.test(text)) return 'PACKING';
    if (/^(pack|customer)\s+\d+(?:\s+packed)?$/i.test(text)) return 'PACKING';
    if (/help|commands|what can i send/.test(text)) return 'HELP';
    if (/main menu|^menu$|all options|show options/.test(text)) return 'MENU';
    if (/support|agent|human/.test(text)) return 'SUPPORT';
    if (/backlog|older products|repost products from/.test(text))
      return 'BACKLOG';
    if (/set date|date range|custom date/.test(text)) return 'SET_DATE';
    if (/set markup|markup|runner fee/.test(text)) return 'SET_MARKUP';
    if (/^(billing|subscription|subscribe|invoice|my invoice)s?$/i.test(text))
      return 'BILLING';
    if (/^(plans?|prices?|pricing)$/i.test(text)) return 'PLANS';
    if (/^(plan|choose plan)\s+\d+\b/i.test(text)) return 'PLANS';
    if (/^(pay|payment|proof|paid|pay status)\b/i.test(text)) return 'PAY';

    return null;
  }

  async getRunnerStatus(runnerId: string) {
    const runner = await this.getRunner(runnerId);
    const whatsappRepostingEnabled = await this.getAppSettingBoolean(
      WHATSAPP_REPOSTING_ENABLED_KEY,
      false,
    );
    const testWindow = this.phase1TestWindow(runner);
    const selectedShops = runner.shopAssignments.filter((link) =>
      this.isPhase1TestShopLink(link, runner),
    );
    const liveShops = runner.shopAssignments.filter(
      (link) => link.selectedForLive && link.status === 'APPROVED',
    );
    const approvedShops = selectedShops.filter(
      (link) => link.status === 'APPROVED',
    );
    const activeGroups = runner.repostingGroups.filter((group) =>
      ACTIVE_GROUP_STATUSES.includes(group.status),
    );
    const readyGroups = activeGroups.filter(
      (group) => group.status === 'READY_FOR_REPOSTING',
    );
    const groupLimits = this.runnerGroupLimits(runner, readyGroups);
    const shopLimit = this.sourceShopLimitFromSubscription(runner);
    const savedGroupLimits = this.runnerGroupLimits(runner, activeGroups);
    const legacyDestinationGroupIds = this.legacyDestinationGroupIds(runner);
    const legacyMergedGroupIds = new Set(
      activeGroups
        .flatMap((group) => [group.whatsappGroupId, group.discoveredGroupId])
        .filter(Boolean),
    );
    const legacyMerged = legacyDestinationGroupIds.every((groupId) =>
      legacyMergedGroupIds.has(groupId),
    );
    const access = this.runnerAccess(runner);
    const blockers = this.readinessBlockers({
      runner,
      access,
      approvedShops,
      activeGroups,
      readyGroups,
    });
    const bridgeStatus = this.runnerBridgeStatus(runner.bridgeAccount);
    const repostingControl = this.runnerRepostingControl({
      runner,
      access,
      readinessBlockers: blockers,
      whatsappRepostingEnabled,
      bridgeStatus,
      testShopAssignments: runner.shopAssignments.filter((link) =>
        this.isPhase1TestShopLink(link, runner),
      ),
      liveShopAssignments: liveShops,
    });

    return {
      runner: this.publicRunner(runner),
      bridgeStatus,
      repostingControl,
      whatsappRepostingEnabled,
      legacyReposting: {
        destinationGroups: legacyDestinationGroupIds,
        autoPostEnabled: runner.autoPostEnabled,
        autoPostIntervalMinutes: runner.autoPostIntervalMinutes,
        maxPostsPerRun: runner.maxPostsPerRun,
        lastAutoPostAt: runner.lastAutoPostAt,
        mergedIntoPhase1:
          legacyDestinationGroupIds.length === 0 || legacyMerged,
      },
      access,
      testWindow,
      repostingStatus: runner.repostingStatus,
      selectedShops: selectedShops.map((link) => ({
        id: link.id,
        shopId: link.shopId,
        status: link.status,
        selectedAt: link.joinedAt,
        shopName: link.shop?.name,
        location: link.shop?.procurementCity,
        primaryGroupName:
          link.shop?.whatsappGroupMappings?.find((item) => item.isPrimarySource)
            ?.sourceGroup ||
          link.shop?.whatsappGroupMappings?.[0]?.sourceGroup ||
          null,
      })),
      shopLimit: {
        selected: selectedShops.length,
        max: shopLimit,
        label: 'Shop groups',
        expiresAt: testWindow.endsAt,
        active: testWindow.active,
      },
      liveShopLimit: {
        selected: liveShops.length,
        max: shopLimit,
        label: 'Shop groups',
      },
      repostingGroups: activeGroups.map((group) => this.publicGroup(group)),
      groupLimit: {
        selected: readyGroups.length,
        max: groupLimits.total.max,
        test: groupLimits.test,
        live: groupLimits.live,
        saved: {
          selected: activeGroups.length,
          test: savedGroupLimits.test,
          live: savedGroupLimits.live,
        },
      },
      submittedShopLinks: runner.submittedShopLinks.map((link) => ({
        id: link.id,
        inviteLink: link.inviteLink,
        status: link.status,
        notes: link.notes,
        createdAt: link.createdAt,
      })),
      readiness: {
        canStart: blockers.length === 0,
        blockers,
      },
      commands: [
        'START',
        'PAUSE',
        'RESUME',
        'STOP',
        'STATUS',
        'GROUPS',
        'SHOPS',
        'HELP',
      ],
    };
  }

  async discoverShops(options: {
    search?: string;
    location?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    const search = this.clean(options.search);
    const location = this.clean(options.location);
    const category = this.clean(options.category);
    const limit = Math.max(1, Math.min(Number(options.limit || 30), 500));
    const offset = Math.max(0, Number(options.offset || 0));
    const where: any = {
      status: 'ACTIVE',
      whatsappGroupMappings: {
        some: {
          status: 'ACTIVE',
          groupRole: 'SOURCE',
          isPrimarySource: true,
          captureEnabled: true,
        },
      },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { procurementCity: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (location) {
      where.procurementCity = { contains: location, mode: 'insensitive' };
    }
    if (category) {
      where.products = {
        some: {
          category: { contains: category, mode: 'insensitive' },
          status: 'ACTIVE',
        },
      };
    }

    const [total, shops] = await Promise.all([
      this.prisma.shop.count({ where }),
      this.prisma.shop.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          procurementCity: true,
          whatsappGroupMappings: {
            where: {
              status: 'ACTIVE',
              groupRole: 'SOURCE',
              isPrimarySource: true,
              captureEnabled: true,
            },
            select: {
              id: true,
              sourceGroup: true,
              participants: true,
              isPrimarySource: true,
              groupRole: true,
            },
            orderBy: [{ isPrimarySource: 'desc' }, { sourceGroup: 'asc' }],
          },
          _count: {
            select: {
              products: { where: { status: 'ACTIVE' } },
            },
          },
        },
        orderBy: [{ procurementCity: 'asc' }, { name: 'asc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    return {
      data: shops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        description: shop.description,
        location: shop.procurementCity,
        activeProducts: shop._count.products,
        primaryGroupName:
          shop.whatsappGroupMappings.find((group) => group.isPrimarySource)
            ?.sourceGroup ||
          shop.whatsappGroupMappings[0]?.sourceGroup ||
          null,
        groupCount: shop.whatsappGroupMappings.length,
      })),
      limits: {
        maxSelectable: DEFAULT_RUNNER_SOURCE_SHOP_LIMIT,
        liveMaxSelectable: DEFAULT_RUNNER_SOURCE_SHOP_LIMIT,
        total,
        offset,
        limit,
        hasMore: offset + shops.length < total,
      },
    };
  }

  async selectShops(runnerId: string, shopIds: string[]) {
    const uniqueShopIds = [...new Set(shopIds || [])].filter(Boolean);
    if (uniqueShopIds.length === 0) {
      throw new BadRequestException('Select at least one shop group');
    }
    const runner = await this.getRunner(runnerId);
    const shopLimit = this.sourceShopLimitFromSubscription(runner);
    if (uniqueShopIds.length > shopLimit) {
      throw new BadRequestException(
        `During Phase 1, you can select up to ${shopLimit} shop groups.`,
      );
    }
    const shops = await this.prisma.shop.findMany({
      where: {
        id: { in: uniqueShopIds },
        status: 'ACTIVE',
        whatsappGroupMappings: {
          some: {
            status: 'ACTIVE',
            groupRole: 'SOURCE',
            isPrimarySource: true,
            captureEnabled: true,
          },
        },
      },
      select: { id: true },
    });
    if (shops.length !== uniqueShopIds.length) {
      throw new BadRequestException(
        'One or more selected shops are not available for Phase 1',
      );
    }

    const existing = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: { in: ACTIVE_SHOP_STATUSES },
        OR: [
          { selectedForTest: true },
          { notes: { startsWith: PHASE1_TEST_SHOP_NOTE_PREFIX } },
        ],
      },
      select: { shopId: true },
    });
    const nextIds = new Set([
      ...existing.map((item) => item.shopId),
      ...uniqueShopIds,
    ]);
    if (nextIds.size > shopLimit) {
      throw new BadRequestException(
        `During Phase 1, you can select up to ${shopLimit} shop groups.`,
      );
    }

    for (const shopId of uniqueShopIds) {
      await this.prisma.runnerShopLink.upsert({
        where: { runnerId_shopId: { runnerId, shopId } },
        create: {
          runnerId,
          shopId,
          status: 'APPROVED',
          approvedAt: new Date(),
          autoListEnabled: true,
          autoPostEnabled: false,
          selectedForTest: true,
          notes: PHASE1_TEST_SHOP_NOTE,
        },
        update: {
          status: 'APPROVED',
          approvedAt: new Date(),
          selectedForTest: true,
          notes: PHASE1_TEST_SHOP_NOTE,
        },
      });
    }

    return this.getRunnerStatus(runnerId);
  }

  async selectLiveShops(runnerId: string, shopIds: string[]) {
    const uniqueShopIds = [...new Set(shopIds || [])].filter(Boolean);
    if (uniqueShopIds.length === 0) {
      throw new BadRequestException('Select at least one shop group');
    }
    const runner = await this.getRunner(runnerId);
    const shopLimit = this.sourceShopLimitFromSubscription(runner);
    const shops = await this.prisma.shop.findMany({
      where: {
        id: { in: uniqueShopIds },
        status: 'ACTIVE',
        whatsappGroupMappings: {
          some: {
            status: 'ACTIVE',
            groupRole: 'SOURCE',
            isPrimarySource: true,
            captureEnabled: true,
          },
        },
      },
      select: { id: true },
    });
    if (shops.length !== uniqueShopIds.length) {
      throw new BadRequestException(
        'One or more selected shop groups are not available',
      );
    }

    const existing = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: { in: ACTIVE_SHOP_STATUSES },
        selectedForLive: true,
      },
      select: { shopId: true },
    });
    const nextIds = new Set([
      ...existing.map((item) => item.shopId),
      ...uniqueShopIds,
    ]);
    if (nextIds.size > shopLimit) {
      throw new BadRequestException(
        `During Phase 1, you can select up to ${shopLimit} shop groups total.`,
      );
    }

    for (const shopId of uniqueShopIds) {
      await this.prisma.runnerShopLink.upsert({
        where: { runnerId_shopId: { runnerId, shopId } },
        create: {
          runnerId,
          shopId,
          status: 'APPROVED',
          approvedAt: new Date(),
          autoListEnabled: true,
          autoPostEnabled: false,
          selectedForLive: true,
          notes: PHASE1_LIVE_SHOP_NOTE,
        },
        update: {
          status: 'APPROVED',
          approvedAt: new Date(),
          selectedForLive: true,
          notes: PHASE1_LIVE_SHOP_NOTE,
        },
      });
    }

    return this.getRunnerStatus(runnerId);
  }

  async removeLiveShop(runnerId: string, shopId: string) {
    const link = await this.prisma.runnerShopLink.findUnique({
      where: { runnerId_shopId: { runnerId, shopId } },
    });
    if (!link || !link.selectedForLive) {
      throw new NotFoundException('Selected shop group not found');
    }
    if (link.selectedForTest) {
      await this.prisma.runnerShopLink.update({
        where: { id: link.id },
        data: { selectedForLive: false },
      });
    } else {
      await this.prisma.runnerShopLink.delete({ where: { id: link.id } });
    }
    return this.getRunnerStatus(runnerId);
  }

  async removeShop(runnerId: string, shopId: string) {
    const link = await this.prisma.runnerShopLink.findUnique({
      where: { runnerId_shopId: { runnerId, shopId } },
    });
    if (!link || !this.isPhase1TestShopLink(link)) {
      throw new NotFoundException('Selected Phase 1 shop not found');
    }
    if (link.selectedForLive) {
      await this.prisma.runnerShopLink.update({
        where: { id: link.id },
        data: { selectedForTest: false },
      });
    } else {
      await this.prisma.runnerShopLink.delete({ where: { id: link.id } });
    }
    return this.getRunnerStatus(runnerId);
  }

  async submitShopLinks(
    runnerId: string,
    value: string | string[],
    options: { bridgeAccountId?: string | null; rawText?: string } = {},
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { id: true, serviceArea: true, phase1Setup: true },
    });
    if (!runner) throw new NotFoundException('Runner not found');
    const links = this.extractInviteLinks(value);
    if (links.length === 0) {
      throw new BadRequestException(
        'Send at least one WhatsApp group invite link',
      );
    }
    const shoppingDestination = this.runnerShoppingDestination(runner);
    const destinationNote = shoppingDestination
      ? `Shopping destination: ${shoppingDestination}`
      : null;

    const bridgeAccountId =
      this.clean(options.bridgeAccountId) ||
      (await this.resolveBridgeAccountFromText(options.rawText || ''));
    const saved: any[] = [];
    const messages: string[] = [];
    for (const inviteLink of links) {
      const known = await this.resolveKnownShopInviteLink(runnerId, inviteLink);
      const item = await this.prisma.runnerSubmittedShopLink.upsert({
        where: { runnerId_inviteLink: { runnerId, inviteLink } },
        create: {
          runnerId,
          inviteLink,
          status: known ? known.status : 'PENDING_REVIEW',
          notes: [known?.notes, destinationNote].filter(Boolean).join('\n'),
        },
        update: {
          status: known ? known.status : 'PENDING_REVIEW',
          notes: [known?.notes, destinationNote].filter(Boolean).join('\n'),
        },
      });
      saved.push(item);
      if (known?.message) messages.push(known.message);
      if (!known && bridgeAccountId) {
        try {
          const joinJob = await this.queueBridgeGroupJoin({
            bridgeAccountId,
            inviteLink,
            metadataKey: `RUNNER_SUBMITTED_SHOP_LINK:${item.id}`,
          });
          await this.prisma.runnerSubmittedShopLink.update({
            where: { id: item.id },
            data: {
              notes: [
                item.notes,
                destinationNote,
                `Bridge join queued for supplier/shop review: ${joinJob.id}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          });
        } catch (error: any) {
          await this.prisma.runnerSubmittedShopLink.update({
            where: { id: item.id },
            data: {
              notes: [
                item.notes,
                destinationNote,
                `Bridge join could not be queued: ${error?.message || 'bridge unavailable'}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          });
        }
      }
    }

    return {
      message:
        messages.length > 0
          ? [
              ...messages,
              saved.some((item) => item.status === 'PENDING_REVIEW')
                ? `Other new shop links were received and will be reviewed before they are added to Runner Commerce${shoppingDestination ? ` for ${shoppingDestination}` : ''}.`
                : '',
            ]
              .filter(Boolean)
              .join('\n')
          : `Shop links received. They will be reviewed before they are added to Runner Commerce${shoppingDestination ? ` for ${shoppingDestination}` : ''}.`,
      bridgeJoinQueued: Boolean(bridgeAccountId),
      data: saved,
    };
  }

  private async resolveKnownShopInviteLink(
    runnerId: string,
    inviteLink: string,
  ) {
    const mapping = await this.prisma.whatsAppGroupMapping.findFirst({
      where: { inviteLink },
      include: {
        shop: {
          select: { id: true, name: true, status: true },
        },
      },
    });
    if (!mapping?.shop || mapping.shop.status !== 'ACTIVE') return null;

    const activeSource = await this.prisma.whatsAppGroupMapping.findFirst({
      where: {
        shopId: mapping.shopId,
        status: 'ACTIVE',
        groupRole: 'SOURCE',
        isPrimarySource: true,
        captureEnabled: true,
      },
      orderBy: [{ isPrimarySource: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!activeSource) return null;

    const runner = await this.getRunner(runnerId);
    const shopLimit = this.sourceShopLimitFromSubscription(runner);

    const selectedCount = await this.prisma.runnerShopLink.count({
      where: {
        runnerId,
        status: { in: ACTIVE_SHOP_STATUSES },
        OR: [
          { selectedForTest: true },
          { notes: { startsWith: PHASE1_TEST_SHOP_NOTE_PREFIX } },
        ],
      },
    });
    const existingSelection = await this.prisma.runnerShopLink.findUnique({
      where: { runnerId_shopId: { runnerId, shopId: mapping.shopId } },
      select: { id: true, status: true, notes: true },
    });
    const canSelect =
      this.isPhase1TestShopLink(existingSelection) || selectedCount < shopLimit;
    if (canSelect) {
      await this.prisma.runnerShopLink.upsert({
        where: { runnerId_shopId: { runnerId, shopId: mapping.shopId } },
        create: {
          runnerId,
          shopId: mapping.shopId,
          status: 'APPROVED',
          approvedAt: new Date(),
          autoListEnabled: true,
          autoPostEnabled: false,
          selectedForTest: true,
          notes: PHASE1_TEST_SHOP_NOTE,
        },
        update: {
          status: 'APPROVED',
          approvedAt: new Date(),
          selectedForTest: true,
          notes: PHASE1_TEST_SHOP_NOTE,
        },
      });
    }

    const isActiveSource = mapping.id === activeSource.id;
    const status = canSelect ? 'ACTIVE' : 'DUPLICATE';
    const notes = isActiveSource
      ? `Known active source for ${mapping.shop.name}.`
      : `Known ${mapping.status.toLowerCase()} ${mapping.groupRole.toLowerCase()} for ${mapping.shop.name}; active source is ${activeSource.sourceGroup}.`;

    return {
      status,
      notes,
      message: isActiveSource
        ? canSelect
          ? `${mapping.shop.name} is already available. I selected the active group for you.`
          : `${mapping.shop.name} is already available, but your Phase 1 shop selection is full. Remove a shop before adding it.`
        : canSelect
          ? `${mapping.sourceGroup} is a related or paused group. I selected the active ${mapping.shop.name} group for you: ${activeSource.sourceGroup}.`
          : `${mapping.sourceGroup} is a related or paused group for ${mapping.shop.name}. The active group is ${activeSource.sourceGroup}, but your Phase 1 shop selection is full.`,
    };
  }

  async submitRepostingGroup(
    runnerId: string,
    data: { inviteLink?: string; groupName?: string; isTestGroup?: boolean },
  ) {
    const runner = await this.getRunner(runnerId);
    const inviteLink = this.clean(data.inviteLink);
    if (!inviteLink || !this.isInviteLink(inviteLink)) {
      throw new BadRequestException(
        [
          'Send a valid WhatsApp reposting group invite link.',
          '',
          'Send one WhatsApp group link at a time:',
          'https://chat.whatsapp.com/...',
        ].join('\n'),
      );
    }
    const activeGroups = runner.repostingGroups.filter((group) =>
      ACTIVE_GROUP_STATUSES.includes(group.status),
    );
    const groupNameFromInput = this.clean(data.groupName);
    const groupLimits = this.runnerGroupLimits(runner, activeGroups);
    const isTestGroup = false;

    if (groupLimits.total.selected >= groupLimits.total.max) {
      throw new BadRequestException(
        [
          `Your current package allows ${groupLimits.total.max} posting group${groupLimits.total.max === 1 ? '' : 's'}.`,
          '',
          'Next step:',
          '1. Reply GROUPS to review your saved posting groups.',
          '2. Reply STATUS to see what is still needed.',
          '3. Reply SUPPORT if you need help with posting groups.',
          this.supportCtaLine(),
        ].join('\n'),
      );
    }

    const groupName = groupNameFromInput || 'Posting group';
    const bridgeAccountId =
      runner.bridgeAccountId ||
      (await this.selectAvailableRunnerBridgeAccountId());
    if (!runner.bridgeAccountId && bridgeAccountId) {
      await this.prisma.runner.update({
        where: { id: runner.id },
        data: { bridgeAccountId },
      });
    }

    const group = await this.prisma.runnerRepostingGroup.create({
      data: {
        runnerId,
        inviteLink,
        groupName,
        isTestGroup,
        status: 'GROUP_LINK_RECEIVED',
        botJoinStatus: 'GROUP_LINK_RECEIVED',
        botAdminStatus: 'ADMIN_STATUS_PENDING',
        bridgeAccountId,
      },
    });

    const groupJoinQueued = await this.queueRunnerRepostingGroupJoin({
      groupId: group.id,
      inviteLink,
      bridgeAccountId,
    });

    return {
      message: groupJoinQueued
        ? [
            'Posting group link received.',
            'The bot is joining automatically.',
            '',
            'Please wait while the bot joins the group.',
          ].join('\n')
        : [
            'Posting group link received.',
            'The bot will try joining again when the connection is available.',
            '',
            'Please keep the invite link active and wait for confirmation.',
          ].join('\n'),
      data: this.publicGroup(group),
    };
  }

  private async queueRunnerRepostingGroupJoin(data: {
    groupId: string;
    inviteLink: string;
    bridgeAccountId?: string | null;
  }) {
    const bridgeAccountId =
      this.clean(data.bridgeAccountId) ||
      (await this.activeBotBridgeAccount())?.id ||
      (await this.primaryBridgeAccountId());
    if (!bridgeAccountId) {
      await this.prisma.runnerRepostingGroup.update({
        where: { id: data.groupId },
        data: {
          notes:
            'Bridge join was not queued automatically: no active WhatsApp bridge is available.',
        },
      });
      return false;
    }

    try {
      const joinJob = await this.queueBridgeGroupJoin({
        bridgeAccountId,
        inviteLink: data.inviteLink,
        metadataKey: `RUNNER_REPOSTING_GROUP:${data.groupId}`,
      });
      await this.prisma.runnerRepostingGroup.update({
        where: { id: data.groupId },
        data: {
          bridgeAccountId,
          botJoinStatus: 'JOIN_ATTEMPT_STARTED',
          status: 'JOIN_ATTEMPT_STARTED',
          notes: `Bridge join queued automatically: ${joinJob.id}`,
        },
      });
      return true;
    } catch (error: any) {
      await this.prisma.runnerRepostingGroup.update({
        where: { id: data.groupId },
        data: {
          notes: `Bridge join was not queued automatically: ${error?.message || 'bridge unavailable'}`,
        },
      });
      return false;
    }
  }

  async confirmBotAdmin(runnerId: string, groupId: string) {
    const group = await this.prisma.runnerRepostingGroup.findFirst({
      where: { id: groupId, runnerId },
    });
    if (!group) throw new NotFoundException('Reposting group not found');

    const updated = await this.prisma.runnerRepostingGroup.update({
      where: { id: group.id },
      data: {
        runnerConfirmedAdminAt: new Date(),
        status:
          group.status === 'READY_FOR_REPOSTING'
            ? 'READY_FOR_REPOSTING'
            : 'RUNNER_CONFIRMED_ADMIN',
      },
    });

    return {
      message:
        'Bot admin confirmation recorded as a support fallback. Automatic bot joining can still mark the group ready when the bridge confirms it can post.',
      data: this.publicGroup(updated),
    };
  }

  async commandReposting(
    runnerId: string,
    input: string,
    context: Record<string, unknown> = {},
  ) {
    const command = this.parseCommand(input);
    if (!command) {
      return {
        command: null,
        message: this.helpMessage(),
      };
    }

    if (command === 'STATUS') return this.statusCommand(runnerId);
    if (command === 'GROUPS') return this.groupsCommand(runnerId);
    if (command === 'SHOPS') return this.shopsCommand(runnerId);
    if (command === 'HELP') return { command, message: this.helpMessage() };
    if (command === 'STATS')
      return this.runnerStatsBotResponse(runnerId, input);
    if (command === 'SET_AGE') {
      return this.runnerSetItemAgeBotResponse(runnerId, input, context);
    }
    if (command === 'SUPPORT') {
      return {
        command,
        message: this.supportMessage(),
      };
    }
    if (command === 'START') {
      const startScope = this.startScope(input);
      const postingAgeReady = await this.ensurePostingAgeConfirmed(
        runnerId,
        input,
        startScope,
      );
      if (!postingAgeReady.ready) {
        return {
          command,
          status: 'BLOCKED',
          message: postingAgeReady.message,
          readiness: { canStart: false, blockers: ['POSTING_AGE_REQUIRED'] },
        };
      }

      const status = await this.getRunnerStatus(runnerId);
      const startBlockers =
        startScope === 'live'
          ? this.liveStartBlockers(status)
          : this.testStartBlockers(status);
      if (startBlockers.length > 0) {
        return {
          command,
          status: 'BLOCKED',
          message: this.blockedStartMessage(startBlockers),
          readiness: { canStart: false, blockers: startBlockers },
        };
      }
      if (startScope === 'live') {
        await this.activateLiveRunnerPosting(runnerId);
        return {
          command,
          status: 'ACTIVE',
          message: [
            'Reposting has started.',
            '',
            'The bot will post products from your selected shop groups into all ready posting groups.',
            '',
            'Controls: PAUSE, RESUME, STOP, STATUS.',
          ].join('\n'),
        };
      }
      await this.prisma.$transaction([
        this.prisma.runner.update({
          where: { id: runnerId },
          data: { repostingStatus: 'ACTIVE', autoPostEnabled: true },
        }),
        this.prisma.runnerShopLink.updateMany({
          where: { runnerId, selectedForTest: true, status: 'APPROVED' },
          data: { autoPostEnabled: true },
        }),
      ]);
      return {
        command,
        status: 'ACTIVE',
        message: [
          'Reposting has started.',
          '',
          'The bot will post products from your selected shop groups into your posting group.',
          '',
          'Controls:',
          'PAUSE - pause reposting',
          'RESUME - continue reposting',
          'STOP - stop reposting',
          'STATUS - check setup',
        ].join('\n'),
      };
    }
    if (command === 'PAUSE') {
      if (this.hasShopPostingTarget(input)) {
        return this.runnerShopPostingControlResponse(
          runnerId,
          command,
          input,
          context,
        );
      }
      const scope = this.startScope(input);
      const remainingEnabled = await this.setScopedShopPosting(
        runnerId,
        scope,
        false,
      );
      return {
        command,
        status: remainingEnabled > 0 ? 'ACTIVE' : 'PAUSED',
        message: [
          'Reposting has been paused.',
          '',
          'Your selected shops, posting group, markup, and settings remain saved.',
          'Reply STATUS to check setup.',
        ].join('\n'),
      };
    }
    if (command === 'RESUME') {
      if (this.hasShopPostingTarget(input)) {
        return this.runnerShopPostingControlResponse(
          runnerId,
          command,
          input,
          context,
        );
      }
      const scope = this.startScope(input);
      const postingAgeReady = await this.ensurePostingAgeConfirmed(
        runnerId,
        input,
        scope,
      );
      if (!postingAgeReady.ready) {
        return {
          command,
          status: 'BLOCKED',
          message: postingAgeReady.message,
          readiness: { canStart: false, blockers: ['POSTING_AGE_REQUIRED'] },
        };
      }

      const status = await this.getRunnerStatus(runnerId);
      const blockers =
        scope === 'live'
          ? this.liveStartBlockers(status)
          : this.testStartBlockers(status);
      if (blockers.length > 0) {
        return {
          command,
          status: 'BLOCKED',
          message: this.blockedStartMessage(blockers),
          readiness: { canStart: false, blockers },
        };
      }
      if (scope === 'live') {
        await this.activateLiveRunnerPosting(runnerId);
      } else {
        await this.prisma.$transaction([
          this.prisma.runner.update({
            where: { id: runnerId },
            data: { repostingStatus: 'ACTIVE', autoPostEnabled: true },
          }),
          this.prisma.runnerShopLink.updateMany({
            where: {
              runnerId,
              status: 'APPROVED',
              selectedForTest: true,
            },
            data: { autoPostEnabled: true },
          }),
        ]);
      }
      return {
        command,
        status: 'ACTIVE',
        message:
          'Reposting has resumed. Reply STATUS to check progress or PAUSE to hold reposting.',
      };
    }
    if (command === 'STOP') {
      const scope = this.startScope(input);
      const remainingEnabled = await this.setScopedShopPosting(
        runnerId,
        scope,
        false,
        'STOPPED',
      );
      return {
        command,
        status: remainingEnabled > 0 ? 'ACTIVE' : 'STOPPED',
        message:
          'Reposting has been stopped. Your selected shops and posting group remain saved.',
      };
    }

    return {
      command,
      message:
        'This command is recorded for Phase 1. Use STATUS to see your setup or START once your trial, shops, and groups are ready.',
    };
  }

  private startScope(input: string) {
    return /\btest\b/i.test(String(input || '')) ? 'test' : 'live';
  }

  private postingAgeScope(input: string): 'test' | 'live' | 'all' {
    const text = String(input || '');
    if (/\btest\b/i.test(text)) return 'test';
    if (/\blive\b/i.test(text)) return 'live';
    return 'all';
  }

  private cleanPhase1Setup(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private postingAgePromptMessage() {
    return this.chatBlock('POSTING AGE NEEDED', [
      'Choose the product age window before reposting starts.',
      '',
      'Reply AGE 3 DAYS, AGE 7 DAYS, or AGE <number> DAYS before starting.',
      'You can also reply START 3 DAYS, RESUME 3 DAYS, or START LIVE 7 DAYS.',
      '',
      'The allowed range is 1 to 90 days.',
    ]);
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

  private async hasConfirmedPostingAge(
    runnerId: string,
    scope: 'test' | 'live',
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { phase1Setup: true },
    });
    const setup = this.cleanPhase1Setup(runner?.phase1Setup);
    const days = Number(setup.postingAgeDays || 0);
    const confirmedAt = String(setup.postingAgeConfirmedAt || '');
    const confirmedScope = String(setup.postingAgeScope || '');
    return (
      Boolean(confirmedAt) &&
      days >= 1 &&
      days <= 90 &&
      (confirmedScope === 'all' || confirmedScope === scope)
    );
  }

  private async applyPostingAgeWindowToScope(
    runnerId: string,
    days: number,
    scope: 'test' | 'live' | 'all',
  ) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        ...(scope === 'test'
          ? { selectedForTest: true }
          : scope === 'live'
            ? { OR: [{ selectedForTest: true }, { selectedForLive: true }] }
            : {}),
      },
      select: { shopId: true },
    });
    const shopIds = links.map((link) => link.shopId);
    if (shopIds.length > 0) {
      const ageCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      await this.prisma.$transaction([
        this.prisma.runnerShopLink.updateMany({
          where: { runnerId, shopId: { in: shopIds }, status: 'APPROVED' },
          data: { maximumListingAgeDays: days },
        }),
        this.prisma.runnerListing.updateMany({
          where: {
            runnerId,
            shopId: { in: shopIds },
            status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] },
          },
          data: { maximumListingAgeDays: days },
        }),
        this.prisma.runnerListing.updateMany({
          where: {
            runnerId,
            shopId: { in: shopIds },
            status: 'INACTIVE',
            product: {
              status: 'ACTIVE',
              OR: [
                { sourceRefreshedAt: { gte: ageCutoff } },
                { createdAt: { gte: ageCutoff } },
                {
                  whatsappImports: { some: { receivedAt: { gte: ageCutoff } } },
                },
              ],
            },
          },
          data: {
            status: 'ACTIVE',
            autoPostApproved: true,
            maximumListingAgeDays: days,
            pausedAt: null,
            stoppedAt: null,
          },
        }),
      ]);
    }
    await this.markPostingAgeConfirmed(runnerId, days, scope);
  }

  private async ensurePostingAgeConfirmed(
    runnerId: string,
    input: string,
    scope: 'test' | 'live',
  ): Promise<{ ready: true } | { ready: false; message: string }> {
    const inlineDays = this.parseItemAgeDays(input);
    if (inlineDays) {
      await this.applyPostingAgeWindowToScope(runnerId, inlineDays, scope);
      return { ready: true };
    }

    if (await this.hasConfirmedPostingAge(runnerId, scope)) {
      return { ready: true };
    }

    return { ready: false, message: this.postingAgePromptMessage() };
  }

  private async activateLiveRunnerPosting(runnerId: string) {
    await this.prisma.$transaction([
      this.prisma.runner.update({
        where: { id: runnerId },
        data: { repostingStatus: 'ACTIVE', autoPostEnabled: true },
      }),
      this.prisma.runnerShopLink.updateMany({
        where: {
          runnerId,
          status: 'APPROVED',
          OR: [{ selectedForTest: true }, { selectedForLive: true }],
        },
        data: {
          selectedForTest: false,
          selectedForLive: true,
          autoPostEnabled: true,
        },
      }),
    ]);
  }

  private async setScopedShopPosting(
    runnerId: string,
    scope: 'test' | 'live',
    enabled: boolean,
    inactiveStatus: 'PAUSED' | 'STOPPED' = 'PAUSED',
  ) {
    await this.prisma.runnerShopLink.updateMany({
      where: {
        runnerId,
        status: 'APPROVED',
        ...(scope === 'live'
          ? { selectedForLive: true }
          : { selectedForTest: true }),
      },
      data: { autoPostEnabled: enabled },
    });

    const remainingEnabled = await this.prisma.runnerShopLink.count({
      where: {
        runnerId,
        status: 'APPROVED',
        autoPostEnabled: true,
        OR: [{ selectedForTest: true }, { selectedForLive: true }],
      },
    });

    await this.prisma.runner.update({
      where: { id: runnerId },
      data: {
        repostingStatus: remainingEnabled > 0 ? 'ACTIVE' : inactiveStatus,
        autoPostEnabled: remainingEnabled > 0,
      },
    });

    return remainingEnabled;
  }

  private hasShopPostingTarget(input: string) {
    return /\b(all\s+shops?|shops?\s+\d|shop\s+\d)/i.test(String(input || ''));
  }

  private async runnerShopPostingControlResponse(
    runnerId: string,
    command: 'PAUSE' | 'RESUME',
    input: string,
    context: Record<string, unknown>,
  ) {
    const enabled = command === 'RESUME';
    const resolved = await this.resolveRunnerShopTargets(
      runnerId,
      input,
      context,
    );

    if (resolved.error) {
      return {
        command,
        status: 'BLOCKED',
        message: resolved.error,
      };
    }

    const shopIds = resolved.targets.map((shop) => shop.shopId);
    await this.prisma.runnerShopLink.updateMany({
      where: {
        runnerId,
        shopId: { in: shopIds },
        status: 'APPROVED',
      },
      data: { autoPostEnabled: enabled },
    });

    const remainingEnabled = await this.prisma.runnerShopLink.count({
      where: {
        runnerId,
        status: 'APPROVED',
        autoPostEnabled: true,
        OR: [{ selectedForTest: true }, { selectedForLive: true }],
      },
    });

    await this.prisma.runner.update({
      where: { id: runnerId },
      data: {
        repostingStatus: remainingEnabled > 0 ? 'ACTIVE' : 'PAUSED',
        autoPostEnabled: remainingEnabled > 0,
      },
    });

    return {
      command,
      status: remainingEnabled > 0 ? 'ACTIVE' : 'PAUSED',
      message: this.chatBlock(
        enabled ? 'SHOP REPOSTING RESUMED' : 'SHOP REPOSTING PAUSED',
        [
          enabled
            ? 'These shop groups can repost again:'
            : 'These shop groups are paused:',
          ...resolved.targets.map(
            (shop, index) => `${index + 1}. ${shop.name || shop.shopId}`,
          ),
          '',
          `Active shop groups now: ${remainingEnabled}`,
          '',
          'Useful commands:',
          'PAUSE SHOP 1,2 - pause selected shops',
          'RESUME SHOP 1,2 - resume selected shops',
          'AGE 7 DAYS - set item age window',
          'STATS - view posting metrics',
        ],
      ),
    };
  }

  private async runnerSetItemAgeBotResponse(
    runnerId: string,
    input: string,
    context: Record<string, unknown>,
  ) {
    const days = this.parseItemAgeDays(input);
    if (!days) {
      return {
        command: 'SET_AGE',
        status: 'BLOCKED',
        message: this.chatBlock('ITEM AGE NEEDED', [
          'Please include the age window for products to repost.',
          '',
          'Examples:',
          'AGE 7 DAYS - apply to all selected shops',
          'AGE 3 DAYS SHOP 1,2 - apply to selected shops from SHOPS',
          '',
          'The allowed range is 1 to 90 days.',
        ]),
      };
    }

    const hasShopTarget = this.hasShopPostingTarget(input);
    const resolved = hasShopTarget
      ? await this.resolveRunnerShopTargets(runnerId, input, context, true)
      : await this.resolveAllRunnerShopTargets(runnerId);

    if (resolved.error) {
      return {
        command: 'SET_AGE',
        status: 'BLOCKED',
        message: resolved.error,
      };
    }

    const shopIds = resolved.targets.map((shop) => shop.shopId);
    const ageCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const confirmationScope = hasShopTarget
      ? 'custom'
      : this.postingAgeScope(input);
    await this.markPostingAgeConfirmed(runnerId, days, confirmationScope);
    const [links, listings, revivedListings] = await this.prisma.$transaction([
      this.prisma.runnerShopLink.updateMany({
        where: {
          runnerId,
          shopId: { in: shopIds },
          status: 'APPROVED',
        },
        data: { maximumListingAgeDays: days },
      }),
      this.prisma.runnerListing.updateMany({
        where: {
          runnerId,
          shopId: { in: shopIds },
          status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] },
        },
        data: { maximumListingAgeDays: days },
      }),
      this.prisma.runnerListing.updateMany({
        where: {
          runnerId,
          shopId: { in: shopIds },
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
          maximumListingAgeDays: days,
          pausedAt: null,
          stoppedAt: null,
        },
      }),
    ]);

    return {
      command: 'SET_AGE',
      status: 'UPDATED',
      message: this.chatBlock(
        'ITEM AGE UPDATED',
        [
          `New reposting age window: ${days} day${days === 1 ? '' : 's'}`,
          `Shop groups updated: ${links.count}`,
          `Existing listings updated: ${listings.count}`,
          `Expired listings revived for posting: ${revivedListings.count}`,
          '',
          'Applied to:',
          ...resolved.targets
            .slice(0, 10)
            .map((shop, index) => `${index + 1}. ${shop.name || shop.shopId}`),
          resolved.targets.length > 10
            ? `...and ${resolved.targets.length - 10} more`
            : '',
          '',
          'The bot will use this age window when deciding which items are eligible for reposting.',
          'Reply STATS to view posting metrics or STATUS to check readiness.',
        ].filter(Boolean),
      ),
    };
  }

  private async runnerStatsBotResponse(runnerId: string, input: string) {
    if (!this.runnerService?.getAutomationMetrics) {
      return {
        command: 'STATS',
        status: 'UNAVAILABLE',
        message: this.chatBlock('POSTING STATS', [
          'Posting stats are not available in this bot process right now.',
          'Reply STATUS for setup readiness or SUPPORT for help.',
        ]),
      };
    }

    const hours = this.parseStatsHours(input);
    const metrics = await this.runnerService.getAutomationMetrics(runnerId, {
      hours,
      intervalMinutes: 60,
    });
    const summary = metrics.summary || {};
    const trends = metrics.postingTrends?.periods || [];
    const shopTotals = metrics.shopGroupMetrics?.shopTotals || [];
    const topShops = [...shopTotals]
      .sort(
        (a: any, b: any) => Number(b.reposted || 0) - Number(a.reposted || 0),
      )
      .slice(0, 5);

    return {
      command: 'STATS',
      status: 'OK',
      data: metrics,
      message: this.chatBlock('RUNNER POSTING STATS', [
        `Range: last ${hours} hour${hours === 1 ? '' : 's'}`,
        '',
        `Captured products: ${summary.captured || 0}`,
        `Listings created: ${summary.listingsCreated || 0}`,
        `Ready for reposting: ${summary.pendingAutoPostListings || 0}`,
        `Posted: ${summary.reposted || 0}`,
        `Failed attempts: ${summary.repostFailed || 0}`,
        summary.latestRepostAt
          ? `Latest repost: ${this.formatBotDateTime(summary.latestRepostAt)}`
          : 'Latest repost: none yet',
        '',
        'Posting trend:',
        ...(trends.length
          ? trends.map(
              (period: any) =>
                `${period.label}: ${period.total || 0} posts, avg ${period.averagePerDay || 0}/day`,
            )
          : ['No trend data yet.']),
        '',
        'Top shop groups:',
        ...(topShops.length
          ? topShops.map(
              (shop: any, index: number) =>
                `${index + 1}. ${shop.shopName || shop.shopId} - ${shop.reposted || 0} posted, ${shop.repostFailed || 0} failed, ${shop.autoPostEnabled ? 'on' : 'paused'}`,
            )
          : ['No shop posting data yet.']),
        '',
        'Try STATS 72H for a longer recent range.',
      ]),
    };
  }

  private parseItemAgeDays(input: string) {
    const text = String(input || '').toLowerCase();
    const hoursMatch = text.match(/\b(\d{1,4})\s*(?:hours?|hrs?|h)\b/);
    if (hoursMatch?.[1]) {
      return Math.max(1, Math.min(90, Math.ceil(Number(hoursMatch[1]) / 24)));
    }
    const daysMatch =
      text.match(
        /\b(?:age|set age|item age|max age|maximum age)\D+(\d{1,3})\b/,
      ) ||
      text.match(/\b(\d{1,3})\s*(?:days?|d)\b/) ||
      text.match(/\bolder than\s+(\d{1,3})\b/);
    if (!daysMatch?.[1]) return null;
    return Math.max(1, Math.min(90, Number(daysMatch[1]) || 14));
  }

  private parseStatsHours(input: string) {
    const text = String(input || '').toLowerCase();
    const days = text.match(/\b(\d{1,2})\s*(?:days?|d)\b/);
    if (days?.[1]) return Math.max(6, Math.min(72, Number(days[1]) * 24));
    const hours = text.match(/\b(\d{1,3})\s*(?:hours?|hrs?|h)\b/);
    if (hours?.[1]) return Math.max(6, Math.min(72, Number(hours[1])));
    return 24;
  }

  private parseShopTargetNumbers(input: string, ignoreFirstNumber = false) {
    const text = String(input || '');
    const explicit = text.match(/\bshops?\s+([\d,\s]+)/i);
    const numbers = explicit?.[1]
      ? this.parseNumberList(explicit[1])
      : this.parseNumberList(text);
    return ignoreFirstNumber && !explicit ? numbers.slice(1) : numbers;
  }

  private async resolveRunnerShopTargets(
    runnerId: string,
    input: string,
    context: Record<string, unknown>,
    ignoreFirstNumber = false,
  ): Promise<{
    targets: Array<{ shopId: string; name?: string }>;
    error?: string;
  }> {
    if (/\ball\s+shops?\b/i.test(String(input || ''))) {
      return this.resolveAllRunnerShopTargets(runnerId);
    }

    const numbers = this.parseShopTargetNumbers(input, ignoreFirstNumber);
    if (numbers.length === 0) {
      return {
        targets: [],
        error: this.chatBlock('SHOP NUMBER NEEDED', [
          'Please include the shop number from your SHOPS list.',
          '',
          'Examples:',
          'PAUSE SHOP 1,2',
          'RESUME SHOP 1',
          'AGE 7 DAYS SHOP 1,2',
          '',
          'Reply SHOPS to refresh the numbered list.',
        ]),
      };
    }

    const contextOptions = Array.isArray(context.selectedShopOptions)
      ? (context.selectedShopOptions as Array<{
          shopId?: string;
          name?: string;
        }>)
      : [];
    const selectedFromContext = numbers
      .map((number) => contextOptions[number - 1])
      .filter((shop) => shop?.shopId)
      .map((shop) => ({
        shopId: String(shop.shopId),
        name: shop.name ? String(shop.name) : undefined,
      }));

    if (selectedFromContext.length === numbers.length) {
      return { targets: selectedFromContext };
    }

    const all = await this.getRunnerPostingShopOptions(runnerId);
    const selectedFromDb = numbers
      .map((number) => all[number - 1])
      .filter((shop) => shop?.shopId);

    if (selectedFromDb.length !== numbers.length) {
      return {
        targets: [],
        error: this.chatBlock('SHOP NUMBER NOT FOUND', [
          'One or more shop numbers were not found.',
          '',
          'Reply SHOPS to refresh the numbered list, then try again.',
          'Example: PAUSE SHOP 1,2',
        ]),
      };
    }

    return { targets: selectedFromDb };
  }

  private async resolveAllRunnerShopTargets(runnerId: string): Promise<{
    targets: Array<{ shopId: string; name?: string }>;
    error?: string;
  }> {
    const targets = await this.getRunnerPostingShopOptions(runnerId);
    if (targets.length === 0) {
      return {
        targets: [],
        error: this.chatBlock('NO SHOP GROUPS', [
          'No approved selected shop groups were found.',
          'Reply SHOPS to choose shop groups first.',
        ]),
      };
    }
    return { targets };
  }

  private async getRunnerPostingShopOptions(runnerId: string) {
    const links = await this.prisma.runnerShopLink.findMany({
      where: {
        runnerId,
        status: 'APPROVED',
        OR: [{ selectedForTest: true }, { selectedForLive: true }],
      },
      include: { shop: { select: { name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return links.map((link: any) => ({
      shopId: link.shopId,
      name: link.shop?.name || link.shopName || link.shopId,
    }));
  }

  private testStartBlockers(status: any) {
    const blockers: string[] = [];
    const approvedTestShops = (status.selectedShops || []).filter(
      (shop: any) => shop.status === 'APPROVED',
    );
    const readyTestGroups = (status.repostingGroups || []).filter(
      (group: any) => group.status === 'READY_FOR_REPOSTING',
    );
    if (!['ACTIVE', 'APPROVED'].includes(status.runner?.status)) {
      blockers.push('Runner must be approved/active');
    }
    if (!status.access?.active) {
      blockers.push('Phase 1 trial or subscription must be active');
    }
    if (approvedTestShops.length === 0) {
      blockers.push('Select at least one approved shop group');
    }
    if (readyTestGroups.length === 0) {
      blockers.push(
        'At least one posting group must be ready. Reply GROUPS, then send a WhatsApp group invite link so the bot can join automatically.',
      );
    }
    return blockers;
  }

  private liveStartBlockers(status: any) {
    const blockers: string[] = [];
    const readyLiveGroups = (status.repostingGroups || []).filter(
      (group: any) => group.status === 'READY_FOR_REPOSTING',
    );
    if (!['ACTIVE', 'APPROVED'].includes(status.runner?.status)) {
      blockers.push('Runner must be approved/active');
    }
    if (!status.access?.active) {
      blockers.push('Phase 1 trial or subscription must be active');
    }
    if (
      Number(
        status.liveShopLimit?.selected || status.shopLimit?.selected || 0,
      ) === 0
    ) {
      blockers.push('Select at least one approved shop group');
    }
    if (readyLiveGroups.length === 0) {
      blockers.push('At least one posting group must be ready');
    }
    return blockers;
  }

  async handleBotMessage(data: {
    whatsappNumber: string;
    messageText: string;
    bridgeAccountId?: string;
    messageId?: string;
    mediaUrls?: string[];
    receivedAt?: string;
  }) {
    const whatsappNumber = this.normalizePhone(data.whatsappNumber);
    if (!whatsappNumber) {
      throw new BadRequestException('WhatsApp number is required');
    }
    const activeBotBridge = await this.activeBotBridgeAccount();
    const incomingBridgeAccountId = this.clean(data.bridgeAccountId);

    const phoneCandidates = this.phoneLookupCandidates(whatsappNumber);
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...phoneCandidates.map((phone) => ({ phone })),
          ...phoneCandidates.map((phone) => ({
            runner: { is: { phone } },
          })),
        ],
      },
      include: { role: true, runner: true },
    });
    if (!user) {
      const directRunner = await this.prisma.runner.findFirst({
        where: {
          OR: phoneCandidates.map((phone) => ({ phone })),
        },
        include: { user: { include: { role: true } } },
      });
      if (directRunner?.user) {
        user = {
          ...directRunner.user,
          runner: directRunner,
        } as any;
      }
    }
    const runner = user?.runner || null;
    const isRegisteredAdminBotUser = this.isRegisteredAdminBotUser(
      user,
      whatsappNumber,
    );
    const adminOnlyBotMode =
      isRegisteredAdminBotUser && user?.role?.name !== 'SUPERUSER';
    const command = this.parseCommand(data.messageText);
    const previousSessionRecord = await this.prisma.botSession.findUnique({
      where: { id: `${whatsappNumber}:phase1` },
      select: {
        currentStep: true,
        context: true,
        runnerId: true,
        updatedAt: true,
      },
    });
    const sessionTimedOut = this.isBotSessionTimedOut(
      previousSessionRecord?.updatedAt,
    );
    const previousSession = sessionTimedOut ? null : previousSessionRecord;
    const isNewChatSession = !previousSessionRecord || sessionTimedOut;
    const inviteLinks = this.extractInviteLinks(data.messageText);
    const followUpStep = previousSession?.currentStep;
    const previousContext =
      previousSession?.context && typeof previousSession.context === 'object'
        ? (previousSession.context as Record<string, unknown>)
        : {};
    const welcomeInterviewChoice =
      followUpStep === 'WELCOME_INTERVIEW' &&
      !this.containsOrderCode(data.messageText)
        ? this.parseWelcomeInterviewChoice(data.messageText)
        : null;
    const registeredRunnerIdFromContext =
      typeof previousContext.registeredRunnerId === 'string'
        ? previousContext.registeredRunnerId
        : null;
    const runnerControlMode =
      previousContext.runnerControlMode === true ||
      previousContext.enrolmentStatus === 'ACTIVE';
    const completedRegistrationRunnerId = runnerControlMode
      ? registeredRunnerIdFromContext || previousSession?.runnerId || null
      : null;
    const mediaUrls = this.cleanStringArray(data.mediaUrls, 8, 500);
    const exitResponse = command === 'EXIT' ? this.exitBotResponse() : null;
    const proceedResponse =
      command === 'PROCEED' && (!runner || followUpStep === 'REGISTER')
        ? this.registrationBotResponse(isRegisteredAdminBotUser && !runner)
        : command === 'PROCEED' &&
            !runner &&
            this.isRegistrationStep(followUpStep) &&
            !this.isRegistrationConfirmationStep(followUpStep)
          ? this.registrationStepResponse(followUpStep, previousContext)
          : command === 'PROCEED' && runner && followUpStep
            ? this.proceedBotResponse(followUpStep)
            : null;
    const adminResponse =
      !welcomeInterviewChoice && this.isAdminBotRequest(data.messageText)
        ? await this.adminBotCommand(
            user,
            data.messageText,
            previousContext,
            whatsappNumber,
          )
        : null;
    const followUpIsStale = this.isBotFollowUpStale(previousSession?.updatedAt);
    const delayedResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      runner &&
      !command &&
      mediaUrls.length === 0 &&
      followUpStep &&
      followUpIsStale
        ? this.delayedRunnerFollowUpResponse(followUpStep)
        : null;
    const runnerPaymentMediaResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      runner &&
      !command &&
      !delayedResponse &&
      mediaUrls.length > 0
        ? await this.botResponseOrValidationMessage('PAY', () =>
            this.runnerPaymentBotResponse(runner.id, data.messageText, {
              messageId: data.messageId,
              mediaUrls,
              context: previousContext,
            }),
          )
        : null;
    const paymentChoiceRunnerId = runner?.id || completedRegistrationRunnerId;
    const runnerPaymentChoiceResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      paymentChoiceRunnerId &&
      previousSession &&
      followUpStep === 'PAY' &&
      this.isRunnerPaymentChoiceReply(data.messageText, previousContext)
        ? await this.botResponseOrValidationMessage('PAY', () =>
            this.runnerPaymentBotResponse(
              paymentChoiceRunnerId,
              data.messageText,
              {
                messageId: data.messageId,
                mediaUrls,
                context: previousContext,
              },
            ),
          )
        : null;
    const runnerPendingGroupMenuResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      runner &&
      previousSession &&
      command === 'MENU' &&
      this.pendingRepostingGroupFromContext(previousContext)
        ? await this.handlePendingRepostingGroupConfirmation(
            runner.id,
            data.messageText,
            inviteLinks,
            this.pendingRepostingGroupFromContext(previousContext)!,
          )
        : null;
    const runnerFollowUpResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      runner &&
      previousSession &&
      !command &&
      !runnerPaymentMediaResponse &&
      !delayedResponse
        ? await this.botResponseOrValidationMessage(
            followUpStep || 'BOT_MESSAGE',
            () =>
              this.isGreeting(data.messageText)
                ? this.runnerGreetingResponse(runner.id, followUpStep)
                : this.runnerBotFollowUp(
                    runner.id,
                    data.messageText,
                    followUpStep,
                    previousContext,
                  ),
          )
        : null;
    const controlledRunnerFollowUpResponse =
      !adminOnlyBotMode &&
      !adminResponse &&
      !runner &&
      completedRegistrationRunnerId &&
      previousSession &&
      !command &&
      !delayedResponse
        ? await this.botResponseOrValidationMessage(
            followUpStep || 'BOT_MESSAGE',
            () =>
              this.runnerBotFollowUp(
                completedRegistrationRunnerId,
                data.messageText,
                followUpStep,
                previousContext,
              ),
          )
        : null;
    const registrationHelpResponse =
      !adminResponse &&
      !exitResponse &&
      !proceedResponse &&
      !adminOnlyBotMode &&
      !completedRegistrationRunnerId &&
      !runner &&
      command === 'HELP' &&
      this.isRegistrationStep(followUpStep)
        ? this.registrationHelpResponse(followUpStep as string, previousContext)
        : null;
    const registrationSupportResponse =
      !adminResponse &&
      !exitResponse &&
      !proceedResponse &&
      !adminOnlyBotMode &&
      !completedRegistrationRunnerId &&
      !runner &&
      command === 'SUPPORT' &&
      this.isRegistrationStep(followUpStep)
        ? this.registrationSupportResponse(
            followUpStep as string,
            previousContext,
          )
        : null;
    const registrationFollowUpResponse =
      !adminResponse &&
      !exitResponse &&
      !proceedResponse &&
      !adminOnlyBotMode &&
      !completedRegistrationRunnerId &&
      !runner &&
      this.isRegistrationStep(followUpStep) &&
      command !== 'REGISTER' &&
      command !== 'HELP' &&
      command !== 'SUPPORT'
        ? await this.runnerRegistrationFollowUpFromBot({
            user,
            whatsappNumber,
            messageText: data.messageText,
            bridgeAccountId: incomingBridgeAccountId || activeBotBridge?.id,
            step: followUpStep as string,
            context: previousContext,
          })
        : null;
    const enrolmentResponse =
      !adminResponse &&
      !exitResponse &&
      !proceedResponse &&
      !registrationFollowUpResponse &&
      !adminOnlyBotMode &&
      !completedRegistrationRunnerId &&
      !runner &&
      followUpStep === 'REGISTER' &&
      command !== 'HELP' &&
      command !== 'SUPPORT'
        ? await this.enrolRunnerFromBot({
            user,
            whatsappNumber,
            messageText: data.messageText,
            bridgeAccountId: incomingBridgeAccountId || activeBotBridge?.id,
          })
        : null;
    const followUpResponse =
      !command && inviteLinks.length > 0 && followUpStep === 'SUBMIT_SHOP_LINKS'
        ? this.nonRunnerShopLinksReceivedResponse(inviteLinks)
        : !command &&
            inviteLinks.length > 0 &&
            followUpStep === 'CONNECT_REPOSTING_GROUP'
          ? this.nonRunnerRepostingGroupReceivedResponse(inviteLinks[0])
          : null;
    const welcomeInterviewResponse =
      !adminResponse &&
      !exitResponse &&
      !this.containsOrderCode(data.messageText) &&
      followUpStep === 'WELCOME_INTERVIEW'
        ? await this.welcomeInterviewChoiceBotResponse({
            choice: welcomeInterviewChoice,
            whatsappNumber,
            user,
            runner,
            isRegisteredAdminBotUser,
          })
        : !adminResponse &&
            !exitResponse &&
            this.shouldShowWelcomeInterview({
              messageText: data.messageText,
              command,
              runner,
              user,
              isRegisteredAdminBotUser,
              followUpStep,
              isNewChatSession,
              inviteLinks,
              hasMedia: mediaUrls.length > 0,
            })
          ? this.welcomeInterviewBotResponse()
          : null;
    const customerRedirectResponse =
      !adminResponse &&
      !exitResponse &&
      !proceedResponse &&
      !registrationFollowUpResponse &&
      !enrolmentResponse &&
      !followUpResponse &&
      !adminOnlyBotMode &&
      !completedRegistrationRunnerId &&
      !runner &&
      !command &&
      inviteLinks.length === 0 &&
      String(data.messageText || '').trim().length > 0 &&
      !this.containsOrderCode(data.messageText) &&
      !this.isGreeting(data.messageText) &&
      !this.isRegistrationStep(followUpStep)
        ? await this.customerRedirectBotResponse(whatsappNumber)
        : null;
    let response: any;
    if (welcomeInterviewResponse) {
      response = welcomeInterviewResponse;
    } else if (exitResponse) {
      response = exitResponse;
    } else if (proceedResponse) {
      response = proceedResponse;
    } else if (adminResponse) {
      response = adminResponse;
    } else if (delayedResponse) {
      response = delayedResponse;
    } else if (runnerPaymentMediaResponse) {
      response = runnerPaymentMediaResponse;
    } else if (runnerPaymentChoiceResponse) {
      response = runnerPaymentChoiceResponse;
    } else if (runnerPendingGroupMenuResponse) {
      response = runnerPendingGroupMenuResponse;
    } else if (runnerFollowUpResponse) {
      response = runnerFollowUpResponse;
    } else if (controlledRunnerFollowUpResponse) {
      response = controlledRunnerFollowUpResponse;
    } else if (registrationHelpResponse) {
      response = registrationHelpResponse;
    } else if (registrationSupportResponse) {
      response = registrationSupportResponse;
    } else if (registrationFollowUpResponse) {
      response = registrationFollowUpResponse;
    } else if (enrolmentResponse) {
      response = enrolmentResponse;
    } else if (followUpResponse) {
      response = followUpResponse;
    } else if (completedRegistrationRunnerId && command) {
      response = await this.botResponseOrValidationMessage(command, () =>
        this.runnerBotCommand(
          completedRegistrationRunnerId,
          command,
          data.messageText,
          {
            messageId: data.messageId,
            mediaUrls,
            context: previousContext,
          },
        ),
      );
    } else if (isRegisteredAdminBotUser && command === 'STATUS') {
      response = this.adminStatusBotResponse(user);
    } else if (isRegisteredAdminBotUser && command === 'HELP') {
      response = this.adminBotHelpResponse();
    } else if (isRegisteredAdminBotUser && command === 'WALKTHROUGH') {
      response = this.adminWalkthroughBotResponse();
    } else if (adminOnlyBotMode) {
      response = this.adminWelcomeResponse(user);
    } else if (runner && command) {
      response = await this.botResponseOrValidationMessage(command, () =>
        this.runnerBotCommand(runner.id, command, data.messageText, {
          messageId: data.messageId,
          mediaUrls,
          context: previousContext,
        }),
      );
    } else if (runner && isNewChatSession) {
      response = this.registeredRunnerWelcomeResponse(user, runner);
    } else if (!runner && this.containsOrderCode(data.messageText)) {
      return {
        command: 'WELCOME_IGNORED',
        message: '',
        reason:
          'Order-code text is handled by WhatsApp order intake before RunnerBot.',
      };
    } else if (customerRedirectResponse) {
      response = customerRedirectResponse;
    } else if (
      !runner &&
      this.isCustomerMenuIntent(data.messageText, command)
    ) {
      response = await this.customerRedirectBotResponse(whatsappNumber);
    } else if (isRegisteredAdminBotUser && !command) {
      response = this.adminWelcomeResponse(user);
    } else if (user && isNewChatSession && !command) {
      response = this.knownUserWelcomeResponse(user);
    } else if (command === 'REGISTER') {
      response = this.registrationBotResponse(
        isRegisteredAdminBotUser && !runner,
      );
    } else if (command === 'PROCEED') {
      response = this.registrationBotResponse(
        isRegisteredAdminBotUser && !runner,
      );
    } else if (command === 'EXIT') {
      response = this.exitBotResponse();
    } else if (command === 'WALKTHROUGH') {
      response = this.whatsappWalkthroughBotResponse(Boolean(runner));
    } else if (command === 'SHOPS') {
      response = await this.availableShopsBotResponse();
    } else if (command === 'SUBMIT_SHOP_LINKS') {
      response = this.submitShopLinksBotResponse();
    } else if (command === 'CONNECT_REPOSTING_GROUP') {
      response = this.connectRepostingGroupBotResponse();
    } else if (command === 'HOW_IT_WORKS') {
      response = this.howItWorksBotResponse();
    } else if (command === 'STATUS') {
      response = this.nonRunnerStatusBotResponse();
    } else if (command === 'HELP') {
      response = { command, message: this.helpMessage() };
    } else if (command === 'SUPPORT') {
      response = {
        command,
        message: this.supportMessage(),
      };
    } else if (
      !user &&
      !runner &&
      !command &&
      !this.isGreeting(data.messageText) &&
      inviteLinks.length === 0
    ) {
      response = await this.customerRedirectBotResponse(whatsappNumber);
    } else {
      response = {
        command: 'WELCOME',
        message: this.welcomeMessage(),
      };
    }
    const responseRunnerId =
      response.command === 'EXIT'
        ? null
        : response.runnerId ||
          runner?.id ||
          completedRegistrationRunnerId ||
          null;
    const nextStep = response.command || command || 'WELCOME';
    const nextContext = this.nextBotSessionContext({
      previousContext: previousSession?.context,
      step: nextStep,
      inviteLinks,
      patch: response.contextPatch,
    });

    await this.prisma.botSession.upsert({
      where: { id: `${whatsappNumber}:phase1` },
      create: {
        id: `${whatsappNumber}:phase1`,
        runnerId: responseRunnerId,
        whatsappNumber,
        currentStep: nextStep,
        lastQuestion: response.message,
        lastResponse: data.messageText,
        context: nextContext as any,
      },
      update: {
        runnerId: responseRunnerId,
        currentStep: nextStep,
        lastQuestion: response.message,
        lastResponse: data.messageText,
        sessionStatus: 'ACTIVE',
        context: nextContext as any,
      },
    });

    const responseBridgeAccountId =
      incomingBridgeAccountId ||
      runner?.bridgeAccountId ||
      activeBotBridge?.id ||
      (await this.primaryBridgeAccountId());
    if (responseBridgeAccountId) {
      const bridgeAccountId = responseBridgeAccountId;
      if (bridgeAccountId) {
        await this.prisma.whatsAppOutboundMessage.create({
          data: {
            bridgeAccountId,
            recipientPhone: whatsappNumber,
            messageType: 'TEXT',
            messageText: response.message,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        const documents = Array.isArray(response.documents)
          ? (response.documents as Array<{
              mediaUrl?: string;
              filename?: string;
              mimeType?: string;
              caption?: string;
            }>)
          : [];
        for (const document of documents) {
          if (!document?.mediaUrl) continue;
          await this.prisma.whatsAppOutboundMessage.create({
            data: {
              bridgeAccountId,
              recipientPhone: whatsappNumber,
              messageType: 'DOCUMENT',
              messageText: document.caption || document.filename || 'Document',
              mediaUrl: document.mediaUrl,
              filename: document.filename || 'Runner-Commerce-document.pdf',
              mimeType: document.mimeType || 'application/pdf',
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }
      }
    }

    return response;
  }

  async getPhase1Runners(options: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (options.status) where.status = options.status;
    if (options.search) {
      where.OR = [
        { user: { name: { contains: options.search, mode: 'insensitive' } } },
        { user: { phone: { contains: options.search, mode: 'insensitive' } } },
        { phone: { contains: options.search, mode: 'insensitive' } },
      ];
    }
    const [runners, total] = await Promise.all([
      this.prisma.runner.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, email: true } },
          bridgeAccount: {
            select: { id: true, name: true, phone: true, status: true },
          },
          shopAssignments: {
            where: {
              status: { in: ACTIVE_SHOP_STATUSES },
              OR: [
                { selectedForTest: true },
                { notes: { startsWith: PHASE1_TEST_SHOP_NOTE_PREFIX } },
              ],
            },
            include: { shop: { select: { id: true, name: true } } },
          },
          repostingGroups: {
            where: { status: { in: ACTIVE_GROUP_STATUSES } },
            include: { discoveredGroup: true },
          },
          submittedShopLinks: { orderBy: { createdAt: 'desc' }, take: 5 },
          subscriptions: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(Number(options.limit || 20), 100)),
        skip: Math.max(0, Number(options.offset || 0)),
      }),
      this.prisma.runner.count({ where }),
    ]);

    return {
      total,
      runners: runners.map((runner) => {
        const access = this.runnerAccess(runner);
        const readyGroups = runner.repostingGroups.filter(
          (group) => group.status === 'READY_FOR_REPOSTING',
        );
        const groupLimits = this.runnerGroupLimits(
          runner,
          runner.repostingGroups,
        );
        const blockers = this.readinessBlockers({
          runner,
          access,
          approvedShops: runner.shopAssignments.filter(
            (link) => link.status === 'APPROVED',
          ),
          activeGroups: runner.repostingGroups,
          readyGroups,
        });
        return {
          ...this.publicRunner(runner),
          bridgeAccount: runner.bridgeAccount,
          selectedShopCount: runner.shopAssignments.length,
          selectedShops: runner.shopAssignments.map((link) => link.shop),
          repostingGroupCount: runner.repostingGroups.length,
          readyRepostingGroupCount: readyGroups.length,
          groupLimit: {
            selected: groupLimits.total.selected,
            max: groupLimits.total.max,
            test: groupLimits.test,
            live: groupLimits.live,
          },
          submittedShopLinkCount: runner.submittedShopLinks.length,
          readiness: { canStart: blockers.length === 0, blockers },
        };
      }),
    };
  }

  async getPhase1Prospects(options: {
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const search = this.clean(options.search);
    const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
    const offset = Math.max(0, Number(options.offset || 0));
    const sessions = await this.prisma.botSession.findMany({
      where: {
        sessionStatus: 'ACTIVE',
        runnerId: null,
        ...(search
          ? {
              OR: [
                { whatsappNumber: { contains: search, mode: 'insensitive' } },
                { lastResponse: { contains: search, mode: 'insensitive' } },
                { lastQuestion: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const prospects = sessions
      .map((session) => {
        const context =
          session.context && typeof session.context === 'object'
            ? (session.context as Record<string, unknown>)
            : {};
        return {
          id: session.id,
          whatsappNumber: session.whatsappNumber,
          currentStep: session.currentStep,
          lastResponse: session.lastResponse,
          lastQuestion: session.lastQuestion,
          submittedShopLinks: this.stringArray(context.submittedShopLinks),
          repostingGroupLinks: this.stringArray(context.repostingGroupLinks),
          bridgeJoinApprovals: Array.isArray(context.bridgeJoinApprovals)
            ? context.bridgeJoinApprovals
            : [],
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      })
      .filter(
        (session) =>
          session.submittedShopLinks.length > 0 ||
          session.repostingGroupLinks.length > 0 ||
          session.currentStep !== 'WELCOME',
      );

    return {
      total: prospects.length,
      prospects,
    };
  }

  async updateRunnerPhase1Access(
    runnerId: string,
    actorUserId: string | undefined,
    data: {
      status?: string;
      trialStatus?: string;
      subscriptionStatus?: string;
      repostingStatus?: string;
      activateTrial?: boolean;
      trialEndsAt?: string;
    },
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
    });
    if (!runner) throw new NotFoundException('Runner not found');
    const now = new Date();
    const update: any = {};
    if (data.status) update.status = this.cleanStatus(data.status);
    if (data.trialStatus)
      update.trialStatus = this.cleanStatus(data.trialStatus);
    if (data.subscriptionStatus)
      update.subscriptionStatus = this.cleanStatus(data.subscriptionStatus);
    if (data.repostingStatus)
      update.repostingStatus = this.cleanStatus(data.repostingStatus);
    if (data.activateTrial) {
      update.status = 'ACTIVE';
      update.trialStatus = 'TRIAL_ACTIVE';
      update.subscriptionStatus =
        runner.subscriptionStatus || 'PENDING_SUBSCRIPTION';
      update.trialStartsAt = runner.trialStartsAt || now;
      update.trialEndsAt = data.trialEndsAt
        ? new Date(data.trialEndsAt)
        : new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      update.approvedAt = runner.approvedAt || now;
      update.approvedById = actorUserId || runner.approvedById;
    } else if (data.trialEndsAt) {
      update.trialEndsAt = new Date(data.trialEndsAt);
    }
    if (update.status === 'ACTIVE' && !runner.approvedAt) {
      update.approvedAt = now;
      update.approvedById = actorUserId;
    }

    const saved = await this.prisma.runner.update({
      where: { id: runnerId },
      data: update,
    });
    return this.getRunnerStatus(saved.id);
  }

  async mergeLegacyRunnerRepostingSetup(
    runnerId: string,
    actorUserId: string | undefined,
  ) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        repostingGroups: true,
        bridgeAccount: true,
        shopAssignments: {
          where: { status: 'APPROVED' },
          select: { destinationGroup: true },
        },
      },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    const destinationGroupIds = [
      ...new Set([
        ...this.parseLegacyDestinationGroupRefs(runner.whatsappGroup),
        ...runner.shopAssignments.flatMap((link) =>
          this.parseLegacyDestinationGroupRefs(link.destinationGroup),
        ),
      ]),
    ];

    if (destinationGroupIds.length === 0) {
      throw new BadRequestException(
        'No legacy destination WhatsApp group is configured for this runner',
      );
    }

    const now = new Date();
    const mergedGroups: any[] = [];

    for (const destinationGroupId of destinationGroupIds) {
      const discoveredGroup =
        await this.prisma.whatsAppDiscoveredGroup.findUnique({
          where: { groupId: destinationGroupId },
        });
      const groupName = discoveredGroup?.name || destinationGroupId;
      const existingLinkedGroup = runner.repostingGroups.find(
        (group) =>
          group.whatsappGroupId === destinationGroupId ||
          (discoveredGroup && group.discoveredGroupId === discoveredGroup.id),
      );
      const unlinkedReadyCandidate = existingLinkedGroup
        ? undefined
        : runner.repostingGroups.find(
            (group) =>
              !group.whatsappGroupId &&
              !group.discoveredGroupId &&
              [
                'GROUP_LINK_RECEIVED',
                'RUNNER_CONFIRMED_ADMIN',
                'ADMIN_VERIFIED',
                'READY_FOR_REPOSTING',
              ].includes(group.status),
          );
      const targetGroup = existingLinkedGroup || unlinkedReadyCandidate;
      const isTestGroup = false;
      await assertDestinationGroupsAvailableToRunner(
        this.prisma,
        runnerId,
        [destinationGroupId, groupName],
        { excludeRepostingGroupId: targetGroup?.id },
      );
      const readyData = {
        groupName: targetGroup?.groupName || groupName,
        whatsappGroupId: destinationGroupId,
        discoveredGroupId: discoveredGroup?.id,
        bridgeAccountId: runner.bridgeAccountId,
        isTestGroup,
        status: 'READY_FOR_REPOSTING',
        botJoinStatus: 'JOINED_GROUP',
        botAdminStatus: 'ADMIN_VERIFIED',
        runnerConfirmedAdminAt: targetGroup?.runnerConfirmedAdminAt || now,
        adminVerifiedAt: targetGroup?.adminVerifiedAt || now,
        adminVerifiedById: actorUserId || targetGroup?.adminVerifiedById,
        notes: [
          targetGroup?.notes,
          `Merged from legacy reposting setup on ${now.toISOString()}`,
        ]
          .filter(Boolean)
          .join('\n'),
      };

      const saved = targetGroup
        ? await this.prisma.runnerRepostingGroup.update({
            where: { id: targetGroup.id },
            data: readyData,
          })
        : await this.prisma.runnerRepostingGroup.create({
            data: {
              runnerId,
              inviteLink: null,
              ...readyData,
            },
          });

      if (
        discoveredGroup &&
        discoveredGroup.groupPurpose !== 'RUNNER_ADVERTISING'
      ) {
        await this.prisma.whatsAppDiscoveredGroup.update({
          where: { id: discoveredGroup.id },
          data: {
            groupPurpose: 'RUNNER_ADVERTISING',
            importedRunnerAdvertisingAt:
              discoveredGroup.importedRunnerAdvertisingAt || now,
            archivedAt: null,
          },
        });
      }

      mergedGroups.push(saved);
    }

    if (runner.autoPostEnabled || runner.repostingStatus === 'ACTIVE') {
      await this.prisma.runner.update({
        where: { id: runner.id },
        data: {
          repostingStatus: 'ACTIVE',
          autoPostEnabled: true,
        },
      });
    }

    return {
      message: `Merged ${mergedGroups.length} legacy reposting destination${mergedGroups.length === 1 ? '' : 's'} into Phase 1.`,
      runner: {
        id: runner.id,
        autoPostEnabled: runner.autoPostEnabled,
        autoPostIntervalMinutes: runner.autoPostIntervalMinutes,
        maxPostsPerRun: runner.maxPostsPerRun,
        lastAutoPostAt: runner.lastAutoPostAt,
      },
      groups: mergedGroups.map((group) => this.publicGroup(group)),
    };
  }

  async autoMergeLegacyRunnerRepostingSetups(
    actorUserId: string | undefined,
    options: { limit?: number } = {},
  ) {
    const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
    const runners = await this.prisma.runner.findMany({
      where: {
        OR: [
          { whatsappGroup: { not: null } },
          {
            shopAssignments: {
              some: {
                status: 'APPROVED',
                destinationGroup: { not: null },
              },
            },
          },
        ],
      },
      include: {
        repostingGroups: true,
        shopAssignments: {
          where: { status: 'APPROVED' },
          select: { destinationGroup: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const pending = runners.filter((runner) => {
      const destinationGroupIds = this.legacyDestinationGroupIds(runner);
      if (destinationGroupIds.length === 0) return false;
      const mergedGroupIds = new Set(
        (runner.repostingGroups || [])
          .flatMap((group: any) => [
            group.whatsappGroupId,
            group.discoveredGroupId,
          ])
          .filter(Boolean),
      );
      return destinationGroupIds.some(
        (groupId) => !mergedGroupIds.has(groupId),
      );
    });

    const merged: Array<{ runnerId: string; message: string }> = [];
    const failed: Array<{ runnerId: string; message: string }> = [];

    for (const runner of pending) {
      try {
        const result = await this.mergeLegacyRunnerRepostingSetup(
          runner.id,
          actorUserId,
        );
        merged.push({ runnerId: runner.id, message: result.message });
      } catch (error: any) {
        failed.push({
          runnerId: runner.id,
          message: error?.message || 'Failed to merge legacy reposting setup',
        });
      }
    }

    return {
      scannedCount: runners.length,
      pendingCount: pending.length,
      mergedCount: merged.length,
      failedCount: failed.length,
      merged,
      failed,
      message:
        merged.length === 0
          ? 'No pending legacy reposting setups needed merging.'
          : `Auto-merged ${merged.length} legacy reposting setup${merged.length === 1 ? '' : 's'}.`,
    };
  }

  async verifyRunnerRepostingGroup(
    groupId: string,
    actorUserId: string | undefined,
    data: {
      status?: string;
      botJoinStatus?: string;
      botAdminStatus?: string;
      whatsappGroupId?: string;
      groupName?: string;
      isTestGroup?: boolean;
      notes?: string;
      autoImportRunnerAdvertising?: boolean;
    },
  ) {
    const group = await this.prisma.runnerRepostingGroup.findUnique({
      where: { id: groupId },
      include: {
        runner: { select: { bridgeAccountId: true } },
        discoveredGroup: { select: { groupId: true, importedShopId: true } },
      },
    });
    if (!group) throw new NotFoundException('Reposting group not found');
    const status = data.status ? this.cleanStatus(data.status) : group.status;
    const update: any = {
      ...(data.groupName !== undefined
        ? { groupName: this.clean(data.groupName) || group.groupName }
        : {}),
      ...(data.whatsappGroupId !== undefined
        ? { whatsappGroupId: this.clean(data.whatsappGroupId) }
        : {}),
      ...(data.isTestGroup !== undefined
        ? { isTestGroup: Boolean(data.isTestGroup) }
        : {}),
      ...(data.notes !== undefined ? { notes: this.clean(data.notes) } : {}),
      status,
      botJoinStatus: data.botJoinStatus
        ? this.cleanStatus(data.botJoinStatus)
        : group.botJoinStatus,
      botAdminStatus: data.botAdminStatus
        ? this.cleanStatus(data.botAdminStatus)
        : group.botAdminStatus,
    };

    if (status === 'READY_FOR_REPOSTING' || status === 'ADMIN_VERIFIED') {
      update.adminVerifiedAt = new Date();
      update.adminVerifiedById = actorUserId || group.adminVerifiedById;
      if (status === 'READY_FOR_REPOSTING') {
        update.botJoinStatus = 'JOINED_GROUP';
        update.botAdminStatus = 'ADMIN_VERIFIED';
      }
      if (data.autoImportRunnerAdvertising !== false) {
        const advertisingGroup = await this.ensureRunnerAdvertisingGroup(
          group,
          {
            whatsappGroupId: update.whatsappGroupId,
            groupName: update.groupName,
          },
        );
        update.discoveredGroupId = advertisingGroup.id;
        update.whatsappGroupId = advertisingGroup.groupId;
        update.bridgeAccountId =
          group.bridgeAccountId || group.runner?.bridgeAccountId || null;
        await assertDestinationGroupsAvailableToRunner(
          this.prisma,
          group.runnerId,
          [advertisingGroup.groupId, advertisingGroup.name],
          { excludeRepostingGroupId: group.id },
        );
      } else {
        const requestedGroupId = this.clean(update.whatsappGroupId);
        const requestedGroupName = this.clean(update.groupName);
        if (requestedGroupId || requestedGroupName) {
          await assertDestinationGroupsAvailableToRunner(
            this.prisma,
            group.runnerId,
            [requestedGroupId, requestedGroupName].filter(Boolean) as string[],
            { excludeRepostingGroupId: group.id },
          );
        }
      }
    }
    const saved = await this.prisma.runnerRepostingGroup.update({
      where: { id: groupId },
      data: update,
    });
    return this.publicGroup(saved);
  }

  async deleteRunnerRepostingGroup(
    groupId: string,
    _actorUserId: string | undefined,
  ) {
    const group = await this.prisma.runnerRepostingGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        groupName: true,
        status: true,
        botJoinStatus: true,
      },
    });
    if (!group) throw new NotFoundException('Reposting group not found');
    if (group.status === 'READY_FOR_REPOSTING') {
      throw new BadRequestException(
        'Ready reposting groups cannot be deleted from this cleanup action. Pause reposting first and review the posting destination.',
      );
    }

    await this.prisma.runnerRepostingGroup.delete({
      where: { id: groupId },
    });

    return {
      id: group.id,
      message: `${group.groupName || 'Reposting group'} removed from runner setup.`,
    };
  }

  private async ensureRunnerAdvertisingGroup(
    group: any,
    options: { whatsappGroupId?: string | null; groupName?: string | null },
  ) {
    const groupId =
      this.clean(options.whatsappGroupId) || this.clean(group.whatsappGroupId);
    const name =
      this.clean(options.groupName) ||
      this.clean(group.groupName) ||
      'Runner Advertising Group';
    const matchedByName =
      !groupId && !group.discoveredGroupId
        ? await this.findUnambiguousRunnerAdvertisingCandidate(name)
        : null;

    if (!groupId && !group.discoveredGroupId && !matchedByName) {
      throw new BadRequestException(
        'Auto-import needs a synced WhatsApp group. Import the group from Admin -> WhatsApp Groups first, or verify with auto-import turned off.',
      );
    }

    const existing = group.discoveredGroupId
      ? await this.prisma.whatsAppDiscoveredGroup.findUnique({
          where: { id: group.discoveredGroupId },
        })
      : matchedByName
        ? matchedByName
        : await this.prisma.whatsAppDiscoveredGroup.findUnique({
            where: { groupId: groupId as string },
          });

    if (existing?.importedShopId) {
      throw new BadRequestException(
        'This WhatsApp group is already linked as a shop-owned group and cannot be used as runner advertising.',
      );
    }

    const saved = existing
      ? await this.prisma.whatsAppDiscoveredGroup.update({
          where: { id: existing.id },
          data: {
            name,
            groupPurpose: 'RUNNER_ADVERTISING',
            importedRunnerAdvertisingAt:
              existing.importedRunnerAdvertisingAt || new Date(),
            archivedAt: null,
            lastSeenAt: new Date(),
          },
        })
      : await this.prisma.whatsAppDiscoveredGroup.create({
          data: {
            groupId: groupId as string,
            name,
            groupPurpose: 'RUNNER_ADVERTISING',
            importedRunnerAdvertisingAt: new Date(),
            lastSeenAt: new Date(),
          },
        });

    const bridgeAccountId =
      group.bridgeAccountId || group.runner?.bridgeAccountId;
    if (bridgeAccountId) {
      await this.prisma.whatsAppBridgeGroupPresence.upsert({
        where: {
          bridgeAccountId_groupId: {
            bridgeAccountId,
            groupId: saved.groupId,
          },
        },
        create: {
          bridgeAccountId,
          discoveredGroupId: saved.id,
          groupId: saved.groupId,
          name: saved.name,
          isAvailable: true,
          lastSeenAt: new Date(),
        },
        update: {
          discoveredGroupId: saved.id,
          name: saved.name,
          isAvailable: true,
          archivedAt: null,
          lastSeenAt: new Date(),
        },
      });
    }

    return saved;
  }

  private async findUnambiguousRunnerAdvertisingCandidate(name: string) {
    const matches = await this.prisma.whatsAppDiscoveredGroup.findMany({
      where: {
        name,
        importedShopId: null,
        archivedAt: null,
        groupPurpose: { in: ['UNCLASSIFIED', 'RUNNER_ADVERTISING'] },
      },
      take: 2,
    });

    if (matches.length > 1) {
      throw new BadRequestException(
        `More than one synced WhatsApp group is named "${name}". Link the correct group manually in Admin -> WhatsApp Groups.`,
      );
    }

    return matches[0] || null;
  }

  async reviewSubmittedShopLink(
    linkId: string,
    actorUserId: string | undefined,
    data: { status: string; notes?: string; bridgeAccountId?: string },
  ) {
    const link = await this.prisma.runnerSubmittedShopLink.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('Submitted shop link not found');
    const saved = await this.prisma.runnerSubmittedShopLink.update({
      where: { id: linkId },
      data: {
        status: this.cleanStatus(data.status || 'PENDING_REVIEW'),
        notes: this.clean(data.notes),
        reviewedAt: new Date(),
        reviewedById: actorUserId,
      },
    });
    if (
      this.cleanStatus(data.status || '') === 'APPROVED' &&
      data.bridgeAccountId
    ) {
      await this.queueBridgeGroupJoin({
        bridgeAccountId: data.bridgeAccountId,
        inviteLink: link.inviteLink,
      });
    }
    return saved;
  }

  async approveProspectInviteLink(
    sessionId: string,
    data: { inviteLink?: string; bridgeAccountId?: string; linkType?: string },
  ) {
    const inviteLink = this.clean(data.inviteLink);
    const bridgeAccountId = this.clean(data.bridgeAccountId);
    if (!inviteLink || !this.isInviteLink(inviteLink)) {
      throw new BadRequestException('Send a valid WhatsApp group invite link');
    }
    if (!bridgeAccountId) {
      throw new BadRequestException(
        'Choose the WhatsApp bridge that should join this group',
      );
    }
    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Phase 1 bot prospect not found');

    const context =
      session.context && typeof session.context === 'object'
        ? (session.context as Record<string, unknown>)
        : {};
    const linkType =
      this.cleanStatus(data.linkType || '') === 'REPOSTING_GROUP'
        ? 'repostingGroupLinks'
        : 'submittedShopLinks';
    const links = this.stringArray(context[linkType]);
    if (!links.includes(inviteLink)) {
      throw new BadRequestException(
        'This invite link is not saved on the selected prospect',
      );
    }

    const joinJob = await this.queueBridgeGroupJoin({
      bridgeAccountId,
      inviteLink,
      metadataKey: `PHASE1_PROSPECT:${session.id}`,
    });
    const approvals = Array.isArray(context.bridgeJoinApprovals)
      ? (context.bridgeJoinApprovals as unknown[])
      : [];
    await this.prisma.botSession.update({
      where: { id: session.id },
      data: {
        context: {
          ...context,
          bridgeJoinApprovals: [
            ...approvals,
            {
              inviteLink,
              bridgeAccountId,
              linkType,
              status: 'QUEUED',
              queuedMessageId: joinJob.id,
              queuedAt: new Date().toISOString(),
            },
          ],
        } as any,
      },
    });

    return {
      message: 'Group join queued for the selected WhatsApp bridge.',
      data: joinJob,
    };
  }

  private async getRunner(runnerId: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        subscriptions: {
          include: {
            plan: true,
          },
        },
        shopAssignments: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                procurementCity: true,
                whatsappGroupMappings: {
                  where: { status: 'ACTIVE' },
                  select: {
                    id: true,
                    sourceGroup: true,
                    isPrimarySource: true,
                    groupRole: true,
                  },
                  orderBy: [
                    { isPrimarySource: 'desc' },
                    { sourceGroup: 'asc' },
                  ],
                },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        repostingGroups: {
          include: { discoveredGroup: true },
          orderBy: { createdAt: 'asc' },
        },
        bridgeAccount: true,
        submittedShopLinks: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!runner) throw new NotFoundException('Runner not found');
    return runner;
  }

  private async assertRunnerExists(runnerId: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { id: true },
    });
    if (!runner) throw new NotFoundException('Runner not found');
  }

  private runnerAccess(runner: any) {
    const now = new Date();
    const trialActive =
      runner.trialStatus === 'TRIAL_ACTIVE' &&
      (!runner.trialEndsAt || runner.trialEndsAt >= now);
    const subscriptionActive = runner.subscriptions?.some(
      (subscription: any) =>
        subscription.audience === 'RUNNER' &&
        subscription.status === 'ACTIVE' &&
        subscription.currentPeriodStart <= now &&
        subscription.currentPeriodEnd >= now,
    );
    return {
      trialStatus: runner.trialStatus,
      subscriptionStatus: runner.subscriptionStatus,
      trialStartsAt: runner.trialStartsAt,
      trialEndsAt: runner.trialEndsAt,
      active: Boolean(trialActive || subscriptionActive),
      label: trialActive
        ? 'Free Phase 1 trial active'
        : subscriptionActive
          ? 'Subscription active'
          : 'Subscription or trial required',
    };
  }

  private runnerGroupLimits(runner: any, activeGroups: any[]) {
    const selected = activeGroups.length;
    const max = this.liveGroupLimitFromSubscription(runner);

    return {
      test: {
        selected,
        max,
        label: 'Posting groups',
      },
      live: {
        selected,
        max,
        label: 'Posting groups',
      },
      total: {
        selected,
        max,
      },
    };
  }

  private phase1TestWindow(runner: any) {
    const startsAt = runner?.trialStartsAt
      ? new Date(runner.trialStartsAt)
      : null;
    const endsAt = startsAt
      ? new Date(
          startsAt.getTime() + PHASE1_TEST_OFFER_DAYS * 24 * 60 * 60 * 1000,
        )
      : null;
    const active = Boolean(!endsAt || endsAt >= new Date());
    return {
      startsAt,
      endsAt,
      active,
      days: PHASE1_TEST_OFFER_DAYS,
    };
  }

  private isPhase1TestShopLink(link: any, runner?: any) {
    const testWindow = runner
      ? this.phase1TestWindow(runner)
      : { active: true };
    return (
      testWindow.active &&
      ACTIVE_SHOP_STATUSES.includes(link?.status) &&
      (Boolean(link?.selectedForTest) ||
        String(link?.notes || '').startsWith(PHASE1_TEST_SHOP_NOTE_PREFIX))
    );
  }

  private sourceShopLimitFromSubscription(runner: any) {
    const subscription = this.runnerSubscriptionForCapacity(runner);
    const features = subscription?.plan?.features;
    const featureText = Array.isArray(features)
      ? features.join('\n')
      : typeof features === 'string'
        ? features
        : JSON.stringify(features || '');
    const match =
      featureText.match(/up to\s+(\d+)\s+source shop groups?/i) ||
      featureText.match(/\b(\d+)\s+source shop groups?/i);

    if (match?.[1]) {
      return Math.max(1, Number(match[1]) || DEFAULT_RUNNER_SOURCE_SHOP_LIMIT);
    }

    return DEFAULT_RUNNER_SOURCE_SHOP_LIMIT;
  }

  private runnerSubscriptionForCapacity(runner: any) {
    const now = new Date();
    const trialActive =
      runner.trialStatus === 'TRIAL_ACTIVE' &&
      (!runner.trialEndsAt || runner.trialEndsAt >= now);
    const activeSubscriptions = (runner.subscriptions || [])
      .filter((subscription: any) => {
        if (
          subscription.audience !== 'RUNNER' ||
          subscription.status !== 'ACTIVE'
        ) {
          return false;
        }
        const startsAt = subscription.currentPeriodStart
          ? new Date(subscription.currentPeriodStart)
          : null;
        const endsAt = subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null;
        const current =
          (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
        const scheduledDuringTrial = trialActive && (!endsAt || endsAt >= now);
        return current || scheduledDuringTrial;
      })
      .sort((a: any, b: any) => {
        const aStart = a.currentPeriodStart
          ? new Date(a.currentPeriodStart).getTime()
          : 0;
        const bStart = b.currentPeriodStart
          ? new Date(b.currentPeriodStart).getTime()
          : 0;
        return aStart - bStart;
      });

    return activeSubscriptions[0] || null;
  }
  private liveGroupLimitFromSubscription(runner: any) {
    const subscription = this.runnerSubscriptionForCapacity(runner);
    const features = subscription?.plan?.features;
    const featureText = Array.isArray(features)
      ? features.join('\n')
      : typeof features === 'string'
        ? features
        : JSON.stringify(features || '');
    const match =
      featureText.match(/up to\s+(\d+)\s+runner advertising groups?/i) ||
      featureText.match(/\b(\d+)\s+runner advertising groups?/i);

    if (match?.[1]) {
      return Math.max(1, Number(match[1]) || DEFAULT_LIVE_GROUP_LIMIT);
    }

    return DEFAULT_LIVE_GROUP_LIMIT;
  }

  private readinessBlockers(data: {
    runner: any;
    access: { active: boolean };
    approvedShops: any[];
    activeGroups: any[];
    readyGroups: any[];
  }) {
    const blockers: string[] = [];
    if (!['ACTIVE', 'APPROVED'].includes(data.runner.status)) {
      blockers.push('Runner must be approved/active');
    }
    if (!data.access.active) {
      blockers.push('Phase 1 trial or subscription must be active');
    }
    if (data.approvedShops.length === 0) {
      blockers.push('Select at least one approved shop group');
    }
    if (data.activeGroups.length === 0) {
      blockers.push('Connect at least one reposting group');
    }
    if (data.readyGroups.length === 0) {
      blockers.push(
        data.activeGroups.length > 0
          ? 'At least one posting group must be ready. Reply GROUPS, then RETRY 1 to let the bot try the saved group again.'
          : 'At least one posting group must be ready. Reply GROUPS, then send a WhatsApp group invite link so the bot can join automatically.',
      );
    }
    const notReady = data.activeGroups.filter(
      (group) => group.status !== 'READY_FOR_REPOSTING',
    );
    if (notReady.some((group) => group.botJoinStatus !== 'JOINED_GROUP')) {
      blockers.push('The bot still needs to join the posting group');
    }
    if (notReady.some((group) => group.botAdminStatus !== 'ADMIN_VERIFIED')) {
      blockers.push('The bot still needs posting access in the group');
    }
    if (notReady.some((group) => !group.runnerConfirmedAdminAt)) {
      blockers.push('Group access is still being checked');
    }
    if (notReady.some((group) => !group.adminVerifiedAt)) {
      blockers.push('Group readiness is still being checked');
    }
    return [...new Set(blockers)];
  }

  private runnerBridgeStatus(bridge: any) {
    if (!bridge) {
      return {
        assigned: false,
        online: false,
        state: 'UNASSIGNED',
        label: 'Bot connection needs attention',
        explanation:
          'The posting bot is not connected to your runner account yet. Support can help if this does not update soon.',
      };
    }

    const lastSeenAt = bridge.lastSeenAt ? new Date(bridge.lastSeenAt) : null;
    const heartbeatFresh = Boolean(
      lastSeenAt &&
      Date.now() - lastSeenAt.getTime() <= BRIDGE_ONLINE_HEARTBEAT_MS,
    );
    const online = bridge.status === 'ONLINE' && heartbeatFresh;
    const staleOnline = bridge.status === 'ONLINE' && !heartbeatFresh;

    return {
      assigned: true,
      id: bridge.id,
      name: bridge.name,
      phone: bridge.phone || bridge.verifiedPhone || bridge.expectedPhone,
      mode: bridge.mode,
      rawStatus: bridge.status,
      lastSeenAt: bridge.lastSeenAt,
      online,
      state: online ? 'ONLINE' : staleOnline ? 'STALE' : 'OFFLINE',
      label: online
        ? 'Bot connection ready'
        : staleOnline
          ? 'Bot connection checking'
          : 'Bot connection needs attention',
      explanation: online
        ? 'The posting bot is connected and ready.'
        : staleOnline
          ? 'The posting bot was connected recently. Reposting will wait for a fresh check-in.'
          : 'The posting bot is not connected right now. Reposting will wait until it is ready.',
    };
  }

  private runnerRepostingControl(data: {
    runner: any;
    access: { active: boolean };
    readinessBlockers: string[];
    whatsappRepostingEnabled: boolean;
    bridgeStatus: any;
    testShopAssignments: any[];
    liveShopAssignments: any[];
  }) {
    const runnerStatus = String(data.runner.repostingStatus || 'NOT_STARTED');
    const runnerEnabled =
      runnerStatus === 'ACTIVE' && Boolean(data.runner.autoPostEnabled);
    const enabledLiveShops = data.liveShopAssignments.filter(
      (link) => link.autoPostEnabled,
    );
    const enabledTestShops = data.testShopAssignments.filter(
      (link) => link.autoPostEnabled,
    );
    const pausedReasons: string[] = [];

    if (!data.whatsappRepostingEnabled) {
      pausedReasons.push('global WhatsApp reposting is paused by admin');
    }
    if (!data.bridgeStatus.online) {
      pausedReasons.push(data.bridgeStatus.explanation);
    }
    if (!data.access.active) {
      pausedReasons.push(
        'your Phase 1 trial or runner subscription is not active',
      );
    }
    if (data.readinessBlockers.length > 0) {
      pausedReasons.push(
        `setup is incomplete: ${data.readinessBlockers.join('; ')}`,
      );
    }
    if (!runnerEnabled) {
      pausedReasons.push(
        runnerStatus === 'STOPPED'
          ? 'your runner reposting is stopped'
          : runnerStatus === 'PAUSED'
            ? 'your runner reposting is paused'
            : 'your runner reposting has not been started',
      );
    }
    if (
      runnerEnabled &&
      data.testShopAssignments.length > 0 &&
      enabledTestShops.length === 0
    ) {
      pausedReasons.push('selected shop groups are paused for reposting');
    }

    const active =
      data.whatsappRepostingEnabled &&
      data.bridgeStatus.online &&
      data.access.active &&
      data.readinessBlockers.length === 0 &&
      runnerEnabled &&
      (enabledTestShops.length > 0 || enabledLiveShops.length > 0);

    return {
      active,
      state: active ? 'ACTIVE' : 'PAUSED',
      label: active ? 'Reposting active' : 'Reposting paused',
      globalEnabled: data.whatsappRepostingEnabled,
      runnerStatus,
      runnerAutoPostEnabled: Boolean(data.runner.autoPostEnabled),
      enabledTestShopCount: enabledTestShops.length,
      testShopCount: data.testShopAssignments.length,
      enabledLiveShopCount: enabledLiveShops.length,
      liveShopCount: data.liveShopAssignments.length,
      pausedReasons: [...new Set(pausedReasons)],
      explanation: active
        ? 'Reposting is active, setup is ready, and the bot connection is online.'
        : [...new Set(pausedReasons)].join('. '),
    };
  }

  private publicRunner(runner: any) {
    return {
      id: runner.id,
      userId: runner.userId,
      name: runner.user?.name,
      phone: runner.phone || runner.user?.phone,
      status: runner.status,
      trialStatus: runner.trialStatus,
      trialStartsAt: runner.trialStartsAt,
      trialEndsAt: runner.trialEndsAt,
      subscriptionStatus: runner.subscriptionStatus,
      repostingStatus: runner.repostingStatus,
      whatsappGroup: runner.whatsappGroup,
      bridgeAccountId: runner.bridgeAccountId,
      autoPostEnabled: runner.autoPostEnabled,
      autoPostIntervalMinutes: runner.autoPostIntervalMinutes,
      maxPostsPerRun: runner.maxPostsPerRun,
      lastAutoPostAt: runner.lastAutoPostAt,
      approvedAt: runner.approvedAt,
      createdAt: runner.createdAt,
    };
  }

  private publicGroup(group: any) {
    return {
      id: group.id,
      groupName: group.groupName,
      inviteLink: group.inviteLink,
      isTestGroup: group.isTestGroup,
      status: group.status,
      botJoinStatus: group.botJoinStatus,
      botAdminStatus: group.botAdminStatus,
      whatsappGroupId: group.whatsappGroupId,
      discoveredGroupId: group.discoveredGroupId,
      discoveredGroupName: group.discoveredGroup?.name || null,
      bridgeAccountId: group.bridgeAccountId,
      runnerConfirmedAdminAt: group.runnerConfirmedAdminAt,
      adminVerifiedAt: group.adminVerifiedAt,
      notes: group.notes,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  private isAdminBotRequest(input: string) {
    const text = String(input || '').trim();
    if (/^admin\s+done\b/i.test(text)) return false;
    return /^admin\b/i.test(text);
  }

  private async botResponseOrValidationMessage(
    command: string,
    action: () => Promise<any>,
  ) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof BadRequestException) {
        return {
          command,
          message: this.exceptionText(error),
        };
      }
      throw error;
    }
  }

  private exceptionText(error: BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const message = (response as any).message;
      if (Array.isArray(message)) return message.join('\n');
      if (message) return String(message);
    }
    return (
      error.message ||
      'That reply could not be accepted. Reply HELP for options.'
    );
  }

  private isAdminUser(user: any) {
    return ['ADMIN', 'SUPERUSER'].includes(user?.role?.name);
  }

  private isRegisteredAdminBotUser(user: any, whatsappNumber: string) {
    if (!this.isAdminUser(user) || user?.status !== 'ACTIVE') return false;
    const registeredPhone = this.normalizePhone(user?.phone || '');
    const incomingPhone = this.normalizePhone(whatsappNumber || '');
    if (!registeredPhone || !incomingPhone) return false;
    return registeredPhone === incomingPhone;
  }

  private async adminBotActor(user: any, whatsappNumber: string) {
    if (!this.isRegisteredAdminBotUser(user, whatsappNumber)) return null;
    return { id: user.id, role: user.role.name };
  }

  private async adminBotCommand(
    user: any,
    input: string,
    context: Record<string, unknown>,
    whatsappNumber: string,
  ) {
    const actor = await this.adminBotActor(user, whatsappNumber);
    if (!actor) {
      return {
        command: 'ADMIN',
        message:
          'Admin bot commands are only available from a registered ACTIVE ADMIN or SUPERUSER WhatsApp number. Reply HELP for runner/customer commands.',
      };
    }

    const text = String(input || '')
      .trim()
      .replace(/^admin\b/i, '')
      .trim();
    if (!text || /^help|commands$/i.test(text)) {
      return this.adminBotHelpResponse();
    }

    const [actionRaw, ...rest] = text.split(/\s+/);
    const action = String(actionRaw || '').toUpperCase();
    const target = rest.join(' ').trim();

    if (['WALKTHROUGH', 'GUIDE', 'SETUP'].includes(action)) {
      return this.adminWalkthroughBotResponse();
    }

    if (['USE', 'AS', 'CONTROL'].includes(action)) {
      const runnerTarget = target.replace(/^runner\b/i, '').trim();
      const runner = await this.resolveAdminRunnerTarget(
        runnerTarget,
        context,
        user,
      );
      if (!runner) return this.adminBotTargetMissingResponse('runner');
      return this.adminBotRunnerControlResponse(runner.id);
    }

    if (action === 'DEV') {
      const [devActionRaw, ...devRest] = rest;
      const devAction = String(devActionRaw || '').toUpperCase();
      if (!devAction || ['HELP', 'COMMANDS'].includes(devAction)) {
        return this.adminDevBotHelpResponse();
      }
      if (['STATUS', 'STATE'].includes(devAction)) {
        return this.adminDevStatusResponse();
      }
      if (['REPOSTING', 'REPOSTS', 'WHATSAPP-REPOSTING'].includes(devAction)) {
        return this.adminDevToggleResponse(
          'ADMIN_DEV_REPOSTING_SETTING',
          WHATSAPP_REPOSTING_ENABLED_KEY,
          this.parseAdminDevBoolean(devRest.join(' ')),
          {
            label: 'Automatic WhatsApp reposting',
            enabledMessage:
              'Automatic WhatsApp reposting is enabled. Bridge mode, runner, shop, and listing settings still apply.',
            disabledMessage:
              'Automatic WhatsApp reposting is paused immediately. Capture and listing creation remain available.',
          },
        );
      }
      if (['MAINTENANCE', 'MAINT'].includes(devAction)) {
        return this.adminDevMaintenanceResponse(
          this.parseAdminDevBoolean(devRest.join(' ')),
        );
      }
      if (['PHASE2', 'PHASE-2'].includes(devAction)) {
        return this.adminDevPhase2Response(
          this.parseAdminDevBoolean(devRest.join(' ')),
        );
      }
      if (['ORDERS', 'ORDER', 'ORDER-INTAKE', 'INTAKE'].includes(devAction)) {
        return this.adminDevOrderIntakeResponse(
          this.parseAdminDevBoolean(devRest.join(' ')),
        );
      }
      if (
        ['AUTOAPPROVAL', 'AUTO-APPROVAL', 'AUTOAPPROVE', 'JOIN'].includes(
          devAction,
        )
      ) {
        return this.adminDevToggleResponse(
          'ADMIN_DEV_AUTO_APPROVAL',
          RUNNER_SHOP_AUTO_APPROVAL_KEY,
          this.parseAdminDevBoolean(devRest.join(' ')),
          {
            label: 'Runner-shop auto approval',
            enabledMessage: 'Runner shop join requests will be auto-approved.',
            disabledMessage:
              'Runner shop join requests will require shop-owner approval.',
          },
        );
      }
      if (['SHUTDOWN', 'SAFE-SHUTDOWN'].includes(devAction)) {
        return this.adminDevSafeShutdownResponse(devRest.join(' '));
      }
      if (['START', 'REPOST', 'REPOSTING', 'ENABLE'].includes(devAction)) {
        const runner = await this.resolveAdminRunnerTarget(
          this.adminDevelopmentRunnerTarget(devRest.join(' ')),
          context,
          user,
        );
        if (!runner) return this.adminBotTargetMissingResponse('runner');
        return this.adminBotEnableDevelopmentReposting(runner.id, text);
      }
    }

    if (['RUNNERS', 'LIST'].includes(action)) {
      return this.adminBotListRunners(target);
    }

    if (['RUNNER', 'STATUS'].includes(action)) {
      const runner = await this.resolveAdminRunnerTarget(target, context, user);
      if (!runner) return this.adminBotTargetMissingResponse('runner');
      return this.adminBotRunnerStatusResponse(runner.id);
    }

    if (['APPROVALS', 'QUEUE'].includes(action)) {
      return this.adminBotApprovalsResponse();
    }

    if (['APPROVE', 'REJECT'].includes(action)) {
      const approvalResponse = await this.adminBotApprovalAction(
        action,
        target,
        context,
        actor,
      );
      if (approvalResponse) return approvalResponse;
    }

    if (action === 'APPROVE') {
      return {
        command: 'ADMIN',
        message:
          'That admin action is no longer required. Bot registration now grants runner status and role automatically. Use ADMIN RUNNER <id/#> to inspect or ADMIN START <id/#> when setup is ready.',
      };
    }

    if (action === 'MERGE') {
      return {
        command: 'ADMIN',
        message:
          'That admin action is no longer required in the WhatsApp bot flow. Use ADMIN RUNNER <id/#> to inspect current setup, ADMIN VERIFY only for stuck group verification, or ADMIN START when blockers are clear.',
      };
    }

    if (action === 'VERIFY') {
      const group = await this.resolveAdminGroupTarget(target, context);
      if (!group) return this.adminBotTargetMissingResponse('reposting group');
      const verified = await this.verifyRunnerRepostingGroup(
        group.id,
        actor.id,
        {
          status: 'READY_FOR_REPOSTING',
          botJoinStatus: 'JOINED_GROUP',
          botAdminStatus: 'ADMIN_VERIFIED',
          autoImportRunnerAdvertising: !/\bnoauto\b/i.test(text),
        },
      );
      return {
        command: 'ADMIN_VERIFY',
        contextPatch: {
          adminGroupOptions: [
            { id: verified.id, groupName: verified.groupName },
          ],
        },
        message: [
          `Verified reposting group: ${verified.groupName}`,
          `Status: ${verified.status}`,
          `Bot joined: ${verified.botJoinStatus} · Admin: ${verified.botAdminStatus}`,
        ].join('\n'),
      };
    }

    if (['START', 'PAUSE', 'RESUME', 'STOP'].includes(action)) {
      if (action === 'START' && /\bdev(elopment)?\b/i.test(text)) {
        const runner = await this.resolveAdminRunnerTarget(
          this.adminDevelopmentRunnerTarget(target),
          context,
          user,
        );
        if (!runner) return this.adminBotTargetMissingResponse('runner');
        return this.adminBotEnableDevelopmentReposting(runner.id, text);
      }
      const runner = await this.resolveAdminRunnerTarget(target, context, user);
      if (!runner) return this.adminBotTargetMissingResponse('runner');
      const result = await this.commandReposting(runner.id, action);
      const status = await this.getRunnerStatus(runner.id);
      return {
        command: `ADMIN_${action}`,
        contextPatch: this.adminContextPatchFromStatus(status),
        message: [
          `Admin ${action.toLowerCase()} result for ${status.runner.name || status.runner.phone || status.runner.id}:`,
          result.message,
          '',
          this.adminRunnerStatusText(status),
        ].join('\n'),
      };
    }

    return {
      command: 'ADMIN',
      message: [
        'I did not recognise that admin command.',
        '',
        this.adminBotHelpText(),
      ].join('\n'),
    };
  }

  private async runnerBotCommand(
    runnerId: string,
    command: RepostCommand,
    input: string,
    meta?: {
      messageId?: string;
      mediaUrls?: string[];
      context?: Record<string, unknown>;
    },
  ) {
    if (command === 'SETUP') return this.runnerSetupGuideResponse(runnerId);
    if (command === 'WALKTHROUGH')
      return this.whatsappWalkthroughBotResponse(true);
    if (command === 'SHOPS') {
      return this.runnerShopsGuideResponse(runnerId, input);
    }
    if (command === 'GROUPS') return this.runnerGroupsGuideResponse(runnerId);
    if (command === 'SUBMIT_SHOP_LINKS')
      return this.submitShopLinksBotResponse(true);
    if (command === 'CONNECT_REPOSTING_GROUP') {
      return this.connectRepostingGroupBotResponse(true);
    }
    if (command === 'ORDERS')
      return this.runnerOrdersBotResponse(runnerId, input);
    if (command === 'BUYING')
      return this.runnerBuyingBotResponse(runnerId, input);
    if (command === 'PACKING')
      return this.runnerPackingBotResponse(runnerId, input);
    if (command === 'MENU') return this.runnerMainMenuBotResponse();
    if (command === 'BILLING') return this.runnerBillingBotResponse(runnerId);
    if (command === 'PLANS')
      return this.runnerPlansBotResponse(runnerId, input);
    if (command === 'CAPTIONS')
      return this.runnerCaptionsBotResponse(runnerId, input);
    if (command === 'PAY')
      return this.runnerPaymentBotResponse(runnerId, input, meta);
    if (command === 'ADMIN_DONE') return this.confirmLatestBotAdmin(runnerId);
    return this.commandReposting(runnerId, input, meta?.context || {});
  }

  private async runnerCaptionsBotResponse(runnerId: string, input: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    const intent = this.parseRunnerCaptionIntent(input);
    if (!intent.kind) return this.runnerCaptionMenuResponse(runner);

    if (intent.kind === 'MODE') {
      const options = this.runnerCaptionOptions(runner);
      const requestedValue = String(intent.value || '');
      const selected = /^\\d+$/.test(requestedValue)
        ? options[Number(requestedValue) - 1]
        : this.runnerCaptionOptionByAlias(options, requestedValue);
      if (!selected) {
        if (this.isSuspendedRunnerCaptionMode(requestedValue)) {
          return this.runnerCaptionSuspendedResponse();
        }
        const requested = this.runnerCaptionOptionByAlias(
          this.allRunnerCaptionOptions(),
          requestedValue,
        );
        return requested
          ? this.runnerCaptionUpgradeResponse(requested)
          : this.runnerCaptionMenuResponse(
              runner,
              'That caption option was not found.',
            );
      }
      await this.prisma.runner.update({
        where: { id: runnerId },
        data: { repostPriceMode: selected.mode },
      });
      return this.runnerCaptionMenuResponse(
        { ...runner, repostPriceMode: selected.mode },
        `Caption type updated to ${selected.label}.`,
      );
    }

    if (intent.kind === 'ORDER') {
      await this.prisma.runner.update({
        where: { id: runnerId },
        data: { repostOrderDetailsEnabled: intent.enabled },
      });
      return this.runnerCaptionMenuResponse(
        { ...runner, repostOrderDetailsEnabled: intent.enabled },
        `Order details are now ${intent.enabled ? 'ON' : 'OFF'}.`,
      );
    }

    if (intent.kind === 'FEE_PERCENT') {
      if (!this.runnerHasPriceCaptionAddon(runner)) {
        return this.runnerCaptionUpgradeResponse({
          label: 'Fee percentage',
          requires: 'Runner price editing/calculation',
        });
      }
      await this.prisma.runner.update({
        where: { id: runnerId },
        data: { repostFeePercentageEnabled: intent.enabled },
      });
      return this.runnerCaptionMenuResponse(
        { ...runner, repostFeePercentageEnabled: intent.enabled },
        `Fee percentage is now ${intent.enabled ? 'ON' : 'OFF'}.`,
      );
    }

    if (intent.kind === 'IMAGE_PRICE') {
      if (!this.runnerHasShopPriceImageAddon(runner)) {
        return this.runnerCaptionUpgradeResponse({
          label: 'Shop price on each image',
          requires: 'Attach shop price to each image',
        });
      }
      const setup =
        runner.phase1Setup && typeof runner.phase1Setup === 'object'
          ? (runner.phase1Setup as Record<string, unknown>)
          : {};
      await this.prisma.runner.update({
        where: { id: runnerId },
        data: {
          phase1Setup: {
            ...setup,
            repostOriginalPricePerImageEnabled: intent.enabled,
          } as any,
        },
      });
      return this.runnerCaptionMenuResponse(
        {
          ...runner,
          phase1Setup: {
            ...setup,
            repostOriginalPricePerImageEnabled: intent.enabled,
          },
        },
        `Shop price on each image is now ${intent.enabled ? 'ON' : 'OFF'}.`,
      );
    }

    return this.runnerCaptionMenuResponse(runner);
  }

  private runnerCaptionMenuResponse(runner: any, notice?: string) {
    const options = this.runnerCaptionOptions(runner);
    const currentMode = String(
      runner.repostPriceMode || 'ORIGINAL',
    ).toUpperCase();
    const setup =
      runner.phase1Setup && typeof runner.phase1Setup === 'object'
        ? (runner.phase1Setup as Record<string, unknown>)
        : {};
    const paid = this.currentRunnerCaptionSubscription(runner);
    const lines = [
      notice || '',
      'Caption choices',
      '',
      `Subscription: ${paid ? 'active paid' : runner.trialStatus === 'TRIAL_ACTIVE' ? 'trial/basic' : 'basic only'}`,
      `Current type: ${currentMode}`,
      `Order details: ${runner.repostOrderDetailsEnabled === false ? 'OFF' : 'ON'}`,
      `Fee percentage: ${runner.repostFeePercentageEnabled === false ? 'OFF' : 'ON'}`,
      `Shop price on images: ${setup.repostOriginalPricePerImageEnabled === true ? 'ON' : 'OFF'}`,
      '',
      'Available types:',
      ...options.map(
        (option, index) =>
          `${index + 1}. ${option.label}\nExample: ${option.example}\nReply CAPTION ${index + 1} or CAPTION ${option.alias}`,
      ),
      '',
      'Toggles:',
      'CAPTION ORDER ON/OFF',
      this.runnerHasPriceCaptionAddon(runner)
        ? 'CAPTION FEE% ON/OFF'
        : 'CAPTION FEE% needs Runner price editing/calculation',
      this.runnerHasShopPriceImageAddon(runner)
        ? 'CAPTION IMAGE PRICE ON/OFF'
        : 'CAPTION IMAGE PRICE needs Attach shop price to each image',
      '',
      'Reply PLANS to upgrade extras.',
    ];
    return {
      command: 'CAPTIONS',
      contextPatch: { unexpectedReplyCount: 0 },
      message: lines.filter(Boolean).join('\n'),
    };
  }

  private parseRunnerCaptionIntent(input: string) {
    const text = String(input || '').trim();
    const body = text.replace(/^captions?\b/i, '').trim();
    if (!body) return { kind: null, value: '' };
    const toggle = body.match(
      /^(order|orders|fee%|fee|percentage|image price|shop price image|images?)\s+(on|off|yes|no)$/i,
    );
    if (toggle) {
      const enabled = /^(on|yes)$/i.test(toggle[2]);
      const key = toggle[1].toUpperCase();
      if (key.startsWith('ORDER')) return { kind: 'ORDER', enabled };
      if (key === 'FEE%' || key === 'FEE' || key === 'PERCENTAGE') {
        return { kind: 'FEE_PERCENT', enabled };
      }
      return { kind: 'IMAGE_PRICE', enabled };
    }
    return { kind: 'MODE', value: body.toUpperCase() };
  }

  private runnerCaptionOptions(runner: any) {
    return this.allRunnerCaptionOptions().filter((option) => {
      if (!option.requires) return true;
      if (option.requires === 'Runner price editing/calculation') {
        return this.runnerHasPriceCaptionAddon(runner);
      }
      if (option.requires === 'Attach shop price to each image') {
        return this.runnerHasShopPriceImageAddon(runner);
      }
      return false;
    });
  }

  private allRunnerCaptionOptions() {
    return [
      {
        mode: 'ORIGINAL',
        alias: 'ORIGINAL',
        label: 'Original shop caption + order link',
        example:
          'Original shop caption... Order code: RC-123 - Order: https://wa.me/...',
      },
      {
        mode: 'TOTAL_ONLY',
        alias: 'TOTAL',
        label: 'Runner total price only',
        requires: 'Runner price editing/calculation',
        example:
          'Runner Price: R120.00 (Includes Runner Fee) - Order: https://wa.me/...',
      },
      {
        mode: 'STOCK_EACH_TOTALS',
        alias: 'STOCK',
        label: 'Stock and each totals',
        requires: 'Runner price editing/calculation',
        example: 'STOCK R500.00 - EACH R65.00 - Order: https://wa.me/...',
      },
    ];
  }

  private runnerCaptionOptionByAlias(options: any[], value: string) {
    const clean = String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    return options.find(
      (option) =>
        option.mode === clean ||
        option.alias === clean ||
        (option.mode === 'TOTAL_ONLY' && clean === 'PRICE') ||
        (option.mode === 'STOCK_EACH_TOTALS' &&
          ['STOCK_EACH', 'EACH'].includes(clean)),
    );
  }

  private isSuspendedRunnerCaptionMode(value: string) {
    const clean = String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    return ['FEE', 'FEE_BREAKDOWN', 'BREAKDOWN'].includes(clean);
  }

  private runnerCaptionSuspendedResponse() {
    return {
      command: 'CAPTIONS',
      message: [
        'Fee breakdown captions are temporarily suspended for stock, bulk, and each pricing.',
        'Use CAPTION TOTAL for one final runner price, or CAPTION STOCK for stock/each totals.',
      ].join('\n'),
    };
  }

  private runnerCaptionUpgradeResponse(option: {
    label: string;
    requires?: string;
  }) {
    return {
      command: 'CAPTIONS',
      message: [
        `${option.label} needs the ${option.requires || 'required'} extra.`,
        'Reply PLANS to add or upgrade your subscription, then return to CAPTIONS.',
      ].join('\n'),
    };
  }

  private currentRunnerCaptionSubscription(runner: any) {
    const now = new Date();
    return (runner.subscriptions || []).find((subscription: any) => {
      const start = subscription.currentPeriodStart
        ? new Date(subscription.currentPeriodStart)
        : null;
      const end = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null;
      return (
        subscription.audience === 'RUNNER' &&
        subscription.status === 'ACTIVE' &&
        (!start || start <= now) &&
        (!end || end >= now)
      );
    });
  }

  private runnerHasPriceCaptionAddon(runner: any) {
    return Boolean(
      this.currentRunnerCaptionSubscription(runner)?.priceEditingAddonEnabled,
    );
  }

  private runnerHasShopPriceImageAddon(runner: any) {
    return Boolean(
      this.currentRunnerCaptionSubscription(runner)?.shopPriceImageAddonEnabled,
    );
  }
  private async runnerBillingBotResponse(runnerId: string) {
    if (!this.billingService) {
      return this.billingUnavailableResponse();
    }
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        user: { select: { phone: true, name: true } },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        billingInvoices: {
          include: {
            manualPayments: true,
            subscription: { include: { plan: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    let openInvoice = (runner.billingInvoices || []).find(
      (invoice: any) =>
        !['PAID', 'VOID', 'CANCELLED', 'REJECTED'].includes(invoice.status),
    );
    if (openInvoice?.id && this.billingService?.ensureInvoicePdf) {
      openInvoice = await this.billingService.ensureInvoicePdf(openInvoice.id);
    }
    const verifiedReceipts = (runner.billingInvoices || []).flatMap(
      (invoice: any) =>
        (invoice.manualPayments || [])
          .filter(
            (payment: any) =>
              payment.status === 'VERIFIED' && payment.receiptPdfUrl,
          )
          .map((payment: any) => ({
            mediaUrl: payment.receiptPdfUrl,
            filename: `${payment.receiptNumber || 'Runner-Commerce-Receipt'}.pdf`,
            mimeType: 'application/pdf',
            caption: `Official receipt ${payment.receiptNumber || ''}`.trim(),
          })),
    );
    const subscription = runner.subscriptions?.[0];
    const runnerReference = this.runnerPaymentReference(runner);
    const lines = [
      'Runner Commerce billing',
      '',
      subscription
        ? `Subscription: ${subscription.plan?.name || 'Runner plan'} · ${subscription.status} · ${this.moneyText(subscription.monthlyPrice)}/${this.billingCycleText(subscription.billingCycle)}`
        : 'Subscription: none yet',
      subscription
        ? `Current extras: ${this.subscriptionExtrasText(subscription)}`
        : 'Current extras: none',
      openInvoice
        ? `Open invoice: ${openInvoice.invoiceNumber} · ${this.moneyText(openInvoice.total)} · ${openInvoice.status}`
        : 'Open invoice: none',
      openInvoice?.invoicePdfUrl
        ? `Invoice PDF: ${openInvoice.invoicePdfUrl}`
        : openInvoice
          ? 'Invoice PDF: being prepared'
          : '',
      `Runner reference: ${runnerReference}`,
      '',
      openInvoice
        ? `Pay with reference: ${openInvoice.invoiceNumber} ${runnerReference}`
        : 'Reply PLANS to choose a runner subscription plan.',
      openInvoice
        ? `After EFT/MoMo, send: PAY ${openInvoice.invoiceNumber} ${openInvoice.total} EFT ${openInvoice.invoiceNumber} ${runnerReference}`
        : 'Reply PLAN 1, PLAN 2, etc after viewing plans.',
      openInvoice
        ? `For cash, send: PAY ${openInvoice.invoiceNumber} ${openInvoice.total} CASH`
        : '',
      'After payment is submitted, admin approval activates or updates the subscription.',
      'You may paste payment SMS text, attach a screenshot, or use CASH for a payment request.',
      'Official receipt PDFs are issued after admin verifies the payment.',
      this.menuCtaLine(),
    ];

    return {
      command: 'BILLING',
      contextPatch: openInvoice
        ? {
            billingInvoiceNumber: openInvoice.invoiceNumber,
            billingRunnerReference: runnerReference,
          }
        : { billingRunnerReference: runnerReference },
      documents: [
        openInvoice?.invoicePdfUrl
          ? {
              mediaUrl: openInvoice.invoicePdfUrl,
              filename: `${openInvoice.invoiceNumber}.pdf`,
              mimeType: 'application/pdf',
              caption: `Invoice ${openInvoice.invoiceNumber}`,
            }
          : null,
        ...verifiedReceipts,
      ].filter(Boolean),
      message: lines.join('\n'),
    };
  }

  private runnerMainMenuBotResponse() {
    return {
      command: 'MENU',
      contextPatch: { menuActive: true },
      message: this.chatBlock('RUNNERBOT MAIN MENU', [
        'Reply with a number or type the command.',
        '',
        '1. WALKTHROUGH - see the full setup path',
        '2. STATUS - check setup readiness',
        '3. SHOPS - choose shop groups',
        '4. GROUPS - connect posting group',
        '5. START / PAUSE / RESUME / STOP - control reposting',
        '6. STATS - view posting activity and metrics',
        '7. AGE - choose item age window',
        '8. BILLING - subscriptions, invoices, receipts',
        '9. PLANS - view or choose packages',
        '10. PAY - submit payment proof or cash payment request',
        '11. ORDERS - order help and customer order flow',
        '12. SUPPORT - contact support',
        '',
        'Examples:',
        'AGE 7 DAYS',
        'PAUSE SHOP 1,2',
        'STATS 72H',
        this.supportCtaLine(),
      ]),
    };
  }

  private async runnerPlansBotResponse(runnerId: string, input: string) {
    if (!this.billingService) {
      return this.billingUnavailableResponse();
    }
    const text = String(input || '');
    const selected = text.match(/\bplan\s+(\d+)\b/i);
    const plans = await this.billingService.listRunnerPlans();
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        user: { select: { phone: true } },
      },
    });
    const currentSubscription = runner?.subscriptions?.[0];
    if (selected) {
      const index = Number(selected[1]) - 1;
      const plan = plans[index];
      if (!plan) {
        return {
          command: 'PLANS',
          message: `Plan ${selected[1]} was not found. Reply PLANS to refresh available plans.`,
        };
      }
      return this.startRunnerSubscriptionExtrasFlow(plan, index + 1);
    }

    return {
      command: 'PLANS',
      message: this.chatBlock('RUNNER COMMERCE PLANS', [
        'Choose a plan first. I will ask about extras one by one after that.',
        '',
        currentSubscription
          ? `Current plan: ${currentSubscription.plan?.name || 'Runner plan'}`
          : 'Current plan: none',
        currentSubscription
          ? `Current extras: ${this.subscriptionExtrasText(currentSubscription)}`
          : 'Current extras: none',
        '',
        ...plans.map((plan: any, index: number) =>
          this.runnerPlanCaptionBlock(plan, index + 1),
        ),
        '',
        'Next: reply PLAN 1, PLAN 2, etc.',
        'After you choose, I will ask about each extra separately, then confirm before issuing the invoice.',
        this.menuCtaLine(),
      ]),
    };
  }

  private async runnerPaymentBotResponse(
    runnerId: string,
    input: string,
    meta?: {
      messageId?: string;
      mediaUrls?: string[];
      context?: Record<string, unknown>;
    },
  ) {
    if (!this.billingService) {
      return this.billingUnavailableResponse();
    }
    if (/^pay status\b/i.test(input || '')) {
      return this.runnerBillingBotResponse(runnerId);
    }
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: { user: { select: { phone: true } } },
    });
    const runnerReference = this.runnerPaymentReference(runner);
    const proofImageUrls = this.cleanStringArray(meta?.mediaUrls, 8, 500);
    const pendingPayment = this.pendingRunnerPaymentFromContext(meta?.context);
    const paymentChoice = this.runnerPaymentChoiceFromInput(
      input,
      pendingPayment,
    );
    if (paymentChoice) {
      if (paymentChoice.method === 'CASH') {
        input = `PAY ${paymentChoice.invoiceNumber} ${paymentChoice.amount} CASH`;
      } else {
        const proofText = this.runnerPaymentChoiceProofText(input);
        if (!proofText && proofImageUrls.length === 0) {
          return {
            command: 'PAY',
            contextPatch: {
              billingInvoiceNumber: paymentChoice.invoiceNumber,
              billingInvoiceAmount: paymentChoice.amount,
              billingRunnerReference: runnerReference,
              pendingRunnerPayment: paymentChoice,
            },
            message: [
              `EFT/MoMo selected for ${paymentChoice.invoiceNumber}.`,
              `Amount: ${this.moneyText(paymentChoice.amount)}`,
              `Use reference: ${paymentChoice.invoiceNumber} ${runnerReference}`,
              '',
              'After paying, paste the SMS proof or attach a screenshot.',
              `You can also reply: PAY ${paymentChoice.invoiceNumber} ${paymentChoice.amount} EFT ${paymentChoice.invoiceNumber} ${runnerReference}`,
              this.menuCtaLine(),
            ].join('\n'),
          };
        }
        input = [
          `PAY ${paymentChoice.invoiceNumber} ${paymentChoice.amount} EFT ${paymentChoice.invoiceNumber} ${runnerReference}`,
          proofText,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }
    const parsed = this.parseRunnerPaymentProof(
      input,
      meta?.context,
      runnerReference,
    );
    if (/^pay\s*$/i.test(String(input || '')) && proofImageUrls.length === 0) {
      const openInvoice = await this.openRunnerInvoiceForPayment(runnerId);
      if (openInvoice) {
        return this.runnerPaymentOptionsResponse(openInvoice, runnerReference);
      }
      return {
        command: 'PAY',
        message: [
          'Please include payment proof details.',
          `Example: PAY RCINV-000001 150 EFT RCINV-000001 ${runnerReference}`,
          'Cash payment request example: PAY RCINV-000001 150 CASH',
          'You can paste the SMS proof, attach a screenshot, or use CASH to create a payment request.',
          'Official receipt PDFs are issued only after admin verification.',
          this.menuCtaLine(),
        ].join('\n'),
      };
    }

    if (
      !this.isCashPaymentMethod(parsed.method) &&
      !parsed.reference?.includes(runnerReference)
    ) {
      return {
        command: 'PAY',
        message: [
          `Please include your runner reference in the payment reference: ${runnerReference}`,
          parsed.invoiceNumber
            ? `Example: PAY ${parsed.invoiceNumber} ${parsed.amount || '150'} EFT ${parsed.invoiceNumber} ${runnerReference}`
            : `Example: PAY RCINV-000001 150 EFT RCINV-000001 ${runnerReference}`,
        ].join('\n'),
      };
    }

    const amount =
      parsed.amount > 0
        ? parsed.amount
        : await this.runnerInvoiceAmount(
            runnerId,
            parsed.invoiceNumber || undefined,
          );
    const payment = await this.billingService.submitRunnerBotInvoicePayment({
      runnerId,
      invoiceNumber: parsed.invoiceNumber || undefined,
      amount,
      method: parsed.method,
      reference: this.runnerPaymentReferenceForMethod(parsed, runnerReference),
      runnerReference,
      proofText: this.runnerPaymentProofTextForMethod(parsed),
      proofImageUrls,
      sourceMessageId: meta?.messageId,
      notes: this.isCashPaymentMethod(parsed.method)
        ? 'Cash payment request created through RunnerBot for admin approval'
        : 'Submitted through RunnerBot for admin approval',
    });

    return {
      command: 'PAY',
      contextPatch: {
        billingInvoiceNumber: parsed.invoiceNumber,
        billingRunnerReference: runnerReference,
        pendingRunnerPayment: null,
      },
      message: [
        this.isCashPaymentMethod(parsed.method)
          ? 'Cash payment request received for admin approval.'
          : 'Payment proof received for admin approval.',
        `Amount: ${this.moneyText(payment.amount)}`,
        `Method: ${payment.method}`,
        `Reference: ${payment.reference || runnerReference}`,
        proofImageUrls.length ? `Screenshots: ${proofImageUrls.length}` : '',
        '',
        'Your invoice remains pending until admin verifies the payment.',
        'Official receipt PDF will be issued after verification.',
        'Reply PAY STATUS to check the invoice later.',
        this.menuCtaLine(),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private runnerPlanExtras(plan: any) {
    return [
      {
        key: 'priceEditingAddonEnabled',
        aliases: ['price', 'pricing', 'editing', 'calculation', 'calc'],
        label: 'Runner price editing/calculation',
        price: Number(plan.priceEditingAddonPrice || 0),
        suffix: '',
      },
      {
        key: 'shopPriceImageAddonEnabled',
        aliases: ['shop', 'image', 'images', 'attach'],
        label: 'Attach shop price to each image',
        price: Number(plan.shopPriceImageAddonPrice || 0),
        suffix: '',
      },
      {
        key: 'automationAddonEnabled',
        aliases: ['automation', 'auto'],
        label: 'Extra reposting capacity',
        price: Number(plan.automationAddonPrice || 0),
        suffix: '',
      },
    ].filter((extra) => extra.price > 0);
  }

  private runnerPlanCaptionBlock(plan: any, number: number) {
    const cycle = this.billingCycleText(plan.billingCycle);
    const extras = this.runnerPlanExtras(plan);
    return [
      this.chatDivider(),
      `PLAN ${number}: ${plan.name}`,
      this.chatDivider(),
      `Price: ${this.moneyText(plan.monthlyPrice)}/${cycle}`,
      plan.description ? `Best for: ${plan.description}` : '',
      Array.isArray(plan.features) && plan.features.length
        ? `Includes: ${plan.features.slice(0, 3).join(' · ')}`
        : '',
      extras.length
        ? `Extras available: ${extras.map((extra) => extra.label).join(' · ')}`
        : 'Extras available: none',
      `Code: ${plan.code}`,
      `Reply: PLAN ${number}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private startRunnerSubscriptionExtrasFlow(plan: any, planNumber: number) {
    const extras = this.runnerPlanExtras(plan);
    const pending = {
      planCode: plan.code,
      planNumber,
      planSnapshot: this.runnerPlanSnapshot(plan),
      extras,
      answers: {},
      currentExtraIndex: 0,
    };
    if (extras.length === 0) {
      return this.runnerSubscriptionConfirmationPrompt({
        ...pending,
        currentExtraIndex: extras.length,
      });
    }
    return {
      command: 'PLANS',
      contextPatch: {
        pendingRunnerSubscription: pending,
        unexpectedReplyCount: 0,
      },
      message: [
        `*${plan.name} selected*`,
        `Base price: ${this.moneyText(plan.monthlyPrice)}/${this.billingCycleText(plan.billingCycle)}`,
        '',
        this.runnerSubscriptionExtraQuestion(pending),
      ].join('\n'),
    };
  }

  private runnerPlanSnapshot(plan: any) {
    return {
      code: plan.code,
      name: plan.name,
      monthlyPrice: Number(plan.monthlyPrice || 0),
      billingCycle: plan.billingCycle,
      perConfirmedOrderFee: Number(plan.perConfirmedOrderFee || 0),
    };
  }

  private pendingRunnerSubscriptionFromContext(
    context: Record<string, unknown>,
  ) {
    const pending = context.pendingRunnerSubscription;
    if (!pending || typeof pending !== 'object') return null;
    const item = pending as any;
    if (!item.planCode || !item.planSnapshot) return null;
    return {
      planCode: String(item.planCode),
      planNumber: Number(item.planNumber || 0),
      planSnapshot: item.planSnapshot,
      extras: Array.isArray(item.extras)
        ? item.extras.filter((extra: any) =>
            this.phase1RunnerExtraKeys().includes(String(extra?.key || '')),
          )
        : [],
      answers:
        item.answers && typeof item.answers === 'object'
          ? this.phase1RunnerSubscriptionAnswers(item.answers)
          : {},
      currentExtraIndex: Number(item.currentExtraIndex || 0),
    };
  }

  private async handlePendingRunnerSubscriptionStep(
    runnerId: string,
    text: string,
    pending: any,
  ) {
    if (!this.billingService) {
      return this.billingUnavailableResponse();
    }
    if (/^(cancel|stop|exit)$/i.test(text)) {
      return {
        command: 'PLANS',
        contextPatch: {
          pendingRunnerSubscription: null,
          unexpectedReplyCount: 0,
        },
        message: [
          'Subscription selection cancelled.',
          '',
          'Reply PLANS when you want to choose again.',
        ].join('\n'),
      };
    }

    if (pending.currentExtraIndex < pending.extras.length) {
      const answer = this.parseYesNo(text);
      if (answer === null) {
        return {
          command: 'PLANS',
          contextPatch: { unexpectedReplyCount: 0 },
          message: this.runnerSubscriptionExtraQuestion(pending),
        };
      }
      const extra = pending.extras[pending.currentExtraIndex];
      const nextPending = {
        ...pending,
        answers: { ...pending.answers, [extra.key]: answer },
        currentExtraIndex: pending.currentExtraIndex + 1,
      };
      if (nextPending.currentExtraIndex < nextPending.extras.length) {
        return {
          command: 'PLANS',
          contextPatch: {
            pendingRunnerSubscription: nextPending,
            unexpectedReplyCount: 0,
          },
          message: this.runnerSubscriptionExtraQuestion(nextPending),
        };
      }
      return this.runnerSubscriptionConfirmationPrompt(nextPending);
    }

    if (!/^(yes|y|confirm|issue|invoice|ok|okay)$/i.test(text)) {
      return this.runnerSubscriptionConfirmationPrompt(pending);
    }

    const { subscription, invoice } =
      await this.billingService.createRunnerBotSubscriptionAndInvoice(
        runnerId,
        pending.planCode,
        this.phase1RunnerSubscriptionAnswers(pending.answers),
      );
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: { user: { select: { phone: true } } },
    });
    const runnerReference = this.runnerPaymentReference(runner);
    return {
      command: 'BILLING',
      contextPatch: {
        pendingRunnerSubscription: null,
        billingInvoiceNumber: invoice.invoiceNumber,
        billingRunnerReference: runnerReference,
      },
      message: [
        '*Invoice issued*',
        '',
        `Plan: ${subscription.plan?.name || pending.planSnapshot.name}`,
        `Extras: ${this.subscriptionExtrasText(subscription)}`,
        `Invoice: ${invoice.invoiceNumber}`,
        `Amount: ${this.moneyText(invoice.total)}`,
        `Status: ${invoice.status}`,
        invoice.invoicePdfUrl ? `Invoice PDF: ${invoice.invoicePdfUrl}` : '',
        '',
        'Your subscription will wait for admin approval after payment.',
        `Reference: ${invoice.invoiceNumber} ${runnerReference}`,
        `EFT/MoMo: PAY ${invoice.invoiceNumber} ${invoice.total} EFT ${invoice.invoiceNumber} ${runnerReference}`,
        `Cash payment request: PAY ${invoice.invoiceNumber} ${invoice.total} CASH`,
        'Official receipt PDF is issued after admin verifies payment.',
        this.menuCtaLine(),
      ]
        .filter(Boolean)
        .join('\n'),
      documents: invoice.invoicePdfUrl
        ? [
            {
              mediaUrl: invoice.invoicePdfUrl,
              filename: `${invoice.invoiceNumber}.pdf`,
              mimeType: 'application/pdf',
              caption: `Invoice ${invoice.invoiceNumber}`,
            },
          ]
        : [],
    };
  }

  private runnerSubscriptionExtraQuestion(pending: any) {
    const extra = pending.extras[pending.currentExtraIndex];
    const cycle = this.billingCycleText(pending.planSnapshot.billingCycle);
    return [
      `*Extra ${pending.currentExtraIndex + 1} of ${pending.extras.length}*`,
      `${extra.label}`,
      `Price: ${this.moneyText(extra.price)}/${cycle}${extra.suffix || ''}`,
      '',
      'Reply YES to add it, or NO to skip it.',
      'Reply CANCEL to stop subscription selection.',
    ].join('\n');
  }

  private runnerSubscriptionConfirmationPrompt(pending: any) {
    const summary = this.pendingSubscriptionExtrasText(pending);
    const total = this.pendingSubscriptionTotal(pending);
    return {
      command: 'PLANS',
      contextPatch: {
        pendingRunnerSubscription: pending,
        unexpectedReplyCount: 0,
      },
      message: [
        '*Confirm subscription*',
        '',
        `Plan: ${pending.planSnapshot.name}`,
        `Base price: ${this.moneyText(pending.planSnapshot.monthlyPrice)}/${this.billingCycleText(pending.planSnapshot.billingCycle)}`,
        `Extras: ${summary}`,
        `Total now: ${this.moneyText(total)}`,
        '',
        'Reply YES to issue the invoice.',
        'Reply CANCEL to stop.',
      ].join('\n'),
    };
  }

  private pendingSubscriptionExtrasText(pending: any) {
    const cycle = this.billingCycleText(pending.planSnapshot.billingCycle);
    const selected = pending.extras
      .filter((extra: any) => pending.answers?.[extra.key])
      .map(
        (extra: any) =>
          `${extra.label} ${this.moneyText(extra.price)}/${cycle}${extra.suffix || ''}`,
      );
    return selected.length ? selected.join('; ') : 'none';
  }

  private pendingSubscriptionTotal(pending: any) {
    const extrasTotal = pending.extras
      .filter((extra: any) => pending.answers?.[extra.key])
      .reduce((sum: number, extra: any) => sum + Number(extra.price || 0), 0);
    return Number(pending.planSnapshot.monthlyPrice || 0) + extrasTotal;
  }

  private parseYesNo(text: string) {
    if (/^(yes|y|add|include|take|ok|okay)$/i.test(text)) return true;
    if (/^(no|n|skip|none|not now)$/i.test(text)) return false;
    return null;
  }

  private availablePlanExtrasText(plan: any) {
    const cycle = this.billingCycleText(plan.billingCycle);
    const extras = this.runnerPlanExtras(plan);
    if (extras.length === 0) return 'none';
    return extras
      .map(
        (extra, index) =>
          `${index + 1}. ${extra.label} ${this.moneyText(extra.price)}/${cycle}${extra.suffix}`,
      )
      .join('; ');
  }

  private parseRunnerPlanExtras(input: string, plan: any) {
    const text = String(input || '').toLowerCase();
    const extras = this.runnerPlanExtras(plan);
    const numbers = new Set(
      (text.match(/\bextras?\s+([0-9,\s]+)/i)?.[1] || '')
        .match(/\d+/g)
        ?.map((item) => Number(item)) || [],
    );
    const selected: Record<string, boolean> = {};
    extras.forEach((extra, index) => {
      const byNumber = numbers.has(index + 1);
      const byWord = extra.aliases.some((alias) =>
        text.includes(alias.toLowerCase()),
      );
      selected[extra.key] = Boolean(byNumber || byWord);
    });
    return selected;
  }

  private phase1RunnerExtraKeys() {
    return [
      'priceEditingAddonEnabled',
      'shopPriceImageAddonEnabled',
      'automationAddonEnabled',
    ];
  }

  private phase1RunnerSubscriptionAnswers(answers: Record<string, unknown>) {
    const allowed = new Set(this.phase1RunnerExtraKeys());
    return Object.fromEntries(
      Object.entries(answers || {}).filter(([key]) => allowed.has(key)),
    );
  }

  private subscriptionExtrasText(subscription: any) {
    const cycle = this.billingCycleText(subscription.billingCycle);
    const extras = [
      subscription.priceEditingAddonEnabled
        ? `Runner price editing/calculation ${this.moneyText(subscription.priceEditingAddonPrice)}/${cycle}`
        : '',
      subscription.shopPriceImageAddonEnabled
        ? `Attach shop price to each image ${this.moneyText(subscription.shopPriceImageAddonPrice)}/${cycle}`
        : '',
      subscription.automationAddonEnabled
        ? `Extra reposting capacity ${this.moneyText(subscription.automationAddonPrice)}/${cycle}`
        : '',
    ].filter(Boolean);
    return extras.length ? extras.join('; ') : 'none';
  }

  private async runnerOrdersBotResponse(runnerId: string, input: string) {
    if (!this.isRunnerOrderSubmission(input)) {
      return {
        command: 'ORDERS',
        message: this.runnerOrderHelpText(),
      };
    }

    if (!this.runnerService) {
      return {
        command: 'ORDERS',
        message:
          'Order intake is not available right now. Please try again after the system services restart.',
      };
    }

    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { phone: true, user: { select: { phone: true } } },
    });
    const result = await this.runnerService.submitRunnerWhatsAppOrder(
      runnerId,
      input,
      runner?.phone || runner?.user?.phone || null,
    );
    const order = result.order as any;
    const orderId = String(order?.id || '')
      .slice(-8)
      .toUpperCase();
    const itemCount = Array.isArray(order?.items) ? order.items.length : 0;
    const detailLines = [
      result.size ? `Size: ${result.size}` : '',
      result.color ? `Color: ${result.color}` : '',
    ].filter(Boolean);

    return {
      command: 'ORDERS',
      message: [
        result.createdNewOrder
          ? 'Order captured and a new customer basket was created.'
          : 'Order captured and added to the customer’s open basket.',
        '',
        `Customer: ${result.customerName || result.customerPhone}`,
        `Item: ${result.listing.product?.name || 'Selected item'}`,
        `Shop: ${result.listing.product?.shop?.name || 'Unknown shop'}`,
        `Order code: ${result.listing.orderCode}`,
        `Qty: ${result.quantity}`,
        ...detailLines,
        orderId ? `Basket/order: ${orderId}` : '',
        itemCount ? `Basket items: ${itemCount}` : '',
        '',
        'Next steps:',
        '1. Open Runner > WhatsApp Orders to review customer orders.',
        '2. Open Runner > Shopping List to buy items grouped by shop.',
        '3. If the customer adds another item, send another ADD TO ORDER message with the same customer phone.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }

  private isRunnerOrderSubmission(input: string) {
    return /^(order for|add order|add to order)\b/i.test(
      String(input || '').trim(),
    );
  }

  private async runnerBuyingBotResponse(runnerId: string, input: string) {
    if (!this.runnerService) {
      return {
        command: 'BUYING',
        message:
          'Shopping list is not available right now. Please try again after the system services restart.',
      };
    }

    const shoppingList = await this.runnerService.getShoppingList(runnerId);
    const shops = Array.isArray((shoppingList as any).data)
      ? (shoppingList as any).data
      : [];
    const text = String(input || '').trim();
    const shopMatch = text.match(
      /^shop\s+(\d+)(?:\s+(bought|unavailable|reset))?$/i,
    );

    if (!shopMatch) {
      if (shops.length === 0) {
        return {
          command: 'BUYING',
          message:
            'No open items to buy yet.\n\nWhen customer orders are captured, reply BUY LIST to see shops and SHOP 1 to open a shop buying list.',
        };
      }

      return {
        command: 'BUYING',
        message: [
          'Shop buying list',
          '',
          ...shops.map((shop: any, index: number) =>
            [
              `${index + 1}. ${shop.shop?.name || 'Unknown shop'}`,
              `${shop.itemCount} line(s)`,
              `${shop.totalQuantity} qty`,
              this.moneyText(shop.totalShopCost),
            ].join(' - '),
          ),
          '',
          'Next steps:',
          'Reply SHOP <number> to see all items for one shop.',
          'Reply SHOP <number> BOUGHT to mark all items from that shop as bought.',
          'Reply SHOP <number> UNAVAILABLE if that shop cannot supply the selected items.',
          'Reply SHOP <number> RESET to put those items back on the buying list.',
          'Reply PACK LIST when you are ready to pack by customer.',
        ].join('\n'),
      };
    }

    const shopIndex = Number(shopMatch[1]) - 1;
    const shop = shops[shopIndex];
    if (!shop) {
      return {
        command: 'BUYING',
        message:
          'I could not find that shop number. Reply BUY LIST to see current shop numbers, then send SHOP <number>.',
      };
    }

    const action = String(shopMatch[2] || '').toUpperCase();
    const itemIds = this.itemIdsForShopGroup(shop);
    if (action) {
      const status = action === 'RESET' ? 'REQUESTED' : action;
      await this.runnerService.updateShoppingListItemsStatus(
        runnerId,
        itemIds,
        status,
      );
      return {
        command: 'BUYING',
        message: [
          `${shop.shop?.name || 'Selected shop'} updated.`,
          `Items updated: ${itemIds.length}`,
          `Status: ${status}`,
          '',
          'Next steps:',
          'Reply BUY LIST to refresh shop numbers.',
          'Reply PACK LIST to pack customer orders.',
        ].join('\n'),
      };
    }

    return {
      command: 'BUYING',
      message: [
        `${shopIndex + 1}. ${shop.shop?.name || 'Unknown shop'}`,
        `${shop.totalQuantity} item(s) to buy - ${this.moneyText(
          shop.totalShopCost,
        )} shop cost`,
        shop.shop?.phone || shop.shop?.address
          ? [shop.shop?.phone, shop.shop?.address].filter(Boolean).join(' - ')
          : '',
        '',
        ...this.shopBuyingLines(shop),
        '',
        'Next steps:',
        `Reply SHOP ${shopIndex + 1} BOUGHT after buying all available items from this shop.`,
        `Reply SHOP ${shopIndex + 1} UNAVAILABLE if this shop cannot supply them.`,
        `Reply SHOP ${shopIndex + 1} RESET to undo a shop-level status update.`,
        'Reply BUY LIST to choose another shop.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }

  private async runnerPackingBotResponse(runnerId: string, input: string) {
    if (!this.runnerService) {
      return {
        command: 'PACKING',
        message:
          'Packing list is not available right now. Please try again after the system services restart.',
      };
    }

    const packingList =
      await this.runnerService.getCustomerPackingList(runnerId);
    const customers = Array.isArray((packingList as any).data)
      ? (packingList as any).data
      : [];
    const text = String(input || '').trim();
    const customerMatch = text.match(
      /^(?:pack|customer)\s+(\d+)(?:\s+packed)?$/i,
    );
    const markPacked = /\s+packed$/i.test(text);

    if (!customerMatch) {
      if (customers.length === 0) {
        return {
          command: 'PACKING',
          message:
            'No customer items are ready for packing yet.\n\nAfter buying items, reply PACK LIST again to see customer packing options.',
        };
      }

      return {
        command: 'PACKING',
        message: [
          'Customer packing list',
          '',
          ...customers.map((customer: any, index: number) =>
            [
              `${index + 1}. ${customer.customerName || 'Customer'}`,
              customer.customerPhone || 'no phone saved',
              `${customer.totalQuantity} item(s)`,
              `${customer.shopCount} shop(s)`,
            ].join(' - '),
          ),
          '',
          'Next steps:',
          'Reply PACK <number> to see one customer’s items.',
          'Reply PACK <number> PACKED after packing that customer’s items.',
          'Reply BUY LIST if you still need to buy items by shop.',
        ].join('\n'),
      };
    }

    const customerIndex = Number(customerMatch[1]) - 1;
    const customer = customers[customerIndex];
    if (!customer) {
      return {
        command: 'PACKING',
        message:
          'I could not find that customer number. Reply PACK LIST to see current customer numbers, then send PACK <number>.',
      };
    }

    const itemIds = this.itemIdsForPackingCustomer(customer);
    if (markPacked) {
      await this.runnerService.updateShoppingListItemsStatus(
        runnerId,
        itemIds,
        'PACKED',
      );
      return {
        command: 'PACKING',
        message: [
          `${customer.customerName || 'Customer'} marked as packed.`,
          `Items packed: ${itemIds.length}`,
          '',
          'Next steps:',
          'Reply PACK LIST to choose the next customer.',
          'Reply BUY LIST to return to shop buying.',
        ].join('\n'),
      };
    }

    return {
      command: 'PACKING',
      message: [
        `${customerIndex + 1}. ${customer.customerName || 'Customer'}`,
        customer.customerPhone ? `Phone: ${customer.customerPhone}` : '',
        `${customer.totalQuantity} item(s) from ${customer.shopCount} shop(s)`,
        '',
        ...this.customerPackingLines(customer),
        '',
        'Next steps:',
        `Reply PACK ${customerIndex + 1} PACKED after packing this customer’s items.`,
        'Reply PACK LIST to choose another customer.',
        'Reply BUY LIST if you still need to buy by shop.',
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }

  private shopBuyingLines(shop: any) {
    const lines = Array.isArray(shop?.lines) ? shop.lines : [];
    return lines.flatMap((line: any, index: number) => {
      const details = [
        `Qty ${line.quantity}`,
        line.selectedSize ? `Size ${line.selectedSize}` : '',
        line.selectedColor ? `Color ${line.selectedColor}` : '',
        `Shop unit ${this.moneyText(line.shopUnitPrice)}`,
        `Total ${this.moneyText(line.shopCost)}`,
      ].filter(Boolean);
      const customers = Array.isArray(line.customers)
        ? line.customers
            .map((customer: any) =>
              [
                `  - ${customer.customerName || 'Customer'}`,
                customer.customerPhone || '',
                `Qty ${customer.quantity}`,
                customer.customerNote ? `Note: ${customer.customerNote}` : '',
              ]
                .filter(Boolean)
                .join(' - '),
            )
            .slice(0, 8)
        : [];
      const image =
        line.customerImages?.[0] || line.productImages?.[0] || undefined;
      return [
        `${index + 1}) ${line.productName || 'Item'} - ${details.join(' - ')}`,
        image ? `Image: ${image}` : '',
        ...customers,
      ].filter(Boolean);
    });
  }

  private customerPackingLines(customer: any) {
    const shops = Array.isArray(customer?.shops) ? customer.shops : [];
    return shops.flatMap((shop: any) => [
      `Shop: ${shop.shopName || 'Unknown shop'}`,
      ...((Array.isArray(shop.items) ? shop.items : []) as any[]).map(
        (item: any, index: number) =>
          [
            `${index + 1}) ${item.productName || 'Item'}`,
            `Qty ${item.quantity}`,
            item.selectedSize ? `Size ${item.selectedSize}` : '',
            item.selectedColor ? `Color ${item.selectedColor}` : '',
            item.status ? `Status ${item.status}` : '',
            item.customerNote ? `Note: ${item.customerNote}` : '',
            item.imageUrls?.[0] ? `Image: ${item.imageUrls[0]}` : '',
          ]
            .filter(Boolean)
            .join(' - '),
      ),
    ]);
  }

  private itemIdsForShopGroup(shop: any) {
    return (Array.isArray(shop?.lines) ? shop.lines : []).flatMap(
      (line: any) => (Array.isArray(line.itemIds) ? line.itemIds : []),
    );
  }

  private itemIdsForPackingCustomer(customer: any) {
    return (Array.isArray(customer?.shops) ? customer.shops : []).flatMap(
      (shop: any) =>
        (Array.isArray(shop.items) ? shop.items : [])
          .map((item: any) => item.orderItemId)
          .filter(Boolean),
    );
  }

  private moneyText(value: unknown) {
    return `E${Number(value || 0).toFixed(2)}`;
  }

  private billingCycleText(value?: string | null) {
    return String(value || 'MONTHLY').toUpperCase() === 'WEEKLY'
      ? 'week'
      : 'month';
  }

  private runnerPaymentReference(runner: any) {
    return (
      this.normalizePhone(runner?.phone || runner?.user?.phone || '') || ''
    )
      .replace(/^\+/, '')
      .slice(-12);
  }

  private async openRunnerInvoiceForPayment(runnerId: string) {
    return this.prisma.platformInvoice.findFirst({
      where: {
        runnerId,
        status: { notIn: ['PAID', 'VOID', 'CANCELLED', 'REJECTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private runnerPaymentOptionsResponse(invoice: any, runnerReference: string) {
    const invoiceNumber = invoice.invoiceNumber;
    const amount = Number(invoice.total || 0);
    const pendingRunnerPayment = {
      invoiceNumber,
      amount,
      runnerReference,
      method: 'EFT',
    };
    return {
      command: 'PAY',
      contextPatch: {
        billingInvoiceNumber: invoiceNumber,
        billingInvoiceAmount: amount,
        billingRunnerReference: runnerReference,
        pendingRunnerPayment,
      },
      message: [
        'Choose payment option',
        '',
        `Invoice: ${invoiceNumber}`,
        `Amount: ${this.moneyText(amount)}`,
        `Reference: ${invoiceNumber} ${runnerReference}`,
        '',
        '1. EFT/MoMo proof - use the reference above, then paste the SMS proof or attach a screenshot.',
        '2. Cash payment request - create a cash request for admin approval.',
        '',
        'Reply 1 for EFT/MoMo proof or 2 for CASH.',
        'You can also reply EFT, MOMO, or CASH.',
        'Official receipt PDFs are issued only after admin verification.',
        this.menuCtaLine(),
      ].join('\n'),
    };
  }

  private pendingRunnerPaymentFromContext(context?: Record<string, unknown>) {
    const pending = context?.pendingRunnerPayment;
    if (!pending || typeof pending !== 'object') return null;
    const data = pending as Record<string, unknown>;
    const invoiceNumber = this.clean(data.invoiceNumber as string);
    const amount = Number(data.amount || context?.billingInvoiceAmount || 0);
    const runnerReference = this.clean(
      (data.runnerReference || context?.billingRunnerReference) as string,
    );
    if (!invoiceNumber || !(amount > 0)) return null;
    return {
      invoiceNumber,
      amount,
      runnerReference,
      method: this.clean(data.method as string) || 'EFT',
    };
  }

  private isRunnerPaymentChoiceReply(
    input: string,
    context: Record<string, unknown>,
  ) {
    return Boolean(
      this.runnerPaymentChoiceFromInput(
        input,
        this.pendingRunnerPaymentFromContext(context),
      ),
    );
  }

  private runnerPaymentChoiceFromInput(input: string, pending: any) {
    if (!pending) return null;
    const text = String(input || '').trim();
    const choice = text.match(
      /^(?:pay\s*)?(1|2|eft|momo|mtn\s*momo|cash)\b/i,
    )?.[1];
    if (!choice) return null;
    const normalized = choice.toUpperCase().replace(/\s+/g, '_');
    return {
      ...pending,
      method: ['2', 'CASH'].includes(normalized) ? 'CASH' : 'EFT',
    };
  }

  private runnerPaymentChoiceProofText(input: string) {
    return String(input || '')
      .trim()
      .replace(/^(?:pay\s*)?(?:1|eft|momo|mtn\s*momo)\b\s*[:\-]?\s*/i, '')
      .trim();
  }

  private parseRunnerPaymentProof(
    input: string,
    context: Record<string, unknown> | undefined,
    runnerReference: string,
  ) {
    const text = String(input || '').trim();
    const invoiceNumber =
      text.match(/\bRCINV-\d{6,}\b/i)?.[0]?.toUpperCase() ||
      this.clean(context?.billingInvoiceNumber as string) ||
      undefined;
    const withoutCommand = text.replace(/^pay(?:ment| proof| paid)?\s*/i, '');
    const amountSource = invoiceNumber
      ? withoutCommand.replace(new RegExp(invoiceNumber, 'i'), ' ')
      : withoutCommand;
    const amountMatch = amountSource.match(
      /\b(?:R|E)?\s*(\d+(?:[.,]\d{1,2})?)\b/i,
    );
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0;
    const method =
      withoutCommand.match(
        /\b(EFT|MTN[_\s-]?MOMO|MOMO|CASH[_\s-]?DEPOSIT|CASH|OTHER)\b/i,
      )?.[1] || 'EFT';
    const normalizedMethod = method
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/^MOMO$/, 'MTN_MOMO')
      .replace(/^CASH_DEPOSIT$/, 'CASH');
    const referenceStart = invoiceNumber
      ? withoutCommand.toUpperCase().indexOf(invoiceNumber)
      : -1;
    const firstLine = withoutCommand.split(/\n/)[0].trim();
    const reference =
      referenceStart >= 0
        ? withoutCommand.slice(referenceStart).split(/\n/)[0].trim()
        : firstLine ||
          [invoiceNumber, runnerReference].filter(Boolean).join(' ');

    return {
      invoiceNumber,
      amount,
      method: normalizedMethod,
      reference,
      proofText: text.length > 0 ? text.slice(0, 4000) : undefined,
    };
  }

  private isCashPaymentMethod(method?: string | null) {
    return ['CASH', 'CASH_DEPOSIT'].includes(
      String(method || '').toUpperCase(),
    );
  }

  private runnerPaymentReferenceForMethod(
    parsed: {
      invoiceNumber?: string;
      method: string;
      reference?: string;
    },
    runnerReference: string,
  ) {
    if (this.isCashPaymentMethod(parsed.method)) {
      return [
        'CASH RECEIPT',
        parsed.invoiceNumber,
        runnerReference,
        new Date().toISOString().slice(0, 10),
      ]
        .filter(Boolean)
        .join(' ');
    }
    return parsed.reference;
  }

  private runnerPaymentProofTextForMethod(parsed: {
    method: string;
    proofText?: string;
  }) {
    if (this.isCashPaymentMethod(parsed.method)) {
      return ['RunnerBot cash receipt request.', parsed.proofText || '']
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);
    }
    return parsed.proofText;
  }

  private async runnerInvoiceAmount(runnerId: string, invoiceNumber?: string) {
    const invoice = await this.prisma.platformInvoice.findFirst({
      where: {
        runnerId,
        ...(invoiceNumber ? { invoiceNumber } : {}),
        status: { notIn: ['PAID', 'VOID', 'CANCELLED', 'REJECTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice) {
      throw new BadRequestException(
        'No unpaid invoice found. Reply BILLING to choose a plan first.',
      );
    }
    return Number(invoice.total || 0);
  }

  private billingUnavailableResponse() {
    return {
      command: 'BILLING',
      message:
        'Billing is not available right now. Please try again after the system services restart.',
    };
  }

  private runnerOrderHelpText() {
    return [
      'Order intake options',
      '',
      '1. Customer messages you directly',
      'Reply to RunnerBot with:',
      'ORDER FOR <customer phone>',
      'CODE: <order code>',
      'QTY: <number>',
      'SIZE: <size if any>',
      'COLOR: <color if any>',
      'NOTE: <customer request>',
      '',
      'Example:',
      'ORDER FOR +26876123456',
      'CODE: RC-1DB428A8',
      'QTY: 2',
      'SIZE: M',
      'COLOR: Black',
      '',
      '2. Customer uses RunnerBot',
      'Ask customer to send:',
      'ORDER <order code>',
      'or use the order link in the repost.',
      '',
      '3. Customer uses app/webapp',
      'Orders will appear automatically in WhatsApp Orders and Shopping List.',
    ].join('\n');
  }

  private async runnerBotFollowUp(
    runnerId: string,
    input: string,
    followUpStep: string | undefined,
    context: Record<string, unknown>,
  ) {
    const text = String(input || '').trim();
    const inviteLinks = this.extractInviteLinks(text);
    const menuCommand = this.menuNumberCommand(text, followUpStep, context);
    if (menuCommand) {
      return this.runnerBotCommand(runnerId, menuCommand, text, {
        context,
      });
    }

    const pendingSubscription =
      this.pendingRunnerSubscriptionFromContext(context);
    if (pendingSubscription) {
      return this.handlePendingRunnerSubscriptionStep(
        runnerId,
        text,
        pendingSubscription,
      );
    }

    const pendingGroup = this.pendingRepostingGroupFromContext(context);
    if (pendingGroup) {
      return this.handlePendingRepostingGroupConfirmation(
        runnerId,
        text,
        inviteLinks,
        pendingGroup,
      );
    }

    if (followUpStep === 'SHOPS') {
      return this.handleShopSelectionReply(runnerId, text, context);
    }

    const savedGroupSelection = this.parseSavedRepostingGroupSelection(text);
    if (savedGroupSelection) {
      return this.retrySavedRepostingGroupFromBot(
        runnerId,
        savedGroupSelection,
      );
    }

    if (followUpStep === 'SUBMIT_SHOP_LINKS' && inviteLinks.length > 0) {
      const result = await this.submitShopLinks(runnerId, inviteLinks, {
        rawText: text,
      });
      return {
        command: 'SUBMIT_SHOP_LINKS',
        message: [
          result.message,
          result.bridgeJoinQueued
            ? 'Bot joining was also queued for the submitted supplier/shop group.'
            : '',
          '',
          'Next:',
          'Reply SHOPS to choose available shop groups.',
          'Reply GROUPS to connect a posting group.',
          'Reply STATUS to see what is still needed.',
          this.supportCtaLine(),
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }

    if (followUpStep === 'CONNECT_REPOSTING_GROUP' && inviteLinks.length > 0) {
      return this.repostingGroupPurposePrompt(runnerId, text, inviteLinks[0]);
    }

    if (inviteLinks.length > 0) {
      const looksLikeShop = /shop|supplier|source/i.test(text);
      if (looksLikeShop) {
        const result = await this.submitShopLinks(runnerId, inviteLinks, {
          rawText: text,
        });
        return {
          command: 'SUBMIT_SHOP_LINKS',
          message: [
            result.message,
            result.bridgeJoinQueued
              ? 'Bot joining was also queued for the submitted supplier/shop group.'
              : '',
            'Reply SHOPS to choose available shop groups after the submitted shop is captured.',
            'You can add a posting group with GROUPS when you are ready.',
            this.supportCtaLine(),
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
      return this.repostingGroupPurposePrompt(runnerId, text, inviteLinks[0]);
    }

    if (this.isGuidedRunnerStep(followUpStep)) {
      return this.unexpectedRunnerFollowUpResponse(followUpStep, context);
    }

    return this.runnerGreetingResponse(runnerId, followUpStep);
  }

  private menuNumberCommand(
    input: string,
    followUpStep: string | undefined,
    context: Record<string, unknown>,
  ): RepostCommand | null {
    if (followUpStep !== 'MENU') return null;
    const text = String(input || '').trim();
    const map: Record<string, RepostCommand> = {
      '1': 'WALKTHROUGH',
      '2': 'STATUS',
      '3': 'SHOPS',
      '4': 'GROUPS',
      '5': 'STATUS',
      '6': 'STATS',
      '7': 'SET_AGE',
      '8': 'BILLING',
      '9': 'PLANS',
      '10': 'PAY',
      '11': 'ORDERS',
      '12': 'SUPPORT',
    };
    return map[text] || null;
  }

  private pendingRepostingGroupFromContext(context: Record<string, unknown>) {
    const pending = context.pendingRepostingGroup;
    if (!pending || typeof pending !== 'object') return null;
    const item = pending as {
      inviteLink?: unknown;
      groupName?: unknown;
      isTestGroup?: unknown;
    };
    const inviteLink = this.clean(
      typeof item.inviteLink === 'string' ? item.inviteLink : '',
    );
    if (!inviteLink || !this.isInviteLink(inviteLink)) return null;
    const groupName = this.clean(
      typeof item.groupName === 'string' ? item.groupName : '',
    );
    return {
      inviteLink,
      ...(groupName ? { groupName } : {}),
      isTestGroup:
        typeof item.isTestGroup === 'boolean' ? item.isTestGroup : undefined,
    };
  }

  private async repostingGroupPurposePrompt(
    runnerId: string,
    text: string,
    inviteLink: string,
  ) {
    const groupName = this.groupNameFromBotText(text, inviteLink);
    const pending = {
      inviteLink,
      groupName,
      isTestGroup: false,
    };
    const confirmationLine =
      'Reply YES to save this customer advertising posting group, or CANCEL to send a different group link.';

    return {
      command: 'CONNECT_REPOSTING_GROUP',
      contextPatch: {
        unexpectedReplyCount: 0,
        pendingRepostingGroup: pending,
      },
      message: [
        'Group link received.',
        '',
        confirmationLine,
        this.supportCtaLine(),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private async handlePendingRepostingGroupConfirmation(
    runnerId: string,
    text: string,
    inviteLinks: string[],
    pending: {
      inviteLink: string;
      groupName?: string;
      isTestGroup?: boolean;
    },
  ) {
    if (inviteLinks.length > 0) {
      return this.repostingGroupPurposePrompt(runnerId, text, inviteLinks[0]);
    }

    if (/^(cancel|stop|change|replace|no)$/i.test(text)) {
      return {
        command: 'CONNECT_REPOSTING_GROUP',
        contextPatch: {
          unexpectedReplyCount: 0,
          pendingRepostingGroup: null,
        },
        message: [
          'No problem. I have not saved that group.',
          '',
          'Send a WhatsApp group invite link when you are ready.',
          'Example: https://chat.whatsapp.com/...',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }

    if (!/^(yes|y|confirm|save|ok|okay)$/i.test(text)) {
      return {
        command: 'CONNECT_REPOSTING_GROUP',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          'Ready to save this as a customer advertising posting group.',
          '',
          'Reply YES to confirm and save it, or CANCEL to stop.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }

    const result = await this.submitRepostingGroup(runnerId, {
      inviteLink: pending.inviteLink,
      groupName: pending.groupName,
      isTestGroup: pending.isTestGroup,
    });
    return {
      command: 'GROUPS',
      contextPatch: {
        unexpectedReplyCount: 0,
        pendingRepostingGroup: null,
      },
      message: [
        result.message,
        '',
        'Next:',
        '1. Keep the invite link active while the bot joins.',
        '2. Wait for confirmation, or reply STATUS to check readiness.',
        '3. Reply START after STATUS shows setup is ready.',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private parseSavedRepostingGroupSelection(value: string) {
    const text = String(value || '').trim();
    const match = text.match(
      /^(?:retry|use|select)\s+(?:(test|live)\s+)?(\d+)$/i,
    );
    if (!match) return null;
    return {
      type: match[1] ? match[1].toUpperCase() : null,
      number: Number(match[2]),
    };
  }

  private runnerGroupReadinessLabel(group: any) {
    if (group.status === 'READY_FOR_REPOSTING') return 'Ready';
    if (
      group.status === 'GROUP_LINK_RECEIVED' ||
      group.status === 'JOIN_ATTEMPT_STARTED' ||
      group.botJoinStatus === 'GROUP_LINK_RECEIVED' ||
      group.botJoinStatus === 'JOIN_ATTEMPT_STARTED' ||
      group.botAdminStatus === 'ADMIN_STATUS_PENDING'
    ) {
      return 'Checking';
    }
    return 'Needs attention';
  }

  private async retrySavedRepostingGroupFromBot(
    runnerId: string,
    selection: { type: string | null; number: number },
  ) {
    const status = await this.getRunnerStatus(runnerId);
    const candidates = status.repostingGroups;
    const target = candidates[selection.number - 1] as any;

    if (!target) {
      return {
        command: 'GROUPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          'I could not find that saved reposting group number.',
          '',
          'Reply GROUPS to refresh the saved group list.',
          'Then reply RETRY 1 for the saved group you want the bot to try again.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }

    if (target.status === 'READY_FOR_REPOSTING') {
      return {
        command: 'GROUPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          `${target.groupName} is already ready for reposting.`,
          '',
          target.isTestGroup
            ? 'Next: reply STATUS to confirm setup, then START to begin reposting.'
            : 'Reply STATUS to confirm setup, then START or RESUME when you want reposting to run.',
        ].join('\n'),
      };
    }

    if (!target.inviteLink) {
      return {
        command: 'GROUPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          `${target.groupName} is saved, but it does not have an invite link to retry automatically.`,
          '',
          'Reply SUPPORT so an admin can check this group, or send a fresh invite link if this saved group cannot be recovered.',
          this.supportLinkLine(),
        ].join('\n'),
      };
    }

    const queued = await this.queueRunnerRepostingGroupJoin({
      groupId: target.id,
      inviteLink: target.inviteLink,
      bridgeAccountId:
        target.bridgeAccountId || status.runner.bridgeAccountId || null,
    });

    return {
      command: 'GROUPS',
      contextPatch: { unexpectedReplyCount: 0 },
      message: queued
        ? [
            `${target.groupName} has been selected and queued for the bot to join again.`,
            '',
            'Next:',
            '1. Keep the saved WhatsApp invite link active.',
            '2. Make sure the bot number can join and post in that group.',
            '3. Reply STATUS to check when it becomes ready.',
            this.supportCtaLine(),
          ].join('\n')
        : [
            `${target.groupName} is saved, but the bot could not join right now because the connection is not available.`,
            '',
            'Next: reply STATUS later to check again, or SUPPORT if it remains stuck.',
            this.supportLinkLine(),
          ].join('\n'),
    };
  }

  private async runnerSetupGuideResponse(runnerId: string) {
    const status = await this.getRunnerStatus(runnerId);
    return {
      command: 'SETUP',
      message: [
        'Runner Commerce setup guide',
        '',
        `1. Access: ${status.access.label}`,
        `2. Shop groups: ${status.shopLimit.selected}/${status.shopLimit.max} selected`,
        status.testWindow.endsAt
          ? `   Trial shop access ends: ${new Date(status.testWindow.endsAt).toLocaleDateString()}`
          : '',
        `3. Posting groups: ${status.groupLimit.selected} ready, ${status.groupLimit.saved.selected} saved`,
        `4. Reposting: ${status.repostingStatus}`,
        `5. Active shop groups: ${status.repostingControl.enabledLiveShopCount || status.repostingControl.enabledTestShopCount}/${status.repostingControl.liveShopCount || status.repostingControl.testShopCount}`,
        '',
        status.readiness.canStart
          ? 'You are ready for reposting. Reply START to post your selected shops.'
          : `Still needed: ${status.readiness.blockers.join('; ')}`,
        '',
        'Bot actions:',
        'SHOPS - choose or remove shop groups',
        'SHOP LINKS - submit missing supplier/shop group links',
        'GROUPS - connect or review your posting groups',
        'STATUS - see what is still needed',
        'START - begin reposting once ready',
        'PAUSE - pause reposting',
        'RESUME - continue reposting after pause',
      ].join('\n'),
    };
  }

  private async runnerShopsGuideResponse(
    runnerId: string,
    input = '',
    pageOverride?: number,
  ) {
    const explicitPage = pageOverride || this.parsePageNumber(input);
    const all = /\ball\b/i.test(input) || !explicitPage;
    const requestedPage = explicitPage || 1;
    const limit = all ? PHASE1_SHOP_ALL_LIMIT : PHASE1_SHOP_PAGE_SIZE;
    const offset = all ? 0 : (requestedPage - 1) * limit;
    const [status, result] = await Promise.all([
      this.getRunnerStatus(runnerId),
      this.discoverShops({ limit, offset }),
    ]);
    const selected = status.selectedShops || [];
    const shops = result.data || [];
    const total = result.limits.total || shops.length;
    const nextPageAfterAll =
      Math.floor(PHASE1_SHOP_ALL_LIMIT / PHASE1_SHOP_PAGE_SIZE) + 1;

    return {
      command: 'SHOPS',
      contextPatch: {
        shopOptions: shops.map((shop: any) => ({
          id: shop.id,
          name: shop.name,
        })),
        selectedShopOptions: selected.map((shop: any) => ({
          shopId: shop.shopId,
          name: shop.shopName,
        })),
        shopSelectionScope: 'test',
        shopPage: requestedPage,
      },
      message: [
        'Available shop groups',
        '',
        selected.length
          ? `Selected (${status.shopLimit.selected}/${status.shopLimit.max}):\n${selected
              .map(
                (shop: any, index: number) =>
                  `${index + 1}. ${shop.shopName} - ${shop.status}`,
              )
              .join('\n')}`
          : `No shops selected yet. You may select up to ${status.shopLimit.max} shop groups.`,
        '',
        all
          ? `Available shops: showing ${shops.length} of ${total}`
          : `Available shops page ${requestedPage}: showing ${offset + 1}-${offset + shops.length} of ${total}`,
        shops.length
          ? shops
              .map(
                (shop: any, index: number) =>
                  `${index + 1}. ${shop.name}${shop.location ? ` - ${shop.location}` : ''}`,
              )
              .join('\n')
          : 'No available shops found.',
        '',
        'Reply SELECT 1,2,3 to add shop groups.',
        'Reply REMOVE 1 to remove a selected shop.',
        result.limits.hasMore && !all
          ? `Reply SHOPS ${requestedPage + 1} to see more shops.`
          : '',
        total > shops.length && all
          ? `Reply SHOPS ${nextPageAfterAll} to continue after the first ${PHASE1_SHOP_ALL_LIMIT} shops.`
          : '',
        'Reply GROUPS when you are ready to connect posting groups.',
        'Send another group invite link later when you want to add another customer advertising group.',
        'Reply SHOP LINKS to submit missing supplier/shop invite links.',
        this.supportCtaLine(),
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private async runnerLiveShopsGuideResponse(
    runnerId: string,
    input = '',
    pageOverride?: number,
  ) {
    const all = /\ball\b/i.test(input);
    const requestedPage = pageOverride || this.parsePageNumber(input) || 1;
    const limit = all ? PHASE1_SHOP_ALL_LIMIT : PHASE1_SHOP_PAGE_SIZE;
    const offset = all ? 0 : (requestedPage - 1) * limit;
    const [status, result] = await Promise.all([
      this.getRunnerStatus(runnerId),
      this.discoverShops({ limit, offset }),
    ]);
    const liveSelected = status.repostingGroups
      ? await this.prisma.runnerShopLink.findMany({
          where: {
            runnerId,
            selectedForLive: true,
            status: { in: ACTIVE_SHOP_STATUSES },
          },
          include: { shop: { select: { name: true } } },
          orderBy: { joinedAt: 'asc' },
        })
      : [];
    const shops = result.data || [];
    const total = result.limits.total || shops.length;

    return {
      command: 'SHOPS',
      contextPatch: {
        shopOptions: shops.map((shop: any) => ({
          id: shop.id,
          name: shop.name,
        })),
        selectedShopOptions: liveSelected.map((link: any) => ({
          shopId: link.shopId,
          name: link.shop?.name,
        })),
        shopSelectionScope: 'live',
        liveShopPage: requestedPage,
      },
      message: [
        'Shop group selection',
        '',
        `Selected shop groups: ${status.liveShopLimit.selected}/${status.liveShopLimit.max}`,
        liveSelected.length
          ? liveSelected
              .map(
                (link: any, index: number) =>
                  `${index + 1}. ${link.shop?.name || link.shopId} - ${link.status}`,
              )
              .join('\n')
          : 'No shop groups selected yet.',
        '',
        all
          ? `Available shops: showing ${shops.length} of ${total}`
          : `Available shops page ${requestedPage}: showing ${offset + 1}-${offset + shops.length} of ${total}`,
        shops.length
          ? shops
              .map(
                (shop: any, index: number) =>
                  `${index + 1}. ${shop.name}${shop.location ? ` - ${shop.location}` : ''}`,
              )
              .join('\n')
          : 'No available shops found on this page.',
        '',
        'Reply SELECT 1,2,3 to add shop groups from this list.',
        'Reply REMOVE 1 to remove a selected shop group.',
        result.limits.hasMore && !all
          ? `Reply SHOPS ${requestedPage + 1} to see more shops.`
          : '',
        total > shops.length
          ? `Reply SHOPS ALL to show up to ${PHASE1_SHOP_ALL_LIMIT} shops in one message.`
          : '',
        'Reply SHOP LINKS to submit missing supplier/shop links. If a supplier gives a QR code, decode it to the WhatsApp invite link and send that link.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private async handleShopSelectionReply(
    runnerId: string,
    input: string,
    context: Record<string, unknown>,
  ) {
    if (/^(more|next)\b/i.test(input)) {
      if (context.shopSelectionScope === 'live') {
        const currentPage =
          typeof context.liveShopPage === 'number'
            ? Number(context.liveShopPage)
            : 1;
        return this.runnerLiveShopsGuideResponse(
          runnerId,
          'LIVE SHOPS',
          currentPage + 1,
        );
      }
      const currentPage =
        typeof context.shopPage === 'number' ? Number(context.shopPage) : 1;
      return this.runnerShopsGuideResponse(runnerId, '', currentPage + 1);
    }

    const scope =
      this.isLiveShopIntent(input) || context.shopSelectionScope === 'live'
        ? 'live'
        : 'test';
    const isRemove = /^remove\b|^delete\b/i.test(input);
    const numbers = this.parseNumberList(input);
    if (numbers.length === 0) {
      return this.unexpectedRunnerFollowUpResponse('SHOPS', context);
    }

    if (isRemove) {
      const selected = Array.isArray(context.selectedShopOptions)
        ? (context.selectedShopOptions as Array<{
            shopId?: string;
            name?: string;
          }>)
        : [];
      const target = selected[numbers[0] - 1];
      if (!target?.shopId) {
        return {
          command: 'SHOPS',
          contextPatch: { unexpectedReplyCount: 0 },
          message: [
            scope === 'live'
              ? 'That selected shop number was not found. Reply SHOPS to refresh the list, then REMOVE 1 to remove a selected shop.'
              : 'That selected shop number was not found. Reply SHOPS to refresh the list, then REMOVE 1 to remove a selected shop.',
            this.supportCtaLine(),
          ].join('\n'),
        };
      }
      if (scope === 'live') {
        await this.removeLiveShop(runnerId, target.shopId);
        return this.runnerLiveShopsGuideResponse(runnerId);
      }
      await this.removeShop(runnerId, target.shopId);
      return this.runnerShopsGuideResponse(runnerId);
    }

    const options = Array.isArray(context.shopOptions)
      ? (context.shopOptions as Array<{ id?: string; name?: string }>)
      : [];
    const selected = Array.isArray(context.selectedShopOptions)
      ? (context.selectedShopOptions as Array<{
          shopId?: string;
          name?: string;
        }>)
      : [];
    const maxSelectable =
      Number(context.shopLimitMax) || DEFAULT_RUNNER_SOURCE_SHOP_LIMIT;
    const invalidNumbers = numbers.filter((number) => !options[number - 1]?.id);
    const shopIds = numbers
      .map((number) => options[number - 1]?.id)
      .filter(Boolean) as string[];
    if (shopIds.length === 0) {
      return {
        command: 'SHOPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          'Those shop numbers were not found. Reply SHOPS to refresh the available list, then SELECT 1,2,3 to add shops.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }
    if (invalidNumbers.length > 0) {
      return {
        command: 'SHOPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          `I could not find shop option ${invalidNumbers.join(', ')} in the current list.`,
          '',
          scope === 'live'
            ? `During Phase 1, select up to ${maxSelectable} shop groups.`
            : `During Phase 1, select up to ${maxSelectable} shop groups total.`,
          scope === 'live'
            ? 'Please reply with numbers shown in the latest shop list only, for example SELECT 1,2,3.'
            : 'Please reply with numbers shown in the latest shop list only, for example SELECT 1,2,3,4,5.',
          scope === 'live'
            ? 'Reply SHOPS to refresh the list.'
            : 'Reply SHOPS to refresh the list.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }

    const selectedIds = new Set(
      selected.map((item) => item.shopId).filter(Boolean) as string[],
    );
    const newShopIds = shopIds.filter((shopId) => !selectedIds.has(shopId));
    if (selectedIds.size + newShopIds.length > maxSelectable) {
      const remaining = Math.max(0, maxSelectable - selectedIds.size);
      return {
        command: 'SHOPS',
        contextPatch: { unexpectedReplyCount: 0 },
        message: [
          scope === 'live'
            ? `That selection has too many shops. During Phase 1, you can select up to ${maxSelectable} shop groups total.`
            : `That selection has too many shops. During Phase 1, you can select up to ${maxSelectable} shop groups total.`,
          selectedIds.size
            ? `You already have ${selectedIds.size} selected, so you can add ${remaining} more.`
            : `Please choose ${maxSelectable} or fewer from the list.`,
          '',
          remaining > 0
            ? scope === 'live'
              ? `Reply SELECT with ${remaining} or fewer number${remaining === 1 ? '' : 's'}, for example SELECT 1,2,3.`
              : `Reply SELECT with ${remaining} or fewer number${remaining === 1 ? '' : 's'}, for example SELECT 1,2,3.`
            : scope === 'live'
              ? 'Reply REMOVE 1 to remove a selected shop before adding another one.'
              : 'Reply REMOVE 1 to remove a selected shop before adding another one.',
          scope === 'live'
            ? 'Reply SHOPS to refresh the list.'
            : 'Reply SHOPS to refresh the list.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    }

    if (scope === 'live') {
      await this.selectLiveShops(runnerId, shopIds);
      return this.runnerLiveShopsGuideResponse(runnerId);
    }
    await this.selectShops(runnerId, shopIds);
    return this.runnerShopsGuideResponse(runnerId);
  }

  private async runnerGroupsGuideResponse(runnerId: string) {
    const status = await this.getRunnerStatus(runnerId);
    const savedPostingGroups = status.repostingGroups;
    const groupStep =
      savedPostingGroups.length > 0
        ? [
            'Posting groups:',
            `You have ${savedPostingGroups.length} saved posting group${savedPostingGroups.length === 1 ? '' : 's'}.`,
            `You can save up to ${status.groupLimit.max} customer advertising posting group${status.groupLimit.max === 1 ? '' : 's'}.`,
            'Reply RETRY 1 to let the bot try joining a saved group again.',
          ]
        : [
            'Posting groups:',
            'Send one WhatsApp group invite link at a time.',
            'Example: https://chat.whatsapp.com/...',
          ];
    return {
      command: 'CONNECT_REPOSTING_GROUP',
      message: [
        'Posting groups',
        '',
        savedPostingGroups.length
          ? savedPostingGroups
              .map(
                (group: any, index: number) =>
                  `${index + 1}. ${group.groupName}\n   ${this.runnerGroupReadinessLabel(group)}`,
              )
              .join('\n')
          : 'No posting groups connected yet.',
        '',
        `Posting groups: ${status.groupLimit.selected} ready, ${status.groupLimit.saved.selected} saved`,
        '',
        ...groupStep,
        '',
        'Important:',
        'You do not need to type the group name. The system saves the WhatsApp group name after the bot joins.',
        'Keep the invite link active while the bot joins.',
        'The bot must be able to post in at least one group before reposting can start.',
        'Please wait for confirmation that the bot joined and the group is ready.',
        'You control posting with START, PAUSE, RESUME, STOP, and STATUS.',
        '',
        'After sending a group link, wait for confirmation or reply STATUS to check readiness.',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }
  private async confirmLatestBotAdmin(runnerId: string) {
    const status = await this.getRunnerStatus(runnerId);
    const target = [...status.repostingGroups]
      .reverse()
      .find((group: any) => !group.runnerConfirmedAdminAt);
    if (!target) {
      return {
        command: 'ADMIN_DONE',
        message:
          'No reposting group is waiting for your admin confirmation. Reply GROUPS to review your groups.',
      };
    }

    const result = await this.confirmBotAdmin(runnerId, target.id);
    return {
      command: 'ADMIN_DONE',
      message: [
        result.message,
        '',
        'Next: wait for automatic bot confirmation, or ask support to verify manually if the group stays stuck.',
        this.supportLinkLine(),
        'Reply STATUS to check whether START is now available.',
      ].join('\n'),
    };
  }

  private adminBotHelpResponse() {
    return {
      command: 'ADMIN_HELP',
      message: this.adminBotHelpText(),
    };
  }

  private adminStatusBotResponse(user: any) {
    const role = this.clean(user?.role?.name) || 'ADMIN';
    return {
      command: 'ADMIN_STATUS',
      message: [
        'Runner Commerce Admin Bot',
        '',
        'This number is registered as ' + role + '.',
        '',
        'Valid admin options:',
        'ADMIN RUNNERS - list Phase 1 runners',
        'ADMIN RUNNER <id/#/phone/name> - inspect one runner',
        'ADMIN WALKTHROUGH - admin operations guide',
        'ADMIN APPROVALS - pending payments, subscriptions, shop links, and groups',
        'ADMIN DEV STATUS - development/operations controls',
        'HELP - show all admin commands',
        '',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private adminDevBotHelpResponse() {
    return {
      command: 'ADMIN_DEV_HELP',
      message: this.adminDevBotHelpText(),
    };
  }

  private adminBotHelpText() {
    return [
      'Runner Commerce Admin Bot',
      'Admin access is limited to registered ACTIVE ADMIN/SUPERUSER WhatsApp numbers.',
      '',
      'ADMIN RUNNERS - list Phase 1 runners',
      'ADMIN APPROVALS - list pending approval queue',
      'ADMIN APPROVE PAYMENT <#|id> - verify a manual payment',
      'ADMIN REJECT PAYMENT <#|id> [reason] - reject a manual payment',
      'ADMIN APPROVE SUBSCRIPTION <#|id> - activate a pending subscription',
      'ADMIN REJECT SUBSCRIPTION <#|id> [reason] - reject a pending subscription',
      'ADMIN APPROVE SHOP <#|id> [BRIDGE #|id] - approve a submitted shop link',
      'ADMIN REJECT SHOP <#|id> [reason] - reject a submitted shop link',
      'ADMIN WALKTHROUGH - practical WhatsApp-only verification and operations guide',
      'ADMIN RUNNER <id/#/phone/name> - inspect one runner',
      'ADMIN USE RUNNER <id/#/phone/name> - operate as that runner until EXIT',
      'ADMIN VERIFY <groupId/#> - manual support fallback: mark reposting group ready and auto-import as runner advertising',
      'ADMIN VERIFY <groupId/#> NOAUTO - manual support fallback without auto-import',
      'ADMIN START <id/#> - start runner reposting',
      'ADMIN DEV START <id/#> - development override: enable global and runner WhatsApp reposting',
      'ADMIN START <id/#> DEV every 30 max 10 - same override with frequency/max',
      'ADMIN DEV STATUS - show development/operations controls',
      'ADMIN DEV REPOSTING ON/OFF - global WhatsApp reposting',
      'ADMIN DEV MAINTENANCE ON/OFF - prepare/leave code update mode',
      'ADMIN DEV PHASE2 ON/OFF - orders, carts, shopping and delivery workflow',
      'ADMIN DEV ORDERS ON/OFF - incoming WhatsApp order intake',
      'ADMIN DEV AUTOAPPROVAL ON/OFF - runner-shop join auto approval',
      'ADMIN DEV SHUTDOWN CONFIRM - safe local shutdown',
      'ADMIN PAUSE <id/#> - pause runner reposting',
      'ADMIN RESUME <id/#> - resume runner reposting',
      'ADMIN STOP <id/#> - stop runner reposting',
      '',
      'Use # after ADMIN RUNNERS or ADMIN RUNNER, for example ADMIN RUNNER 1 or ADMIN VERIFY 1.',
    ].join('\n');
  }

  private adminWalkthroughBotResponse() {
    return {
      command: 'ADMIN_WALKTHROUGH',
      message: [
        'WhatsApp-only admin walkthrough',
        'Admin access is limited to registered ACTIVE ADMIN/SUPERUSER WhatsApp numbers.',
        '',
        '1. ADMIN RUNNERS - find active runners.',
        '2. ADMIN RUNNER 1 - inspect the runner, shops, groups, and blockers.',
        '3. Ask the runner to send GROUPS, then submit one posting group invite link: https://chat.whatsapp.com/...',
        '4. Posting groups can be added with GROUPS and a fresh WhatsApp invite link.',
        '5. The bridge queues bot joining automatically and marks each group ready when posting/admin access is confirmed.',
        '6. ADMIN RUNNER 1 - confirm the latest setup state and blockers.',
        '7. Use ADMIN VERIFY 1 only as a manual support fallback when automatic verification is stuck and posting access is trusted.',
        '8. Runner sends STATUS, then START when blockers are clear.',
        '',
        'Operations:',
        'ADMIN APPROVALS shows pending payments, subscriptions, shop links, and groups.',
        'ADMIN START 1, ADMIN PAUSE 1, ADMIN RESUME 1, ADMIN STOP 1.',
        'ADMIN DEV STATUS shows global switches and counts.',
        'ADMIN DEV REPOSTING ON/OFF controls automatic WhatsApp reposting.',
        'ADMIN DEV MAINTENANCE ON/OFF prepares or leaves update mode.',
        '',
        'Rule: trust the seamless path first. Manual verification is only for stuck cases where the bot/group access has been checked.',
      ].join('\n'),
    };
  }

  private adminDevBotHelpText() {
    return [
      'Development controls via admin bot',
      '',
      'ADMIN DEV STATUS - show current settings and counts',
      'ADMIN DEV REPOSTING ON - resume global WhatsApp reposting',
      'ADMIN DEV REPOSTING OFF - pause global WhatsApp reposting',
      'ADMIN DEV MAINTENANCE ON - pause reposting and block bridge watchdog restarts',
      'ADMIN DEV MAINTENANCE OFF - leave maintenance; reposting stays paused until resumed',
      'ADMIN DEV PHASE2 ON/OFF - toggle carts, orders, shopping and delivery workflow',
      'ADMIN DEV ORDERS ON/OFF - toggle incoming WhatsApp order intake; Phase 2 must be on',
      'ADMIN DEV AUTOAPPROVAL ON/OFF - toggle runner-shop join auto approval',
      'ADMIN DEV START <runner #/id> every 30 max 10 - enable development reposting for a runner',
      'ADMIN DEV SHUTDOWN CONFIRM - safe local shutdown after pausing reposting',
      '',
      'Use ADMIN HELP for runner verification, reposting, and operations commands.',
    ].join('\n');
  }

  private async adminDevStatusResponse() {
    const [
      maintenanceMode,
      runnerListings,
      products,
      orders,
      shops,
      whatsappOrderRequests,
      groupMappings,
      discoveredGroups,
      pendingRunnerShopRequests,
      autoApproval,
      phase2Enabled,
      whatsappOrderTrackingEnabled,
      whatsappRepostingEnabled,
    ] = await Promise.all([
      this.isMaintenanceMode(),
      this.prisma.runnerListing.count(),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.shop.count(),
      this.prisma.whatsAppOrderRequest.count(),
      this.prisma.whatsAppGroupMapping.count(),
      this.prisma.whatsAppDiscoveredGroup.count(),
      this.prisma.runnerShopLink.count({ where: { status: 'PENDING' } }),
      this.getAppSettingBoolean(RUNNER_SHOP_AUTO_APPROVAL_KEY, false),
      this.getAppSettingBoolean(PHASE_2_ENABLED_KEY, false),
      this.getAppSettingBoolean(WHATSAPP_ORDER_TRACKING_KEY, false),
      this.getAppSettingBoolean(WHATSAPP_REPOSTING_ENABLED_KEY, false),
    ]);

    return {
      command: 'ADMIN_DEV_STATUS',
      message: [
        'Development controls',
        '',
        `Maintenance: ${maintenanceMode ? 'ON' : 'OFF'}`,
        `Automatic WhatsApp reposting: ${whatsappRepostingEnabled ? 'ON' : 'OFF'}`,
        `Phase 2: ${phase2Enabled ? 'ON' : 'OFF'}`,
        `WhatsApp order intake: ${
          phase2Enabled && whatsappOrderTrackingEnabled ? 'ON' : 'OFF'
        }`,
        `Runner-shop auto approval: ${autoApproval ? 'ON' : 'OFF'}`,
        '',
        'Counts:',
        `Listings: ${runnerListings}`,
        `Products: ${products}`,
        `Orders: ${orders}`,
        `Shops: ${shops}`,
        `WhatsApp order requests: ${whatsappOrderRequests}`,
        `Group mappings: ${groupMappings}`,
        `Discovered groups: ${discoveredGroups}`,
        `Pending runner-shop requests: ${pendingRunnerShopRequests}`,
        '',
        'Commands: ADMIN DEV REPOSTING ON/OFF, MAINTENANCE ON/OFF, PHASE2 ON/OFF, ORDERS ON/OFF, AUTOAPPROVAL ON/OFF.',
      ].join('\n'),
    };
  }

  private async adminDevToggleResponse(
    command: string,
    key: string,
    enabled: boolean | null,
    copy: { label: string; enabledMessage: string; disabledMessage: string },
  ) {
    if (enabled === null) {
      const current = await this.getAppSettingBoolean(key, false);
      return {
        command,
        message: [
          `${copy.label}: ${current ? 'ON' : 'OFF'}`,
          `Reply ${this.adminDevCommandExampleForKey(key)} ON or ${this.adminDevCommandExampleForKey(key)} OFF.`,
        ].join('\n'),
      };
    }

    await this.setAppSettingBoolean(key, enabled);
    return {
      command,
      message: [
        `${copy.label}: ${enabled ? 'ON' : 'OFF'}`,
        enabled ? copy.enabledMessage : copy.disabledMessage,
      ].join('\n'),
    };
  }

  private adminDevCommandExampleForKey(key: string) {
    if (key === WHATSAPP_REPOSTING_ENABLED_KEY) return 'ADMIN DEV REPOSTING';
    if (key === RUNNER_SHOP_AUTO_APPROVAL_KEY) return 'ADMIN DEV AUTOAPPROVAL';
    return 'ADMIN DEV';
  }

  private async adminDevMaintenanceResponse(enabled: boolean | null) {
    if (enabled === null) {
      const current = await this.isMaintenanceMode();
      return {
        command: 'ADMIN_DEV_MAINTENANCE',
        message: [
          `Maintenance mode: ${current ? 'ON' : 'OFF'}`,
          'Reply ADMIN DEV MAINTENANCE ON to prepare for code update, or ADMIN DEV MAINTENANCE OFF to leave maintenance.',
        ].join('\n'),
      };
    }

    if (enabled) {
      await this.setAppSettingBoolean(WHATSAPP_REPOSTING_ENABLED_KEY, false);
      await writeFile(MAINTENANCE_FLAG, new Date().toISOString(), 'utf8');
    } else {
      await unlink(MAINTENANCE_FLAG).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }

    return {
      command: 'ADMIN_DEV_MAINTENANCE',
      message: enabled
        ? 'Maintenance mode enabled. Reposting is paused and bridge watchdog restarts are blocked.'
        : 'Maintenance mode cleared. Reposting remains paused until you explicitly send ADMIN DEV REPOSTING ON.',
    };
  }

  private async adminDevPhase2Response(enabled: boolean | null) {
    if (enabled === null) {
      const current = await this.getAppSettingBoolean(
        PHASE_2_ENABLED_KEY,
        false,
      );
      return {
        command: 'ADMIN_DEV_PHASE2',
        message: [
          `Phase 2: ${current ? 'ON' : 'OFF'}`,
          'Reply ADMIN DEV PHASE2 ON or ADMIN DEV PHASE2 OFF.',
        ].join('\n'),
      };
    }

    await this.setAppSettingBoolean(PHASE_2_ENABLED_KEY, enabled);
    if (!enabled) {
      await this.setAppSettingBoolean(WHATSAPP_ORDER_TRACKING_KEY, false);
    }

    return {
      command: 'ADMIN_DEV_PHASE2',
      message: enabled
        ? 'Phase 2 order management is enabled. WhatsApp intake remains separately controlled.'
        : 'Phase 2 is disabled. Phase 1 capture, listings, and reposting remain active. WhatsApp order intake was paused.',
    };
  }

  private async adminDevOrderIntakeResponse(enabled: boolean | null) {
    const phase2Enabled = await this.getAppSettingBoolean(
      PHASE_2_ENABLED_KEY,
      false,
    );
    if (enabled === null) {
      const current = await this.getAppSettingBoolean(
        WHATSAPP_ORDER_TRACKING_KEY,
        false,
      );
      return {
        command: 'ADMIN_DEV_ORDER_INTAKE',
        message: [
          `WhatsApp order intake: ${phase2Enabled && current ? 'ON' : 'OFF'}`,
          phase2Enabled
            ? 'Reply ADMIN DEV ORDERS ON or ADMIN DEV ORDERS OFF.'
            : 'Phase 2 is OFF. Send ADMIN DEV PHASE2 ON before enabling order intake.',
        ].join('\n'),
      };
    }

    if (enabled && !phase2Enabled) {
      return {
        command: 'ADMIN_DEV_ORDER_INTAKE',
        message:
          'Cannot enable WhatsApp order intake while Phase 2 is OFF. Send ADMIN DEV PHASE2 ON first.',
      };
    }

    await this.setAppSettingBoolean(WHATSAPP_ORDER_TRACKING_KEY, enabled);
    return {
      command: 'ADMIN_DEV_ORDER_INTAKE',
      message: enabled
        ? 'Incoming WhatsApp order intake is enabled.'
        : 'Incoming WhatsApp order intake is paused. Reposting remains separately controlled.',
    };
  }

  private async adminDevSafeShutdownResponse(input: string) {
    if (!/\bconfirm\b/i.test(input)) {
      return {
        command: 'ADMIN_DEV_SHUTDOWN',
        message: [
          'Safe shutdown will pause reposting, enter maintenance mode, then stop local app services and bridge workers.',
          '',
          'To continue, reply ADMIN DEV SHUTDOWN CONFIRM.',
        ].join('\n'),
      };
    }

    await this.adminDevMaintenanceResponse(true);
    const script = resolve(process.cwd(), '..', 'ops', 'stop-hybrid-local.ps1');
    const shutdownLog = resolve(process.cwd(), 'logs', 'safe-shutdown.log');
    const shutdownErrorLog = resolve(
      process.cwd(),
      'logs',
      'safe-shutdown.error.log',
    );
    const shutdownArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-RepostingAlreadyPaused',
      '-DelayBeforeAppStopSeconds',
      '2',
      '-StopBridges',
    ];

    const quotePowerShell = (value: string) =>
      `'${String(value).replace(/'/g, "''")}'`;
    const launcherCommand = [
      `$shutdownArgs = @(${shutdownArgs.map(quotePowerShell).join(',')})`,
      `Start-Process -FilePath 'powershell.exe' -ArgumentList $shutdownArgs -WorkingDirectory ${quotePowerShell(
        resolve(process.cwd(), '..'),
      )} -WindowStyle Hidden -RedirectStandardOutput ${quotePowerShell(
        shutdownLog,
      )} -RedirectStandardError ${quotePowerShell(shutdownErrorLog)}`,
    ].join('; ');
    const encodedLauncher = Buffer.from(launcherCommand, 'utf16le').toString(
      'base64',
    );

    await new Promise<void>((resolveLaunch, rejectLaunch) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', encodedLauncher],
        {
          cwd: resolve(process.cwd(), '..'),
          detached: false,
          stdio: 'ignore',
          windowsHide: true,
        },
      );

      child.once('spawn', () => resolveLaunch());
      child.once('error', (error) =>
        rejectLaunch(
          new BadRequestException(
            `Safe shutdown could not start: ${error.message}`,
          ),
        ),
      );
    });

    return {
      command: 'ADMIN_DEV_SHUTDOWN',
      message:
        'Safe shutdown started. Reposting is paused and local services will stop within a few seconds. Start again locally with .\\ops\\start-hybrid-local.ps1 -StartBridges.',
    };
  }

  private parseAdminDevBoolean(input: string) {
    const text = String(input || '').trim();
    if (/^(on|enable|enabled|start|resume|yes|true|1)\b/i.test(text)) {
      return true;
    }
    if (/^(off|disable|disabled|pause|stop|no|false|0)\b/i.test(text)) {
      return false;
    }
    return null;
  }

  private async getAppSettingBoolean(key: string, defaultValue = false) {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    if (!setting) return defaultValue;
    return setting.value === 'true';
  }

  private async setAppSettingBoolean(key: string, enabled: boolean) {
    await (this.prisma as any).appSetting.upsert({
      where: { key },
      update: { value: enabled ? 'true' : 'false' },
      create: { key, value: enabled ? 'true' : 'false' },
    });
  }

  private async isMaintenanceMode() {
    try {
      await stat(MAINTENANCE_FLAG);
      return true;
    } catch {
      return false;
    }
  }

  private async adminBotApprovalsResponse() {
    const now = new Date();
    const [payments, subscriptions, shopLinks, groups, bridges] =
      await Promise.all([
        this.prisma.manualPaymentRecord.findMany({
          where: { status: 'PENDING' },
          include: {
            invoice: {
              include: {
                runner: {
                  include: { user: { select: { name: true, phone: true } } },
                },
                subscription: { include: { plan: true } },
              },
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 10,
        }),
        this.prisma.subscription.findMany({
          where: { audience: 'RUNNER', status: 'PENDING' },
          include: {
            plan: true,
            runner: {
              include: { user: { select: { name: true, phone: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.runnerSubmittedShopLink.findMany({
          where: {
            status: { in: ['PENDING_REVIEW', 'JOINED_PENDING_REVIEW'] },
          },
          include: {
            runner: {
              include: { user: { select: { name: true, phone: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.runnerRepostingGroup.findMany({
          where: {
            status: {
              in: [
                'GROUP_LINK_RECEIVED',
                'JOIN_ATTEMPT_STARTED',
                'JOINED_GROUP',
                'ADMIN_STATUS_PENDING',
                'RUNNER_CONFIRMED_ADMIN',
                'ADMIN_VERIFIED',
                'BOT_NOT_ADMIN',
              ],
            },
          },
          include: {
            runner: {
              include: { user: { select: { name: true, phone: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.whatsAppBridgeAccount.findMany({
          where: {
            archivedAt: null,
            status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
          },
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        }),
      ]);

    const runnerLabel = (runner: any) =>
      runner?.user?.name ||
      runner?.name ||
      runner?.user?.phone ||
      runner?.phone ||
      'Runner';
    const lines = [
      'Admin approval queue',
      '',
      payments.length
        ? [
            'Payments:',
            ...payments.map(
              (payment: any, index: number) =>
                `${index + 1}. ${runnerLabel(payment.invoice?.runner)} - ${this.moneyText(payment.amount)} ${payment.method} - invoice ${payment.invoice?.invoiceNumber || 'N/A'} - ${payment.id}`,
            ),
          ].join('\n')
        : 'Payments: none pending',
      '',
      subscriptions.length
        ? [
            'Subscriptions:',
            ...subscriptions.map(
              (subscription: any, index: number) =>
                `${index + 1}. ${runnerLabel(subscription.runner)} - ${subscription.plan?.name || 'Runner plan'} - starts ${this.shortDate(subscription.currentPeriodStart || now)} - ${subscription.id}`,
            ),
          ].join('\n')
        : 'Subscriptions: none pending',
      '',
      shopLinks.length
        ? [
            'Shop links:',
            ...shopLinks.map(
              (link: any, index: number) =>
                `${index + 1}. ${runnerLabel(link.runner)} - ${link.status} - ${link.inviteLink} - ${link.id}`,
            ),
          ].join('\n')
        : 'Shop links: none pending',
      '',
      groups.length
        ? [
            'Groups:',
            ...groups.map(
              (group: any, index: number) =>
                `${index + 1}. ${runnerLabel(group.runner)} - ${group.groupName} - ${group.status} - ${group.id}`,
            ),
          ].join('\n')
        : 'Groups: none pending',
      '',
      bridges.length
        ? [
            'Bridge options for SHOP approvals:',
            ...bridges.map(
              (bridge: any, index: number) =>
                `${index + 1}. ${bridge.name || bridge.phone || bridge.id} - ${bridge.status} - ${bridge.id}`,
            ),
          ].join('\n')
        : 'Bridge options: none active',
      '',
      'Commands: ADMIN APPROVE PAYMENT 1, ADMIN REJECT PAYMENT 1 reason, ADMIN APPROVE SUBSCRIPTION 1, ADMIN APPROVE SHOP 1 BRIDGE 1, ADMIN VERIFY 1.',
    ];

    return {
      command: 'ADMIN_APPROVALS',
      contextPatch: {
        adminPaymentOptions: payments.map((payment: any) => ({
          id: payment.id,
        })),
        adminSubscriptionOptions: subscriptions.map((subscription: any) => ({
          id: subscription.id,
        })),
        adminShopLinkOptions: shopLinks.map((link: any) => ({ id: link.id })),
        adminGroupOptions: groups.map((group: any) => ({
          id: group.id,
          groupName: group.groupName,
        })),
        adminBridgeOptions: bridges.map((bridge: any) => ({
          id: bridge.id,
          name: bridge.name,
          phone: bridge.phone,
        })),
        unexpectedReplyCount: 0,
      },
      message: lines.join('\n'),
    };
  }

  private async adminBotApprovalAction(
    action: string,
    target: string,
    context: Record<string, unknown>,
    actor: { id: string; role: string },
  ) {
    const parsed = this.parseAdminApprovalTarget(target);
    if (!parsed) return null;
    const approved = action === 'APPROVE';
    try {
      if (parsed.type === 'PAYMENT') {
        if (!this.billingService) return this.billingUnavailableResponse();
        const paymentId = await this.resolveAdminApprovalOption(
          parsed.id,
          context.adminPaymentOptions,
          this.prisma.manualPaymentRecord,
        );
        if (!paymentId) return this.adminBotTargetMissingResponse('payment');
        const payment = await this.billingService.updateManualPayment(
          paymentId,
          {
            status: approved ? 'VERIFIED' : 'REJECTED',
            notes: parsed.notes,
          } as any,
          actor.id,
        );
        return {
          command: approved ? 'ADMIN_APPROVE_PAYMENT' : 'ADMIN_REJECT_PAYMENT',
          contextPatch: { unexpectedReplyCount: 0 },
          message: `${approved ? 'Verified' : 'Rejected'} payment ${payment.receiptNumber || payment.id}.`,
        };
      }
      if (parsed.type === 'SUBSCRIPTION') {
        if (!this.billingService) return this.billingUnavailableResponse();
        const subscriptionId = await this.resolveAdminApprovalOption(
          parsed.id,
          context.adminSubscriptionOptions,
          this.prisma.subscription,
        );
        if (!subscriptionId)
          return this.adminBotTargetMissingResponse('subscription');
        const subscription = await this.billingService.updateSubscriptionStatus(
          { userId: actor.id, role: actor.role },
          subscriptionId,
          { status: approved ? 'ACTIVE' : 'REJECTED', notes: parsed.notes },
        );
        return {
          command: approved
            ? 'ADMIN_APPROVE_SUBSCRIPTION'
            : 'ADMIN_REJECT_SUBSCRIPTION',
          contextPatch: { unexpectedReplyCount: 0 },
          message: `${approved ? 'Activated' : 'Rejected'} subscription ${subscription.plan?.name || subscription.id}.`,
        };
      }
      if (parsed.type === 'SHOP') {
        const shopId = await this.resolveAdminApprovalOption(
          parsed.id,
          context.adminShopLinkOptions,
          this.prisma.runnerSubmittedShopLink,
        );
        if (!shopId) return this.adminBotTargetMissingResponse('shop link');
        const link = await this.prisma.runnerSubmittedShopLink.findUnique({
          where: { id: shopId },
          include: { runner: { select: { bridgeAccountId: true } } },
        });
        const bridgeAccountId = approved
          ? await this.resolveShopApprovalBridge(
              link,
              parsed.bridgeTarget,
              context,
            )
          : undefined;
        if (approved && !bridgeAccountId) {
          return {
            command: 'ADMIN_APPROVE_SHOP',
            message:
              'Choose an active WhatsApp bridge for this shop link. Reply ADMIN APPROVALS, then ADMIN APPROVE SHOP <#> BRIDGE <#>.',
          };
        }
        const saved = await this.reviewSubmittedShopLink(shopId, actor.id, {
          status: approved ? 'APPROVED' : 'REJECTED',
          notes: parsed.notes,
          bridgeAccountId: bridgeAccountId || undefined,
        });
        return {
          command: approved ? 'ADMIN_APPROVE_SHOP' : 'ADMIN_REJECT_SHOP',
          contextPatch: { unexpectedReplyCount: 0 },
          message: `${approved ? 'Approved' : 'Rejected'} shop link ${saved.id}.`,
        };
      }
    } catch (error: any) {
      return {
        command: 'ADMIN_APPROVAL_ERROR',
        message:
          error?.message || 'That approval action could not be completed.',
      };
    }
    return null;
  }

  private parseAdminApprovalTarget(target: string) {
    const tokens = String(target || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const typeRaw = String(tokens.shift() || '').toUpperCase();
    const type = ['PAYMENT', 'PAY'].includes(typeRaw)
      ? 'PAYMENT'
      : ['SUBSCRIPTION', 'SUB'].includes(typeRaw)
        ? 'SUBSCRIPTION'
        : ['SHOP', 'SHOPLINK', 'SHOP_LINK', 'LINK'].includes(typeRaw)
          ? 'SHOP'
          : null;
    if (!type) return null;
    const id = tokens.shift() || '';
    const bridgeIndex = tokens.findIndex((token) => /^bridge$/i.test(token));
    const bridgeTarget = bridgeIndex >= 0 ? tokens[bridgeIndex + 1] : undefined;
    const noteTokens = bridgeIndex >= 0 ? tokens.slice(0, bridgeIndex) : tokens;
    return {
      type,
      id,
      bridgeTarget,
      notes: this.clean(noteTokens.join(' ')) || undefined,
    };
  }

  private async resolveAdminApprovalOption(
    value: string,
    options: unknown,
    model: { findUnique?: Function },
  ) {
    const cleanTarget = this.cleanAdminTarget(value);
    if (!cleanTarget) return null;
    const fromContext = this.resolveNumberedContextOption(cleanTarget, options);
    const id = fromContext?.id || cleanTarget;
    if (!model?.findUnique) return id;
    const found = await model.findUnique({
      where: { id },
      select: { id: true },
    });
    return found?.id || null;
  }

  private async resolveShopApprovalBridge(
    link: any,
    bridgeTarget: string | undefined,
    context: Record<string, unknown>,
  ) {
    const explicit = this.cleanAdminTarget(bridgeTarget || '');
    const fromContext = explicit
      ? this.resolveNumberedContextOption(explicit, context.adminBridgeOptions)
      : null;
    const explicitId = fromContext?.id || explicit;
    const candidateIds = [explicitId, link?.runner?.bridgeAccountId].filter(
      Boolean,
    ) as string[];
    for (const id of candidateIds) {
      const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
        where: {
          id,
          archivedAt: null,
          status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        },
        select: { id: true },
      });
      if (bridge?.id) return bridge.id;
    }
    const latest = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
      },
      select: { id: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return latest?.id || null;
  }

  private shortDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value || ''));
    return Number.isNaN(date.getTime())
      ? 'N/A'
      : date.toISOString().slice(0, 10);
  }
  private async adminBotListRunners(search?: string) {
    const result = await this.getPhase1Runners({
      search: this.clean(search) || undefined,
      limit: 10,
      offset: 0,
    });
    const runners = result.runners || [];
    return {
      command: 'ADMIN_RUNNERS',
      contextPatch: {
        adminRunnerOptions: runners.map((runner: any) => ({
          id: runner.id,
          name: runner.name,
          phone: runner.phone,
        })),
        adminGroupOptions: [],
      },
      message: [
        `Phase 1 runners (${runners.length}/${result.total})`,
        '',
        runners.length
          ? runners
              .map(
                (runner: any, index: number) =>
                  `${index + 1}. ${runner.name || runner.phone || runner.id}\n   ${runner.trialStatus} · ${runner.subscriptionStatus} · Reposting: ${runner.repostingStatus}\n   Shop groups: ${runner.selectedShopCount}/${runner.shopLimit?.max || DEFAULT_RUNNER_SOURCE_SHOP_LIMIT} · Posting groups: ${runner.groupLimit.selected}/${runner.groupLimit.max}`,
              )
              .join('\n')
          : 'No runners found.',
        '',
        'Reply ADMIN RUNNER 1 to inspect, ADMIN VERIFY 1 only for stuck group verification, or ADMIN START 1 when setup is ready.',
      ].join('\n'),
    };
  }

  private async adminBotRunnerStatusResponse(runnerId: string) {
    const status = await this.getRunnerStatus(runnerId);
    return {
      command: 'ADMIN_RUNNER',
      status,
      contextPatch: this.adminContextPatchFromStatus(status),
      message: this.adminRunnerStatusText(status),
    };
  }

  private async adminBotRunnerControlResponse(runnerId: string) {
    const status = await this.getRunnerStatus(runnerId);
    const label = status.runner.name || status.runner.phone || status.runner.id;
    return {
      command: 'ADMIN_USE_RUNNER',
      runnerId: status.runner.id,
      status,
      contextPatch: {
        ...this.adminContextPatchFromStatus(status),
        registeredRunnerId: status.runner.id,
        enrolmentStatus: 'ACTIVE',
        runnerControlMode: true,
      },
      message: [
        `Now controlling runner: ${label}`,
        '',
        'You can now use runner commands from this chat: STATUS, SETUP, SHOPS, GROUPS, SHOP LINKS, GROUP LINK, START, PAUSE, RESUME, STOP.',
        'Use ADMIN STATUS for your superuser status.',
        'Reply EXIT to leave this runner control session completely.',
        '',
        this.adminRunnerStatusText(status),
      ].join('\n'),
    };
  }

  private adminRunnerStatusText(status: any) {
    return [
      `Runner: ${status.runner.name || status.runner.phone || status.runner.id}`,
      `ID: ${status.runner.id}`,
      `Access: ${status.access.label}`,
      `Trial: ${status.runner.trialStatus} · Subscription: ${status.runner.subscriptionStatus}`,
      `Bridge: ${status.bridgeStatus.label}`,
      status.bridgeStatus.explanation,
      `Effective reposting: ${status.repostingControl.label}`,
      status.repostingControl.explanation,
      `Reposting: ${status.repostingStatus}`,
      `Shop groups: ${status.shopLimit.selected}/${status.shopLimit.max}`,
      `Ready posting groups: ${status.groupLimit.selected}/${status.groupLimit.max}`,
      `Saved posting groups: ${status.groupLimit.saved.selected}/${status.groupLimit.saved.live.max}`,
      '',
      status.repostingGroups.length
        ? status.repostingGroups
            .map(
              (group: any, index: number) =>
                `Group ${index + 1}: ${group.groupName}\nID: ${group.id}\n${group.status} · Bot joined: ${group.botJoinStatus} · Admin: ${group.botAdminStatus}`,
            )
            .join('\n')
        : 'No reposting groups connected.',
      '',
      status.readiness.canStart
        ? 'Ready: yes. Use ADMIN START <id/#> to activate.'
        : `Blockers: ${status.readiness.blockers.join('; ')}`,
      '',
      'Admin actions: ADMIN VERIFY, ADMIN START, ADMIN PAUSE, ADMIN RESUME, ADMIN STOP.',
    ].join('\n');
  }
  private adminContextPatchFromStatus(status: any) {
    return {
      adminRunnerOptions: [
        {
          id: status.runner.id,
          name: status.runner.name,
          phone: status.runner.phone,
        },
      ],
      adminGroupOptions: status.repostingGroups.map((group: any) => ({
        id: group.id,
        groupName: group.groupName,
      })),
      unexpectedReplyCount: 0,
    };
  }

  private adminBotTargetMissingResponse(label: string) {
    return {
      command: 'ADMIN',
      message: [
        `I could not find that ${label}.`,
        '',
        'Use ADMIN RUNNERS to get a numbered runner list, ADMIN RUNNER <id/phone/name> to inspect, then use the shown number or ID.',
      ].join('\n'),
    };
  }

  private async adminBotEnableDevelopmentReposting(
    runnerId: string,
    input: string,
  ) {
    if (!this.developmentBotRepostingAllowed()) {
      return {
        command: 'ADMIN_DEV_REPOSTING',
        message:
          'Development reposting override is disabled in this environment. Set PHASE1_ALLOW_DEV_BOT_REPOSTING=true if you intentionally want this outside local development.',
      };
    }

    const options = this.parseDevelopmentRepostingOptions(input);
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      include: {
        user: { select: { name: true, phone: true } },
        shopAssignments: {
          where: { status: 'APPROVED' },
          select: { id: true, destinationGroup: true },
        },
        repostingGroups: {
          where: { status: { in: ACTIVE_GROUP_STATUSES } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    const destinationGroups = [
      ...new Set([
        ...this.parseLegacyDestinationGroupRefs(runner.whatsappGroup),
        ...runner.shopAssignments.flatMap((link) =>
          this.parseLegacyDestinationGroupRefs(link.destinationGroup),
        ),
        ...runner.repostingGroups
          .filter((group) => group.status === 'READY_FOR_REPOSTING')
          .flatMap((group) =>
            [
              this.clean(group.whatsappGroupId),
              this.clean(group.groupName),
            ].filter(Boolean),
          ),
      ]),
    ];
    const fallbackDestination = destinationGroups[0] || null;

    await (this.prisma as any).appSetting.upsert({
      where: { key: WHATSAPP_REPOSTING_ENABLED_KEY },
      update: { value: 'true' },
      create: { key: WHATSAPP_REPOSTING_ENABLED_KEY, value: 'true' },
    });

    await this.prisma.runner.update({
      where: { id: runner.id },
      data: {
        status: 'ACTIVE',
        repostingStatus: 'ACTIVE',
        autoPostEnabled: true,
        ...(options.frequencyMinutes
          ? { autoPostIntervalMinutes: Math.max(30, options.frequencyMinutes) }
          : { autoPostIntervalMinutes: 30 }),
        ...(options.maxPostsPerRun
          ? {
              maxPostsPerRun: Math.max(1, Math.min(10, options.maxPostsPerRun)),
            }
          : { maxPostsPerRun: 10 }),
      },
    });

    await this.prisma.runnerShopLink.updateMany({
      where: { runnerId: runner.id, status: 'APPROVED' },
      data: { autoPostEnabled: true },
    });

    if (fallbackDestination) {
      await this.prisma.runnerShopLink.updateMany({
        where: {
          runnerId: runner.id,
          status: 'APPROVED',
          OR: [{ destinationGroup: null }, { destinationGroup: '' }],
        },
        data: { destinationGroup: fallbackDestination },
      });
    }

    const status = await this.getRunnerStatus(runner.id);
    return {
      command: 'ADMIN_DEV_REPOSTING',
      contextPatch: this.adminContextPatchFromStatus(status),
      message: [
        `Development reposting enabled for ${status.runner.name || status.runner.phone || status.runner.id}.`,
        '',
        'Global automatic WhatsApp reposting: ON',
        `Runner auto-post: ON`,
        options.frequencyMinutes
          ? `Frequency: every ${Math.max(30, options.frequencyMinutes)} minutes`
          : `Frequency: every 30 minutes`,
        options.maxPostsPerRun
          ? `Max posts per run: ${Math.max(1, Math.min(10, options.maxPostsPerRun))}`
          : `Max posts per run: 10`,
        `Approved shop links enabled: ${status.selectedShops.length}`,
        fallbackDestination
          ? `Destination fallback: ${fallbackDestination}`
          : 'Destination fallback: none found. The bridge still needs runner.whatsappGroup or link.destinationGroup to post.',
        '',
        'This is a development override. Phase 1 readiness blockers may still appear in STATUS, but the bridge repost scheduler can now pick up eligible approved listings.',
      ].join('\n'),
    };
  }

  private developmentBotRepostingAllowed() {
    return (
      process.env.NODE_ENV !== 'production' ||
      process.env.PHASE1_ALLOW_DEV_BOT_REPOSTING === 'true'
    );
  }

  private parseDevelopmentRepostingOptions(input: string) {
    const frequencyMatch = String(input || '').match(
      /\b(?:freq|frequency|every|interval)\s*[:=]?\s*(\d{1,3})\b/i,
    );
    const maxMatch = String(input || '').match(
      /\b(?:max|maxposts|max-posts|posts)\s*[:=]?\s*(\d{1,3})\b/i,
    );
    const maxPostsPerRun = maxMatch
      ? Math.max(1, Math.min(Number(maxMatch[1]), 10))
      : undefined;
    return {
      frequencyMinutes: frequencyMatch ? Number(frequencyMatch[1]) : undefined,
      maxPostsPerRun,
    };
  }

  private adminDevelopmentRunnerTarget(value: string) {
    const clean = this.clean(value);
    if (!clean) return '';
    const tokens = clean.split(/\s+/);
    const stopWords = new Set([
      'DEV',
      'DEVELOPMENT',
      'EVERY',
      'FREQ',
      'FREQUENCY',
      'INTERVAL',
      'MAX',
      'MAXPOSTS',
      'MAX-POSTS',
      'POSTS',
    ]);
    const targetTokens: string[] = [];
    for (const token of tokens) {
      if (stopWords.has(token.toUpperCase())) break;
      targetTokens.push(token);
    }
    return targetTokens.join(' ');
  }

  private async resolveAdminRunnerTarget(
    target: string,
    context: Record<string, unknown>,
    user?: any,
  ) {
    const cleanTarget = this.cleanAdminTarget(target);
    if (!cleanTarget && user?.runner?.id) {
      return this.prisma.runner.findUnique({
        where: { id: user.runner.id },
        select: { id: true },
      });
    }
    if (!cleanTarget) return null;
    const fromContext = this.resolveNumberedContextOption(
      cleanTarget,
      context.adminRunnerOptions,
    );
    if (fromContext?.id) {
      return this.prisma.runner.findUnique({
        where: { id: fromContext.id },
        select: { id: true },
      });
    }

    if (/^\d+$/.test(cleanTarget)) {
      return this.resolveAdminRunnerListIndex(Number(cleanTarget));
    }

    const normalizedPhone = this.normalizePhone(cleanTarget);
    const runner = await this.prisma.runner.findFirst({
      where: {
        OR: [
          { id: cleanTarget },
          { phone: cleanTarget },
          ...(normalizedPhone
            ? [
                { phone: normalizedPhone },
                { phone: normalizedPhone.replace(/^\+/, '') },
              ]
            : []),
          {
            user: {
              is: { name: { contains: cleanTarget, mode: 'insensitive' } },
            },
          },
          {
            user: {
              is: { phone: { contains: cleanTarget, mode: 'insensitive' } },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return runner || null;
  }

  private async resolveAdminRunnerListIndex(index: number) {
    if (!Number.isInteger(index) || index < 1) return null;
    const runners = await this.prisma.runner.findMany({
      orderBy: { createdAt: 'desc' },
      skip: index - 1,
      take: 1,
      select: { id: true },
    });
    return runners[0] || null;
  }

  private cleanAdminTarget(target: string) {
    const clean = this.clean(target);
    if (!clean) return null;
    const withoutNoise = clean.replace(/[!?.;,]+/g, '').trim();
    return withoutNoise || null;
  }

  private async resolveAdminGroupTarget(
    target: string,
    context: Record<string, unknown>,
  ) {
    const cleanTarget = this.clean(target);
    if (!cleanTarget) return null;
    const fromContext = this.resolveNumberedContextOption(
      cleanTarget,
      context.adminGroupOptions,
    );
    const groupId = fromContext?.id || cleanTarget;
    return this.prisma.runnerRepostingGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
  }

  private resolveNumberedContextOption(value: string, options: unknown) {
    if (!/^\d+$/.test(value) || !Array.isArray(options)) return null;
    const item = (options as Array<{ id?: string }>)[Number(value) - 1];
    return item?.id ? item : null;
  }

  private statusCommand(runnerId: string) {
    return this.getRunnerStatus(runnerId).then((status) => {
      const savedPostingGroups = status.repostingGroups;
      const needsSavedGroupRetry =
        status.groupLimit.selected === 0 && savedPostingGroups.length > 0;
      return {
        command: 'STATUS',
        status,
        message: [
          'Runner Commerce Status',
          '',
          `Access: ${status.access.label}`,
          status.access.trialEndsAt
            ? `Trial ends: ${new Date(status.access.trialEndsAt).toLocaleDateString()}`
            : '',
          `Bot connection: ${status.bridgeStatus.label}`,
          status.bridgeStatus.explanation,
          `Reposting: ${status.repostingControl.label}`,
          status.repostingControl.explanation,
          `Reposting status: ${status.repostingStatus}`,
          `Shop groups selected: ${status.shopLimit.selected} of ${status.shopLimit.max}`,
          status.testWindow.endsAt
            ? `Trial shop access ends: ${new Date(status.testWindow.endsAt).toLocaleDateString()}`
            : '',
          `Active shop groups: ${status.repostingControl.enabledLiveShopCount || status.repostingControl.enabledTestShopCount} of ${status.repostingControl.liveShopCount || status.repostingControl.testShopCount}`,
          `Posting groups: ${status.groupLimit.selected} ready, ${status.groupLimit.saved.selected} saved`,
          status.readiness.canStart
            ? 'Setup: Ready for reposting'
            : `Still needed: ${status.readiness.blockers.join('; ')}`,
          '',
          status.readiness.canStart
            ? 'Next step: reply START to begin reposting. Reply PAUSE anytime to hold it.'
            : needsSavedGroupRetry
              ? 'Next step: reply RETRY 1 to let the bot try joining the saved group again.'
              : 'Next step: reply SETUP for the checklist, SHOPS for shop selection, or GROUPS to connect a posting group.',
          status.readiness.canStart
            ? 'Need more shop or reposting capacity? Reply PLANS to see weekly options.'
            : '',
          this.menuCtaLine(),
          this.supportCtaLine(),
        ]
          .filter(Boolean)
          .join('\n'),
      };
    });
  }

  private groupsCommand(runnerId: string) {
    return this.getRunnerStatus(runnerId).then((status) => {
      const savedPostingGroups = status.repostingGroups;
      return {
        command: 'GROUPS',
        groups: savedPostingGroups,
        message: [
          savedPostingGroups.length === 0
            ? 'No posting groups connected yet.'
            : `Your posting groups:\n\n${savedPostingGroups
                .map(
                  (group, index) =>
                    `${index + 1}. ${group.groupName} - ${this.runnerGroupReadinessLabel(group)}`,
                )
                .join('\n')}`,
          '',
          savedPostingGroups.length > 0
            ? 'Posting group found. Reply RETRY 1 to let the bot try joining any saved group that is not ready yet.'
            : 'To add a customer advertising posting group, send one WhatsApp group invite link:\nhttps://chat.whatsapp.com/...',
          '',
          savedPostingGroups.length > 0
            ? `You can save up to ${status.groupLimit.max} posting groups. Send another WhatsApp group invite link to add one if capacity is available.`
            : 'Reply STATUS after sending the link to check readiness.',
          this.supportCtaLine(),
        ].join('\n'),
      };
    });
  }
  private shopsCommand(runnerId: string) {
    return this.getRunnerStatus(runnerId).then((status) => ({
      command: 'SHOPS',
      shops: status.selectedShops,
      message:
        status.selectedShops.length === 0
          ? `No shop groups selected yet. During Phase 1, you can select up to ${status.shopLimit.max} shop groups.`
          : `Your selected shop groups:\n\n${status.selectedShops
              .map(
                (shop, index) =>
                  `${index + 1}. ${shop.shopName} - ${shop.status}`,
              )
              .join('\n')}`,
    }));
  }

  private async availableShopsBotResponse() {
    const result = await this.discoverShops({ limit: PHASE1_SHOP_ALL_LIMIT });
    const shops = result.data || [];
    const separator = '------------------------------';
    return {
      command: 'SHOPS',
      shops,
      message:
        shops.length === 0
          ? [
              'No available shop groups are captured right now. Please send SUPPORT and an admin will help you.',
              this.supportCtaLine(),
            ].join('\n')
          : [
              'Available shop groups:',
              '',
              ...shops.flatMap((shop: any, index: number) =>
                [
                  `${index + 1}. ${shop.name}`,
                  shop.location ? `Location: ${shop.location}` : '',
                  shop.activeProducts
                    ? `Active products: ${shop.activeProducts}`
                    : '',
                  separator,
                ].filter(Boolean),
              ),
              '',
              'Current Phase 1 offer:',
              `Setup: choose up to ${result.limits.maxSelectable} shop groups and connect one posting group.`,
              result.limits.hasMore
                ? `Showing the first ${shops.length} shops. Ask support if you need a shop beyond this list.`
                : '',
              'Reply REGISTER to start runner registration, or SUPPORT for help.',
              this.supportCtaLine(),
            ]
              .filter(Boolean)
              .join('\n'),
    };
  }

  private async enrolRunnerFromBot(data: {
    user?: any;
    whatsappNumber: string;
    messageText: string;
    bridgeAccountId?: string | null;
  }) {
    const details = this.parseRunnerRegistrationDetails(data.messageText);
    if (
      !details.name &&
      !details.phone &&
      !details.town &&
      !details.sells &&
      !details.groupLink
    ) {
      return {
        command: 'REGISTER',
        message: [
          'I am ready to register you as a runner, but I could not read the details yet.',
          '',
          'We use two towns:',
          '1. Shop town - where you want supplier/shop products from.',
          '2. Delivery town - where you sell, deliver, or meet customers.',
          '',
          'Neither question is asking for your private home address.',
          '',
          'To proceed, reply with your details in this format:',
          '',
          this.isAdminUser(data.user) ? 'Runner WhatsApp: +26876000000' : null,
          'Name: Your name',
          'Shop town: Supplier/shop town',
          'Delivery town: Customer delivery town',
          'What you sell: Clothing, shoes, cosmetics, etc.',
          '',
          'After registration, reply SHOPS to choose shop groups, then GROUPS to connect your posting group.',
          '',
          'Reply PROCEED to see this format again, or EXIT to stop registration.',
        ]
          .filter(Boolean)
          .join('\\n'),
      };
    }

    if (this.isAdminUser(data.user) && !details.phone) {
      return this.registrationStepResponse('REGISTER_PHONE', {
        registrationDraft: { ...details, assistedRegistration: true },
      });
    }

    if (!details.name) {
      return {
        command: 'REGISTER',
        message: [
          'Please include your name so I can create the runner application.',
          '',
          'Example:',
          'Name: Thandi Dlamini',
          'Shop town: Durban',
          'Delivery town: Manzini',
          'What you sell: Clothing and shoes',
          '',
          'After registration, reply SHOPS to choose shop groups, then GROUPS to connect your posting group.',
          '',
          'Reply EXIT if you do not want to continue now.',
        ].join('\n'),
      };
    }

    if (!details.shopTown) {
      return this.registrationStepResponse('REGISTER_SHOP_TOWN', {
        registrationDraft: details,
      });
    }

    if (!details.deliveryTown) {
      return this.registrationStepResponse('REGISTER_DELIVERY_TOWN', {
        registrationDraft: details,
      });
    }

    if (!details.sells) {
      return this.registrationStepResponse('REGISTER_SELLS', {
        registrationDraft: details,
      });
    }

    return this.createRunnerApplicationFromBot({
      ...data,
      details,
      rawRegistrationText: data.messageText,
    });
  }

  private async runnerRegistrationFollowUpFromBot(data: {
    user?: any;
    whatsappNumber: string;
    messageText: string;
    bridgeAccountId?: string | null;
    step: string;
    context: Record<string, unknown>;
  }) {
    const text = String(data.messageText || '').trim();
    const draft = this.registrationDraftFromContext(data.context);
    const parsed = this.parseRunnerRegistrationDetails(text);

    if (this.isRegistrationConfirmationStep(data.step)) {
      return this.registrationConfirmationFollowUpFromBot({
        ...data,
        text,
        draft,
      });
    }

    const mergedDraft = {
      ...draft,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => Boolean(value)),
      ),
    };

    if (
      this.isAdminUser(data.user) &&
      !data.user?.runner &&
      !mergedDraft.phone &&
      data.step !== 'REGISTER_PHONE'
    ) {
      return this.registrationStepResponse('REGISTER_PHONE', {
        registrationDraft: { ...mergedDraft, assistedRegistration: true },
      });
    }

    if (
      mergedDraft.name &&
      (!mergedDraft.assistedRegistration || mergedDraft.phone) &&
      mergedDraft.shopTown &&
      mergedDraft.deliveryTown &&
      mergedDraft.sells
    ) {
      if (
        data.step === 'REGISTER_GROUP_LINK' &&
        !mergedDraft.groupLink &&
        !/^skip|not now|later$/i.test(text)
      ) {
        return this.registrationStepResponse('REGISTER_GROUP_LINK', {
          registrationDraft: mergedDraft,
        });
      }
      return this.createRunnerApplicationFromBot({
        user: data.user,
        whatsappNumber: data.whatsappNumber,
        bridgeAccountId: data.bridgeAccountId,
        details: mergedDraft,
        rawRegistrationText: text,
      });
    }

    if (data.step === 'REGISTER_PHONE') {
      const phone = parsed.phone || this.normalizePhone(text);
      if (!phone) {
        return this.unexpectedRegistrationResponse('REGISTER_PHONE', {
          registrationDraft: mergedDraft,
        });
      }
      mergedDraft.phone = phone;
      return this.registrationConfirmationResponse({
        field: 'phone',
        value: mergedDraft.phone,
        nextStep: 'REGISTER_NAME',
        draft,
      });
    }

    if (data.step === 'REGISTER_NAME') {
      if (!parsed.name && this.isUnexpectedRegistrationAnswer(text, 'name')) {
        return this.unexpectedRegistrationResponse(
          'REGISTER_NAME',
          data.context,
        );
      }
      mergedDraft.name = parsed.name || text;
      return this.registrationConfirmationResponse({
        field: 'name',
        value: mergedDraft.name,
        nextStep: 'REGISTER_SHOP_TOWN',
        draft,
      });
    }

    if (data.step === 'REGISTER_SHOP_TOWN') {
      if (
        !parsed.shopTown &&
        this.isUnexpectedRegistrationAnswer(text, 'town')
      ) {
        return this.unexpectedRegistrationResponse('REGISTER_SHOP_TOWN', {
          registrationDraft: mergedDraft,
        });
      }
      mergedDraft.shopTown = parsed.shopTown || text;
      return this.registrationConfirmationResponse({
        field: 'shopTown',
        value: mergedDraft.shopTown,
        nextStep: 'REGISTER_DELIVERY_TOWN',
        draft,
      });
    }

    if (data.step === 'REGISTER_DELIVERY_TOWN') {
      if (
        !parsed.deliveryTown &&
        this.isUnexpectedRegistrationAnswer(text, 'town')
      ) {
        return this.unexpectedRegistrationResponse('REGISTER_DELIVERY_TOWN', {
          registrationDraft: mergedDraft,
        });
      }
      mergedDraft.deliveryTown = parsed.deliveryTown || text;
      return this.registrationConfirmationResponse({
        field: 'deliveryTown',
        value: mergedDraft.deliveryTown,
        nextStep: 'REGISTER_SELLS',
        draft,
      });
    }

    if (data.step === 'REGISTER_SELLS') {
      if (
        !parsed.sells &&
        this.isUnexpectedRegistrationAnswer(text, 'products')
      ) {
        return this.unexpectedRegistrationResponse('REGISTER_SELLS', {
          registrationDraft: mergedDraft,
        });
      }
      mergedDraft.sells = parsed.sells || text;
      return this.registrationConfirmationResponse({
        field: 'sells',
        value: mergedDraft.sells,
        nextStep: 'REGISTER_COMPLETE',
        draft: mergedDraft.groupLink
          ? { ...draft, groupLink: mergedDraft.groupLink }
          : draft,
      });
    }

    if (data.step === 'REGISTER_GROUP_LINK') {
      const groupLink = parsed.groupLink || this.extractInviteLinks(text)[0];
      if (!groupLink && !/^skip|not now|later$/i.test(text)) {
        return this.registrationStepResponse('REGISTER_GROUP_LINK', {
          registrationDraft: mergedDraft,
        });
      }
      return this.registrationConfirmationResponse({
        field: 'groupLink',
        value: groupLink || null,
        nextStep: 'REGISTER_COMPLETE',
        draft: mergedDraft,
      });
    }

    return this.registrationBotResponse();
  }

  private async registrationConfirmationFollowUpFromBot(data: {
    user?: any;
    whatsappNumber: string;
    messageText: string;
    bridgeAccountId?: string | null;
    step: string;
    context: Record<string, unknown>;
    text: string;
    draft: Record<string, any>;
  }) {
    const pending = this.registrationConfirmationFromContext(data.context);
    if (!pending) {
      return this.registrationBotResponse();
    }

    const answer = data.text.trim();
    if (/^(yes|y|correct|confirm|ok|okay|proceed|continue)$/i.test(answer)) {
      const nextDraft = { ...data.draft, [pending.field]: pending.value };
      if (pending.nextStep === 'REGISTER_COMPLETE') {
        return this.createRunnerApplicationFromBot({
          user: data.user,
          whatsappNumber: data.whatsappNumber,
          bridgeAccountId: data.bridgeAccountId,
          details: nextDraft,
          rawRegistrationText: data.messageText,
        });
      }
      return this.registrationStepResponse(pending.nextStep, {
        registrationDraft: nextDraft,
      });
    }

    if (/^(no|n|wrong|change|edit|redo|again)$/i.test(answer)) {
      return this.registrationStepResponse(
        this.registrationStepForField(pending.field),
        { registrationDraft: data.draft },
      );
    }

    const editMatch = answer.match(/^(?:edit|change|replace)\s+(.+)$/i);
    if (editMatch?.[1]) {
      const editedValue = this.clean(editMatch[1]) || '';
      const invalidGroupLink =
        pending.field === 'groupLink' &&
        !this.isInviteLink(editedValue) &&
        !/^skip|not now|later$/i.test(editedValue);
      const invalidPhoneAnswer =
        pending.field === 'phone' && !this.normalizePhone(editedValue);
      const invalidTextAnswer =
        pending.field !== 'groupLink' &&
        pending.field !== 'phone' &&
        (!editedValue ||
          this.isUnexpectedRegistrationAnswer(
            editedValue,
            pending.field === 'name'
              ? 'name'
              : pending.field === 'sells'
                ? 'products'
                : 'town',
          ));
      if (invalidGroupLink || invalidPhoneAnswer || invalidTextAnswer) {
        return this.unexpectedRegistrationResponse(
          this.registrationStepForField(pending.field),
          { registrationDraft: data.draft },
        );
      }
      return this.registrationConfirmationResponse({
        field: pending.field,
        value:
          pending.field === 'groupLink' &&
          /^skip|not now|later$/i.test(editedValue)
            ? null
            : pending.field === 'phone'
              ? this.normalizePhone(editedValue)
              : editedValue,
        nextStep: pending.nextStep,
        draft: data.draft,
      });
    }

    return {
      command: this.registrationConfirmCommand(pending.field),
      contextPatch: {
        registrationDraft: data.draft,
        pendingRegistrationConfirmation: pending,
        unexpectedReplyCount: 0,
      },
      message: [
        'Please confirm the captured answer first.',
        '',
        `${this.registrationFieldLabel(pending.field)}: ${this.registrationDisplayValue(pending.value)}`,
        '',
        'Reply YES to confirm.',
        'Reply NO to change it.',
        `Or reply EDIT ${this.registrationFieldExample(pending.field)}.`,
        'Reply EXIT to stop registration for now.',
      ].join('\n'),
    };
  }

  private registrationConfirmationResponse(data: {
    field: string;
    value: string | null;
    nextStep: string;
    draft: Record<string, any>;
  }) {
    const pending = {
      field: data.field,
      value: data.value,
      nextStep: data.nextStep,
    };
    return {
      command: this.registrationConfirmCommand(data.field),
      contextPatch: {
        registrationDraft: data.draft,
        pendingRegistrationConfirmation: pending,
        unexpectedReplyCount: 0,
      },
      message: [
        'Please confirm the answer I captured.',
        '',
        `${this.registrationFieldLabel(data.field)}: ${this.registrationDisplayValue(data.value)}`,
        '',
        'Is this correct?',
        '',
        'Reply YES to confirm.',
        'Reply NO to change it.',
        `Or reply EDIT ${this.registrationFieldExample(data.field)}.`,
        'Reply EXIT to stop registration for now.',
      ].join('\n'),
    };
  }

  private registrationConfirmationFromContext(
    context: Record<string, unknown>,
  ) {
    const pending = context.pendingRegistrationConfirmation;
    if (!pending || typeof pending !== 'object') return null;
    const value = pending as Record<string, any>;
    if (!value.field || !value.nextStep) return null;
    return {
      field: String(value.field),
      value: value.value ?? null,
      nextStep: String(value.nextStep),
    };
  }

  private registrationConfirmCommand(field: string) {
    const map: Record<string, string> = {
      phone: 'REGISTER_CONFIRM_PHONE',
      name: 'REGISTER_CONFIRM_NAME',
      shopTown: 'REGISTER_CONFIRM_SHOP_TOWN',
      deliveryTown: 'REGISTER_CONFIRM_DELIVERY_TOWN',
      sells: 'REGISTER_CONFIRM_SELLS',
      groupLink: 'REGISTER_CONFIRM_GROUP_LINK',
    };
    return map[field] || 'REGISTER_CONFIRM';
  }

  private registrationStepForField(field: string) {
    const map: Record<string, string> = {
      phone: 'REGISTER_PHONE',
      name: 'REGISTER_NAME',
      shopTown: 'REGISTER_SHOP_TOWN',
      deliveryTown: 'REGISTER_DELIVERY_TOWN',
      sells: 'REGISTER_SELLS',
      groupLink: 'REGISTER_GROUP_LINK',
    };
    return map[field] || 'REGISTER_NAME';
  }

  private registrationFieldLabel(field: string) {
    const map: Record<string, string> = {
      phone: 'Runner WhatsApp',
      name: 'Full name',
      shopTown: 'Shop/source town',
      deliveryTown: 'Delivery/customer town',
      sells: 'Products',
      groupLink: 'Posting group link',
    };
    return map[field] || 'Answer';
  }

  private registrationFieldExample(field: string) {
    const map: Record<string, string> = {
      phone: '+26876000000',
      name: 'Thandi Dlamini',
      shopTown: 'Manzini',
      deliveryTown: 'Mbabane',
      sells: 'clothing and shoes',
      groupLink: 'https://chat.whatsapp.com/...',
    };
    return map[field] || 'your answer';
  }

  private registrationDisplayValue(value: unknown) {
    const text = this.clean(String(value ?? ''));
    return text || 'No group link now';
  }

  private temporaryRunnerPassword() {
    return `RC-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private temporaryPasswordMessage(data: {
    name?: string | null;
    phone: string;
    password: string;
  }) {
    const frontendUrl = this.frontendUrl();
    return this.chatBlock('RUNNER LOGIN DETAILS', [
      `Hello ${this.clean(data.name) || 'there'},`,
      '',
      'Your Runner Commerce account is ready.',
      `Login phone: ${data.phone}`,
      `Temporary password: ${data.password}`,
      '',
      `Login: ${frontendUrl}/login`,
      '',
      'Please sign in and change this temporary password as soon as possible.',
      'Do not share this password with anyone.',
      this.supportCtaLine(),
    ]);
  }

  private async queueRunnerTemporaryPasswordMessage(data: {
    bridgeAccountId?: string | null;
    phone: string;
    name?: string | null;
    password: string;
  }) {
    const bridgeAccountId = this.clean(data.bridgeAccountId);
    if (!bridgeAccountId) return false;
    const recipientPhone = this.normalizePhone(data.phone);
    if (!recipientPhone) return false;
    try {
      await this.prisma.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId,
          recipientPhone,
          messageType: 'RUNNER_TEMPORARY_PASSWORD',
          messageText: this.temporaryPasswordMessage({
            name: data.name,
            phone: recipientPhone,
            password: data.password,
          }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private runnerShoppingDestination(runner: {
    phase1Setup?: unknown;
    serviceArea?: string | null;
  }) {
    const setup =
      runner.phase1Setup && typeof runner.phase1Setup === 'object'
        ? (runner.phase1Setup as Record<string, unknown>)
        : {};
    return (
      this.clean(String(setup.shopTown || '')) ||
      this.clean(String(setup.shoppingDestination || '')) ||
      this.clean(runner.serviceArea)
    );
  }

  private async createRunnerApplicationFromBot(data: {
    user?: any;
    whatsappNumber: string;
    bridgeAccountId?: string | null;
    details: any;
    rawRegistrationText: string;
  }) {
    const details = data.details;
    const role = await this.prisma.role.findUnique({
      where: { name: 'RUNNER' },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('RUNNER role not found');

    const targetWhatsappNumber = this.normalizePhone(
      details.phone || data.whatsappNumber,
    );
    if (!targetWhatsappNumber) {
      throw new BadRequestException('Runner WhatsApp number is required');
    }
    const assistedRegistration = targetWhatsappNumber !== data.whatsappNumber;
    if (assistedRegistration && !this.isAdminUser(data.user)) {
      throw new BadRequestException(
        'Only admin users can register a runner using a different WhatsApp number',
      );
    }
    const targetUser = assistedRegistration
      ? await this.prisma.user.findFirst({
          where: {
            OR: this.phoneLookupCandidates(targetWhatsappNumber).map(
              (phone) => ({ phone }),
            ),
          },
          include: { role: true, runner: true },
        })
      : data.user;

    const bridgeAccountId = await this.selectAvailableRunnerBridgeAccountId(
      this.clean(data.bridgeAccountId),
    );
    const now = new Date();
    const temporaryPassword = targetUser
      ? null
      : this.temporaryRunnerPassword();
    const result = await this.prisma.$transaction(async (tx) => {
      const user =
        targetUser ||
        (await tx.user.create({
          data: {
            name: details.name as string,
            phone: targetWhatsappNumber,
            email: null,
            passwordHash: await bcrypt.hash(temporaryPassword as string, 10),
            passwordResetRequired: true,
            roleId: role.id,
          },
          include: { role: true },
        }));

      if (user && !['RUNNER', 'ADMIN', 'SUPERUSER'].includes(user.role?.name)) {
        await tx.user.update({
          where: { id: user.id },
          data: { roleId: role.id, status: 'ACTIVE' },
        });
      }

      const runner =
        user.runner ||
        (await tx.runner.create({
          data: {
            user: { connect: { id: user.id } },
            phone: targetWhatsappNumber,
            serviceArea: details.deliveryTown || details.shopTown,
            status: 'ACTIVE',
            trialStatus: 'TRIAL_ACTIVE',
            trialStartsAt: now,
            trialEndsAt: new Date(
              now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
            ),
            subscriptionStatus: 'PENDING_SUBSCRIPTION',
            repostingStatus: 'NOT_STARTED',
            approvedAt: now,
            ...(bridgeAccountId
              ? { bridgeAccount: { connect: { id: bridgeAccountId } } }
              : {}),
            phase1Setup: {
              source: 'WHATSAPP_BOT',
              shopTown: details.shopTown,
              deliveryTown: details.deliveryTown,
              town: details.deliveryTown || details.shopTown,
              sells: details.sells,
              rawRegistrationText: data.rawRegistrationText,
              registeredAt: new Date().toISOString(),
            },
          },
          select: { id: true },
        }));

      await tx.runnerWallet.upsert({
        where: { runnerId: runner.id },
        update: {},
        create: { runnerId: runner.id, balance: 0, pending: 0 },
      });

      let group = null;
      if (details.groupLink) {
        group = await tx.runnerRepostingGroup.create({
          data: {
            runnerId: runner.id,
            inviteLink: details.groupLink,
            groupName: 'Posting group',
            isTestGroup: false,
            status: 'GROUP_LINK_RECEIVED',
            botJoinStatus: 'GROUP_LINK_RECEIVED',
            botAdminStatus: 'ADMIN_STATUS_PENDING',
            bridgeAccountId,
          },
          select: { id: true, inviteLink: true, bridgeAccountId: true },
        });
      }

      return { runner, group };
    });

    if (temporaryPassword && bridgeAccountId) {
      await this.queueRunnerTemporaryPasswordMessage({
        bridgeAccountId,
        phone: targetWhatsappNumber,
        name: details.name,
        password: temporaryPassword,
      });
    }

    let groupJoinQueued = false;
    if (result.group?.id && result.group.inviteLink) {
      groupJoinQueued = await this.queueRunnerRepostingGroupJoin({
        groupId: result.group.id,
        inviteLink: result.group.inviteLink,
        bridgeAccountId: result.group.bridgeAccountId || bridgeAccountId,
      });
    }

    return {
      command: 'REGISTER',
      runnerId: result.runner.id,
      contextPatch: {
        registeredRunnerId: result.runner.id,
        enrolmentStatus: 'ACTIVE',
      },
      message: [
        'Runner registration active',
        '',
        `Thanks ${details.name}. Your runner status and role are active.`,
        details.shopTown ? `Shop town: ${details.shopTown}` : null,
        details.deliveryTown ? `Delivery town: ${details.deliveryTown}` : null,
        details.sells ? `Products: ${details.sells}` : null,
        details.groupLink
          ? groupJoinQueued
            ? 'Your posting group link was saved and bot joining has been queued automatically.'
            : 'Your posting group link was saved. Bot joining will be retried when the connection is available.'
          : null,
        '',
        `Your ${Math.round(TRIAL_DAYS / 7)}-week trial is active.`,
        'Next steps:',
        '1. Reply SHOPS to choose available shop groups.',
        '2. After selecting shops, reply GROUPS to connect your posting group.',
        '3. Reply STATUS anytime to check readiness.',
        this.supportCtaLine(),
        'Reply MENU for all options.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private registrationBotResponse(assistedRegistration = false) {
    if (assistedRegistration) {
      return {
        command: 'REGISTER_PHONE',
        contextPatch: {
          registrationDraft: { assistedRegistration: true },
          pendingRegistrationConfirmation: null,
          registeredRunnerId: null,
          enrolmentStatus: null,
          unexpectedReplyCount: 0,
        },
        message: [
          'Runner registration',
          '',
          'I will register a runner account for someone else.',
          '',
          'Question 1 of 5:',
          'What is the runner WhatsApp number?',
          '',
          'Reply with the runner WhatsApp number only. Example: +26876000000',
          '',
          'Choices:',
          'PROCEED - continue with registration',
          'EXIT - stop registration for now',
          '',
          'Timing: I will reply immediately when I receive the details. If this chat is idle for a few hours, I may refresh the step so you do not use old choices.',
        ].join('\n'),
      };
    }

    return {
      command: 'REGISTER_NAME',
      contextPatch: {
        registrationDraft: {},
        pendingRegistrationConfirmation: null,
        registeredRunnerId: null,
        enrolmentStatus: null,
        unexpectedReplyCount: 0,
      },
      message: [
        'Runner registration',
        '',
        'I will ask one question at a time.',
        '',
        'Question 1 of 4:',
        'What is your full name?',
        '',
        'Reply with your name only.',
        '',
        'Choices:',
        'PROCEED - continue with registration',
        'EXIT - stop registration for now',
        '',
        'Timing: I will reply immediately when I receive the details. If this chat is idle for a few hours, I may refresh the step so you do not use old choices.',
      ].join('\n'),
    };
  }
  private isRegistrationStep(step?: string) {
    return [
      'REGISTER',
      'REGISTER_PHONE',
      'REGISTER_NAME',
      'REGISTER_SHOP_TOWN',
      'REGISTER_DELIVERY_TOWN',
      'REGISTER_SELLS',
      'REGISTER_GROUP_LINK',
      'REGISTER_CONFIRM_PHONE',
      'REGISTER_CONFIRM_NAME',
      'REGISTER_CONFIRM_SHOP_TOWN',
      'REGISTER_CONFIRM_DELIVERY_TOWN',
      'REGISTER_CONFIRM_SELLS',
      'REGISTER_CONFIRM_GROUP_LINK',
    ].includes(String(step || ''));
  }

  private isRegistrationConfirmationStep(step?: string) {
    return String(step || '').startsWith('REGISTER_CONFIRM_');
  }

  private registrationDraftFromContext(context: Record<string, unknown>) {
    return context.registrationDraft &&
      typeof context.registrationDraft === 'object'
      ? { ...(context.registrationDraft as Record<string, any>) }
      : {};
  }

  private registrationStepResponse(
    step: string | undefined,
    context: Record<string, unknown>,
  ) {
    const draft = this.registrationDraftFromContext(context);
    const pendingConfirmation =
      this.registrationConfirmationFromContext(context);
    if (this.isRegistrationConfirmationStep(step) && pendingConfirmation) {
      return this.registrationConfirmationResponse({
        field: pendingConfirmation.field,
        value: pendingConfirmation.value,
        nextStep: pendingConfirmation.nextStep,
        draft,
      });
    }
    const response = (command: string, lines: string[]) => ({
      command,
      contextPatch: { registrationDraft: draft, unexpectedReplyCount: 0 },
      message: this.chatBlock('RUNNER REGISTRATION', [
        ...lines,
        '',
        'Reply EXIT to stop registration for now.',
      ]),
    });

    const assistedRegistration = draft.assistedRegistration === true;

    if (step === 'REGISTER_PHONE') {
      return response('REGISTER_PHONE', [
        'I will register a runner account for someone else.',
        '',
        'Question 1 of 5:',
        'What is the runner WhatsApp number?',
        '',
        'Reply with the runner WhatsApp number only. Example: +26876000000',
      ]);
    }

    if (step === 'REGISTER_SHOP_TOWN') {
      return response('REGISTER_SHOP_TOWN', [
        'Got it.',
        '',
        assistedRegistration ? 'Question 3 of 5:' : 'Question 2 of 4:',
        'Which town/city should we use for shop and supplier matching?',
        '',
        'This is the town where you want products sourced from. Example: Durban, Johannesburg, Manzini.',
        'Reply with the shop/source town only.',
      ]);
    }

    if (step === 'REGISTER_DELIVERY_TOWN') {
      return response('REGISTER_DELIVERY_TOWN', [
        'Got it.',
        '',
        assistedRegistration ? 'Question 4 of 5:' : 'Question 3 of 4:',
        'Which town/city do you deliver to or serve customers in?',
        '',
        'This is your delivery/customer area, not your private residential address.',
        'Reply with the delivery town only.',
      ]);
    }

    if (step === 'REGISTER_SELLS') {
      return response('REGISTER_SELLS', [
        'Got it.',
        '',
        assistedRegistration ? 'Question 5 of 5:' : 'Question 4 of 4:',
        'What products do you sell or want to repost?',
        '',
        'Example: clothing, shoes, cosmetics.',
        'Reply with the product categories only.',
      ]);
    }

    if (step === 'REGISTER_GROUP_LINK') {
      return response('REGISTER_GROUP_LINK', [
        'Got it.',
        '',
        'Optional posting group link:',
        'Send your posting group invite link, or skip it and add it later with GROUPS.',
        '',
        'This is the WhatsApp group where Runner Commerce will post products when you start reposting.',
        'You can add or change posting groups later with GROUPS.',
        'Reply with a link like https://chat.whatsapp.com/...',
        'If you do not have the group link now, reply SKIP.',
      ]);
    }

    return response('REGISTER_NAME', [
      'I will ask one question at a time.',
      '',
      'Question 1 of 4:',
      'What is your full name?',
      '',
      assistedRegistration
        ? 'Reply with the runner name only.'
        : 'Reply with your name only.',
    ]);
  }

  private unexpectedRegistrationResponse(
    step: string | undefined,
    context: Record<string, unknown>,
  ) {
    const guide = this.registrationStepResponse(step, context);
    return {
      ...guide,
      message: this.chatBlock('REGISTRATION ANSWER NEEDED', [
        'I could not use that answer for this registration question.',
        '',
        guide.message,
        '',
        'Choices: answer the question, PROCEED to repeat it, EXIT to stop, or SUPPORT for admin help.',
        this.supportLinkLine(),
      ]),
    };
  }

  private isUnexpectedRegistrationAnswer(
    value: string,
    kind: 'name' | 'town' | 'products',
  ) {
    const text = String(value || '').trim();
    const lower = text.toLowerCase();
    if (text.length < 2) return true;
    if (/^[^\p{L}\p{N}]+$/u.test(text)) return true;
    if (
      /^(stuck|invalid|invalid input|unexpected|unknown|test|testing|asdf|qwerty|none|no|n\/a|na|help me)$/i.test(
        lower,
      )
    ) {
      return true;
    }
    if (this.looksLikeKeyboardMash(text)) return true;
    if (kind === 'name') {
      return !/[a-z]/i.test(text) || text.length < 3;
    }
    if (kind === 'town') {
      return !/[a-z]/i.test(text) || text.length > 80;
    }
    return !/[a-z]/i.test(text) || text.length > 160;
  }

  private looksLikeKeyboardMash(value: string) {
    const lettersOnly = String(value || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (lettersOnly.length < 10) return false;
    if (/\s/.test(value)) return false;
    const vowelCount = (lettersOnly.match(/[aeiou]/g) || []).length;
    const uniqueLetters = new Set(lettersOnly.split('')).size;
    const vowelRatio = vowelCount / lettersOnly.length;
    return vowelRatio < 0.31 && uniqueLetters >= 7;
  }

  private registrationHelpResponse(
    step: string | undefined,
    context: Record<string, unknown>,
  ) {
    const guide = this.registrationStepResponse(step, context);
    return {
      ...guide,
      message: this.chatBlock('REGISTRATION HELP', [
        'Registration help',
        '',
        'Answer the current question only. I will move you to the next question after that.',
        '',
        guide.message,
        '',
        'Choices: PROCEED to continue, EXIT to stop, SUPPORT for admin help.',
        this.supportLinkLine(),
      ]),
    };
  }

  private registrationSupportResponse(
    step: string | undefined,
    context: Record<string, unknown>,
  ) {
    const guide = this.registrationStepResponse(step, context);
    return {
      ...guide,
      message: this.chatBlock('SUPPORT NOTED', [
        'Support noted.',
        '',
        'An admin can review this chat, and I will keep you on the same registration question for now.',
        this.supportLinkLine(),
        '',
        guide.message,
        '',
        'Choices: answer the question, PROCEED to repeat the step, or EXIT to stop registration for now.',
      ]),
    };
  }

  private exitBotResponse() {
    return {
      command: 'EXIT',
      contextPatch: {
        customerRedirectRunnerIds: [],
        menuActive: null,
        pendingRepostingGroup: null,
        pendingRunnerSubscription: null,
        registrationDraft: {},
        pendingRegistrationConfirmation: null,
        repostingGroupLinks: [],
        registeredRunnerId: null,
        enrolmentStatus: null,
        runnerControlMode: null,
        submittedShopLinks: [],
        unexpectedReplyCount: 0,
      },
      message: this.chatBlock('INTERACTION STOPPED', [
        'This interaction is stopped for now.',
        '',
        'No problem. Your chat is still here when you are ready.',
        '',
        'Reply MENU to return to the main interview.',
        'Reply REGISTER to register as a runner.',
        this.supportCtaLine(),
      ]),
    };
  }

  private submitShopLinksBotResponse(isRunner = false) {
    return {
      command: 'SUBMIT_SHOP_LINKS',
      message: [
        'Submit shop links',
        '',
        'Please paste the WhatsApp shop group invite links you want Runner Commerce to add and review.',
        isRunner
          ? 'New shop groups will inherit your registered shop/source town as their shopping destination.'
          : '',
        '',
        'You can send one link or multiple links in one message.',
        'To target a bridge for joining/capture, write it like this:',
        'SHOP LINKS BRIDGE 2: https://chat.whatsapp.com/...',
        '',
        'If the supplier sends a QR code image, first decode it to the WhatsApp invite link, then send the link here.',
        isRunner
          ? 'Tip: send SHOP before the link if you are pasting it outside this step.'
          : '',
      ].join('\n'),
    };
  }

  private connectRepostingGroupBotResponse(isRunner = false) {
    return {
      command: 'CONNECT_REPOSTING_GROUP',
      message: [
        'Connect reposting group',
        '',
        'Please paste the WhatsApp invite link for the reposting group you want to connect.',
        '',
        'Example: https://chat.whatsapp.com/...',
        '',
        'The bot must be able to post in the group before reposting can start.',
        'You do not need to type the group name. The system saves the WhatsApp group name after the bot joins.',
        isRunner
          ? 'After sending a group link, wait for confirmation or reply STATUS to check whether it is ready.'
          : '',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private howItWorksBotResponse() {
    return {
      command: 'HOW_IT_WORKS',
      message: [
        'How Runner Commerce works',
        '',
        '1. You choose approved shop groups.',
        '2. Runner Commerce captures products from those groups.',
        '3. The system cleans captions and adds order codes.',
        '4. Products are reposted into your posting groups when you start reposting.',
        '5. Customers can order using the order codes.',
        '',
        'Reply REGISTER to register, SHOPS to view available shop groups, SHOP LINKS to submit shop links, or GROUPS to connect a posting group.',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private nonRunnerStatusBotResponse() {
    return {
      command: 'STATUS',
      message: [
        'Phase 1 status',
        '',
        'I do not see an approved runner profile for this WhatsApp number yet.',
        '',
        'Reply REGISTER to register as a runner.',
        'Reply SUPPORT to contact support.',
        this.supportLinkLine(),
      ].join('\n'),
    };
  }

  private registeredRunnerWelcomeResponse(user: any, runner: any) {
    const name = this.clean(user?.name) || 'there';
    const status = this.clean(runner?.status) || 'UNKNOWN';
    const repostingStatus =
      this.clean(runner?.repostingStatus) || 'NOT_STARTED';
    const statusLine =
      status === 'ACTIVE'
        ? `Your runner profile is active. Reposting is ${repostingStatus}.`
        : status === 'PENDING'
          ? 'Your runner application is saved. Reply STATUS to see the next setup step.'
          : `Your runner profile status is ${status}.`;

    return {
      command: 'WELCOME',
      message: [
        `Welcome back, ${name}.`,
        '',
        'I found your Runner Commerce runner profile for this WhatsApp number.',
        statusLine,
        '',
        'Reply STATUS to check your setup.',
        'Reply SETUP to continue onboarding.',
        'Reply HELP to see all commands.',
      ].join('\n'),
    };
  }

  private adminWelcomeResponse(user: any) {
    const name = this.clean(user?.name) || 'there';
    const role = this.clean(user?.role?.name) || 'ADMIN';
    const title = role === 'SUPERUSER' ? 'Admin' : 'Admin';
    return {
      command: 'ADMIN_WELCOME',
      message: [
        `Welcome back, ${name}.`,
        '',
        `I identified this registered WhatsApp number as ${title}.`,
        '',
        this.adminBotHelpText(),
      ].join('\n'),
    };
  }

  private knownUserWelcomeResponse(user: any) {
    const name = this.clean(user?.name) || 'there';
    const role = this.clean(user?.role?.name) || 'CUSTOMER';
    return {
      command: 'WELCOME',
      message: [
        `Welcome back, ${name}.`,
        '',
        `I found your Runner Commerce account (${role}), but this WhatsApp number is not connected to a runner profile yet.`,
        '',
        'Reply REGISTER to register as a runner.',
        'Reply SUPPORT to contact support.',
        this.supportLinkLine(),
      ].join('\n'),
    };
  }

  private nonRunnerShopLinksReceivedResponse(inviteLinks: string[]) {
    return {
      command: 'SUBMIT_SHOP_LINKS',
      message: [
        'Shop links received',
        '',
        `I found ${inviteLinks.length} WhatsApp shop group link${inviteLinks.length === 1 ? '' : 's'}.`,
        '',
        'They are saved in this bot session for admin review.',
        'Reply REGISTER to register as a runner, or send more shop links.',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private nonRunnerRepostingGroupReceivedResponse(inviteLink: string) {
    return {
      command: 'CONNECT_REPOSTING_GROUP',
      message: [
        'Reposting group link received',
        '',
        'I saved this group link in the bot session for admin review.',
        '',
        'Reply REGISTER if you have not registered yet, or SUPPORT to contact support.',
        this.supportLinkLine(),
      ].join('\n'),
    };
  }

  private isBotFollowUpStale(updatedAt?: Date | string | null) {
    if (!updatedAt) return false;
    const time = new Date(updatedAt).getTime();
    if (Number.isNaN(time)) return false;
    return Date.now() - time > BOT_FOLLOWUP_STALE_MS;
  }

  private isBotSessionTimedOut(updatedAt?: Date | string | null) {
    if (!updatedAt) return false;
    const time = new Date(updatedAt).getTime();
    if (Number.isNaN(time)) return false;
    return Date.now() - time > BOT_SESSION_TIMEOUT_MS;
  }

  private isGuidedRunnerStep(step?: string) {
    return [
      'SHOPS',
      'SUBMIT_SHOP_LINKS',
      'CONNECT_REPOSTING_GROUP',
      'GROUPS',
      'ADMIN_DONE',
      'SETUP',
    ].includes(String(step || ''));
  }

  private delayedRunnerFollowUpResponse(step: string) {
    const guide = this.runnerStepGuide(step);
    return {
      command: guide.command,
      contextPatch: { unexpectedReplyCount: 0 },
      message: [
        'This setup step was idle for a while, so I refreshed it to avoid using old choices.',
        '',
        guide.message,
        '',
        'You can also reply STATUS for your current setup, or SETUP to restart the guided checklist.',
      ].join('\n'),
    };
  }

  private proceedBotResponse(step: string) {
    const guide = this.runnerStepGuide(step);
    return {
      command: guide.command,
      contextPatch: { unexpectedReplyCount: 0 },
      message: [
        'Continuing this setup step.',
        '',
        guide.message,
        '',
        'Reply EXIT if you want to stop this setup for now.',
      ].join('\n'),
    };
  }

  private unexpectedRunnerFollowUpResponse(
    step: string | undefined,
    context: Record<string, unknown>,
  ) {
    const previousCount =
      typeof context.unexpectedReplyCount === 'number'
        ? Number(context.unexpectedReplyCount)
        : 0;
    const nextCount = previousCount + 1;
    const guide = this.runnerStepGuide(step);
    const needsHumanHelp = nextCount > BOT_MAX_UNEXPECTED_REPLIES;

    return {
      command: guide.command,
      contextPatch: { unexpectedReplyCount: nextCount },
      message: [
        needsHumanHelp
          ? 'I still could not match that reply to this setup step.'
          : 'I could not match that reply to this setup step.',
        '',
        guide.message,
        '',
        needsHumanHelp
          ? 'Reply SUPPORT if you want an admin to check it, SETUP to restart, or EXIT to stop this setup for now.'
          : 'Reply PROCEED to continue, EXIT to stop this setup for now, HELP to see all commands, or SUPPORT if an admin should check this with you.',
        this.supportLinkLine(),
      ].join('\n'),
    };
  }

  private runnerStepGuide(step?: string) {
    switch (step) {
      case 'SHOPS':
        return {
          command: 'SHOPS',
          message:
            'Reply SELECT 1,2,3 from the shown SHOPS list to choose your shop groups. Reply SHOP LINKS to submit missing supplier links, or GROUPS to add a posting group.',
        };
      case 'SUBMIT_SHOP_LINKS':
        return {
          command: 'SUBMIT_SHOP_LINKS',
          message:
            'Please paste one or more WhatsApp shop/supplier invite links. Example: https://chat.whatsapp.com/...',
        };
      case 'CONNECT_REPOSTING_GROUP':
      case 'GROUPS':
        return {
          command: 'GROUPS',
          message: [
            'For posting groups, send one WhatsApp group invite link at a time.',
            '',
            'Example: https://chat.whatsapp.com/...',
            '',
            'After each link, reply STATUS to check whether the group is ready.',
          ].join('\n'),
        };
      case 'ADMIN_DONE':
        return {
          command: 'GROUPS',
          message: [
            'Reply GROUPS to review posting groups, STATUS to see what is still needed, or SUPPORT if bot joining is stuck.',
            this.supportLinkLine(),
          ].join('\n'),
        };
      case 'STATUS':
        return {
          command: 'STATUS',
          message:
            'Reply STATUS to see your current shop groups, posting groups, and next action.',
        };
      case 'START':
        return {
          command: 'START',
          message:
            'Reply START to begin reposting selected shop products to your posting group.',
        };
      case 'SETUP':
      default:
        return {
          command: 'SETUP',
          message:
            'Reply SHOPS to choose available shop groups, SHOP LINKS to submit missing shop links, GROUPS to connect a posting group, STATUS to see what is still needed, or START when setup is ready.',
        };
    }
  }

  private isGreeting(value?: string | null) {
    return /^(hi|hello|hey|sawubona|sanibonani|morning|afternoon|evening|good\s+(morning|afternoon|evening))[\s!.]*$/i.test(
      String(value || '').trim(),
    );
  }

  private parseWelcomeInterviewChoice(value?: string | null) {
    const text = String(value || '')
      .trim()
      .toLowerCase();
    if (!text) return null;
    if (/^(1|customer|buyer|shopper|order)$/i.test(text)) return 'CUSTOMER';
    if (/^(2|runner|seller|register|repost)$/i.test(text)) return 'RUNNER';
    if (/^(3|admin|support|help|human)$/i.test(text)) return 'SUPPORT';
    return null;
  }

  private shouldShowWelcomeInterview(data: {
    messageText: string;
    command: RepostCommand | null;
    runner: any;
    user: any;
    isRegisteredAdminBotUser: boolean;
    followUpStep?: string;
    isNewChatSession: boolean;
    inviteLinks: string[];
    hasMedia?: boolean;
  }) {
    if (data.inviteLinks.length > 0) return false;
    if (this.containsOrderCode(data.messageText)) return false;
    if (data.isRegisteredAdminBotUser) return false;

    const isMenu = data.command === 'MENU';
    const isGreeting = this.isGreeting(data.messageText);
    const isCustomerIntent = this.isCustomerMenuIntent(
      data.messageText,
      data.command,
    );

    const reusableStep =
      !data.followUpStep ||
      data.followUpStep === 'WELCOME' ||
      data.followUpStep === 'WELCOME_INTERVIEW' ||
      data.followUpStep === 'CUSTOMER_ORDER_CODE_REQUIRED' ||
      data.isNewChatSession;

    if (data.runner) return isGreeting && data.isNewChatSession;
    if (data.user) return false;
    if (this.isRegistrationStep(data.followUpStep)) return false;
    if (isCustomerIntent) return false;

    const hasInput =
      String(data.messageText || '').trim().length > 0 ||
      Boolean(data.hasMedia) ||
      isMenu ||
      isGreeting;
    return reusableStep && hasInput;
  }

  private welcomeInterviewBotResponse(extraLine?: string) {
    return {
      command: 'WELCOME_INTERVIEW',
      message: this.chatBlock('WELCOME TO RUNNER COMMERCE', [
        'Hi, welcome to Runner Commerce. I can help route you to the right place.',
        '',
        ...(extraLine ? [extraLine, ''] : []),
        'Please choose one:',
        '1. CUSTOMER - order with an RC code or contact your runner',
        '2. RUNNER - register, setup, reposting, billing, or posting groups',
        '3. ADMIN / SUPPORT - get help from Runner Commerce support',
      ]),
    };
  }

  private async welcomeInterviewChoiceBotResponse(data: {
    choice: string | null;
    whatsappNumber: string;
    user: any;
    runner: any;
    isRegisteredAdminBotUser: boolean;
  }) {
    if (data.choice === 'CUSTOMER') {
      return this.customerRedirectBotResponse(data.whatsappNumber);
    }
    if (data.choice === 'RUNNER') {
      return data.runner
        ? this.registeredRunnerWelcomeResponse(data.user, data.runner)
        : { command: 'WELCOME', message: this.welcomeMessage() };
    }
    if (data.choice === 'SUPPORT') {
      return data.isRegisteredAdminBotUser
        ? this.adminWelcomeResponse(data.user)
        : { command: 'SUPPORT', message: this.supportMessage() };
    }
    return this.welcomeInterviewBotResponse(
      'Please choose 1, 2, or 3 so I can route you correctly.',
    );
  }

  private async runnerGreetingResponse(
    runnerId: string,
    followUpStep?: string,
  ) {
    const status = await this.getRunnerStatus(runnerId);
    const step = this.runnerCurrentStepFromStatus(status, followUpStep);
    if (step === 'SHOPS') {
      const shopsResponse = await this.runnerShopsGuideResponse(runnerId);
      const name = this.clean(status.runner?.name) || 'there';
      return {
        ...shopsResponse,
        contextPatch: {
          ...(shopsResponse as any).contextPatch,
          unexpectedReplyCount: 0,
        },
        message: [
          `Hi ${name}.`,
          '',
          'You are already registered. Here are the available shop groups.',
          '',
          shopsResponse.message,
        ].join('\n'),
      };
    }
    const guide = this.runnerStepGuide(step);
    const name = this.clean(status.runner?.name) || 'there';
    const guideMessage =
      step === 'START' ? this.runnerStartStepMessage(status) : guide.message;

    return {
      command: guide.command,
      contextPatch: { unexpectedReplyCount: 0 },
      message: [
        `Hi ${name}.`,
        '',
        `You are already registered. Current setup step: ${this.runnerStepLabel(step)}.`,
        '',
        guideMessage,
        '',
        'Reply STATUS anytime to see your full setup.',
        this.supportCtaLine(),
      ].join('\n'),
    };
  }

  private runnerStartStepMessage(status: any) {
    const active =
      status.runner?.repostingStatus === 'ACTIVE' ||
      status.repostingStatus === 'ACTIVE';
    const enabledShopCount =
      Number(status.repostingControl?.enabledTestShopCount || 0) ||
      Number(status.repostingControl?.enabledLiveShopCount || 0);
    const readyGroup = (status.repostingGroups || []).find(
      (group: any) => group.status === 'READY_FOR_REPOSTING',
    );
    const groupName = this.clean(readyGroup?.groupName) || 'your posting group';

    if (active) {
      return `Currently posting from ${enabledShopCount} shop${enabledShopCount === 1 ? '' : 's'} to ${groupName}.`;
    }

    return 'Setup is ready. Send START when you want reposting to run.';
  }

  private runnerCurrentStepFromStatus(status: any, followUpStep?: string) {
    const savedStep = String(followUpStep || '');
    if (this.isGuidedRunnerStep(savedStep) && savedStep !== 'WELCOME') {
      return savedStep;
    }
    if ((status.shopLimit?.selected || 0) === 0) return 'SHOPS';
    if ((status.groupLimit?.test?.selected || 0) === 0) return 'GROUPS';
    if (!status.readiness?.canStart) return 'STATUS';
    return 'START';
  }

  private runnerStepLabel(step?: string) {
    switch (String(step || '')) {
      case 'SHOPS':
        return 'choose shop groups';
      case 'SUBMIT_SHOP_LINKS':
        return 'submit missing shop links';
      case 'CONNECT_REPOSTING_GROUP':
      case 'GROUPS':
        return 'connect or review your posting groups';
      case 'STATUS':
        return 'check setup readiness';
      case 'START':
        return 'start reposting';
      case 'SETUP':
      default:
        return 'setup checklist';
    }
  }

  private nextBotSessionContext(data: {
    previousContext: unknown;
    step: string;
    inviteLinks: string[];
    patch?: Record<string, unknown>;
  }) {
    const previous =
      data.previousContext && typeof data.previousContext === 'object'
        ? (data.previousContext as Record<string, unknown>)
        : {};
    const nextRetryCount =
      data.patch && typeof data.patch.unexpectedReplyCount === 'number'
        ? data.patch.unexpectedReplyCount
        : 0;
    const withPatch: Record<string, unknown> = data.patch
      ? { ...previous, ...data.patch, unexpectedReplyCount: nextRetryCount }
      : { ...previous, unexpectedReplyCount: 0 };
    if (data.inviteLinks.length === 0) return withPatch;

    const key =
      data.step === 'CONNECT_REPOSTING_GROUP'
        ? 'repostingGroupLinks'
        : 'submittedShopLinks';
    const existing = Array.isArray(withPatch[key])
      ? (withPatch[key] as string[])
      : [];

    return {
      ...withPatch,
      [key]: [...new Set([...existing, ...data.inviteLinks])],
    };
  }

  private parseNumberList(value: string) {
    return [
      ...new Set(
        String(value || '')
          .match(/\d+/g)
          ?.map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0) || [],
      ),
    ];
  }

  private parsePageNumber(value: string) {
    const match = String(value || '').match(/\b(?:page\s*)?(\d+)\b/i);
    if (!match?.[1]) return null;
    return Math.max(1, Number(match[1]) || 1);
  }

  private isLiveShopIntent(value: string) {
    return /\blive\b/i.test(String(value || ''));
  }

  private parseLegacyDestinationGroupRefs(value?: string | null) {
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

  private legacyDestinationGroupIds(runner: any) {
    return [
      ...new Set([
        ...this.parseLegacyDestinationGroupRefs(runner.whatsappGroup),
        ...(runner.shopAssignments || []).flatMap((link: any) =>
          this.parseLegacyDestinationGroupRefs(link.destinationGroup),
        ),
      ]),
    ];
  }

  private legacyRepostingBotLines(status: any) {
    return [];
  }

  private formatBotDateTime(value: Date | string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }

  private groupNameFromBotText(text: string, inviteLink: string) {
    const withoutLink = String(text || '')
      .replace(inviteLink, '')
      .replace(/\b(TEST|LIVE)\s*:?\s*/gi, '')
      .trim();
    return this.clean(withoutLink) || undefined;
  }

  private hasExplicitRepostingGroupType(text: string) {
    return /\b(TEST|LIVE)\s*:/i.test(String(text || ''));
  }

  private explicitRepostingGroupType(text: string) {
    if (!this.hasExplicitRepostingGroupType(text)) return undefined;
    return /\btest\s*:/i.test(String(text || ''));
  }

  private superUserWhatsAppLink(text = 'Runner Commerce support') {
    const digits = SUPERUSER_SUPPORT_PHONE.replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  private supportLinkLine(text = 'Runner Commerce support') {
    return `Support: ${this.superUserWhatsAppLink(text)}`;
  }

  private supportCtaLine(text = 'Runner Commerce support') {
    return `Reply SUPPORT for help. ${this.supportLinkLine(text)}`;
  }

  private menuCtaLine() {
    return 'Reply MENU for all options.';
  }

  private chatDivider() {
    return '------------------';
  }

  private chatBlock(title: string, lines: string[]) {
    return [this.chatDivider(), title, this.chatDivider(), '', ...lines].join(
      '\n',
    );
  }

  private frontendUrl() {
    return String(
      process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        'http://localhost:3000',
    ).replace(/\/+$/, '');
  }

  private customerSupportBotResponse() {
    return {
      command: 'CUSTOMER',
      message: this.chatBlock('CUSTOMER ENQUIRY', [
        'Customer enquiry',
        '',
        'If you want to order from a Runner Commerce product post, send the RC order code shown on that post.',
        'Example: RC-ABC123',
        '',
        'If you do not have the code, contact the runner who posted the product or ask support to help find it.',
        'Reply MENU to return to the main interview, REGISTER to register as a runner, or SUPPORT to contact support.',
        this.supportLinkLine('I need Runner Commerce customer support'),
      ]),
    };
  }

  private containsOrderCode(value?: string | null) {
    return /\bRC-[A-Z0-9]{6,10}\b/i.test(String(value || ''));
  }

  private async customerRedirectBotResponse(whatsappNumber: string) {
    const runnerContacts =
      await this.customerRunnerContactsFromGroups(whatsappNumber);

    if (runnerContacts.length === 1) {
      return this.customerRunnerRedirectBotResponse(runnerContacts[0]);
    }

    if (runnerContacts.length > 1) {
      return this.orderCodeNeededBotResponse({
        customerRedirectRunnerIds: runnerContacts.map((item) => item.runnerId),
      });
    }

    return this.orderCodeNeededBotResponse({ customerRedirectRunnerIds: [] });
  }

  private orderCodeNeededBotResponse(contextPatch: {
    customerRedirectRunnerIds: string[];
  }) {
    return {
      command: 'CUSTOMER_ORDER_CODE_REQUIRED',
      contextPatch,
      message: this.chatBlock('ORDER CODE NEEDED', [
        'Please send the RC order code shown on the product post, for example RC-ABC123.',
        'That lets me find the item and the correct runner.',
        '',
        this.supportLinkLine('I need help finding my runner or order code'),
      ]),
    };
  }

  private customerRunnerRedirectBotResponse(runner: {
    runnerId: string;
    runnerName: string;
    runnerPhone: string | null;
  }) {
    const contact = runner.runnerPhone
      ? `${runner.runnerName} ${this.whatsappLink(runner.runnerPhone)}`
      : runner.runnerName;
    return {
      command: 'CUSTOMER_REDIRECT',
      contextPatch: { customerRedirectRunnerIds: [runner.runnerId] },
      message: this.chatBlock('CONTACT YOUR RUNNER', [
        'This number is only for Runner Commerce posting and order-code intake.',
        '',
        `For product questions, delivery, payment, changes, or other communication, please WhatsApp your runner directly: ${contact}.`,
        '',
        'To order here, send the RC order code from the product post.',
      ]),
    };
  }

  private async customerRunnerContactsFromGroups(whatsappNumber: string) {
    const memberDelegate = (this.prisma as any).whatsAppDiscoveredGroupMember;
    if (typeof memberDelegate?.findMany !== 'function') return [];

    const phoneCandidates = this.phoneLookupCandidates(whatsappNumber);
    const members = await memberDelegate.findMany({
      where: {
        phone: { in: phoneCandidates },
        status: 'ACTIVE',
        archivedAt: null,
        discoveredGroup: {
          groupPurpose: 'RUNNER_ADVERTISING',
          archivedAt: null,
        },
      },
      select: {
        discoveredGroupId: true,
        groupId: true,
        discoveredGroup: { select: { groupId: true, name: true } },
      },
    });

    const groupRefs = [
      ...new Set(
        (members || [])
          .flatMap((member: any) => [
            this.clean(member.groupId),
            this.clean(member.discoveredGroupId),
            this.clean(member.discoveredGroup?.groupId),
            this.clean(member.discoveredGroup?.name),
          ])
          .filter(Boolean),
      ),
    ];
    if (groupRefs.length === 0) return [];

    const groupRefSet = new Set(groupRefs);
    const discoveredGroupIds = [
      ...new Set(
        (members || [])
          .map((member: any) => this.clean(member.discoveredGroupId))
          .filter(Boolean),
      ),
    ];
    const whatsappGroupIds = [
      ...new Set(
        (members || [])
          .flatMap((member: any) => [
            this.clean(member.groupId),
            this.clean(member.discoveredGroup?.groupId),
          ])
          .filter(Boolean),
      ),
    ];

    const repostingWhere: any[] = [];
    if (whatsappGroupIds.length > 0) {
      repostingWhere.push({ whatsappGroupId: { in: whatsappGroupIds } });
    }
    if (discoveredGroupIds.length > 0) {
      repostingWhere.push({ discoveredGroupId: { in: discoveredGroupIds } });
    }

    const [repostingGroups, legacyLinks] = await Promise.all([
      repostingWhere.length > 0
        ? (this.prisma as any).runnerRepostingGroup.findMany({
            where: {
              status: { in: ACTIVE_GROUP_STATUSES },
              OR: repostingWhere,
              runner: { status: 'ACTIVE' },
            },
            include: {
              runner: {
                include: { user: { select: { name: true, phone: true } } },
              },
            },
          })
        : [],
      (this.prisma as any).runnerShopLink.findMany({
        where: {
          status: 'APPROVED',
          destinationGroup: { not: null },
          runner: { status: 'ACTIVE' },
          OR: groupRefs.map((groupRef) => ({
            destinationGroup: { contains: groupRef },
          })),
        },
        include: {
          runner: {
            include: { user: { select: { name: true, phone: true } } },
          },
        },
      }),
    ]);

    const runners = new Map<
      string,
      { runnerId: string; runnerName: string; runnerPhone: string | null }
    >();
    const addRunner = (runner: any) => {
      if (!runner?.id || runner.status !== 'ACTIVE') return;
      const runnerPhone = this.clean(runner.phone || runner.user?.phone);
      runners.set(runner.id, {
        runnerId: runner.id,
        runnerName:
          this.clean(runner.user?.name) || runnerPhone || 'your runner',
        runnerPhone,
      });
    };

    for (const group of repostingGroups || []) addRunner(group.runner);
    for (const link of legacyLinks || []) {
      const destinations = this.parseLegacyDestinationGroupRefs(
        link.destinationGroup,
      );
      if (destinations.some((destination) => groupRefSet.has(destination))) {
        addRunner(link.runner);
      }
    }

    return [...runners.values()].sort((left, right) =>
      left.runnerName.localeCompare(right.runnerName),
    );
  }

  private whatsappLink(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  }

  private isCustomerMenuIntent(input: string, command: RepostCommand | null) {
    const text = String(input || '')
      .trim()
      .toLowerCase();
    if (command && command !== 'HELP') return false;
    return /\b(customer|non[-\s]?business|shopper|buyer|buy|order)\b/.test(
      text,
    );
  }

  private supportMessage() {
    return this.chatBlock('SUPPORT', [
      'Support request noted.',
      'Support can review your Runner Commerce setup or enquiry.',
      `WhatsApp support: ${this.superUserWhatsAppLink()}`,
      this.supportCtaLine(),
      '',
      'While waiting, reply STATUS to see what is still needed or GROUPS to review your posting groups.',
    ]);
  }

  private repostingGroupTypeRequiredResponse() {
    return {
      command: 'CONNECT_REPOSTING_GROUP',
      message: this.chatBlock('POSTING GROUP LINK', [
        'Please send one WhatsApp group invite link at a time.',
        '',
        'Example: https://chat.whatsapp.com/...',
        '',
        'After sending it, reply STATUS to check readiness.',
        'You do not need to type the group name. The system saves the WhatsApp group name after the bot joins.',
        this.supportCtaLine(),
      ]),
    };
  }

  private helpMessage() {
    return this.chatBlock('RUNNER COMMERCE HELP', [
      'WALKTHROUGH - WhatsApp-only practical setup steps',
      'SETUP - Guided onboarding checklist',
      'START - Start reposting',
      'PAUSE - Temporarily hold reposting but keep your settings',
      'PAUSE SHOP 1,2 - Pause selected shop groups',
      'RESUME - Continue reposting after pause',
      'RESUME SHOP 1,2 - Resume selected shop groups',
      'STOP - End reposting',
      'STATUS - Check your account and reposting status',
      'STATS - View posting stats and shop metrics',
      'SETTINGS - Show posting frequency and max posts',
      'SHOPS - View, select, or remove shop groups',
      'GROUPS - Connect or review posting groups',
      'BILLING - See Phase 1 offer and invoice status',
      'PLANS - Choose a Phase 1 runner offer',
      'PAY - Submit payment SMS, screenshot proof, or cash receipt',
      'CAPTIONS - Choose repost caption type and examples',
      'SHOP LINKS - Submit missing supplier/shop group links',
      'SET MARKUP - Change your runner fee',
      'AGE 7 DAYS - Only repost items within an age window',
      'BACKLOG - Repost older products',
      'MENU - Show the main menu',
      `SUPPORT - Contact support: ${this.superUserWhatsAppLink()}`,
      this.supportCtaLine(),
      '',
      'Start with one posting group. Send GROUPS if you need to connect or replace it.',
      'Failed bot joins are removed automatically, and saved group counts remain available for tracking.',
    ]);
  }

  private whatsappWalkthroughBotResponse(isRunner = false) {
    return {
      command: 'WALKTHROUGH',
      message: this.chatBlock('WHATSAPP RUNNER WALKTHROUGH', [
        'WhatsApp-only runner walkthrough',
        '',
        '1. Send REGISTER or choose 2.',
        '2. Answer one question at a time: name, shop town, delivery town, products.',
        '3. Shop town is where you want supplier/shop products from.',
        '4. Delivery town is where you sell, deliver, or meet customers.',
        '5. Send SHOPS, then SELECT 1,2,3 to choose available shop groups.',
        `6. Your subscribed runner plan controls how many shop groups you can select during Phase 1.`,
        '7. After selecting shops, send GROUPS.',
        '8. Add one posting group link: https://chat.whatsapp.com/...',
        '9. Keep the invite link active while the bot joins automatically. Failed joins are removed, so resend a fresh invite if needed.',
        '10. Send STATUS. If setup is ready, send START.',
        '',
        'Daily controls:',
        'START, PAUSE, RESUME, STOP, STATUS, STATS, GROUPS, SHOPS, HELP.',
        'Use PAUSE SHOP 1,2 or AGE 7 DAYS after checking your SHOPS list.',
        this.supportCtaLine(),
        '',
        isRunner
          ? 'Tip: send SETUP for your current checklist.'
          : 'Tip: reply EXIT anytime during registration to stop for now.',
      ]),
    };
  }

  private welcomeMessage() {
    return this.chatBlock('WELCOME TO RUNNER COMMERCE', [
      'Welcome to Runner Commerce.',
      'This bot helps with runner setup, customer enquiries, and Runner Commerce support.',
      '',
      'Runners can receive products from selected shop groups and repost them to their own WhatsApp posting groups.',
      '',
      'Phase 1 is currently open to a limited number of runners.',
      '',
      'Please choose an option:',
      '',
      '1. WALKTHROUGH - see the full setup path',
      '2. REGISTER - register as a runner',
      '3. SHOPS - choose shop groups',
      '4. SHOP LINKS - submit missing supplier links',
      '5. GROUPS - connect posting group',
      '6. STATUS - check setup readiness',
      '7. SUPPORT - contact support',
      this.supportCtaLine(),
      '',
      'You can also type commands directly: WALKTHROUGH, REGISTER, SHOPS, SHOP LINKS, GROUPS, STATUS, SUPPORT.',
    ]);
  }

  private blockedStartMessage(blockers: string[]) {
    return this.chatBlock('SETUP NEEDED', [
      'Before reposting can start, we need to confirm:',
      '',
      ...blockers.map((blocker, index) => `${index + 1}. ${blocker}`),
      '',
      'Please complete the missing setup first or send SUPPORT for help.',
      this.supportLinkLine(),
    ]);
  }

  private extractInviteLinks(value: string | string[]) {
    const raw = Array.isArray(value) ? value.join('\n') : String(value || '');
    return [
      ...new Set(
        raw
          .split(/\s+/)
          .map((item) => item.trim())
          .filter((item) => this.isInviteLink(item)),
      ),
    ];
  }

  private isInviteLink(value: string) {
    return /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+/i.test(value);
  }

  private parseRunnerRegistrationDetails(value: string) {
    const text = String(value || '').trim();
    const inviteLinks = this.extractInviteLinks(text);
    const withoutLinks = inviteLinks.reduce(
      (current, link) => current.replace(link, '').trim(),
      text,
    );
    const fields: Record<string, string> = {};

    for (const line of withoutLinks.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(name|phone|whatsapp|whatsapp number|runner phone|runner whatsapp|shop town|source town|supplier town|delivery town|customer town|town|city|location|area|what you sell|products?|selling|sells|advertising group|demo group|test group|demo\/test group|test reposting group|live group|customer group|group link)\s*:\s*(.+)$/i,
      );
      if (!match) continue;
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (/^name$/.test(key)) fields.name = value;
      else if (/phone|whatsapp/.test(key)) fields.phone = value;
      else if (/shop town|source town|supplier town/.test(key))
        fields.shopTown = value;
      else if (/delivery town|customer town/.test(key))
        fields.deliveryTown = value;
      else if (/town|city|location|area/.test(key)) fields.deliveryTown = value;
      else if (/sell|product/.test(key)) fields.sells = value;
    }

    const fallbackLines = withoutLinks
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, '').trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !/^(name|phone|whatsapp|whatsapp number|runner phone|runner whatsapp|shop town|source town|supplier town|delivery town|customer town|town|city|location|area|what you sell|products?|selling|sells|advertising group|demo group|test group|demo\/test group|test reposting group|live group|customer group|group link)\s*:/i.test(
            line,
          ),
      );

    return {
      name: this.clean(fields.name || fallbackLines[0]),
      phone: this.normalizePhone(fields.phone),
      shopTown: this.clean(fields.shopTown),
      deliveryTown: this.clean(fields.deliveryTown || fallbackLines[1]),
      town: this.clean(
        fields.deliveryTown || fields.shopTown || fallbackLines[1],
      ),
      sells: this.clean(fields.sells || fallbackLines[2]),
      groupLink: inviteLinks[0] || null,
    };
  }

  private clean(value?: string | null) {
    const clean = String(value || '').trim();
    return clean || null;
  }

  private cleanStatus(value: string) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private async queueBridgeGroupJoin(data: {
    bridgeAccountId: string;
    inviteLink: string;
    metadataKey?: string;
  }) {
    const bridgeAccountId = this.clean(data.bridgeAccountId);
    const inviteLink = this.clean(data.inviteLink);
    if (!bridgeAccountId) {
      throw new BadRequestException('Choose a WhatsApp bridge account');
    }
    if (!inviteLink || !this.isInviteLink(inviteLink)) {
      throw new BadRequestException('Send a valid WhatsApp group invite link');
    }
    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        id: bridgeAccountId,
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
      },
      select: { id: true },
    });
    if (!bridge) {
      throw new BadRequestException('Selected WhatsApp bridge is not active');
    }
    return this.prisma.whatsAppOutboundMessage.create({
      data: {
        bridgeAccountId,
        recipientPhone: data.metadataKey || 'GROUP_INVITE',
        messageType: 'GROUP_JOIN',
        messageText: inviteLink,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        bridgeAccountId: true,
        messageType: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  private stringArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private cleanStringArray(
    value: string[] | undefined,
    maxItems: number,
    maxLength: number,
  ) {
    return Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((item) =>
                String(item || '')
                  .trim()
                  .slice(0, maxLength),
              )
              .filter(Boolean),
          ),
        ).slice(0, maxItems)
      : [];
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? `+${digits}` : null;
  }

  private phoneLookupCandidates(value?: string | null) {
    const raw = String(value || '').trim();
    const digits = raw.replace(/\D/g, '');
    const candidates = new Set<string>();
    const addDigits = (next?: string | null) => {
      const clean = String(next || '').replace(/\D/g, '');
      if (!clean) return;
      candidates.add(`+${clean}`);
      candidates.add(clean);
    };

    if (raw) candidates.add(raw);
    addDigits(digits);

    if (digits.startsWith('268') && digits.length > 3) {
      const local = digits.slice(3);
      addDigits(local);
      addDigits(`0${local}`);
    } else if (digits.startsWith('0') && digits.length > 1) {
      const local = digits.slice(1);
      addDigits(local);
      addDigits(`268${local}`);
    } else if (digits.length === 8) {
      addDigits(`268${digits}`);
      addDigits(`0${digits}`);
    }

    return [...candidates].filter(Boolean);
  }

  private async primaryBridgeAccountId() {
    return this.selectAvailableRunnerBridgeAccountId();
  }

  private async selectAvailableRunnerBridgeAccountId(
    preferredId?: string | null,
  ) {
    const bridgeDelegate: any = this.prisma.whatsAppBridgeAccount as any;
    if (typeof bridgeDelegate?.findMany !== 'function') {
      const bridge = await bridgeDelegate?.findFirst?.({
        where: {
          archivedAt: null,
          status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      return bridge?.id || preferredId || null;
    }

    const eligibleWhere = {
      archivedAt: null,
      status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
      mode: { not: 'PAUSED' },
    };
    const bridges = await bridgeDelegate.findMany({
      where: eligibleWhere,
      select: {
        id: true,
        name: true,
        capacityRunners: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
    });
    if (bridges.length === 0) return null;

    const counts: Array<{
      bridgeAccountId: string | null;
      _count: { _all: number };
    }> =
      typeof (this.prisma.runner as any).groupBy === 'function'
        ? await (this.prisma.runner as any).groupBy({
            by: ['bridgeAccountId'],
            where: {
              bridgeAccountId: { in: bridges.map((bridge: any) => bridge.id) },
              status: { in: ['ACTIVE', 'APPROVED'] },
            },
            _count: { _all: true },
          })
        : [];
    const loadByBridge = new Map(
      counts
        .filter(
          (row: { bridgeAccountId: string | null }) => row.bridgeAccountId,
        )
        .map(
          (row: {
            bridgeAccountId: string | null;
            _count: { _all: number };
          }) => [row.bridgeAccountId as string, row._count._all],
        ),
    );
    const scored = bridges
      .map((bridge: any) => {
        const load = Number(loadByBridge.get(bridge.id) || 0);
        const capacity = Math.max(1, Number(bridge.capacityRunners || 1));
        return {
          ...bridge,
          load,
          capacity,
          available: load < capacity,
          ratio: load / capacity,
        };
      })
      .sort(
        (a: any, b: any) =>
          Number(!a.available) - Number(!b.available) ||
          a.ratio - b.ratio ||
          a.load - b.load ||
          a.name.localeCompare(b.name),
      );

    if (preferredId) {
      const preferred = scored.find(
        (bridge: any) => bridge.id === preferredId && bridge.available,
      );
      if (preferred) return preferred.id;
    }

    return (
      scored.find((bridge: any) => bridge.available)?.id ||
      scored[0]?.id ||
      null
    );
  }

  private async resolveBridgeAccountFromText(value: string) {
    const text = String(value || '');
    const bridgeNumber = text.match(/\bbridge\s*(\d+)\b/i)?.[1];
    if (!bridgeNumber) return null;
    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        mode: { not: 'PAUSED' },
        OR: [
          { workerKey: `bridge-${bridgeNumber.padStart(3, '0')}` },
          { name: { contains: `Bridge ${bridgeNumber}`, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return bridge?.id || null;
  }

  private async activeBotBridgeAccount() {
    const setting = await (this.prisma as any).appSetting.findUnique({
      where: { key: RUNNER_BOT_BRIDGE_ACCOUNT_ID_KEY },
    });
    const configuredBridgeId = this.clean(setting?.value);
    if (!configuredBridgeId) return null;

    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        id: configuredBridgeId,
        archivedAt: null,
        status: { in: ['ACTIVE', 'CONNECTED', 'READY', 'ONLINE'] },
        mode: { not: 'PAUSED' },
      },
      select: { id: true, name: true, phone: true, expectedPhone: true },
    });

    return bridge || null;
  }
}
