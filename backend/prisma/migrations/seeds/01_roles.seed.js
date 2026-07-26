"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedRoles;
async function seedRoles(prisma) {
    const roles = [
        { name: 'ADMIN', description: 'System administrator' },
        { name: 'CUSTOMER', description: 'Customer account' },
        { name: 'RUNNER', description: 'Delivery runner' },
        { name: 'SHOP_OWNER', description: 'Shop owner' },
        { name: 'WAREHOUSE', description: 'Warehouse staff' },
    ];
    for (const role of roles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: {},
            create: role,
        });
    }
    console.log('✓ Roles seeded');
}
//# sourceMappingURL=01_roles.seed.js.map