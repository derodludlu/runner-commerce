import { BillingService } from './billing.service';

describe('BillingService', () => {
  it('lists runner plans weekly first by price', async () => {
    const plans = [
      {
        code: 'RUNNER_STARTER',
        audience: 'RUNNER',
        status: 'ACTIVE',
        monthlyPrice: 349,
        billingCycle: 'MONTHLY',
      },
      {
        code: 'RUNNER_POWER_WEEKLY',
        audience: 'RUNNER',
        status: 'ACTIVE',
        monthlyPrice: 165,
        billingCycle: 'WEEKLY',
      },
      {
        code: 'RUNNER_STARTER_WEEKLY',
        audience: 'RUNNER',
        status: 'ACTIVE',
        monthlyPrice: 95,
        billingCycle: 'WEEKLY',
      },
      {
        code: 'RUNNER_ACTIVE_WEEKLY',
        audience: 'RUNNER',
        status: 'ACTIVE',
        monthlyPrice: 125,
        billingCycle: 'WEEKLY',
      },
    ];
    const service = new BillingService({
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue(plans),
      },
    } as any);

    const result = await service.listRunnerPlans();

    expect(result.map((plan: any) => plan.code).slice(0, 3)).toEqual([
      'RUNNER_STARTER_WEEKLY',
      'RUNNER_ACTIVE_WEEKLY',
      'RUNNER_POWER_WEEKLY',
    ]);
  });

  it('creates subscriptions with runner price and shop-price image add-ons', async () => {
    const plan = {
      id: 'plan-1',
      code: 'RUNNER_ACTIVE',
      name: 'Active Runner',
      audience: 'RUNNER',
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 489,
      billingCycle: 'MONTHLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 79,
      orderWorkflowAddonPrice: 99,
      priceEditingAddonPrice: 49,
      shopPriceImageAddonPrice: 49,
    };
    const prisma = {
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
    };
    const service = new BillingService(prisma as any);

    await service.createSubscription(
      { userId: 'user-1', runnerId: 'runner-1', role: 'RUNNER' },
      {
        planCode: plan.code,
        priceEditingAddonEnabled: true,
        shopPriceImageAddonEnabled: true,
      },
    );

    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceEditingAddonEnabled: true,
          priceEditingAddonPrice: 49,
          shopPriceImageAddonEnabled: true,
          shopPriceImageAddonPrice: 49,
        }),
      }),
    );
  });

  it('creates weekly subscriptions with discounted runner optional add-ons', async () => {
    const plan = {
      id: 'plan-weekly',
      code: 'RUNNER_ACTIVE_WEEKLY',
      name: 'Active Runner',
      audience: 'RUNNER',
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 125,
      billingCycle: 'WEEKLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 39,
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
    };
    const prisma = {
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'subscription-weekly' }),
      },
    };
    const service = new BillingService(prisma as any);

    await service.createSubscription(
      { userId: 'user-1', runnerId: 'runner-1', role: 'RUNNER' },
      {
        planCode: plan.code,
        priceEditingAddonEnabled: true,
        shopPriceImageAddonEnabled: true,
      },
    );

    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingCycle: 'WEEKLY',
          priceEditingAddonEnabled: true,
          priceEditingAddonPrice: 14,
          shopPriceImageAddonEnabled: true,
          shopPriceImageAddonPrice: 14,
        }),
      }),
    );
  });

  it('preserves new optional add-ons when changing subscription plans', async () => {
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      audience: 'RUNNER',
      status: 'ACTIVE',
      monthlyPrice: 349,
      billingCycle: 'MONTHLY',
      automationAddonEnabled: false,
      orderWorkflowAddonEnabled: false,
      priceEditingAddonEnabled: true,
      shopPriceImageAddonEnabled: true,
    };
    const plan = {
      id: 'plan-2',
      code: 'RUNNER_POWER',
      audience: 'RUNNER',
      monthlyPrice: 649,
      billingCycle: 'MONTHLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 79,
      orderWorkflowAddonPrice: 99,
      priceEditingAddonPrice: 49,
      shopPriceImageAddonPrice: 49,
      status: 'ACTIVE',
    };
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn().mockResolvedValue({ ...subscription, plan }),
      },
      billingPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
    };
    const service = new BillingService(prisma as any);

    await service.changeSubscriptionPlan(
      { userId: 'user-1', role: 'RUNNER' },
      subscription.id,
      { planCode: plan.code },
    );

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceEditingAddonEnabled: true,
          priceEditingAddonPrice: 49,
          shopPriceImageAddonEnabled: true,
          shopPriceImageAddonPrice: 49,
        }),
      }),
    );
  });

  it('invoices each chargeable order event and marks it invoiced', async () => {
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      runnerId: 'runner-1',
      shopId: null,
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 399,
      billingCycle: 'MONTHLY',
      perConfirmedOrderFee: 3,
      automationAddonEnabled: false,
      automationAddonPrice: 79,
      orderWorkflowAddonEnabled: true,
      orderWorkflowAddonPrice: 99,
      priceEditingAddonEnabled: true,
      priceEditingAddonPrice: 49,
      shopPriceImageAddonEnabled: true,
      shopPriceImageAddonPrice: 49,
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      plan: { name: 'Runner' },
    };
    const event = {
      id: 'event-1',
      amount: 3,
      effectiveAt: new Date('2026-06-20T00:00:00.000Z'),
    };
    const createdInvoice = { id: 'invoice-1' };
    const tx = {
      platformInvoice: {
        create: jest.fn().mockResolvedValue(createdInvoice),
        findUnique: jest.fn().mockResolvedValue({
          ...createdInvoice,
          orderFees: 3,
          total: 599,
          billingEvents: [event],
        }),
      },
      platformBillingEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      subscription: { findUnique: jest.fn().mockResolvedValue(subscription) },
      platformInvoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          invoiceNumber: 'RCINV-000001',
          status: 'ISSUED',
          currency: 'ZAR',
          monthlyFee: 399,
          automationAddonFee: 0,
          orderWorkflowAddonFee: 99,
          priceEditingAddonFee: 49,
          shopPriceImageAddonFee: 49,
          orderFees: 3,
          total: 599,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueAt: new Date('2026-06-08T00:00:00.000Z'),
          invoicePdfUrl: null,
          manualPayments: [],
          subscription: { plan: { name: 'Runner' } },
          user: { name: 'Runner User', phone: '+26876000000' },
          runner: { user: { name: 'Runner User', phone: '+26876000000' } },
          shop: null,
        }),
        update: jest.fn((args) =>
          Promise.resolve({
            id: 'invoice-1',
            total: 599,
            invoicePdfUrl: args.data.invoicePdfUrl,
            billingEvents: [event],
          }),
        ),
      },
      platformBillingEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new BillingService(prisma as any);

    const invoice = await service.generateCurrentInvoice(
      { userId: 'user-1', role: 'RUNNER' },
      subscription.id,
    );

    expect(tx.platformInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthlyFee: 399,
          automationAddonFee: 0,
          orderWorkflowAddonFee: 99,
          priceEditingAddonFee: 49,
          shopPriceImageAddonFee: 49,
          orderFees: 3,
          total: 599,
        }),
      }),
    );
    expect(tx.platformBillingEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['event-1'] },
          status: 'CHARGEABLE',
        }),
        data: { status: 'INVOICED', invoiceId: 'invoice-1' },
      }),
    );
    expect(invoice).toEqual(expect.objectContaining({ total: 599 }));
    expect(prisma.platformInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoicePdfUrl: expect.stringContaining('/uploads/billing-documents/'),
        }),
      }),
    );
  });

  it('creates RunnerBot subscription invoices with selected extras', async () => {
    const plan = {
      id: 'plan-weekly',
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      audience: 'RUNNER',
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 25,
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
    };
    const invoiceCreate = jest.fn().mockResolvedValue({ id: 'invoice-1' });
    const subscriptionUpsert = jest.fn(async (args) => ({
      id: 'subscription-1',
      userId: 'user-1',
      runnerId: 'runner-1',
      ...args.create,
      plan,
    }));
    const prisma = {
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          userId: 'user-1',
          user: { id: 'user-1' },
        }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: subscriptionUpsert,
      },
      platformInvoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: invoiceCreate,
        findUnique: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          invoiceNumber: 'RCINV-000001',
          status: 'ISSUED',
          currency: 'ZAR',
          monthlyFee: 95,
          automationAddonFee: 0,
          orderWorkflowAddonFee: 35,
          priceEditingAddonFee: 14,
          shopPriceImageAddonFee: 0,
          orderFees: 0,
          total: 144,
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-08T00:00:00.000Z'),
          dueAt: new Date('2026-06-08T00:00:00.000Z'),
          invoicePdfUrl: null,
          manualPayments: [],
          subscription: { plan },
          user: { name: 'Runner User', phone: '+26876000000' },
          runner: { user: { name: 'Runner User', phone: '+26876000000' } },
          shop: null,
        }),
        update: jest.fn((args) =>
          Promise.resolve({
            id: 'invoice-1',
            invoiceNumber: 'RCINV-000001',
            invoicePdfUrl: args.data.invoicePdfUrl,
          }),
        ),
      },
    };
    const service = new BillingService(prisma as any);

    await service.createRunnerBotSubscriptionAndInvoice('runner-1', plan.code, {
      orderWorkflowAddonEnabled: true,
      priceEditingAddonEnabled: true,
    });

    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          orderWorkflowAddonEnabled: true,
          orderWorkflowAddonPrice: 35,
          priceEditingAddonEnabled: true,
          priceEditingAddonPrice: 14,
          shopPriceImageAddonEnabled: false,
          shopPriceImageAddonPrice: 0,
        }),
      }),
    );
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthlyFee: 95,
          orderWorkflowAddonFee: 35,
          priceEditingAddonFee: 14,
          shopPriceImageAddonFee: 0,
          total: 144,
          status: 'ISSUED',
        }),
      }),
    );
  });

  it('stores enriched manual payment proof metadata', async () => {
    const invoice = {
      id: 'invoice-1',
      userId: 'user-1',
      currency: 'ZAR',
      status: 'ISSUED',
    };
    const create = jest.fn().mockResolvedValue({ id: 'payment-1' });
    const prisma = {
      platformInvoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      manualPaymentRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const service = new BillingService(prisma as any);

    await service.submitInvoicePayment(
      { userId: 'user-1', role: 'RUNNER' },
      invoice.id,
      {
        amount: 150,
        method: 'EFT',
        reference: 'RCINV-000001 26876154884',
        runnerReference: '26876154884',
        proofText: 'Bank SMS payment confirmation',
        proofImageUrls: ['/uploads/billing-payment-proofs/proof.jpg'],
        source: 'RUNNER_BOT',
        sourceMessageId: 'wamid-1',
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runnerReference: '26876154884',
          proofText: 'Bank SMS payment confirmation',
          proofImageUrls: ['/uploads/billing-payment-proofs/proof.jpg'],
          source: 'RUNNER_BOT',
          sourceMessageId: 'wamid-1',
        }),
      }),
    );
  });

  it('rejects duplicate manual payment proof source messages', async () => {
    const invoice = {
      id: 'invoice-1',
      userId: 'user-1',
      currency: 'ZAR',
      status: 'ISSUED',
    };
    const prisma = {
      platformInvoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      manualPaymentRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'payment-1',
          status: 'PENDING',
        }),
        create: jest.fn(),
      },
    };
    const service = new BillingService(prisma as any);

    await expect(
      service.submitInvoicePayment(
        { userId: 'user-1', role: 'RUNNER' },
        invoice.id,
        {
          amount: 150,
          method: 'EFT',
          reference: 'RCINV-000001 26876154884',
          sourceMessageId: 'wamid-1',
        },
      ),
    ).rejects.toThrow('Duplicate payment proof already exists');
  });

  it('generates an official receipt PDF after admin verifies payment', async () => {
    const invoice = {
      id: 'invoice-1',
      userId: 'user-1',
      invoiceNumber: 'RCINV-000001',
      currency: 'ZAR',
      total: 150,
      status: 'ISSUED',
    };
    const payment = {
      id: 'payment-1',
      invoiceId: invoice.id,
      payerUserId: 'user-1',
      amount: 150,
      currency: 'ZAR',
      method: 'CASH',
      reference: 'CASH',
      runnerReference: '26876000000',
      source: 'RUNNER_BOT',
      status: 'PENDING',
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      invoice,
    };
    const verifiedPayment = {
      ...payment,
      status: 'VERIFIED',
      verifiedAt: new Date('2026-06-01T01:00:00.000Z'),
      invoice: {
        ...invoice,
        user: { name: 'Runner User', phone: '+26876000000' },
        runner: { user: { name: 'Runner User', phone: '+26876000000' } },
        subscription: { plan: { name: 'Starter Runner' } },
      },
      payer: { name: 'Runner User', phone: '+26876000000' },
      receiptNumber: null,
      receiptPdfUrl: null,
    };
    const update = jest
      .fn()
      .mockResolvedValueOnce(verifiedPayment)
      .mockImplementation((args) =>
        Promise.resolve({
          ...verifiedPayment,
          receiptNumber: args.data.receiptNumber,
          receiptPdfUrl: args.data.receiptPdfUrl,
        }),
      );
    const prisma = {
      manualPaymentRecord: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(payment)
          .mockResolvedValueOnce(verifiedPayment),
        update,
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150 } }),
      },
      platformInvoice: {
        update: jest.fn().mockResolvedValue({ ...invoice, status: 'PAID' }),
      },
    };
    const service = new BillingService(prisma as any);

    const result: any = await service.updateManualPayment(
      payment.id,
      { status: 'VERIFIED' },
      'admin-1',
    );

    expect(prisma.platformInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: invoice.id },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(result.receiptPdfUrl).toContain('/uploads/billing-documents/');
    expect(result.receiptNumber).toContain('RCR-');
  });
  it('queues WhatsApp receipt text and document after verifying RunnerBot cash payment', async () => {
    const invoice = {
      id: 'invoice-1',
      userId: 'user-1',
      runnerId: 'runner-1',
      invoiceNumber: 'RCINV-000001',
      currency: 'ZAR',
      total: 150,
      status: 'ISSUED',
    };
    const payment = {
      id: 'payment-1',
      invoiceId: invoice.id,
      payerUserId: 'user-1',
      amount: 150,
      currency: 'ZAR',
      method: 'CASH',
      reference: 'CASH',
      runnerReference: '26876000000',
      source: 'RUNNER_BOT',
      status: 'PENDING',
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      invoice,
    };
    const verifiedPayment = {
      ...payment,
      status: 'VERIFIED',
      verifiedAt: new Date('2026-06-01T01:00:00.000Z'),
      invoice: {
        ...invoice,
        status: 'PAID',
        paidAt: new Date('2026-06-01T01:00:00.000Z'),
        runner: {
          id: 'runner-1',
          bridgeAccountId: 'bridge-runner',
          user: { name: 'Runner User', phone: '+26876000000' },
        },
        subscription: { plan: { name: 'Starter Runner' } },
      },
      payer: { name: 'Runner User', phone: '+26876000000' },
      receiptNumber: null,
      receiptPdfUrl: null,
    };
    const update = jest
      .fn()
      .mockResolvedValueOnce(verifiedPayment)
      .mockImplementation((args) =>
        Promise.resolve({
          ...verifiedPayment,
          receiptNumber: args.data.receiptNumber,
          receiptPdfUrl: args.data.receiptPdfUrl,
        }),
      );
    const outboundCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      manualPaymentRecord: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(payment)
          .mockResolvedValueOnce(verifiedPayment),
        update,
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150 } }),
      },
      platformInvoice: {
        update: jest.fn().mockResolvedValue({ ...invoice, status: 'PAID' }),
      },
      whatsAppOutboundMessage: { create: outboundCreate },
    };
    const service = new BillingService(prisma as any);

    const result: any = await service.updateManualPayment(
      payment.id,
      { status: 'VERIFIED' },
      'admin-1',
    );

    expect(result.receiptPdfUrl).toContain('/uploads/billing-documents/');
    expect(outboundCreate).toHaveBeenCalledTimes(2);
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'bridge-runner',
          recipientPhone: '+26876000000',
          messageType: 'TEXT',
          messageText: expect.stringContaining('Payment verified'),
        }),
      }),
    );
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageType: 'DOCUMENT',
          mediaUrl: expect.stringContaining('/uploads/billing-documents/'),
          mimeType: 'application/pdf',
        }),
      }),
    );
  });

  it('does not queue duplicate receipt messages when payment was already verified', async () => {
    const payment = {
      id: 'payment-1',
      invoiceId: 'invoice-1',
      payerUserId: 'user-1',
      amount: 150,
      currency: 'ZAR',
      method: 'CASH',
      source: 'RUNNER_BOT',
      status: 'VERIFIED',
      receiptNumber: 'RCR-EXISTING',
      receiptPdfUrl: '/uploads/billing-documents/RCR-EXISTING.pdf',
      receivedAt: new Date('2026-06-01T00:00:00.000Z'),
      invoice: {
        id: 'invoice-1',
        userId: 'user-1',
        runnerId: 'runner-1',
        total: 150,
        invoiceNumber: 'RCINV-000001',
        runner: {
          id: 'runner-1',
          bridgeAccountId: 'bridge-runner',
          user: { phone: '+26876000000' },
        },
      },
    };
    const outboundCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      manualPaymentRecord: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue(payment),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150 } }),
      },
      platformInvoice: { update: jest.fn() },
      whatsAppOutboundMessage: { create: outboundCreate },
    };
    const service = new BillingService(prisma as any);

    await service.updateManualPayment(
      payment.id,
      { status: 'VERIFIED' },
      'admin-1',
    );

    expect(outboundCreate).not.toHaveBeenCalled();
  });

  it('starts RunnerBot paid subscription after an active trial ends', async () => {
    const trialEndsAt = new Date('2099-01-10T00:00:00.000Z');
    const plan = {
      id: 'plan-weekly',
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      audience: 'RUNNER',
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 25,
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
    };
    const subscriptionUpsert = jest.fn(({ create }) =>
      Promise.resolve({ id: 'subscription-1', ...create, plan }),
    );
    const invoiceCreate = jest.fn(({ data }) =>
      Promise.resolve({
        id: 'invoice-1',
        ...data,
        invoiceNumber: 'RCINV-000001',
      }),
    );
    const prisma = {
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          userId: 'user-1',
          trialStatus: 'TRIAL_ACTIVE',
          trialEndsAt,
          user: { id: 'user-1' },
        }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: subscriptionUpsert,
      },
      platformInvoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: invoiceCreate,
        findUnique: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            id: where.id,
            invoiceNumber: 'RCINV-000001',
            status: 'ISSUED',
            currency: 'ZAR',
            monthlyFee: 95,
            automationAddonFee: 0,
            orderWorkflowAddonFee: 0,
            priceEditingAddonFee: 0,
            shopPriceImageAddonFee: 0,
            orderFees: 0,
            total: 95,
            periodStart: trialEndsAt,
            periodEnd: new Date('2099-01-17T00:00:00.000Z'),
            invoicePdfUrl: '/uploads/billing-documents/RCINV-000001.pdf',
            manualPayments: [],
            subscription: { plan },
            user: { name: 'Runner User', phone: '+26876000000' },
            runner: { user: { name: 'Runner User', phone: '+26876000000' } },
            shop: null,
          }),
        ),
      },
    };
    const service = new BillingService(prisma as any);

    await service.createRunnerBotSubscriptionAndInvoice('runner-1', plan.code);

    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentPeriodStart: trialEndsAt }),
        update: expect.objectContaining({ currentPeriodStart: trialEndsAt }),
      }),
    );
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ periodStart: trialEndsAt }),
      }),
    );
  });

  it('starts RunnerBot paid subscription immediately outside an active trial', async () => {
    const plan = {
      id: 'plan-weekly',
      code: 'RUNNER_STARTER_WEEKLY',
      name: 'Starter Runner',
      audience: 'RUNNER',
      status: 'ACTIVE',
      currency: 'ZAR',
      monthlyPrice: 95,
      billingCycle: 'WEEKLY',
      perConfirmedOrderFee: 3,
      automationAddonPrice: 25,
      orderWorkflowAddonPrice: 35,
      priceEditingAddonPrice: 14,
      shopPriceImageAddonPrice: 14,
    };
    const subscriptionUpsert = jest.fn(({ create }) =>
      Promise.resolve({ id: 'subscription-1', ...create, plan }),
    );
    const before = new Date();
    const prisma = {
      billingPlan: {
        upsert: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(plan),
      },
      runner: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-1',
          userId: 'user-1',
          trialStatus: 'TRIAL_EXPIRED',
          trialEndsAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'user-1' },
        }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: subscriptionUpsert,
      },
      platformInvoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'invoice-existing', total: 95 }),
      },
    };
    const service = new BillingService(prisma as any);

    await service.createRunnerBotSubscriptionAndInvoice('runner-1', plan.code);
    const after = new Date();
    const start = subscriptionUpsert.mock.calls[0][0].create.currentPeriodStart;

    expect(start.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(start.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
