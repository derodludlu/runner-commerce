import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderLifecycleWorkflow } from './workflows/order-lifecycle.workflow';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    shop: { findUnique: jest.Mock };
    order: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      shop: { findUnique: jest.fn() },
      order: { findMany: jest.fn(), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OrderLifecycleWorkflow,
          useValue: {
            isValidTransition: jest.fn().mockReturnValue(true),
            handleStatusChange: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('requires a runner profile id for runner order lists', async () => {
    await expect(
      service.findAll({ limit: 10, offset: 0 }, 'user-1', 'RUNNER', null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('filters runner order lists strictly by assigned runner id', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);

    await service.findAll(
      { limit: 10, offset: 0 },
      'user-1',
      'RUNNER',
      'runner-1',
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runnerId: 'runner-1' }),
      }),
    );
  });

  it('blocks shop order lookup for non-owners', async () => {
    prisma.shop.findUnique.mockResolvedValue({ ownerId: 'owner-1' });

    await expect(
      service.findByShop('shop-1', 'other-user', 'SHOP_OWNER'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows admins to view shop orders', async () => {
    prisma.shop.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    prisma.order.findMany.mockResolvedValue([]);

    await expect(
      service.findByShop('shop-1', 'admin-1', 'ADMIN'),
    ).resolves.toEqual([]);
  });
});
