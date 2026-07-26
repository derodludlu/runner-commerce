"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedBatches;
async function seedBatches(prisma) {
    const shops = await prisma.shop.findMany();
    const orders = await prisma.order.findMany();
    if (shops.length === 0) {
        console.log('⚠ Skipping batches - no shops found');
        return;
    }
    // Create batches for each shop
    const batches = [
        {
            shopId: shops.find((s) => s.name === 'Maria Grocery Store')?.id,
            status: 'IN_PROGRESS',
            priority: 1,
            notes: 'Morning pickup batch',
            orderIds: orders.filter((o) => o.status === 'COMPLETED').map((o) => o.id),
        },
        {
            shopId: shops.find((s) => s.name === 'David Electronics')?.id,
            status: 'PENDING',
            priority: 2,
            notes: 'Electronics batch - handle with care',
            orderIds: orders
                .filter((o) => o.status === 'IN_PROGRESS')
                .map((o) => o.id),
        },
        {
            shopId: shops.find((s) => s.name === 'Maria Organic Market')?.id,
            status: 'PENDING',
            priority: 1,
            notes: 'Organic products batch',
            orderIds: orders.filter((o) => o.status === 'PENDING').map((o) => o.id),
        },
    ];
    for (const batchData of batches) {
        const { orderIds, ...batchInfo } = batchData;
        const batch = await prisma.batch.create({
            data: batchInfo,
        });
        // Link orders to batch
        for (const orderId of orderIds) {
            await prisma.batchOrder.create({
                data: {
                    batchId: batch.id,
                    orderId,
                },
            });
        }
        // Create pick lists for products in the batch orders
        const batchOrders = await prisma.batchOrder.findMany({
            where: { batchId: batch.id },
            include: { order: { include: { items: true } } },
        });
        const productPickMap = new Map();
        for (const batchOrder of batchOrders) {
            for (const item of batchOrder.order.items) {
                const currentQty = productPickMap.get(item.productId) || 0;
                productPickMap.set(item.productId, currentQty + item.quantity);
            }
        }
        for (const [productId, quantity] of productPickMap.entries()) {
            await prisma.pickList.create({
                data: {
                    batchId: batch.id,
                    productId,
                    quantity,
                    pickedQty: 0,
                    status: 'PENDING',
                },
            });
        }
    }
    console.log('✓ Batches seeded');
}
//# sourceMappingURL=08_batches.seed.js.map