import { BadRequestException } from '@nestjs/common';
import { RunnerService } from './runner.service';

describe('RunnerService WhatsApp-assisted orders', () => {
  const listing = {
    id: 'listing-1',
    runnerId: 'runner-1',
    productId: 'product-1',
    orderCode: 'RC-TEST123',
    status: 'ACTIVE',
    runnerPrice: 120,
    product: {
      id: 'product-1',
      name: 'Black Dress',
      basePrice: 100,
      stockQty: 20,
      shopId: 'shop-1',
      shop: { id: 'shop-1', name: 'Shop One' },
    },
    runner: { status: 'ACTIVE' },
  };

  const createPrisma = (overrides: any = {}) => {
    const tx = {
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order-1' }),
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          items: [{ id: 'item-1' }],
        }),
      },
      orderItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryReservation: { create: jest.fn() },
      whatsAppOrderRequest: {
        create: jest.fn().mockResolvedValue({ id: 'request-1' }),
      },
      ...overrides.tx,
    };

    return {
      runnerListing: {
        findFirst: jest.fn().mockResolvedValue(listing),
        ...overrides.runnerListing,
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(overrides.openOrder || null),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.order,
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.orderItem,
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
      __tx: tx,
      ...overrides.prisma,
    };
  };

  it('requires customer phone and order code', async () => {
    const service = new RunnerService(createPrisma());

    await expect(
      service.submitRunnerWhatsAppOrder('runner-1', 'ORDER FOR +26876123456'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.submitRunnerWhatsAppOrder('runner-1', 'CODE: RC-TEST123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a new order basket from runner-submitted WhatsApp text', async () => {
    const prisma = createPrisma();
    const service = new RunnerService(prisma);

    const result = await service.submitRunnerWhatsAppOrder(
      'runner-1',
      [
        'ORDER FOR +26876123456',
        'CODE: RC-TEST123',
        'QTY: 2',
        'SIZE: M',
        'COLOR: Black',
      ].join('\n'),
      '+26876960651',
    );

    expect(result.createdNewOrder).toBe(true);
    expect(prisma.__tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerPhone: '+26876123456',
          runnerId: 'runner-1',
          status: 'ORDER_CONFIRMED',
        }),
      }),
    );
    expect(prisma.__tx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 2,
          selectedSize: 'M',
          selectedColor: 'Black',
        }),
      }),
    );
  });

  it('adds later items to an existing open customer order', async () => {
    const prisma = createPrisma({
      openOrder: { id: 'order-open', notes: 'Existing note' },
    });
    const service = new RunnerService(prisma);

    const result = await service.submitRunnerWhatsAppOrder(
      'runner-1',
      ['ADD TO ORDER FOR +26876123456', 'CODE: RC-TEST123', 'QTY: 1'].join(
        '\n',
      ),
    );

    expect(result.createdNewOrder).toBe(false);
    expect(prisma.__tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-open' } }),
    );
    expect(prisma.__tx.order.create).not.toHaveBeenCalled();
  });

  it('allows runners to mark eligible items as packed', async () => {
    const prisma = createPrisma({
      orderItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'item-1', orderId: 'order-1' }]),
      },
      tx: {
        orderItem: {
          updateMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ status: 'PACKED' }]),
        },
        order: {
          update: jest.fn(),
        },
      },
    });
    const service = new RunnerService(prisma);

    const result = await service.updateShoppingListItemsStatus(
      'runner-1',
      ['item-1'],
      'PACKED',
    );

    expect(result).toEqual({ updated: 1, status: 'PACKED' });
    expect(prisma.__tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] } },
      data: { status: 'PACKED' },
    });
  });

  it('groups packing list items by customer and shop', async () => {
    const prisma = createPrisma({
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'order-1',
            customerPhone: '+26876123456',
            customerId: null,
            status: 'ORDER_CONFIRMED',
            customerPaymentStatus: 'UNPAID',
            shippingAddress: { customerName: 'Dero' },
            createdAt: new Date('2026-07-15T10:00:00Z'),
            customer: null,
            items: [
              {
                id: 'item-1',
                quantity: 2,
                selectedSize: 'M',
                selectedColor: 'Black',
                customerNote: 'Pack gently',
                status: 'BOUGHT',
                customerImageUrls: ['/uploads/customer.jpg'],
                product: {
                  id: 'product-1',
                  name: 'Black Dress',
                  images: ['/uploads/product.jpg'],
                  shop: { id: 'shop-1', name: 'Shop One' },
                  whatsappImports: [],
                },
                listing: null,
              },
            ],
          },
        ]),
      },
    });
    const service = new RunnerService(prisma);

    const result = await service.getCustomerPackingList('runner-1');

    expect(result.summary).toEqual({
      customerCount: 1,
      itemCount: 1,
      totalQuantity: 2,
    });
    expect(result.data[0]).toMatchObject({
      customerName: 'Dero',
      customerPhone: '+26876123456',
      shopCount: 1,
      totalQuantity: 2,
    });
    expect(result.data[0].shops[0].items[0]).toMatchObject({
      orderItemId: 'item-1',
      productName: 'Black Dress',
      selectedColor: 'Black',
    });
  });
  it('normalizes runner profile repost cadence and post limits to policy bounds', async () => {
    const prisma = createPrisma({
      prisma: {
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            userId: 'user-1',
            phase1Setup: {},
            user: { id: 'user-1' },
          }),
        },
      },
      tx: {
        runner: {
          update: jest.fn().mockResolvedValue({ id: 'runner-1' }),
        },
      },
    });
    const service = new RunnerService(prisma);

    jest.spyOn(service, 'getRunnerByUserId').mockResolvedValue({} as any);

    await service.updateProfile('user-1', {
      autoPostIntervalMinutes: 10,
      maxPostsPerRun: 20,
    } as any);

    expect(prisma.__tx.runner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'runner-1' },
        data: expect.objectContaining({
          autoPostIntervalMinutes: 30,
          maxPostsPerRun: 10,
        }),
      }),
    );
  });
  it('rejects suspended fee breakdown profile updates', async () => {
    const prisma = createPrisma({
      prisma: {
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            userId: 'user-1',
            phase1Setup: {},
            user: { id: 'user-1' },
          }),
        },
      },
    });
    const service = new RunnerService(prisma);

    await expect(
      service.updateProfile('user-1', {
        repostPriceMode: 'FEE_BREAKDOWN',
      } as any),
    ).rejects.toThrow('Fee breakdown captions are temporarily suspended');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects suspended fee breakdown apply-format requests', async () => {
    const prisma = createPrisma({
      prisma: {
        runner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'runner-1',
            repostPriceMode: 'ORIGINAL',
          }),
        },
      },
    });
    const service = new RunnerService(prisma);

    await expect(
      service.applyRepostPriceFormat('user-1', {
        repostPriceMode: 'FEE_BREAKDOWN',
      } as any),
    ).rejects.toThrow('Fee breakdown captions are temporarily suspended');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
