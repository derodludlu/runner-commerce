import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Phase1Service } from './phase1.service';

describe('Phase1Service', () => {
  const createService = (
    prisma: any = {},
    runnerService?: any,
    billingService?: any,
  ) =>
    new Phase1Service(
      {
        runner: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
          count: jest.fn(),
          ...prisma.runner,
        },
        shop: {
          findMany: jest.fn().mockResolvedValue([]),
          ...prisma.shop,
        },
        runnerShopLink: {
          count: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn(),
          findUnique: jest.fn(),
          delete: jest.fn(),
          updateMany: jest.fn(),
          ...prisma.runnerShopLink,
        },
        runnerListing: {
          updateMany: jest.fn(),
          ...prisma.runnerListing,
        },
        runnerRepostingGroup: {
          count: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          findUnique: jest.fn(),
          ...prisma.runnerRepostingGroup,
        },
        runnerSubmittedShopLink: {
          upsert: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
          update: jest.fn(),
          ...prisma.runnerSubmittedShopLink,
        },
        user: { findFirst: jest.fn(), ...prisma.user },
        role: {
          findUnique: jest.fn().mockResolvedValue({ id: 'customer-role' }),
          ...prisma.role,
        },
        runnerWallet: {
          upsert: jest.fn(),
          ...prisma.runnerWallet,
        },
        botSession: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
          ...prisma.botSession,
        },
        whatsAppBridgeAccount: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          ...prisma.whatsAppBridgeAccount,
        },
        whatsAppOutboundMessage: {
          create: jest.fn(),
          ...prisma.whatsAppOutboundMessage,
        },
        whatsAppGroupMapping: {
          findFirst: jest.fn(),
          ...prisma.whatsAppGroupMapping,
        },
        whatsAppDiscoveredGroupMember: {
          findMany: jest.fn().mockResolvedValue([]),
          ...prisma.whatsAppDiscoveredGroupMember,
        },
        appSetting: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
          ...prisma.appSetting,
        },
        $transaction:
          prisma.$transaction ||
          jest.fn((callbackOrOperations: any) =>
            typeof callbackOrOperations === 'function'
              ? callbackOrOperations({
                  user: { create: jest.fn(), update: jest.fn() },
                  runner: { create: jest.fn(), update: jest.fn() },
                  runnerWallet: { upsert: jest.fn() },
                  runnerRepostingGroup: { create: jest.fn() },
                  runnerListing: { updateMany: jest.fn() },
                  shop: { updateMany: jest.fn() },
                })
              : Promise.all(callbackOrOperations),
          ),
        manualPaymentRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
          ...prisma.manualPaymentRecord,
        },
        platformInvoice: {
          findFirst: jest.fn(),
          ...prisma.platformInvoice,
        },
        subscription: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
          ...prisma.subscription,
        },
      } as any,
      runnerService,
      billingService,
    );

  it('parses exact commands and natural language aliases', () => {
    const service = createService();

    expect(service.parseCommand('1')).toBe('WALKTHROUGH');
    expect(service.parseCommand('2')).toBe('REGISTER');
    expect(service.parseCommand('3')).toBe('SHOPS');
    expect(service.parseCommand('4')).toBe('SUBMIT_SHOP_LINKS');
    expect(service.parseCommand('5')).toBe('CONNECT_REPOSTING_GROUP');
    expect(service.parseCommand('6')).toBe('STATUS');
    expect(service.parseCommand('7')).toBe('SUPPORT');
    expect(service.parseCommand('START')).toBe('START');
    expect(service.parseCommand('PROCEED')).toBe('PROCEED');
    expect(service.parseCommand('EXIT')).toBe('EXIT');
    expect(service.parseCommand('CANCEL')).toBe('EXIT');
    expect(service.parseCommand('QUIT')).toBe('EXIT');
    expect(service.parseCommand('start afresh')).toBe('REGISTER');
    expect(service.parseCommand('restart registration')).toBe('REGISTER');
    expect(service.parseCommand('WALKTHROUGH')).toBe('WALKTHROUGH');
    expect(service.parseCommand('step by step guide')).toBe('WALKTHROUGH');
    expect(service.parseCommand('ORDERS')).toBe('ORDERS');
    expect(service.parseCommand('ORDER HELP')).toBe('ORDERS');
    expect(service.parseCommand('HOW TO ORDER')).toBe('ORDERS');
    expect(service.parseCommand('ORDER FOR +26876123456')).toBe('ORDERS');
    expect(service.parseCommand('ADD TO ORDER FOR +26876123456')).toBe(
      'ORDERS',
    );
    expect(service.parseCommand('BUY LIST')).toBe('BUYING');
    expect(service.parseCommand('SHOP 1')).toBe('BUYING');
    expect(service.parseCommand('SHOP 1 BOUGHT')).toBe('BUYING');
    expect(service.parseCommand('PACK LIST')).toBe('PACKING');
    expect(service.parseCommand('CUSTOMERS')).toBe('PACKING');
    expect(service.parseCommand('PACK 1 PACKED')).toBe('PACKING');
    expect(service.parseCommand('BILLING')).toBe('BILLING');
    expect(service.parseCommand('PLANS')).toBe('PLANS');
    expect(service.parseCommand('PLAN 2')).toBe('PLANS');
    expect(service.parseCommand('PAY RCINV-000001 150 EFT')).toBe('PAY');
    expect(service.parseCommand('PAY STATUS')).toBe('PAY');
    expect(service.parseCommand('Pause my reposts')).toBe('PAUSE');
    expect(service.parseCommand('PAUSE SHOP 1,2')).toBe('PAUSE');
    expect(service.parseCommand('RESUME SHOP 2')).toBe('RESUME');
    expect(service.parseCommand('STATS')).toBe('STATS');
    expect(service.parseCommand('posting metrics')).toBe('STATS');
    expect(service.parseCommand('MENU')).toBe('MENU');
    expect(service.parseCommand('MAIN')).toBe('MENU');
    expect(service.parseCommand('main menu')).toBe('MENU');
    expect(service.parseCommand('AGE 7 DAYS')).toBe('SET_AGE');
    expect(service.parseCommand('set age 3 days shop 1')).toBe('SET_AGE');
    expect(service.parseCommand('Show my groups')).toBe('GROUPS');
    expect(service.parseCommand('Repost products from yesterday')).toBe(
      'START',
    );
    expect(service.parseCommand('what is this?')).toBeNull();
  });

  it('gates unknown REGISTER text through the welcome interview first', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'REGISTER',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
  });

  it('starts unknown greetings with the standard welcome interview', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hi',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain(
      'Hi, welcome to Runner Commerce. I can help route you to the right place.',
    );
    expect(result.message).toContain(
      '1. CUSTOMER - order with an RC code or contact your runner',
    );
    expect(result.message).toContain(
      '2. RUNNER - register, setup, reposting, billing, or posting groups',
    );
    expect(result.message).toContain(
      '3. ADMIN / SUPPORT - get help from Runner Commerce support',
    );
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
  });

  it('shows the welcome interview on any incoming bridge number', async () => {
    const outboundCreate = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'active-bridge',
          phoneNumber: '+26876111111',
          displayName: 'Active Bot',
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      whatsAppOutboundMessage: { create: outboundCreate },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hi',
      bridgeAccountId: 'incoming-bridge',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'incoming-bridge',
          recipientPhone: '+26876000000',
          messageText: expect.stringContaining('1. CUSTOMER'),
        }),
      }),
    );
  });

  it('routes customer choice from the welcome interview to order code handling', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '1',
    });

    expect(result.command).toBe('CUSTOMER_ORDER_CODE_REQUIRED');
    expect(result.message).toContain('Please send the RC order code');
    expect(result.message).not.toContain('/register');
    expect(result.message).not.toContain('/login');
  });

  it('routes runner choice from the welcome interview to the existing runner menu', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '2',
    });

    expect(result.command).toBe('WELCOME');
    expect(result.message).toContain('2. REGISTER - register as a runner');
    expect(result.message).toContain('6. STATUS - check setup readiness');
  });

  it('routes support choice from the welcome interview to support guidance', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '3',
    });

    expect(result.command).toBe('SUPPORT');
    expect(result.message).toContain('Support request noted');
    expect(result.message).toContain('WhatsApp support: https://wa.me/');
  });

  it('gates unknown product-like messages through the welcome interview first', async () => {
    const outboundCreate = jest.fn();
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
      whatsAppOutboundMessage: { create: outboundCreate },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876230918',
      messageText: 'R450',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('1. CUSTOMER - order with an RC code');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
    expect(outboundCreate).not.toHaveBeenCalled();
  });

  it('gates unknown free text after a session expires', async () => {
    const outboundCreate = jest.fn();
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      runner: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        }),
        upsert: botSessionUpsert,
      },
      whatsAppOutboundMessage: { create: outboundCreate },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876230918',
      messageText: 'R450',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
    expect(outboundCreate).not.toHaveBeenCalled();
  });

  it('recognizes registered runners saved with local phone formats', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const serialized = JSON.stringify(where);
          if (
            serialized.includes('"76000000"') &&
            serialized.includes('"runner"')
          ) {
            return {
              id: 'user-1',
              name: 'Nomsa',
              phone: null,
              role: { name: 'RUNNER' },
              runner: {
                id: 'runner-1',
                status: 'ACTIVE',
                repostingStatus: 'NOT_STARTED',
                phone: '76000000',
              },
            };
          }
          return null;
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hi',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          runnerId: 'runner-1',
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
  });

  it('recognizes registered runners through runner phone when user phone lookup misses', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      runner: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'runner-1',
          status: 'ACTIVE',
          repostingStatus: 'NOT_STARTED',
          phone: '+26878259039',
          user: {
            id: 'user-1',
            name: 'Dero Dludlu',
            phone: null,
            role: { name: 'RUNNER' },
          },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'Hi',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          runnerId: 'runner-1',
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
  });

  it('routes known runner choice from the welcome interview to the existing runner welcome', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Nomsa',
          phone: '+26876000000',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            repostingStatus: 'NOT_STARTED',
            phone: '+26876000000',
          },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '2',
    });

    expect(result.command).toBe('WELCOME');
    expect(result.message).toContain('Welcome back, Nomsa');
    expect(result.message).toContain('Your runner profile is active');
  });

  it('gates old welcome menu number replies through the interview first', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '2',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
  });

  it('asks for an RC code for customer-like unknown text', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'I want to order',
    });

    expect(result.command).toBe('CUSTOMER_ORDER_CODE_REQUIRED');
    expect(result.message).toContain('Please send the RC order code');
    expect(result.message).not.toContain('/register');
    expect(result.message).not.toContain('/login');
  });

  it.each(['MENU', 'MAIN', 'MAIN MENU'])(
    'returns non-runner %s replies to the main welcome interview',
    async (messageText) => {
      const service = createService({
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'CUSTOMER_ORDER_CODE_REQUIRED',
            context: { customerRedirectRunnerIds: ['runner-1'] },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
      });

      const result: any = await service.handleBotMessage({
        whatsappNumber: '+26876000000',
        messageText,
      });

      expect(result.command).toBe('WELCOME_INTERVIEW');
      expect(result.message).toContain('Please choose one:');
      expect(result.message).toContain('1. CUSTOMER - order with an RC code');
    },
  );

  it('redirects a customer choice found in one runner posting group to that runner', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
      whatsAppDiscoveredGroupMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            discoveredGroupId: 'disc-1',
            groupId: 'group-1@g.us',
            discoveredGroup: { groupId: 'group-1@g.us', name: 'Dero Deals' },
          },
        ]),
      },
      runnerRepostingGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'posting-1',
            runner: {
              id: 'runner-1',
              status: 'ACTIVE',
              phone: '+26876111111',
              user: { name: 'Dero Runner', phone: '+26876111111' },
            },
          },
        ]),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '1',
    });

    expect(result.command).toBe('CUSTOMER_REDIRECT');
    expect(result.message).toContain(
      'This number is only for Runner Commerce posting',
    );
    expect(result.message).toContain('Dero Runner https://wa.me/26876111111');
    expect(result.message).toContain('send the RC order code');
  });

  it('asks for the order code when a customer choice is found in multiple runner posting groups', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME_INTERVIEW',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
      whatsAppDiscoveredGroupMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            discoveredGroupId: 'disc-1',
            groupId: 'group-1@g.us',
            discoveredGroup: { groupId: 'group-1@g.us', name: 'Dero Deals' },
          },
        ]),
      },
      runnerRepostingGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'posting-1',
            runner: {
              id: 'runner-1',
              status: 'ACTIVE',
              phone: '+26876111111',
              user: { name: 'Dero Runner', phone: '+26876111111' },
            },
          },
          {
            id: 'posting-2',
            runner: {
              id: 'runner-2',
              status: 'ACTIVE',
              phone: '+26876222222',
              user: { name: 'Nomsa Runner', phone: '+26876222222' },
            },
          },
        ]),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '1',
    });

    expect(result.command).toBe('CUSTOMER_ORDER_CODE_REQUIRED');
    expect(result.message).toContain('ORDER CODE NEEDED');
    expect(result.message).toContain('Please send the RC order code');
    expect(result.message).toContain(
      'Support: https://wa.me/26876154884?text=I%20need%20help%20finding%20my%20runner%20or%20order%20code',
    );
    expect(result.message).not.toContain('more than one runner posting group');
    expect(result.contextPatch.customerRedirectRunnerIds).toEqual([
      'runner-1',
      'runner-2',
    ]);
  });

  it('responds to unknown private media messages that have no text', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '',
      mediaUrls: ['https://example.test/customer-reference.jpg'],
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
  });

  it('does not redirect RC order code text inside the Phase 1 bot path', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
      whatsAppDiscoveredGroupMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            discoveredGroupId: 'disc-1',
            groupId: 'group-1@g.us',
            discoveredGroup: { groupId: 'group-1@g.us', name: 'Dero Deals' },
          },
        ]),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'ORDER RC-ABC123',
    });

    expect(result.command).toBe('WELCOME_IGNORED');
    expect(botSessionUpsert).not.toHaveBeenCalled();
  });

  it('gates unknown option 1 through the welcome interview first', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '1',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
  });

  it('gates unknown option 7 through the welcome interview first', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '7',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('3. ADMIN / SUPPORT');
  });

  it('stops registration cleanly when the user exits', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_CONFIRM_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Thandi Dlamini' },
            pendingRegistrationConfirmation: {
              field: 'shopTown',
              value: 'stuck',
              nextStep: 'REGISTER_DELIVERY_TOWN',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'EXIT',
    });

    expect(result.command).toBe('EXIT');
    expect(result.message).toContain('This interaction is stopped for now');
    expect(result.message).toContain(
      'Reply MENU to return to the main interview',
    );
    expect(result.message).toContain('Reply REGISTER to register as a runner');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          context: expect.objectContaining({
            customerRedirectRunnerIds: [],
            registrationDraft: {},
            pendingRegistrationConfirmation: null,
            runnerControlMode: null,
            submittedShopLinks: [],
          }),
        }),
      }),
    );
  });

  it.each(['CANCEL', 'QUIT'])(
    'clears transient interaction context when the user sends %s',
    async (messageText) => {
      const botSessionUpsert = jest.fn();
      const service = createService({
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'CUSTOMER_ORDER_CODE_REQUIRED',
            context: {
              customerRedirectRunnerIds: ['runner-1'],
              menuActive: true,
              pendingRepostingGroup: {
                inviteLink: 'https://chat.whatsapp.com/demo',
              },
              pendingRunnerSubscription: { planCode: 'RUNNER_STARTER' },
              submittedShopLinks: ['https://chat.whatsapp.com/shop'],
            },
            updatedAt: new Date(),
          }),
          upsert: botSessionUpsert,
        },
      });

      const result: any = await service.handleBotMessage({
        whatsappNumber: '+26876000000',
        messageText,
      });

      expect(result.command).toBe('EXIT');
      expect(result.message).toContain('This interaction is stopped for now');
      expect(botSessionUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            currentStep: 'EXIT',
            runnerId: null,
            context: expect.objectContaining({
              customerRedirectRunnerIds: [],
              menuActive: null,
              pendingRepostingGroup: null,
              pendingRunnerSubscription: null,
              submittedShopLinks: [],
            }),
          }),
        }),
      );
    },
  );

  it('starts registration afresh with a clean draft', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_CONFIRM_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Old Name', shopTown: 'Wrong' },
            pendingRegistrationConfirmation: {
              field: 'shopTown',
              value: 'Wrong',
              nextStep: 'REGISTER_DELIVERY_TOWN',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'start afresh',
    });

    expect(result.command).toBe('REGISTER_NAME');
    expect(result.message).toContain('Question 1 of 4');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          context: expect.objectContaining({
            registrationDraft: {},
            pendingRegistrationConfirmation: null,
          }),
        }),
      }),
    );
  });

  it('keeps the same registration question when user asks for help', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Thandi Dlamini' },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'HELP',
    });

    expect(result.command).toBe('REGISTER_SHOP_TOWN');
    expect(result.message).toContain('Registration help');
    expect(result.message).toContain('Question 2 of 4');
    expect(result.message).toContain('shop and supplier matching');
    expect(result.message).toContain('PROCEED to continue');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('keeps registration place when user asks for support', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_DELIVERY_TOWN',
          context: {
            registrationDraft: {
              name: 'Thandi Dlamini',
              shopTown: 'Manzini',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'SUPPORT',
    });

    expect(result.command).toBe('REGISTER_DELIVERY_TOWN');
    expect(result.message).toContain('Support noted');
    expect(result.message).toContain('Question 3 of 4');
    expect(result.message).toContain('deliver to or serve customers');
    expect(result.message).toContain('EXIT to stop');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('repeats the registration question for obvious non-answers', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Thandi Dlamini' },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'stuck',
    });

    expect(result.command).toBe('REGISTER_SHOP_TOWN');
    expect(result.message).toContain('I could not use that answer');
    expect(result.message).toContain('Question 2 of 4');
    expect(result.message).toContain('shop and supplier matching');
    expect(result.message).toContain('SUPPORT for admin help');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('repeats the registration question for keyboard mash text', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Thandi Dlamini' },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'fguhilkgnubhuijlk',
    });

    expect(result.command).toBe('REGISTER_SHOP_TOWN');
    expect(result.message).toContain('I could not use that answer');
    expect(result.message).toContain('Question 2 of 4');
    expect(result.message).not.toContain(
      'Please confirm the answer I captured',
    );
  });

  it('asks for confirmation after capturing a registration answer', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_NAME',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Thandi Dlamini',
    });

    expect(result.command).toBe('REGISTER_CONFIRM_NAME');
    expect(result.message).toContain('Please confirm the answer I captured');
    expect(result.message).toContain('Full name: Thandi Dlamini');
    expect(result.message).toContain('Reply YES to confirm');
    expect(result.message).toContain('Reply NO to change it');
  });

  it('continues registration after confirmed captured answer', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_CONFIRM_NAME',
          context: {
            registrationDraft: {},
            pendingRegistrationConfirmation: {
              field: 'name',
              value: 'Thandi Dlamini',
              nextStep: 'REGISTER_SHOP_TOWN',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'YES',
    });

    expect(result.command).toBe('REGISTER_SHOP_TOWN');
    expect(result.message).toContain('Question 2 of 4');
    expect(result.message).toContain('shop and supplier matching');
  });

  it('completes registration after products are confirmed and points to shops first', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      id: 'user-1',
      runner: null,
      role: { name: 'RUNNER' },
    });
    const runnerCreate = jest.fn().mockResolvedValue({ id: 'runner-1' });
    const groupCreate = jest.fn();
    const transaction = jest.fn((callback: any) =>
      callback({
        user: { create: userCreate },
        runner: { create: runnerCreate },
        runnerWallet: { upsert: jest.fn() },
        runnerRepostingGroup: { create: groupCreate },
      }),
    );
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'runner-role' }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_CONFIRM_SELLS',
          context: {
            registrationDraft: {
              name: 'Thandi Dlamini',
              shopTown: 'Durban',
              deliveryTown: 'Manzini',
            },
            pendingRegistrationConfirmation: {
              field: 'sells',
              value: 'Clothing and shoes',
              nextStep: 'REGISTER_COMPLETE',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: transaction,
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'YES',
    });

    expect(result.command).toBe('REGISTER');
    expect(result.message).toContain('Runner registration active');
    expect(result.message).toContain(
      '1. Reply SHOPS to choose available shop groups.',
    );
    expect(result.message).toContain(
      '2. After selecting shops, reply GROUPS to connect your posting group.',
    );
    expect(result.message).not.toContain('Question 5 of 5');
    expect(result.message).not.toContain('posting group invite link now');
    expect(groupCreate).not.toHaveBeenCalled();
  });

  it('repeats registration question when captured answer is rejected', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_CONFIRM_SHOP_TOWN',
          context: {
            registrationDraft: { name: 'Thandi Dlamini' },
            pendingRegistrationConfirmation: {
              field: 'shopTown',
              value: 'stuck',
              nextStep: 'REGISTER_DELIVERY_TOWN',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'NO',
    });

    expect(result.command).toBe('REGISTER_SHOP_TOWN');
    expect(result.message).toContain('Question 2 of 4');
    expect(result.message).toContain('Reply with the shop/source town only');
  });

  it('gates unknown walkthrough text through the welcome interview first', async () => {
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'WALKTHROUGH',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
    expect(result.message).toContain('1. CUSTOMER - order with an RC code');
  });

  it('returns the WhatsApp-only admin walkthrough for superusers', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN WALKTHROUGH',
    });

    expect(result.command).toBe('ADMIN_WALKTHROUGH');
    expect(result.message).toContain('WhatsApp-only admin walkthrough');
    expect(result.message).toContain('ADMIN APPROVALS');
    expect(result.message).not.toContain('ADMIN MERGE');
    expect(result.message).toContain('ADMIN VERIFY 1');
    expect(result.message).toContain('manual support fallback');
    expect(result.message).toContain('trust the seamless path first');
  });

  it('lists Phase 1 runners for admin bot commands', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'runner-1',
            status: 'ACTIVE',
            phone: '+26876000000',
            trialStatus: 'TRIAL_ACTIVE',
            subscriptionStatus: 'PENDING_SUBSCRIPTION',
            repostingStatus: 'NOT_STARTED',
            user: { name: 'Dev Runner', phone: '+26876000000' },
            subscriptions: [],
            shopAssignments: [],
            repostingGroups: [],
            submittedShopLinks: [],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN RUNNERS',
    });

    expect(result.command).toBe('ADMIN_RUNNERS');
    expect(result.message).toContain('Dev Runner');
    expect(result.contextPatch.adminRunnerOptions[0].id).toBe('runner-1');
  });

  it('verifies a reposting group through the admin bot', async () => {
    const runnerRepostingGroup = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'group-1' })
        .mockResolvedValueOnce({
          id: 'group-1',
          groupName: 'TestRC',
          status: 'RUNNER_CONFIRMED_ADMIN',
          botJoinStatus: 'JOINED_GROUP',
          botAdminStatus: 'ADMIN_STATUS_PENDING',
          bridgeAccountId: null,
          whatsappGroupId: null,
          discoveredGroupId: null,
          runner: { bridgeAccountId: null },
          discoveredGroup: null,
        }),
      update: jest.fn().mockResolvedValue({
        id: 'group-1',
        groupName: 'TestRC',
        status: 'READY_FOR_REPOSTING',
        botJoinStatus: 'JOINED_GROUP',
        botAdminStatus: 'ADMIN_VERIFIED',
      }),
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'ADMIN' },
          runner: null,
        }),
      },
      runnerRepostingGroup,
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'ADMIN_RUNNER',
          context: {
            adminGroupOptions: [{ id: 'group-1', groupName: 'TestRC' }],
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN VERIFY 1 NOAUTO',
    });

    expect(result.command).toBe('ADMIN_VERIFY');
    expect(result.message).toContain('Verified reposting group: TestRC');
    expect(runnerRepostingGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'group-1' },
        data: expect.objectContaining({
          status: 'READY_FOR_REPOSTING',
          botAdminStatus: 'ADMIN_VERIFIED',
        }),
      }),
    );
  });

  it('enrols a new runner from a REGISTER bot follow-up', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      id: 'user-1',
      runner: null,
      role: { name: 'RUNNER' },
    });
    const runnerCreate = jest.fn().mockResolvedValue({ id: 'runner-1' });
    const walletUpsert = jest.fn().mockResolvedValue({});
    const groupCreate = jest.fn().mockResolvedValue({ id: 'group-1' });
    const botSessionUpsert = jest.fn();
    const outboundCreate = jest.fn().mockResolvedValue({});
    const transaction = jest.fn((callback: any) =>
      callback({
        user: { create: userCreate },
        runner: { create: runnerCreate },
        runnerWallet: { upsert: walletUpsert },
        runnerRepostingGroup: { create: groupCreate },
      }),
    );
    const service = createService({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'runner-role' }),
      },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bridge-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'bridge-1' }]),
      },
      whatsAppOutboundMessage: { create: outboundCreate },
      $transaction: transaction,
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: [
        'Name: New Runner',
        'Shop town: Durban',
        'Delivery town: Manzini',
        'What you sell: Clothing and shoes',
        'Posting group link: https://chat.whatsapp.com/abcdef',
      ].join('\n'),
    });

    expect(result.command).toBe('REGISTER');
    expect(result.runnerId).toBe('runner-1');
    expect(result.message).toContain('Runner registration active');
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Runner',
          phone: '+26876000000',
          roleId: 'runner-role',
          passwordResetRequired: true,
        }),
      }),
    );
    const createdPasswordHash = userCreate.mock.calls[0][0].data.passwordHash;
    const queuedPasswordMessage =
      outboundCreate.mock.calls[0][0].data.messageText;
    const temporaryPassword = queuedPasswordMessage.match(
      /Temporary password: (.+)/,
    )?.[1];
    expect(temporaryPassword).toMatch(/^RC-[A-F0-9]{8}$/);
    await expect(
      bcrypt.compare(temporaryPassword as string, createdPasswordHash),
    ).resolves.toBe(true);
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'bridge-1',
          recipientPhone: '+26876000000',
          messageType: 'RUNNER_TEMPORARY_PASSWORD',
          messageText: expect.stringContaining('RUNNER LOGIN DETAILS'),
        }),
      }),
    );
    expect(result.message).not.toContain(
      'Your temporary login password has been sent to this WhatsApp number.',
    );
    expect(runnerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+26876000000',
          serviceArea: 'Manzini',
          status: 'ACTIVE',
          trialStatus: 'TRIAL_ACTIVE',
          phase1Setup: expect.objectContaining({
            source: 'WHATSAPP_BOT',
            shopTown: 'Durban',
            deliveryTown: 'Manzini',
            sells: 'Clothing and shoes',
          }),
        }),
      }),
    );
    expect(walletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runnerId: 'runner-1' },
        create: { runnerId: 'runner-1', balance: 0, pending: 0 },
      }),
    );
    expect(groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runnerId: 'runner-1',
          groupName: 'Posting group',
          inviteLink: 'https://chat.whatsapp.com/abcdef',
          isTestGroup: false,
          status: 'GROUP_LINK_RECEIVED',
        }),
      }),
    );
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ runnerId: 'runner-1' }),
      }),
    );
    expect(result.message).toContain(
      '1. Reply SHOPS to choose available shop groups.',
    );
    expect(result.message).toContain(
      '2. After selecting shops, reply GROUPS to connect your posting group.',
    );
  });

  it('starts already registered runner greetings with the standard welcome interview', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Nomsa',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            repostingStatus: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hi',
    });

    expect(result.command).toBe('WELCOME_INTERVIEW');
    expect(result.message).toContain('Please choose one:');
    expect(result.message).toContain('2. RUNNER - register, setup');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          runnerId: 'runner-1',
          currentStep: 'WELCOME_INTERVIEW',
        }),
      }),
    );
  });

  it('routes registered runner greetings from WELCOME back to the current setup step', async () => {
    const runnerRecord = {
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Dero Dludlu', phone: '+26878259039' },
      subscriptions: [],
      shopAssignments: [],
      repostingGroups: [
        {
          id: 'group-1',
          groupName: 'RunnerReg(TEST)',
          inviteLink: 'https://chat.whatsapp.com/test',
          isTestGroup: false,
          status: 'READY_FOR_REPOSTING',
          botJoinStatus: 'JOINED_GROUP',
          botAdminStatus: 'ADMIN_VERIFIED',
          whatsappGroupId: '120@g.us',
          discoveredGroupId: null,
          discoveredGroup: null,
          bridgeAccountId: null,
          runnerConfirmedAdminAt: new Date(),
          adminVerifiedAt: new Date(),
        },
      ],
      bridgeAccount: null,
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: { findUnique: jest.fn().mockResolvedValue(runnerRecord) },
      shop: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'shop-1',
            name: 'Durban Deals',
            procurementCity: 'Durban',
            _count: { products: 12 },
            whatsappGroupMappings: [
              {
                sourceGroup: 'Durban Deals Source',
                isPrimarySource: true,
              },
            ],
          },
          {
            id: 'shop-2',
            name: 'Manzini Fashion',
            procurementCity: 'Manzini',
            _count: { products: 8 },
            whatsappGroupMappings: [
              {
                sourceGroup: 'Manzini Fashion Source',
                isPrimarySource: true,
              },
            ],
          },
        ]),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'Hi',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('You are already registered');
    expect(result.message).toContain('Here are the available shop groups');
    expect(result.message).toContain('Available shops: showing 2 of 2');
    expect(result.message).toContain('1. Durban Deals - Durban');
    expect(result.message).toContain('Reply SELECT 1,2,3');
    expect(result.message).not.toContain('1. Register as a runner');
  });

  it('routes registered runners with shops but no posting group to GROUPS', async () => {
    const runnerRecord = {
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Dero Dludlu', phone: '+26878259039' },
      subscriptions: [],
      shopAssignments: [
        {
          id: 'link-1',
          shopId: 'shop-1',
          status: 'APPROVED',
          selectedForTest: true,
          selectedForLive: false,
          autoPostEnabled: true,
          joinedAt: new Date(),
          shop: {
            name: 'Durban Deals',
            procurementCity: 'Durban',
            whatsappGroupMappings: [],
          },
        },
      ],
      repostingGroups: [],
      bridgeAccount: null,
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: { findUnique: jest.fn().mockResolvedValue(runnerRecord) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'Hi',
    });

    expect(result.command).toBe('GROUPS');
    expect(result.message).toContain('You are already registered');
    expect(result.message).toContain(
      'Current setup step: connect or review your posting groups',
    );
    expect(result.message).toContain(
      'send one WhatsApp group invite link at a time',
    );
  });

  it('shows current posting summary for already registered active runners', async () => {
    const runnerRecord = {
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'ACTIVE',
      autoPostEnabled: true,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Dero Dludlu', phone: '+26878259039' },
      subscriptions: [],
      shopAssignments: [
        {
          id: 'link-1',
          shopId: 'shop-1',
          status: 'APPROVED',
          selectedForTest: true,
          selectedForLive: false,
          autoPostEnabled: true,
          joinedAt: new Date(),
          shop: {
            name: 'Durban Deals',
            procurementCity: 'Durban',
            whatsappGroupMappings: [],
          },
        },
        {
          id: 'link-2',
          shopId: 'shop-2',
          status: 'APPROVED',
          selectedForTest: true,
          selectedForLive: false,
          autoPostEnabled: true,
          joinedAt: new Date(),
          shop: {
            name: 'Manzini Fashion',
            procurementCity: 'Manzini',
            whatsappGroupMappings: [],
          },
        },
      ],
      repostingGroups: [
        {
          id: 'group-1',
          groupName: 'RunnerReg',
          inviteLink: 'https://chat.whatsapp.com/test',
          isTestGroup: false,
          status: 'READY_FOR_REPOSTING',
          botJoinStatus: 'JOINED_GROUP',
          botAdminStatus: 'ADMIN_VERIFIED',
          whatsappGroupId: '120@g.us',
          discoveredGroupId: null,
          discoveredGroup: null,
          bridgeAccountId: null,
          runnerConfirmedAdminAt: new Date(),
          adminVerifiedAt: new Date(),
        },
      ],
      bridgeAccount: null,
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: { findUnique: jest.fn().mockResolvedValue(runnerRecord) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'Hi',
    });

    expect(result.command).toBe('START');
    expect(result.message).toContain(
      'Currently posting from 2 shops to RunnerReg.',
    );
    expect(result.message).not.toContain(
      'Reply START to begin reposting selected shop products to your posting group.',
    );
  });

  it('shows the RunnerBot main menu to registered runners', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'MENU',
    });

    expect(result.command).toBe('MENU');
    expect(result.message).toContain('RUNNERBOT MAIN MENU');
    expect(result.message).toContain('6. STATS');
    expect(result.message).toContain('8. BILLING');
    expect(result.message).toContain('10. PAY');
  });

  it('keeps registered runner STOP mapped to reposting stop control', async () => {
    const shopUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const shopCount = jest.fn().mockResolvedValue(0);
    const runnerUpdate = jest.fn().mockResolvedValue({});
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: { update: runnerUpdate },
      runnerShopLink: { updateMany: shopUpdateMany, count: shopCount },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'STOP',
    });

    expect(result.command).toBe('STOP');
    expect(result.message).toContain('Reposting has been stopped');
    expect(shopUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { autoPostEnabled: false } }),
    );
    expect(runnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'runner-1' },
        data: expect.objectContaining({ repostingStatus: 'STOPPED' }),
      }),
    );
  });

  it('routes menu numbers only from the menu context', async () => {
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'user-1',
            name: 'Dero Dludlu',
            role: { name: 'RUNNER' },
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            userId: 'user-1',
            user: { phone: '+26878259039' },
            subscriptions: [],
            billingInvoices: [],
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'MENU',
            context: { menuActive: true },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
      },
      undefined,
      {},
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: '8',
    });

    expect(result.command).toBe('BILLING');
    expect(result.message).toContain('Runner Commerce billing');
  });

  it('welcomes a known non-runner user at the start of a new chat session', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Anele',
          role: { name: 'CUSTOMER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hello',
    });

    expect(result.command).toBe('WELCOME');
    expect(result.message).toContain('Welcome back, Anele');
    expect(result.message).toContain('not connected to a runner profile yet');
    expect(result.message).toContain('Reply REGISTER to register');
    expect(result.message).not.toContain(
      'Reply 2 for customer or non-business',
    );
    expect(result.message).toContain('Reply SUPPORT to contact support');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('keeps known non-runner STATUS on the runner registration prompt', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Anele',
          role: { name: 'CUSTOMER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('STATUS');
    expect(result.message).toContain('Phase 1 status');
    expect(result.message).toContain(
      'I do not see an approved runner profile for this WhatsApp number yet.',
    );
  });
  it('lets a known non-runner start registration with option 2', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Anele',
          role: { name: 'CUSTOMER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '2',
    });

    expect(result.command).toBe('REGISTER_NAME');
    expect(result.message).toContain('What is your full name');
  });

  it('lets a registered superuser start RunnerBot registration', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'REGISTER',
    });

    expect(result.command).toBe('REGISTER_PHONE');
    expect(result.message).toContain('Runner registration');
    expect(result.message).toContain('What is the runner WhatsApp number');
    expect(result.message).not.toContain('Runner Commerce Admin Bot');
  });

  it('guides a superuser through the runner WhatsApp number first', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER_PHONE',
          context: { registrationDraft: { assistedRegistration: true } },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: '+26876000000',
    });

    expect(result.command).toBe('REGISTER_CONFIRM_PHONE');
    expect(result.message).toContain('Runner WhatsApp: +26876000000');
    expect(result.contextPatch.pendingRegistrationConfirmation).toEqual(
      expect.objectContaining({
        field: 'phone',
        value: '+26876000000',
        nextStep: 'REGISTER_NAME',
      }),
    );
  });
  it('lets a superuser register a runner with the runner WhatsApp number', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      id: 'runner-user-1',
      role: { name: 'RUNNER' },
      runner: null,
    });
    const runnerCreate = jest.fn().mockResolvedValue({ id: 'runner-1' });
    const walletUpsert = jest.fn().mockResolvedValue({});
    const outboundCreate = jest.fn().mockResolvedValue({});
    const transaction = jest.fn((callback: any) =>
      callback({
        user: { create: userCreate, update: jest.fn() },
        runner: { create: runnerCreate },
        runnerWallet: { upsert: walletUpsert },
        runnerRepostingGroup: { create: jest.fn() },
      }),
    );
    const service = createService({
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'admin-1',
            name: 'Mxolisi',
            phone: '+26876111111',
            status: 'ACTIVE',
            role: { name: 'SUPERUSER' },
            runner: null,
          })
          .mockResolvedValueOnce(null),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'runner-role' }),
      },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bridge-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'bridge-1' }]),
      },
      whatsAppOutboundMessage: { create: outboundCreate },
      $transaction: transaction,
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: [
        'Name: Nomsa Dlamini',
        'Runner WhatsApp: +26876000000',
        'Shop town: Durban',
        'Delivery town: Manzini',
        'What you sell: Clothing and shoes',
      ].join('\n'),
    });

    expect(result.command).toBe('REGISTER');
    expect(result.runnerId).toBe('runner-1');
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Nomsa Dlamini',
          phone: '+26876000000',
          roleId: 'runner-role',
        }),
      }),
    );
    expect(runnerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: { connect: { id: 'runner-user-1' } },
          phone: '+26876000000',
          serviceArea: 'Manzini',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'bridge-1',
          recipientPhone: '+26876000000',
          messageType: 'RUNNER_TEMPORARY_PASSWORD',
        }),
      }),
    );
  });
  it('routes SHOPS to the newly registered runner after assisted registration', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          userId: 'runner-user-1',
          status: 'ACTIVE',
          trialStatus: 'TRIAL_ACTIVE',
          trialEndsAt: new Date(Date.now() + 86400000),
          subscriptionStatus: 'PENDING_SUBSCRIPTION',
          repostingStatus: 'NOT_STARTED',
          autoPostEnabled: false,
          autoPostIntervalMinutes: 30,
          maxPostsPerRun: 30,
          lastAutoPostAt: null,
          whatsappGroup: null,
          user: { id: 'runner-user-1', name: 'Nomsa', phone: '+26876000000' },
          subscriptions: [],
          shopAssignments: [],
          repostingGroups: [],
          bridgeAccount: null,
          submittedShopLinks: [],
        }),
      },
      shop: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'shop-1',
            name: 'Durban Deals',
            procurementCity: 'Durban',
            _count: { products: 12 },
            whatsappGroupMappings: [
              { sourceGroup: 'Durban Deals Source', isPrimarySource: true },
            ],
          },
        ]),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          runnerId: 'runner-1',
          currentStep: 'REGISTER',
          context: {
            registeredRunnerId: 'runner-1',
            enrolmentStatus: 'ACTIVE',
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'SHOPS',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('Available shops: showing 1 of 1');
    expect(result.message).toContain('1. Durban Deals - Durban');
    expect(result.message).toContain('Reply SELECT 1,2,3');
    expect(result.message).not.toContain('What is your full name');
    expect(result.message).not.toContain('What is the runner WhatsApp number');
  });
  it('asks a superuser for the runner WhatsApp number before creating a runner', async () => {
    const runnerCreate = jest.fn();
    const transaction = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'REGISTER',
          context: {},
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
      runner: { create: runnerCreate },
      $transaction: transaction,
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: [
        'Name: Nomsa Dlamini',
        'Shop town: Durban',
        'Delivery town: Manzini',
        'What you sell: Clothing and shoes',
      ].join('\n'),
    });

    expect(result.command).toBe('REGISTER_PHONE');
    expect(result.message).toContain('What is the runner WhatsApp number');
    expect(transaction).not.toHaveBeenCalled();
    expect(runnerCreate).not.toHaveBeenCalled();
  });
  const runnerStatusRecord = () => ({
    id: 'runner-1',
    userId: 'runner-user-1',
    phone: '+26876000000',
    status: 'ACTIVE',
    trialStatus: 'TRIAL_ACTIVE',
    trialStartsAt: new Date(Date.now() - 86400000),
    trialEndsAt: new Date(Date.now() + 86400000),
    subscriptionStatus: 'PENDING_SUBSCRIPTION',
    repostingStatus: 'NOT_STARTED',
    autoPostEnabled: false,
    autoPostIntervalMinutes: 30,
    maxPostsPerRun: 30,
    lastAutoPostAt: null,
    whatsappGroup: null,
    bridgeAccountId: null,
    user: {
      id: 'runner-user-1',
      name: 'Nomsa Dlamini',
      phone: '+26876000000',
      email: null,
    },
    subscriptions: [],
    shopAssignments: [],
    repostingGroups: [],
    bridgeAccount: null,
    submittedShopLinks: [],
  });

  it('lets a superuser operate as a selected runner from RunnerBot', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue(runnerStatusRecord()),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'ADMIN_RUNNERS',
          runnerId: null,
          context: {
            adminRunnerOptions: [
              { id: 'runner-1', name: 'Nomsa Dlamini', phone: '+26876000000' },
            ],
          },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN USE RUNNER 1',
    });

    expect(result.command).toBe('ADMIN_USE_RUNNER');
    expect(result.runnerId).toBe('runner-1');
    expect(result.contextPatch.runnerControlMode).toBe(true);
    expect(result.contextPatch.registeredRunnerId).toBe('runner-1');
    expect(result.message).toContain('Now controlling runner: Nomsa Dlamini');
    expect(result.message).toContain(
      'Reply EXIT to leave this runner control session completely',
    );
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          runnerId: 'runner-1',
          context: expect.objectContaining({
            runnerControlMode: true,
            registeredRunnerId: 'runner-1',
          }),
        }),
      }),
    );
  });

  it('routes runner commands through runner-control mode for a superuser', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue(runnerStatusRecord()),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'ADMIN_USE_RUNNER',
          runnerId: 'runner-1',
          context: {
            runnerControlMode: true,
            registeredRunnerId: 'runner-1',
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('STATUS');
    expect(result.message).toContain('Runner Commerce Status');
    expect(result.message).not.toContain('Runner Commerce Admin Bot');
  });

  it('routes reposting group links through runner-control mode for a superuser', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue(runnerStatusRecord()),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          runnerId: 'runner-1',
          context: {
            runnerControlMode: true,
            registeredRunnerId: 'runner-1',
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'https://chat.whatsapp.com/RunnerPostingGroup123',
    });

    expect(result.command).toBe('CONNECT_REPOSTING_GROUP');
    expect(result.message).toContain('Group link received.');
    expect(result.message).toContain(
      'Reply YES to save this customer advertising posting group',
    );
    expect(result.contextPatch.pendingRepostingGroup.inviteLink).toBe(
      'https://chat.whatsapp.com/RunnerPostingGroup123',
    );
    expect(result.message).not.toContain('admin review');
    expect(result.message).not.toContain(
      'Reply REGISTER if you have not registered yet',
    );
  });

  it('queues automatic bot joining after confirming a runner-control group link', async () => {
    const runnerRepostingGroupCreate = jest.fn().mockResolvedValue({
      id: 'group-1',
      runnerId: 'runner-1',
      inviteLink: 'https://chat.whatsapp.com/RunnerPostingGroup123',
      groupName: 'Posting group',
      isTestGroup: false,
      status: 'GROUP_LINK_RECEIVED',
      botJoinStatus: 'GROUP_LINK_RECEIVED',
      botAdminStatus: 'ADMIN_STATUS_PENDING',
      bridgeAccountId: 'bridge-1',
      createdAt: new Date(),
      whatsappGroupId: null,
      discoveredGroupId: null,
      discoveredGroup: null,
    });
    const runnerRepostingGroupUpdate = jest.fn();
    const outboundCreate = jest.fn().mockResolvedValue({ id: 'join-job-1' });
    const runnerRecord = {
      ...runnerStatusRecord(),
      bridgeAccountId: 'bridge-1',
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue(runnerRecord),
      },
      runnerRepostingGroup: {
        create: runnerRepostingGroupCreate,
        update: runnerRepostingGroupUpdate,
      },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bridge-1' }),
      },
      whatsAppOutboundMessage: {
        create: outboundCreate,
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          runnerId: 'runner-1',
          context: {
            runnerControlMode: true,
            registeredRunnerId: 'runner-1',
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/RunnerPostingGroup123',
              isTestGroup: false,
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'YES',
    });

    expect(result.command).toBe('GROUPS');
    expect(result.message).toContain('The bot is joining automatically.');
    expect(runnerRepostingGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runnerId: 'runner-1',
          inviteLink: 'https://chat.whatsapp.com/RunnerPostingGroup123',
          bridgeAccountId: 'bridge-1',
        }),
      }),
    );
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'bridge-1',
          messageType: 'GROUP_JOIN',
          messageText: 'https://chat.whatsapp.com/RunnerPostingGroup123',
          recipientPhone: 'RUNNER_REPOSTING_GROUP:group-1',
        }),
      }),
    );
    expect(runnerRepostingGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'group-1' },
        data: expect.objectContaining({
          botJoinStatus: 'JOIN_ATTEMPT_STARTED',
          status: 'JOIN_ATTEMPT_STARTED',
        }),
      }),
    );
  });
  it('clears runner-control mode when a superuser exits the session', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'ADMIN_USE_RUNNER',
          runnerId: 'runner-1',
          context: {
            runnerControlMode: true,
            registeredRunnerId: 'runner-1',
            enrolmentStatus: 'ACTIVE',
          },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'EXIT',
    });

    expect(result.command).toBe('EXIT');
    expect(result.contextPatch.runnerControlMode).toBeNull();
    expect(result.contextPatch.registeredRunnerId).toBeNull();
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          runnerId: null,
          context: expect.objectContaining({
            runnerControlMode: null,
            registeredRunnerId: null,
            enrolmentStatus: null,
          }),
        }),
      }),
    );
  });
  it('shows admin options when a registered superuser sends STATUS', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('ADMIN_STATUS');
    expect(result.message).toContain('Runner Commerce Admin Bot');
    expect(result.message).toContain('This number is registered as SUPERUSER.');
    expect(result.message).toContain('ADMIN RUNNERS - list Phase 1 runners');
    expect(result.message).toContain(
      'ADMIN DEV STATUS - development/operations controls',
    );
    expect(result.message).not.toContain('Phase 1 status');
    expect(result.message).not.toContain(
      'I do not see an approved runner profile',
    );
  });

  it('shows admin options when a registered admin sends STATUS', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-2',
          name: 'Ops Admin',
          phone: '+26876111112',
          status: 'ACTIVE',
          role: { name: 'ADMIN' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111112',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('ADMIN_STATUS');
    expect(result.message).toContain('This number is registered as ADMIN.');
    expect(result.message).toContain('ADMIN RUNNER <id/#/phone/name>');
    expect(result.message).not.toContain(
      'Reply REGISTER to register as a runner',
    );
  });

  it('shows admin options for STATUS even when an old runner bot session exists', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876154884',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'GROUPS',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876154884',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('ADMIN_STATUS');
    expect(result.message).toContain('Runner Commerce Admin Bot');
    expect(result.message).not.toContain(
      'I do not see an approved runner profile',
    );
  });
  it('welcomes a registered super user with admin instructions', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'Hi',
    });

    expect(result.command).toBe('ADMIN_WELCOME');
    expect(result.message).toContain('Welcome back, Mxolisi');
    expect(result.message).toContain('Admin');
    expect(result.message).not.toContain('Super User');
    expect(result.message).toContain('Runner Commerce Admin Bot');
    expect(result.message).toContain('ADMIN APPROVALS');
    expect(result.message).not.toContain('ADMIN MERGE');
  });

  it('welcomes a registered super user even when an old runner bot session exists', async () => {
    const botSessionUpsert = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876154884',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'WELCOME',
          context: { unexpectedReplyCount: 0 },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876154884',
      messageText: 'Hi',
    });

    expect(result.command).toBe('ADMIN_WELCOME');
    expect(result.message).toContain('Admin');
    expect(result.message).not.toContain('Super User');
    expect(result.message).toContain('Runner Commerce Admin Bot');
    expect(result.message).not.toContain('Register as a runner');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentStep: 'ADMIN_WELCOME',
          runnerId: null,
        }),
      }),
    );
  });

  it('rejects admin commands when the incoming number is not the registered admin number', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          name: 'Mxolisi',
          phone: '+26876000000',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN RUNNERS',
    });

    expect(result.command).toBe('ADMIN');
    expect(result.message).toContain('registered ACTIVE ADMIN or SUPERUSER');
  });

  it('treats old bot sessions as a new chat instead of continuing stale setup', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Nomsa',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            repostingStatus: 'PAUSED',
            bridgeAccountId: null,
          },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'SHOPS',
          context: { unexpectedReplyCount: 1 },
          updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Hi again',
    });

    expect(result.command).toBe('WELCOME');
    expect(result.message).toContain('Welcome back, Nomsa');
    expect(result.message).not.toContain('SELECT 1,2,3');
  });

  it('rejects configured runner-owned phones for admin bot commands', async () => {
    const previousPhones = process.env.PHASE1_ADMIN_BOT_PHONES;
    process.env.PHASE1_ADMIN_BOT_PHONES = '+26876154884';
    try {
      const userFindFirst = jest.fn().mockResolvedValue({
        id: 'runner-user-1',
        phone: '+26876154884',
        status: 'ACTIVE',
        role: { name: 'RUNNER' },
        runner: { id: 'runner-1', bridgeAccountId: null },
      });
      const service = createService({
        user: { findFirst: userFindFirst },
        runner: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      });

      const result: any = await service.handleBotMessage({
        whatsappNumber: '+26876154884',
        messageText: 'ADMIN RUNNERS',
      });

      expect(result.command).toBe('ADMIN');
      expect(result.message).toContain('registered ACTIVE ADMIN or SUPERUSER');
      expect(userFindFirst).toHaveBeenCalledTimes(1);
    } finally {
      if (previousPhones === undefined) {
        delete process.env.PHASE1_ADMIN_BOT_PHONES;
      } else {
        process.env.PHASE1_ADMIN_BOT_PHONES = previousPhones;
      }
    }
  });

  it('rejects runner-owned phones with punctuation-only admin targets', async () => {
    const runnerRecord = {
      id: 'runner-1',
      userId: 'runner-user-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 10,
      maxPostsPerRun: 20,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { name: 'Dev Runner', phone: '+26876154884' },
      subscriptions: [],
      shopAssignments: [],
      repostingGroups: [],
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValueOnce({
          id: 'runner-user-1',
          phone: '+26876154884',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue(runnerRecord),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876154884',
      messageText: 'ADMIN START !',
    });

    expect(result.command).toBe('ADMIN');
    expect(result.message).toContain('registered ACTIVE ADMIN or SUPERUSER');
  });

  it('resolves ADMIN START 1 from the current admin runner list when context is empty', async () => {
    const runnerRecord = {
      id: 'runner-1',
      userId: 'runner-user-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 10,
      maxPostsPerRun: 20,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { name: 'Dev Runner', phone: '+26876154884' },
      subscriptions: [],
      shopAssignments: [],
      repostingGroups: [],
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findMany: jest.fn().mockResolvedValue([{ id: 'runner-1' }]),
        findUnique: jest.fn().mockResolvedValue(runnerRecord),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN START 1',
    });

    expect(result.command).toBe('ADMIN_START');
    expect(result.message).toContain('Dev Runner');
    expect(result.message).toContain('POSTING AGE NEEDED');
  });

  it('enables development WhatsApp reposting through the admin bot', async () => {
    const runnerRecord = {
      id: 'runner-1',
      userId: 'runner-user-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: '120363428435448501@g.us',
      user: { name: 'Dev Runner', phone: '+26876154884' },
      subscriptions: [],
      shopAssignments: [
        {
          id: 'link-1',
          shopId: 'shop-1',
          status: 'APPROVED',
          joinedAt: new Date(),
          destinationGroup: null,
          shop: {
            name: 'Shop One',
            procurementCity: 'Mbabane',
            whatsappGroupMappings: [],
          },
        },
      ],
      repostingGroups: [],
      submittedShopLinks: [],
    };
    const runnerFindUnique = jest
      .fn()
      .mockResolvedValueOnce({
        ...runnerRecord,
        shopAssignments: [{ id: 'link-1', destinationGroup: null }],
        repostingGroups: [],
      })
      .mockResolvedValueOnce({
        ...runnerRecord,
        autoPostEnabled: true,
        autoPostIntervalMinutes: 10,
        maxPostsPerRun: 20,
      });
    const runnerUpdate = jest.fn().mockResolvedValue({ id: 'runner-1' });
    const linkUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const appSettingUpsert = jest.fn().mockResolvedValue({});
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      runner: {
        findMany: jest.fn().mockResolvedValue([{ id: 'runner-1' }]),
        findUnique: runnerFindUnique,
        update: runnerUpdate,
      },
      runnerShopLink: {
        updateMany: linkUpdateMany,
      },
      appSetting: {
        upsert: appSettingUpsert,
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN DEV START 1 every 10 max 20',
    });

    expect(result.command).toBe('ADMIN_DEV_REPOSTING');
    expect(result.message).toContain('Development reposting enabled');
    expect(appSettingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'whatsappRepostingEnabled' },
        update: { value: 'true' },
      }),
    );
    expect(runnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'runner-1' },
        data: expect.objectContaining({
          repostingStatus: 'ACTIVE',
          autoPostEnabled: true,
          autoPostIntervalMinutes: 30,
          maxPostsPerRun: 10,
        }),
      }),
    );
    expect(linkUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runnerId: 'runner-1', status: 'APPROVED' },
        data: { autoPostEnabled: true },
      }),
    );
  });

  it('guides runners after an unexpected reply in a setup loop', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'SHOPS',
          context: { unexpectedReplyCount: 0, shopOptions: [] },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'I want the nice ones',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('I could not match that reply');
    expect(result.message).toContain('SELECT 1,2,3');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('shows all available shops up to the RunnerBot all-shops cap', async () => {
    const shops = Array.from({ length: 150 }, (_, index) => ({
      id: `shop-${index + 1}`,
      name: `Shop ${index + 1}`,
      description: null,
      procurementCity: 'Manzini',
      whatsappGroupMappings: [
        {
          id: `mapping-${index + 1}`,
          sourceGroup: `Source ${index + 1}`,
          participants: 10,
          isPrimarySource: true,
          groupRole: 'SOURCE',
        },
      ],
      _count: { products: 5 },
    }));
    const runnerRecord = {
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Nomsa', phone: '+26876000000' },
      subscriptions: [],
      shopAssignments: [],
      repostingGroups: [],
      bridgeAccount: null,
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      runner: { findUnique: jest.fn().mockResolvedValue(runnerRecord) },
      shop: {
        count: jest.fn().mockResolvedValue(160),
        findMany: jest.fn().mockResolvedValue(shops),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'SHOPS',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.contextPatch.shopOptions).toHaveLength(150);
    expect(result.message).toContain('Available shops: showing 150 of 160');
    expect(result.message).toContain('150. Shop 150');
    expect(result.message).toContain('Reply SHOPS 4 to continue');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('selects from the full displayed shop list stored in RunnerBot context', async () => {
    const runnerFindUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: 'runner-1' });
    runnerFindUnique.mockResolvedValue({
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Nomsa', phone: '+26876000000' },
      subscriptions: [],
      shopAssignments: [
        {
          id: 'link-75',
          shopId: 'shop-75',
          status: 'APPROVED',
          joinedAt: new Date(),
          selectedForTest: true,
          notes: 'Phase 1 shop selection',
          shop: {
            name: 'Shop 75',
            procurementCity: 'Manzini',
            whatsappGroupMappings: [],
          },
        },
      ],
      repostingGroups: [],
      bridgeAccount: null,
      submittedShopLinks: [],
    });
    const upsert = jest.fn().mockResolvedValue({ id: 'link-75' });
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      runner: { findUnique: runnerFindUnique },
      shop: {
        count: jest.fn().mockResolvedValue(150),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'shop-75' }])
          .mockResolvedValueOnce([]),
      },
      runnerShopLink: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'SHOPS',
          context: {
            unexpectedReplyCount: 0,
            shopOptions: Array.from({ length: 150 }, (_, index) => ({
              id: `shop-${index + 1}`,
              name: `Shop ${index + 1}`,
            })),
            selectedShopOptions: [],
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'SELECT 75',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { runnerId_shopId: { runnerId: 'runner-1', shopId: 'shop-75' } },
      }),
    );
    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('Shop 75');
  });

  it('explains invalid shop option numbers instead of failing silently', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'SHOPS',
          context: {
            unexpectedReplyCount: 0,
            shopOptions: Array.from({ length: 31 }, (_, index) => ({
              id: `shop-${index + 1}`,
              name: `Shop ${index + 1}`,
            })),
            selectedShopOptions: [],
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Select 1,2,34,5,6,7,8,9,10,19',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('could not find shop option 34');
    expect(result.message).toContain('select up to 30 shop groups total');
    expect(result.message).toContain('Reply SHOPS to refresh');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('explains when shop selection exceeds the Phase 1 limit', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'SHOPS',
          context: {
            unexpectedReplyCount: 0,
            shopOptions: Array.from({ length: 31 }, (_, index) => ({
              id: `shop-${index + 1}`,
              name: `Shop ${index + 1}`,
            })),
            selectedShopOptions: [],
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText:
        'Select 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31',
    });

    expect(result.command).toBe('SHOPS');
    expect(result.message).toContain('too many shops');
    expect(result.message).toContain('up to 30 shop groups total');
    expect(result.message).toContain('choose 30 or fewer');
    expect(result.message).toContain('Support: https://wa.me/');
  });

  it('marks setup ready with selected shops and a ready main posting group', async () => {
    const runnerRecord = {
      id: 'runner-1',
      status: 'ACTIVE',
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'PENDING_SUBSCRIPTION',
      repostingStatus: 'NOT_STARTED',
      autoPostEnabled: false,
      autoPostIntervalMinutes: 30,
      maxPostsPerRun: 30,
      lastAutoPostAt: null,
      whatsappGroup: null,
      user: { id: 'user-1', name: 'Nomsa', phone: '+26876000000' },
      subscriptions: [],
      shopAssignments: [
        {
          id: 'link-1',
          shopId: 'shop-1',
          status: 'APPROVED',
          joinedAt: new Date(),
          selectedForTest: true,
          selectedForLive: false,
          autoPostEnabled: false,
          notes: 'Phase 1 shop selection',
          shop: {
            name: 'Shop One',
            procurementCity: 'Manzini',
            whatsappGroupMappings: [],
          },
        },
      ],
      repostingGroups: [
        {
          id: 'group-1',
          groupName: 'Posting group',
          inviteLink: 'https://chat.whatsapp.com/test',
          isTestGroup: false,
          status: 'READY_FOR_REPOSTING',
          botJoinStatus: 'JOINED_GROUP',
          botAdminStatus: 'ADMIN_VERIFIED',
          whatsappGroupId: '120@g.us',
          discoveredGroupId: null,
          discoveredGroup: null,
          bridgeAccountId: null,
          runnerConfirmedAdminAt: new Date(),
          adminVerifiedAt: new Date(),
        },
      ],
      bridgeAccount: null,
      submittedShopLinks: [],
    };
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      runner: { findUnique: jest.fn().mockResolvedValue(runnerRecord) },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'STATUS',
    });

    expect(result.command).toBe('STATUS');
    expect(result.status.readiness.canStart).toBe(true);
    expect(result.message).toContain('Setup: Ready for reposting');
    expect(result.message).toContain('Shop groups selected: 1 of 30');
    expect(result.message).toContain(
      'Next step: reply START to begin reposting',
    );
    expect(result.message).toContain(
      'Need more shop or reposting capacity? Reply PLANS to see weekly options.',
    );
    expect(result.message).not.toContain('------------------------------');
  });

  it('refreshes delayed guided replies before continuing setup', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          runner: { id: 'runner-1', bridgeAccountId: null },
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {},
          updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'Here it is',
    });

    expect(result.command).toBe('GROUPS');
    expect(result.message).toContain('idle for a while');
    expect(result.message).toContain('send one WhatsApp group invite link');
    expect(result.message).toContain('Example: https://chat.whatsapp.com');
    expect(result.message).not.toContain('TEST: https://chat.whatsapp.com');
    expect(result.message).not.toContain('LIVE: https://chat.whatsapp.com');
  });

  it('asks for confirmation before saving an unlabelled group invite', async () => {
    const groupCreate = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [],
        }),
      },
      runnerRepostingGroup: {
        create: groupCreate,
        update: jest.fn().mockResolvedValue({}),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/abcdefghijklmnop',
              groupName: 'Another demo',
              isTestGroup: false,
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'https://chat.whatsapp.com/abcdefghijklmnop',
    });

    expect(result.command).toBe('CONNECT_REPOSTING_GROUP');
    expect(groupCreate).not.toHaveBeenCalled();
    expect(result.contextPatch.pendingRepostingGroup).toEqual(
      expect.objectContaining({
        inviteLink: 'https://chat.whatsapp.com/abcdefghijklmnop',
        isTestGroup: false,
      }),
    );
    expect(result.message).toContain(
      'Reply YES to save this customer advertising posting group',
    );
    expect(result.message).not.toContain('Reply MAIN');
    expect(result.message).not.toContain('Reply EXTRA');
    expect(result.message).not.toContain('TEST:');
    expect(result.message).not.toContain('LIVE:');
  });

  it('asks the runner to confirm before saving a pending posting group', async () => {
    const groupCreate = jest.fn();
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [],
        }),
      },
      runnerRepostingGroup: {
        create: groupCreate,
        update: jest.fn().mockResolvedValue({}),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/abcdefghijklmnop',
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'MAIN',
    });

    expect(result.command).toBe('CONNECT_REPOSTING_GROUP');
    expect(groupCreate).not.toHaveBeenCalled();
    expect(result.message).toContain(
      'Ready to save this as a customer advertising posting group',
    );
    expect(result.message).toContain('Reply YES to confirm');
    expect(result.message).not.toContain('extra posting');
  });

  it('saves a confirmed customer advertising posting group', async () => {
    const groupCreate = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'group-1',
        ...data,
      }),
    );
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [],
        }),
      },
      runnerRepostingGroup: {
        create: groupCreate,
        update: jest.fn().mockResolvedValue({}),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/abcdefghijklmnop',
              isTestGroup: false,
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'YES',
    });

    expect(result.command).toBe('GROUPS');
    expect(groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTestGroup: false,
          groupName: 'Posting group',
        }),
      }),
    );
    expect(result.contextPatch.pendingRepostingGroup).toBeNull();
    expect(result.message).toContain('Posting group link received');
    expect(result.message).toContain('wait for confirmation');
    expect(result.message).toContain(
      'Wait for confirmation, or reply STATUS to check readiness',
    );
    expect(result.message).not.toContain('Next step:');
  });

  it('keeps old labelled posting group links compatible', async () => {
    const groupCreate = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'group-2',
        ...data,
      }),
    );
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [
            {
              id: 'group-1',
              isTestGroup: false,
              status: 'READY_FOR_REPOSTING',
            },
          ],
        }),
      },
      runnerRepostingGroup: {
        create: groupCreate,
        update: jest.fn().mockResolvedValue({}),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/qrstuvwxyzabcdef',
              isTestGroup: false,
            },
          },
          updatedAt: new Date(),
        }),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'YES',
    });

    expect(result.command).toBe('GROUPS');
    expect(groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTestGroup: false,
          groupName: 'Posting group',
        }),
      }),
    );
    expect(result.message).toContain('Posting group link received');
    expect(result.message).not.toContain('Extra posting group');
  });

  it('formats RunnerBot plans with boxed plan sections', async () => {
    const plan = {
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      description: 'Flexible weekly reposting',
      features: ['Up to 30 source shop groups', '1 posting group'],
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
      automationAddonPrice: 25,
      perConfirmedOrderFee: 3,
    };
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            subscriptions: [],
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      },
      undefined,
      {
        listRunnerPlans: jest.fn().mockResolvedValue([plan]),
      },
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'PLANS',
    });

    expect(result.command).toBe('PLANS');
    expect(result.message).toContain('RUNNER COMMERCE PLANS');
    expect(result.message).toContain('PLAN 1: Starter Runner');
    expect(result.message).toContain('------------------');
    expect(result.message).not.toContain('------------------------------');
    expect(result.message).toContain('Reply: PLAN 1');
    expect(result.message).toContain('Reply MENU for all options.');
  });

  it('asks RunnerBot subscription extras separately before issuing an invoice', async () => {
    const plan = {
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
      automationAddonPrice: 25,
      perConfirmedOrderFee: 3,
    };
    const billingService = {
      listRunnerPlans: jest.fn().mockResolvedValue([plan]),
      createRunnerBotSubscriptionAndInvoice: jest.fn(),
    };
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            subscriptions: [],
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      },
      undefined,
      billingService,
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'PLAN 1',
    });

    expect(
      billingService.createRunnerBotSubscriptionAndInvoice,
    ).not.toHaveBeenCalled();
    expect(result.command).toBe('PLANS');
    expect(result.contextPatch.pendingRunnerSubscription).toEqual(
      expect.objectContaining({
        planCode: plan.code,
        currentExtraIndex: 0,
      }),
    );
    expect(result.message).toContain('*Starter Runner selected*');
    expect(result.message).toContain('*Extra 1 of 3*');
    expect(result.message).not.toContain('Order workflow');
    expect(result.message).toContain('Reply YES to add it');
  });

  it('issues a RunnerBot subscription invoice after guided extras confirmation', async () => {
    const plan = {
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
      automationAddonPrice: 25,
      perConfirmedOrderFee: 3,
    };
    const billingService = {
      createRunnerBotSubscriptionAndInvoice: jest.fn().mockResolvedValue({
        subscription: {
          plan,
          monthlyPrice: 95,
          billingCycle: 'WEEKLY',
          orderWorkflowAddonEnabled: false,
          orderWorkflowAddonPrice: 0,
          priceEditingAddonEnabled: true,
          priceEditingAddonPrice: 14,
          shopPriceImageAddonEnabled: false,
          shopPriceImageAddonPrice: 0,
          automationAddonEnabled: false,
          automationAddonPrice: 0,
          perConfirmedOrderFee: 3,
        },
        invoice: {
          invoiceNumber: 'RCINV-000001',
          total: 109,
          status: 'ISSUED',
        },
      }),
    };
    const pendingRunnerSubscription = {
      planCode: plan.code,
      planNumber: 1,
      planSnapshot: {
        code: plan.code,
        name: plan.name,
        monthlyPrice: 95,
        billingCycle: 'WEEKLY',
        perConfirmedOrderFee: 3,
      },
      extras: [
        {
          key: 'orderWorkflowAddonEnabled',
          label: 'Order workflow',
          price: 35,
          suffix: ' + E3.00 per runner-verified paid order',
        },
        {
          key: 'priceEditingAddonEnabled',
          label: 'Runner price editing/calculation',
          price: 14,
          suffix: '',
        },
      ],
      answers: {
        orderWorkflowAddonEnabled: true,
        priceEditingAddonEnabled: true,
      },
      currentExtraIndex: 2,
    };
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            subscriptions: [],
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'PLANS',
            context: { pendingRunnerSubscription },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
      },
      undefined,
      billingService,
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'YES',
    });

    expect(
      billingService.createRunnerBotSubscriptionAndInvoice,
    ).toHaveBeenCalledWith(
      'runner-1',
      plan.code,
      expect.objectContaining({
        priceEditingAddonEnabled: true,
      }),
    );
    expect(
      billingService.createRunnerBotSubscriptionAndInvoice.mock.calls[0][2],
    ).not.toHaveProperty('orderWorkflowAddonEnabled');
    expect(result.message).toContain('*Invoice issued*');
    expect(result.message).toContain(
      'Extras: Runner price editing/calculation',
    );
    expect(result.message).not.toContain('Order workflow');
    expect(result.message).toContain(
      'Cash payment request: PAY RCINV-000001 109 CASH',
    );
  });

  it('shows autofilled payment choices from the current open invoice', async () => {
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            user: { phone: '+26876000000' },
          }),
        },
        platformInvoice: {
          findFirst: jest.fn().mockResolvedValue({
            invoiceNumber: 'RCINV-000001',
            total: 144,
            status: 'ISSUED',
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      },
      undefined,
      { submitRunnerBotInvoicePayment: jest.fn() },
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'PAY',
    });

    expect(result.command).toBe('PAY');
    expect(result.message).toContain('Choose payment option');
    expect(result.message).toContain('Invoice: RCINV-000001');
    expect(result.message).toContain('Amount: E144.00');
    expect(result.message).toContain('Reference: RCINV-000001 26876000000');
    expect(result.message).toContain('1. EFT/MoMo proof');
    expect(result.message).toContain('2. Cash payment request');
    expect(result.contextPatch.pendingRunnerPayment).toEqual(
      expect.objectContaining({
        invoiceNumber: 'RCINV-000001',
        amount: 144,
        runnerReference: '26876000000',
      }),
    );
  });

  it('creates a cash payment request from an autofilled PAY option', async () => {
    const submitRunnerBotInvoicePayment = jest.fn().mockResolvedValue({
      amount: 144,
      method: 'CASH',
      reference: 'CASH RECEIPT RCINV-000001 26876000000 2026-07-20',
    });
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'PAY',
            context: {
              pendingRunnerPayment: {
                invoiceNumber: 'RCINV-000001',
                amount: 144,
                runnerReference: '26876000000',
              },
              billingInvoiceNumber: 'RCINV-000001',
              billingInvoiceAmount: 144,
              billingRunnerReference: '26876000000',
            },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
      },
      undefined,
      { submitRunnerBotInvoicePayment },
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '2',
      messageId: 'wamid-cash-choice-1',
    });

    expect(submitRunnerBotInvoicePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerId: 'runner-1',
        invoiceNumber: 'RCINV-000001',
        amount: 144,
        method: 'CASH',
        runnerReference: '26876000000',
        reference: expect.stringContaining('CASH RECEIPT RCINV-000001'),
      }),
    );
    expect(result.message).toContain(
      'Cash payment request received for admin approval',
    );
    expect(result.contextPatch.pendingRunnerPayment).toBeNull();
  });

  it('asks for proof after selecting autofilled EFT/MoMo without proof', async () => {
    const submitRunnerBotInvoicePayment = jest.fn();
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'PAY',
            context: {
              pendingRunnerPayment: {
                invoiceNumber: 'RCINV-000001',
                amount: 144,
                runnerReference: '26876000000',
              },
            },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
      },
      undefined,
      { submitRunnerBotInvoicePayment },
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: '1',
    });

    expect(submitRunnerBotInvoicePayment).not.toHaveBeenCalled();
    expect(result.message).toContain('EFT/MoMo selected for RCINV-000001');
    expect(result.message).toContain('Use reference: RCINV-000001 26876000000');
    expect(result.message).toContain(
      'paste the SMS proof or attach a screenshot',
    );
  });
  it('creates a cash receipt payment request from RunnerBot', async () => {
    const submitRunnerBotInvoicePayment = jest.fn().mockResolvedValue({
      amount: 144,
      method: 'CASH',
      reference: 'CASH RECEIPT RCINV-000001 26876000000 2026-07-17',
    });
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            runner: { id: 'runner-1', status: 'ACTIVE' },
          }),
        },
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            phone: '+26876000000',
            user: { phone: '+26876000000' },
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
      },
      undefined,
      { submitRunnerBotInvoicePayment },
    );

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'PAY RCINV-000001 144 CASH',
      messageId: 'wamid-cash-1',
    });

    expect(submitRunnerBotInvoicePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerId: 'runner-1',
        invoiceNumber: 'RCINV-000001',
        amount: 144,
        method: 'CASH',
        reference: expect.stringContaining('CASH RECEIPT RCINV-000001'),
        runnerReference: '26876000000',
        proofText: expect.stringContaining('RunnerBot cash receipt request'),
        notes:
          'Cash payment request created through RunnerBot for admin approval',
      }),
    );
    expect(result.message).toContain(
      'Cash payment request received for admin approval',
    );
    expect(result.message).toContain(
      'Your invoice remains pending until admin verifies the payment',
    );
  });

  it('rejects selecting more shops than the default plan capacity', async () => {
    const service = createService({
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          trialStatus: 'TRIAL_ACTIVE',
          trialEndsAt: new Date(Date.now() + 86400000),
          subscriptions: [],
          shopAssignments: [],
          repostingGroups: [],
          submittedShopLinks: [],
        }),
      },
    });

    await expect(
      service.selectShops(
        'runner-1',
        Array.from({ length: 31 }, (_, index) => String(index + 1)),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds another customer advertising posting group when a new group is confirmed', async () => {
    const groupUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const groupCreate = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'group-2',
        ...data,
      }),
    );
    const service = createService({
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [
            {
              id: 'group-1',
              isTestGroup: false,
              status: 'READY_FOR_REPOSTING',
            },
          ],
        }),
      },
      runnerRepostingGroup: {
        updateMany: groupUpdateMany,
        create: groupCreate,
      },
    });

    const result = await service.submitRepostingGroup('runner-1', {
      inviteLink: 'https://chat.whatsapp.com/abcdef',
      isTestGroup: false,
    });

    expect(groupUpdateMany).not.toHaveBeenCalled();
    expect(groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isTestGroup: false,
          groupName: 'Posting group',
        }),
      }),
    );
    expect(result.message).toContain('Posting group link received');
  });

  it('saves another posting group during guided bot setup', async () => {
    const botSessionUpsert = jest.fn();
    const groupUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const groupCreate = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'group-2',
        ...data,
      }),
    );
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Dero Dludlu',
          phone: '+26878259039',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: {
            id: 'runner-1',
            status: 'ACTIVE',
            bridgeAccountId: null,
          },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          bridgeAccountId: null,
          subscriptions: [],
          repostingGroups: [
            {
              id: 'group-1',
              isTestGroup: false,
              status: 'READY_FOR_REPOSTING',
            },
          ],
        }),
      },
      runnerRepostingGroup: {
        updateMany: groupUpdateMany,
        create: groupCreate,
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue({
          currentStep: 'CONNECT_REPOSTING_GROUP',
          context: {
            pendingRepostingGroup: {
              inviteLink: 'https://chat.whatsapp.com/abcdefghijklmnop',
              groupName: 'Another demo',
              isTestGroup: false,
            },
          },
          updatedAt: new Date(),
        }),
        upsert: botSessionUpsert,
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26878259039',
      messageText: 'YES',
    });

    expect(result.command).toBe('GROUPS');
    expect(groupUpdateMany).not.toHaveBeenCalled();

    expect(groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupName: 'Another demo',
          isTestGroup: false,
        }),
      }),
    );
    expect(result.message).toContain('Posting group link received');
    expect(botSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentStep: 'GROUPS',
        }),
      }),
    );
  });

  it('does not allow START when group link is received but not ready', async () => {
    const service = createService({
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          userId: 'user-1',
          status: 'ACTIVE',
          trialStatus: 'TRIAL_ACTIVE',
          trialEndsAt: new Date(Date.now() + 86400000),
          subscriptionStatus: 'PENDING_SUBSCRIPTION',
          repostingStatus: 'NOT_STARTED',
          phase1Setup: {
            postingAgeConfirmedAt: new Date().toISOString(),
            postingAgeDays: 7,
            postingAgeScope: 'live',
          },
          user: { name: 'Runner', phone: '+26876000000' },
          subscriptions: [],
          shopAssignments: [
            {
              id: 'link-1',
              shopId: 'shop-1',
              status: 'APPROVED',
              joinedAt: new Date(),
              shop: {
                name: 'Durban Clothing Deals',
                procurementCity: 'DURBAN',
                whatsappGroupMappings: [],
              },
            },
          ],
          repostingGroups: [
            {
              id: 'group-1',
              groupName: 'Mbabane Deals',
              inviteLink: 'https://chat.whatsapp.com/abcdef',
              isTestGroup: false,
              status: 'GROUP_LINK_RECEIVED',
              botJoinStatus: 'GROUP_LINK_RECEIVED',
              botAdminStatus: 'ADMIN_STATUS_PENDING',
              runnerConfirmedAdminAt: null,
              adminVerifiedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          submittedShopLinks: [],
        }),
      },
    });

    const result: any = await service.commandReposting('runner-1', 'START');

    expect(result.status).toBe('BLOCKED');
    expect(result.readiness.canStart).toBe(false);
    expect(result.readiness.blockers).toContain(
      'At least one posting group must be ready',
    );
  });

  it('pauses selected shop groups by number from bot context', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const count = jest.fn().mockResolvedValue(1);
    const runnerUpdate = jest.fn().mockResolvedValue({});
    const service = createService({
      runner: { update: runnerUpdate },
      runnerShopLink: { updateMany, count },
    });

    const result: any = await service.commandReposting(
      'runner-1',
      'PAUSE SHOP 1,2',
      {
        selectedShopOptions: [
          { shopId: 'shop-1', name: 'Durban Clothing Deals' },
          { shopId: 'shop-2', name: 'Manzini Shoes' },
        ],
      },
    );

    expect(result.command).toBe('PAUSE');
    expect(result.message).toContain('SHOP REPOSTING PAUSED');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          runnerId: 'runner-1',
          shopId: { in: ['shop-1', 'shop-2'] },
        }),
        data: { autoPostEnabled: false },
      }),
    );
    expect(runnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repostingStatus: 'ACTIVE',
          autoPostEnabled: true,
        }),
      }),
    );
  });

  it('updates the item age window for targeted shop groups', async () => {
    const shopUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const listingUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 2 });
    const service = createService({
      runnerShopLink: { updateMany: shopUpdateMany },
      runnerListing: { updateMany: listingUpdateMany },
    });

    const result: any = await service.commandReposting(
      'runner-1',
      'AGE 7 DAYS SHOP 1',
      {
        selectedShopOptions: [{ shopId: 'shop-1', name: 'Durban Clothing' }],
      },
    );

    expect(result.command).toBe('SET_AGE');
    expect(result.message).toContain('New reposting age window: 7 days');
    expect(result.message).toContain('Existing listings updated: 4');
    expect(result.message).toContain('Expired listings revived for posting: 2');
    expect(shopUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          runnerId: 'runner-1',
          shopId: { in: ['shop-1'] },
        }),
        data: { maximumListingAgeDays: 7 },
      }),
    );
    expect(listingUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          runnerId: 'runner-1',
          shopId: { in: ['shop-1'] },
          status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] },
        }),
        data: { maximumListingAgeDays: 7 },
      }),
    );
    expect(listingUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          runnerId: 'runner-1',
          shopId: { in: ['shop-1'] },
          status: 'INACTIVE',
          product: expect.objectContaining({
            status: 'ACTIVE',
            OR: expect.arrayContaining([
              expect.objectContaining({
                sourceRefreshedAt: expect.any(Object),
              }),
              expect.objectContaining({ createdAt: expect.any(Object) }),
              expect.objectContaining({
                whatsappImports: expect.objectContaining({
                  some: expect.objectContaining({
                    receivedAt: expect.any(Object),
                  }),
                }),
              }),
            ]),
          }),
        }),
        data: expect.objectContaining({
          status: 'ACTIVE',
          autoPostApproved: true,
          maximumListingAgeDays: 7,
        }),
      }),
    );
  });

  it('shows runner posting stats via bot command', async () => {
    const runnerService = {
      getAutomationMetrics: jest.fn().mockResolvedValue({
        summary: {
          captured: 12,
          listingsCreated: 10,
          pendingAutoPostListings: 3,
          reposted: 7,
          repostFailed: 1,
          latestRepostAt: '2026-07-18T10:00:00.000Z',
        },
        postingTrends: {
          periods: [
            {
              label: 'Last 24 hours',
              total: 7,
              averagePerDay: 7,
            },
          ],
        },
        shopGroupMetrics: {
          shopTotals: [
            {
              shopName: 'Durban Clothing',
              reposted: 7,
              repostFailed: 1,
              autoPostEnabled: true,
            },
          ],
        },
      }),
    };
    const service = createService({}, runnerService);

    const result: any = await service.commandReposting('runner-1', 'STATS');

    expect(result.command).toBe('STATS');
    expect(result.message).toContain('RUNNER POSTING STATS');
    expect(result.message).toContain('Posted: 7');
    expect(result.message).toContain('Durban Clothing - 7 posted');
    expect(runnerService.getAutomationMetrics).toHaveBeenCalledWith(
      'runner-1',
      expect.objectContaining({ hours: 24, intervalMinutes: 60 }),
    );
  });

  it('stores runner shopping destination on submitted shop links', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'submitted-1',
      status: 'PENDING_REVIEW',
      notes: 'Shopping destination: Manzini',
    });
    const service = createService({
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          serviceArea: 'Mbabane',
          phase1Setup: { shopTown: 'Manzini' },
        }),
      },
      runnerSubmittedShopLink: {
        upsert,
      },
      whatsAppGroupMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    const result: any = await service.submitShopLinks(
      'runner-1',
      'https://chat.whatsapp.com/abcdefghijklmnop',
    );

    expect(result.message).toContain('for Manzini');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          notes: 'Shopping destination: Manzini',
        }),
        update: expect.objectContaining({
          notes: 'Shopping destination: Manzini',
        }),
      }),
    );
  });
  it('does not treat a future-start active paid subscription as currently active', () => {
    const service = createService();
    const access = (service as any).runnerAccess({
      trialStatus: 'TRIAL_EXPIRED',
      trialEndsAt: new Date(Date.now() - 86400000),
      subscriptionStatus: 'ACTIVE_SUBSCRIPTION',
      subscriptions: [
        {
          audience: 'RUNNER',
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() + 86400000),
          currentPeriodEnd: new Date(Date.now() + 8 * 86400000),
        },
      ],
    });

    expect(access.active).toBe(false);
    expect(access.label).toBe('Subscription or trial required');
  });

  it('keeps trial access active before a future paid subscription starts', () => {
    const service = createService();
    const access = (service as any).runnerAccess({
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptionStatus: 'ACTIVE_SUBSCRIPTION',
      subscriptions: [
        {
          audience: 'RUNNER',
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() + 86400000),
          currentPeriodEnd: new Date(Date.now() + 8 * 86400000),
        },
      ],
    });

    expect(access.active).toBe(true);
    expect(access.label).toBe('Free Phase 1 trial active');
  });

  it('uses subscribed plan source shop capacity while trial is active', () => {
    const service = createService();
    const shopLimit = (service as any).sourceShopLimitFromSubscription({
      trialStatus: 'TRIAL_ACTIVE',
      trialEndsAt: new Date(Date.now() + 86400000),
      subscriptions: [
        {
          audience: 'RUNNER',
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() + 86400000),
          currentPeriodEnd: new Date(Date.now() + 8 * 86400000),
          plan: { features: ['Up to 70 source shop groups'] },
        },
      ],
    });

    expect(shopLimit).toBe(70);
  });
  it('does not use future-start subscription features for live group limits', () => {
    const service = createService();
    const liveLimit = (service as any).liveGroupLimitFromSubscription({
      subscriptions: [
        {
          audience: 'RUNNER',
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() + 86400000),
          currentPeriodEnd: new Date(Date.now() + 8 * 86400000),
          plan: { features: ['Up to 9 runner advertising groups'] },
        },
      ],
    });

    expect(liveLimit).toBe(2);
  });
  it('lists pending admin approvals from the bot', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          phone: '+26876111111',
          status: 'ACTIVE',
          role: { name: 'SUPERUSER' },
          runner: null,
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      manualPaymentRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'payment-1',
            amount: 109,
            method: 'CASH',
            invoice: {
              invoiceNumber: 'RCINV-000001',
              runner: { user: { name: 'Dero', phone: '+26876000000' } },
              subscription: { plan: { name: 'Starter Runner' } },
            },
          },
        ]),
      },
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'subscription-1',
            currentPeriodStart: new Date('2026-07-20T00:00:00.000Z'),
            plan: { name: 'Starter Runner' },
            runner: { user: { name: 'Dero', phone: '+26876000000' } },
          },
        ]),
      },
      runnerSubmittedShopLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'shop-link-1',
            status: 'PENDING_REVIEW',
            inviteLink: 'https://chat.whatsapp.com/shop',
            runner: { user: { name: 'Dero', phone: '+26876000000' } },
          },
        ]),
      },
      runnerRepostingGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'group-1',
            groupName: 'Dero Deals',
            status: 'RUNNER_CONFIRMED_ADMIN',
            runner: { user: { name: 'Dero', phone: '+26876000000' } },
          },
        ]),
      },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'bridge-1', name: 'Bridge 1', status: 'READY' },
          ]),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN APPROVALS',
    });

    expect(result.command).toBe('ADMIN_APPROVALS');
    expect(result.message).toContain('Payments:');
    expect(result.message).toContain('Subscriptions:');
    expect(result.message).toContain('Shop links:');
    expect(result.message).toContain('Groups:');
    expect(result.contextPatch.adminPaymentOptions).toEqual([
      { id: 'payment-1' },
    ]);
  });

  it('approves and rejects billing items through existing billing service paths', async () => {
    const updateManualPayment = jest.fn().mockResolvedValue({
      id: 'payment-1',
      receiptNumber: 'RCR-000001',
    });
    const updateSubscriptionStatus = jest.fn().mockResolvedValue({
      id: 'subscription-1',
      plan: { name: 'Starter Runner' },
    });
    const service = createService(
      {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'admin-1',
            phone: '+26876111111',
            status: 'ACTIVE',
            role: { name: 'SUPERUSER' },
            runner: null,
          }),
        },
        botSession: {
          findUnique: jest.fn().mockResolvedValue({
            currentStep: 'ADMIN_APPROVALS',
            context: {
              adminPaymentOptions: [{ id: 'payment-1' }],
              adminSubscriptionOptions: [{ id: 'subscription-1' }],
            },
            updatedAt: new Date(),
          }),
          upsert: jest.fn(),
        },
        manualPaymentRecord: {
          findUnique: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        },
        subscription: {
          findUnique: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
        },
      },
      undefined,
      { updateManualPayment, updateSubscriptionStatus },
    );

    const paymentResult: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN APPROVE PAYMENT 1',
    });
    const subscriptionResult: any = await service.handleBotMessage({
      whatsappNumber: '+26876111111',
      messageText: 'ADMIN REJECT SUBSCRIPTION 1 duplicate',
    });

    expect(paymentResult.command).toBe('ADMIN_APPROVE_PAYMENT');
    expect(updateManualPayment).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({ status: 'VERIFIED' }),
      'admin-1',
    );
    expect(subscriptionResult.command).toBe('ADMIN_REJECT_SUBSCRIPTION');
    expect(updateSubscriptionStatus).toHaveBeenCalledWith(
      { userId: 'admin-1', role: 'SUPERUSER' },
      'subscription-1',
      expect.objectContaining({ status: 'REJECTED', notes: 'duplicate' }),
    );
  });

  it('shows caption examples based on active runner subscription add-ons', async () => {
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          phone: '+26876000000',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          repostPriceMode: 'ORIGINAL',
          repostOrderDetailsEnabled: true,
          repostFeePercentageEnabled: true,
          phase1Setup: {},
          subscriptions: [
            {
              audience: 'RUNNER',
              status: 'ACTIVE',
              priceEditingAddonEnabled: true,
              shopPriceImageAddonEnabled: true,
              currentPeriodStart: new Date(Date.now() - 86400000),
              currentPeriodEnd: new Date(Date.now() + 86400000),
            },
          ],
        }),
      },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const result: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'CAPTIONS',
    });

    expect(result.command).toBe('CAPTIONS');
    expect(result.message).toContain('Original shop caption');
    expect(result.message).toContain('Runner total price only');
    expect(result.message).toContain('Stock and each totals');
    expect(result.message).not.toContain('Price with runner fee breakdown');
    expect(result.message).toContain('CAPTION IMAGE PRICE ON/OFF');
  });

  it('blocks paid caption modes during trial/basic access, allows total with the price add-on, and suspends fee breakdown', async () => {
    const paidRunner = {
      id: 'runner-1',
      repostPriceMode: 'ORIGINAL',
      repostOrderDetailsEnabled: true,
      repostFeePercentageEnabled: true,
      phase1Setup: {},
      subscriptions: [
        {
          audience: 'RUNNER',
          status: 'ACTIVE',
          priceEditingAddonEnabled: true,
          shopPriceImageAddonEnabled: false,
          currentPeriodStart: new Date(Date.now() - 86400000),
          currentPeriodEnd: new Date(Date.now() + 86400000),
        },
      ],
    };
    const runnerUpdate = jest.fn().mockResolvedValue({ id: 'runner-1' });
    const runnerFindUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'runner-1',
        repostPriceMode: 'ORIGINAL',
        repostOrderDetailsEnabled: true,
        repostFeePercentageEnabled: true,
        trialStatus: 'TRIAL_ACTIVE',
        trialEndsAt: new Date(Date.now() + 86400000),
        phase1Setup: {},
        subscriptions: [],
      })
      .mockResolvedValueOnce(paidRunner)
      .mockResolvedValueOnce(paidRunner);
    const service = createService({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          phone: '+26876000000',
          status: 'ACTIVE',
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE' },
        }),
      },
      runner: { findUnique: runnerFindUnique, update: runnerUpdate },
      botSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });

    const blocked: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'CAPTION TOTAL',
    });
    const allowed: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'CAPTION TOTAL',
    });
    const suspended: any = await service.handleBotMessage({
      whatsappNumber: '+26876000000',
      messageText: 'CAPTION FEE',
    });

    expect(blocked.message).toContain('Runner price editing/calculation');
    expect(allowed.message).toContain('Caption type updated');
    expect(suspended.message).toContain('temporarily suspended');
    expect(runnerUpdate).toHaveBeenCalledTimes(1);
    expect(runnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'runner-1' },
        data: { repostPriceMode: 'TOTAL_ONLY' },
      }),
    );
  });
});
