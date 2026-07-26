import { WhatsAppImportsService } from './whatsapp-imports.service';

describe('WhatsAppImportsService price parsing', () => {
  const service = new WhatsAppImportsService(
    null as never,
    null as never,
    null as never,
  );
  const parsePricing = (caption: string) =>
    (service as any).parseCaptionPricing(
      (service as any).normalizeCurrencyText(caption),
    );

  it('keeps retail and two-piece stock pricing and calculates savings', () => {
    const pricing = parsePricing('*2pcs* *STOCK R95* *EACH R100*');

    expect(pricing.regularUnitPrice).toBe(100);
    expect(pricing.bulkQuantity).toBe(2);
    expect(pricing.bulkUnitPrice).toBe(95);
    expect(pricing.bulkTotal).toBe(190);
    expect(pricing.bulkSavings).toBe(10);
    expect(pricing.bulkSavingsPerItem).toBe(5);
    expect(pricing.bulkSavingsPercent).toBe(5);
  });

  it('calculates an explicit bulk special against the regular unit price', () => {
    const pricing = parsePricing('Price R100\n3 for R240');

    expect(pricing.regularUnitPrice).toBe(100);
    expect(pricing.bulkQuantity).toBe(3);
    expect(pricing.bulkUnitPrice).toBe(80);
    expect(pricing.bulkTotal).toBe(240);
    expect(pricing.bulkSavings).toBe(60);
    expect(pricing.bulkSavingsPercent).toBe(20);
  });

  it('shows a bulk unit without inventing savings when no regular price exists', () => {
    const pricing = parsePricing('3 for R150 (R50 each)');

    expect(pricing.regularUnitPrice).toBeNull();
    expect(pricing.bulkQuantity).toBe(3);
    expect(pricing.bulkUnitPrice).toBe(50);
    expect(pricing.bulkTotal).toBe(150);
    expect(pricing.bulkSavings).toBe(0);
  });

  it('does not treat the quantity in a compact sale as the unit price', () => {
    const pricing = parsePricing('SALE special 4 for R9999');

    expect(pricing.standardPrice).toBeNull();
    expect(pricing.bulkQuantity).toBe(4);
    expect(pricing.bulkTotal).toBe(99.99);
    expect(pricing.bulkUnitPrice).toBe(25);
    expect(pricing.basePrice).toBe(99.99);
  });
  it('keeps four-digit whole-rand clothing prices ending in 00', () => {
    expect(
      parsePricing('Restock size white 38,40,42\nR 1200 quality arrived')
        .basePrice,
    ).toBe(1200);
    expect(
      parsePricing('black 38,39,40,41,42\nR1200 quality arrived').basePrice,
    ).toBe(1200);
    expect(parsePricing('R 1000 quality arrived').basePrice).toBe(1000);
  });

  it('uses explicit bulk totals as the base runner price', () => {
    const pricing = parsePricing('Restock\nArrive Tomorow\n12 For R50 🔥');

    expect(pricing.bulkQuantity).toBe(12);
    expect(pricing.bulkTotal).toBe(50);
    expect(pricing.bulkUnitPrice).toBe(4.17);
    expect(pricing.basePrice).toBe(50);
  });

  it('parses bulk prices with emoji arrows and spaced currency symbols', () => {
    const pricing = parsePricing(
      '3 for 👉R 20\n5 for 👉R 30\n1 pack (24 pcs inside) 👉R 120 blackopal lip gloss',
    );

    expect(pricing.bulkSpecials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 3, totalPrice: 20 }),
        expect.objectContaining({ quantity: 5, totalPrice: 30 }),
        expect.objectContaining({ quantity: 24, totalPrice: 120 }),
      ]),
    );
    expect(pricing.bulkQuantity).toBe(3);
    expect(pricing.bulkTotal).toBe(20);
    expect(pricing.basePrice).toBe(20);
  });

  it('parses superscript cents in special price bulk variants', () => {
    const pricing = parsePricing(
      'New arrived forever Fragrance 35ml\n💫💫 Speical price  3 for  R89.⁹⁹\n💫💫Speical price  10 for  R289.⁹⁹',
    );

    expect(pricing.bulkSpecials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 3, totalPrice: 89.99 }),
        expect.objectContaining({ quantity: 10, totalPrice: 289.99 }),
      ]),
    );
    expect(pricing.basePrice).toBe(89.99);
  });

  it('parses additive bundle quantities before emoji-arrow prices', () => {
    const pricing = parsePricing('Good quality special 2+2+1+1👉🏼R 380');

    expect(pricing.bulkQuantity).toBe(6);
    expect(pricing.bulkTotal).toBe(380);
    expect(pricing.bulkUnitPrice).toBe(63.33);
    expect(pricing.basePrice).toBe(380);
  });

  it('treats a lower stock price as a bulk unit price without inventing a quantity', () => {
    const pricing = parsePricing('STOCK R85 EACH R90 SIZE 4-8');

    expect(pricing.basePrice).toBe(85);
    expect(pricing.regularUnitPrice).toBe(90);
    expect(pricing.stockIsBulkPrice).toBe(true);
    expect(pricing.bulkUnitPrice).toBe(85);
    expect(pricing.bulkQuantity).toBeNull();
    expect(pricing.bulkTotal).toBeNull();
    expect(pricing.bulkSavingsPerItem).toBe(5);
    expect(pricing.bulkSavingsPercent).toBe(6);
  });

  it('classifies stock R50 and each R60 as wholesale and retail pricing', () => {
    const pricing = parsePricing(
      'STOCK R50\nEACH R60\nFREE SIZE\nRunner price: R 65.00',
    );

    expect(pricing.basePrice).toBe(50);
    expect(pricing.stockIsBulkPrice).toBe(true);
    expect(pricing.bulkUnitPrice).toBe(50);
    expect(pricing.regularUnitPrice).toBe(60);
    expect(pricing.bulkQuantity).toBeNull();
    expect(pricing.bulkTotal).toBeNull();
    expect(pricing.bulkSavingsPerItem).toBe(10);
    expect(pricing.bulkSavingsPercent).toBe(17);
  });

  it('parses compact quantity-for pricing with a retail each price', () => {
    const pricing = parsePricing('3FOR R54\nEACH R20');

    expect(pricing.bulkQuantity).toBe(3);
    expect(pricing.bulkTotal).toBe(54);
    expect(pricing.bulkUnitPrice).toBe(18);
    expect(pricing.regularUnitPrice).toBe(20);
    expect(pricing.bulkSavings).toBe(6);
  });

  it('parses any spaced quantity-for bulk text like stock pricing', () => {
    const pricing = parsePricing('5 For R100\nEACH R25');

    expect(pricing.bulkQuantity).toBe(5);
    expect(pricing.bulkTotal).toBe(100);
    expect(pricing.bulkUnitPrice).toBe(20);
    expect(pricing.regularUnitPrice).toBe(25);
    expect(pricing.bulkSavings).toBe(25);
  });

  it('parses compact quantity-for bulk text without requiring a currency symbol', () => {
    const pricing = parsePricing('12FOR 300\nEACH R30');

    expect(pricing.bulkQuantity).toBe(12);
    expect(pricing.bulkTotal).toBe(300);
    expect(pricing.bulkUnitPrice).toBe(25);
    expect(pricing.regularUnitPrice).toBe(30);
    expect(pricing.bulkSavings).toBe(60);
  });
});

describe('WhatsAppImportsService runner-submitted shop destination', () => {
  it('uses the runner-submitted shopping destination for a joined group', async () => {
    const prisma = {
      runnerSubmittedShopLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            notes: [
              'Shopping destination: Manzini',
              'Joined WhatsApp group id: 120363999@g.us',
            ].join('\n'),
            runner: {
              serviceArea: 'Mbabane',
              phase1Setup: { shopTown: 'Matsapha' },
            },
          },
        ]),
      },
    };
    const service = new WhatsAppImportsService(
      prisma as any,
      null as never,
      null as never,
    );

    const destination = await (
      service as any
    ).runnerSubmittedShoppingDestinationForGroup('120363999@g.us');

    expect(destination).toBe('Manzini');
    expect(prisma.runnerSubmittedShopLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notes: { contains: 'Joined WhatsApp group id: 120363999@g.us' },
        }),
      }),
    );
  });
});

describe('WhatsAppImportsService order conversation', () => {
  const service = new WhatsAppImportsService(
    null as never,
    null as never,
    null as never,
  ) as any;

  it('normalizes an interactive quantity reply', () => {
    expect(service.normalizeCustomerInteractionReply('order:qty:3')).toBe(
      'Quantity: 3',
    );
  });

  it('accepts a plain numeric quantity and rejects color text as quantity', () => {
    expect(service.parseCustomerQuantity('2')).toBe(2);
    expect(service.hasExplicitCustomerQuantity('2')).toBe(true);
    expect(service.hasExplicitCustomerQuantity('black')).toBe(false);
  });

  it('exposes confirm, edit, and cancel actions', () => {
    const interaction = service.confirmationInteraction();
    expect(interaction.buttons.map((button: any) => button.id)).toEqual([
      'order:confirm',
      'order:edit',
      'order:cancel',
    ]);
  });

  it('uses structured state before legacy conversation text', () => {
    expect(
      service.getStoredCustomerOrderSelection({
        conversationState: {
          size: 'M',
          color: 'Black',
          quantity: 2,
          quantityProvided: true,
        },
        messageText: 'Size: XL\nColor: Red\nQuantity: 9',
      }),
    ).toMatchObject({
      size: 'M',
      color: 'Black',
      quantity: 2,
      quantityProvided: true,
    });
  });

  it('replaces an edited field with the latest reply', () => {
    expect(
      service.applyCustomerReplyToSelection(
        {
          size: 'M',
          color: 'Black',
          quantity: 1,
          quantityProvided: true,
          note: null,
        },
        'Size: XL',
        'size',
      ).size,
    ).toBe('XL');
  });

  it('distinguishes a code-only lookup from an order-start reply', () => {
    expect(service.isOrderCodeOnlyMessage('RC-1234ABCD')).toBe(true);
    expect(service.isOrderCodeOnlyMessage('Order code: RC-1234ABCD')).toBe(
      true,
    );
    expect(service.isOrderCodeOnlyMessage('ORDER RC-1234ABCD')).toBe(false);
    expect(service.isOrderCodeOnlyMessage('order:start:RC-1234ABCD')).toBe(
      false,
    );
  });

  it('builds a clickable start-order link carrying the product code', () => {
    expect(
      service.buildWhatsAppStartOrderUrl('+268 7615 4884', 'RC-1234ABCD'),
    ).toBe('https://wa.me/26876154884?text=ORDER%20RC-1234ABCD');
  });
});

describe('WhatsAppImportsService image order intake', () => {
  it('asks for an RC order code when customer image matching finds no item', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppOrderRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new WhatsAppImportsService(
      prisma as never,
      null as never,
      null as never,
    ) as any;
    service.findStampedMediaMatch = jest.fn().mockResolvedValue(null);

    const result = await service.ingestOrderRequestFromWebhook({
      messageText: '[Customer sent a reference image]',
      customerPhone: '+26876000000',
      recipientPhone: '+26876111111',
      customerImageUrls: [
        'http://localhost/uploads/customer-reference/one.jpg',
      ],
      customerImageHashes: [{ sha256: 'a'.repeat(64) }],
    });

    expect(result).toMatchObject({
      status: 'ORDER_CODE_REQUIRED',
      orderRequestId: null,
      runnerNotification: null,
    });
    expect(result.customerReply).toContain('ORDER CODE NEEDED');
    expect(result.customerReply).toContain('Please send the RC order code');
    expect(result.customerReply).toContain(
      'Support: https://wa.me/26876154884?text=I%20need%20help%20finding%20my%20runner%20or%20order%20code',
    );
  });
});

describe('WhatsAppImportsService WhatsApp order role protection', () => {
  it('rejects incoming orders from runner, shop owner, admin, and superuser numbers', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'runner-user-1',
          name: 'Runner One',
          phone: '+26876154884',
          role: { name: 'RUNNER' },
        }),
      },
    };
    const service = new WhatsAppImportsService(
      prisma as never,
      null as never,
      null as never,
    ) as any;

    const result = await service.ingestOrderRequestFromWebhook({
      messageText: 'ORDER RC-TEST123',
      customerPhone: '+26876154884',
      recipientPhone: '+26876000000',
    });

    expect(result).toMatchObject({
      status: 'REJECTED_ROLE_PHONE',
      orderRequestId: null,
      runnerNotification: null,
      rejectedRole: 'RUNNER',
    });
    expect(result.customerReply).toContain('This order was not accepted.');
    expect(result.customerReply).toContain('registered as a Runner account');
  });
});
