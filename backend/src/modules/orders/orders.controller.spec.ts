import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: jest.Mocked<Pick<OrdersService, 'findByShop' | 'findAll'>>;

  beforeEach(async () => {
    service = {
      findByShop: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes authenticated owner context to shop order lookup', async () => {
    service.findByShop.mockResolvedValue([]);

    await controller.findByShop('shop-1', {
      userId: 'owner-1',
      role: 'SHOP_OWNER',
    });

    expect(service.findByShop).toHaveBeenCalledWith(
      'shop-1',
      'owner-1',
      'SHOP_OWNER',
    );
  });

  it('passes runner profile id to order list lookup', async () => {
    service.findAll.mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 10, offset: 0, hasNext: false },
    });

    await controller.findAll({ limit: 10, offset: 0 }, {
      userId: 'user-1',
      role: 'RUNNER',
      runnerId: 'runner-1',
    } as any);

    expect(service.findAll).toHaveBeenCalledWith(
      { limit: 10, offset: 0 },
      'user-1',
      'RUNNER',
      'runner-1',
    );
  });
});
