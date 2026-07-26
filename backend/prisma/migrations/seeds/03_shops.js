"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedShops;
async function seedShops(prisma) {
    const shopOwners = await prisma.user.findMany({
        where: { role: { name: 'SHOP_OWNER' } },
    });
    const shopOwnerMap = new Map(shopOwners.map((u) => [u.name, u.id]));
    const shops = [
        {
            name: 'Maria Grocery Store',
            description: 'Fresh groceries and daily essentials',
            phone: '+11000000001',
            address: '123 Main Street, Downtown',
            ownerId: shopOwnerMap.get('Shop Owner Maria'),
            status: 'ACTIVE',
        },
        {
            name: 'Maria Organic Market',
            description: 'Premium organic products',
            phone: '+11000000002',
            address: '456 Oak Avenue, Uptown',
            ownerId: shopOwnerMap.get('Shop Owner Maria'),
            status: 'ACTIVE',
        },
        {
            name: 'David Electronics',
            description: 'Electronics and gadgets',
            phone: '+11000000003',
            address: '789 Tech Boulevard, Silicon District',
            ownerId: shopOwnerMap.get('Shop Owner David'),
            status: 'ACTIVE',
        },
        {
            name: 'David Phone Hub',
            description: 'Mobile phones and accessories',
            phone: '+11000000004',
            address: '321 Mobile Lane, Tech Park',
            ownerId: shopOwnerMap.get('Shop Owner David'),
            status: 'ACTIVE',
        },
    ];
    for (const shopData of shops) {
        const existing = await prisma.shop.findFirst({
            where: { name: shopData.name },
        });
        if (!existing) {
            await prisma.shop.create({
                data: shopData,
            });
        }
    }
    console.log('✓ Shops seeded');
}
//# sourceMappingURL=03_shops.js.map