"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedOrders;
async function seedOrders(prisma) {
    const customers = await prisma.user.findMany({
        where: { role: { name: 'CUSTOMER' } },
    });
    const runners = await prisma.runner.findMany();
    const shops = await prisma.shop.findMany();
    const listings = await prisma.runnerListing.findMany({
        include: { product: true },
    });
    if (customers.length === 0 || listings.length === 0) {
        console.log('⚠ Skipping orders - no customers or listings found');
        return;
    }
    const orders = [
        {
            customerPhone: customers[0]?.phone || '+10000000001',
            customerId: customers[0]?.id,
            runnerId: runners[0]?.id,
            shopId: shops.find((s) => s.name === 'Maria Grocery Store')?.id,
            status: 'COMPLETED',
            totalAmount: 25.44,
            subtotal: 22.47,
            tax: 1.97,
            shippingFee: 1.0,
            shippingAddress: JSON.stringify({
                street: '123 Customer Street',
                city: 'Downtown',
                state: 'CA',
                zipCode: '90001',
            }),
            notes: 'Please ring the doorbell',
            items: [
                {
                    listingId: listings.find((l) => l.product.name === 'Fresh Milk 1L')
                        ?.id,
                    productId: listings.find((l) => l.product.name === 'Fresh Milk 1L')
                        ?.productId,
                    quantity: 2,
                    unitPrice: 4.55,
                    shopPrice: 3.99,
                    commission: 0.56,
                    status: 'COMPLETED',
                },
                {
                    listingId: listings.find((l) => l.product.name === 'Whole Wheat Bread')?.id,
                    productId: listings.find((l) => l.product.name === 'Whole Wheat Bread')?.productId,
                    quantity: 3,
                    unitPrice: 2.86,
                    shopPrice: 2.49,
                    commission: 0.37,
                    status: 'COMPLETED',
                },
                {
                    listingId: listings.find((l) => l.product.name === 'Free Range Eggs (12 pack)')?.id,
                    productId: listings.find((l) => l.product.name === 'Free Range Eggs (12 pack)')?.productId,
                    quantity: 2,
                    unitPrice: 5.74,
                    shopPrice: 4.99,
                    commission: 0.75,
                    status: 'COMPLETED',
                },
            ],
        },
        {
            customerPhone: customers[1]?.phone || '+10000000002',
            customerId: customers[1]?.id,
            runnerId: runners[1]?.id,
            shopId: shops.find((s) => s.name === 'David Electronics')?.id,
            status: 'IN_PROGRESS',
            totalAmount: 94.48,
            subtotal: 89.98,
            tax: 4.5,
            shippingFee: 0,
            shippingAddress: JSON.stringify({
                street: '456 Tech Avenue',
                city: 'Silicon Valley',
                state: 'CA',
                zipCode: '94025',
            }),
            notes: 'Leave at reception',
            items: [
                {
                    listingId: listings.find((l) => l.product.name === 'USB-C Hub 7-in-1')
                        ?.id,
                    productId: listings.find((l) => l.product.name === 'USB-C Hub 7-in-1')
                        ?.productId,
                    quantity: 1,
                    unitPrice: 40.24,
                    shopPrice: 34.99,
                    commission: 5.25,
                    status: 'PENDING',
                },
                {
                    listingId: listings.find((l) => l.product.name === 'Portable Power Bank 20000mAh')?.id,
                    productId: listings.find((l) => l.product.name === 'Portable Power Bank 20000mAh')?.productId,
                    quantity: 1,
                    unitPrice: 51.74,
                    shopPrice: 44.99,
                    commission: 6.75,
                    status: 'PENDING',
                },
            ],
        },
        {
            customerPhone: customers[0]?.phone || '+10000000001',
            customerId: customers[0]?.id,
            runnerId: runners[0]?.id,
            shopId: shops.find((s) => s.name === 'Maria Organic Market')?.id,
            status: 'PENDING',
            totalAmount: 35.66,
            subtotal: 32.96,
            tax: 2.7,
            shippingFee: 0,
            shippingAddress: JSON.stringify({
                street: '123 Customer Street',
                city: 'Downtown',
                state: 'CA',
                zipCode: '90001',
            }),
            notes: 'Organic products only',
            items: [
                {
                    listingId: listings.find((l) => l.product.name === 'Organic Quinoa 500g')?.id,
                    productId: listings.find((l) => l.product.name === 'Organic Quinoa 500g')?.productId,
                    quantity: 2,
                    unitPrice: 8.04,
                    shopPrice: 6.99,
                    commission: 1.05,
                    status: 'PENDING',
                },
                {
                    listingId: listings.find((l) => l.product.name === 'Cold Pressed Olive Oil 500ml')?.id,
                    productId: listings.find((l) => l.product.name === 'Cold Pressed Olive Oil 500ml')?.productId,
                    quantity: 1,
                    unitPrice: 14.94,
                    shopPrice: 12.99,
                    commission: 1.95,
                    status: 'PENDING',
                },
                {
                    listingId: listings.find((l) => l.product.name === 'Organic Honey 350g')?.id,
                    productId: listings.find((l) => l.product.name === 'Organic Honey 350g')?.productId,
                    quantity: 1,
                    unitPrice: 11.49,
                    shopPrice: 9.99,
                    commission: 1.5,
                    status: 'PENDING',
                },
            ],
        },
    ];
    for (const orderData of orders) {
        const { items, ...orderInfo } = orderData;
        const order = await prisma.order.create({
            data: orderInfo,
        });
        for (const item of items) {
            await prisma.orderItem.create({
                data: {
                    orderId: order.id,
                    ...item,
                },
            });
        }
    }
    console.log(`✓ Orders seeded (${orders.length} orders created)`);
}
//# sourceMappingURL=07_orders.seed.js.map