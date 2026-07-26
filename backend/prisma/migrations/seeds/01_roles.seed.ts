import { PrismaClient } from '@prisma/client';

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

export default async function seedRoles(prisma: PrismaTransaction) {
  const roles = [
    {
      name: 'SUPERUSER',
      description: 'Super administrator with full system access',
    },
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
