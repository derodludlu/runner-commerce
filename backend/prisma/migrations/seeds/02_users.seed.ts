import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

export default async function seedUsers(prisma: PrismaTransaction) {
  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));

  const users = [
    {
      name: 'Super User',
      phone: '+26876154884',
      email: 'superuser@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SUPERUSER')!,
      status: 'ACTIVE',
    },
    {
      name: 'System Admin',
      phone: '+10000000001',
      email: 'admin@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('ADMIN')!,
      status: 'ACTIVE',
    },
    {
      name: 'John Customer',
      phone: '+10000000002',
      email: 'john.customer@example.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('CUSTOMER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Jane Customer',
      phone: '+10000000003',
      email: 'jane.customer@example.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('CUSTOMER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Shop Owner Maria',
      phone: '+10000000004',
      email: 'maria@shopowner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SHOP_OWNER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Shop Owner David',
      phone: '+10000000005',
      email: 'david@shopowner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SHOP_OWNER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Runner Mike',
      phone: '+10000000006',
      email: 'mike@runner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('RUNNER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Runner Sarah',
      phone: '+10000000007',
      email: 'sarah@runner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('RUNNER')!,
      status: 'ACTIVE',
    },
    {
      name: 'Warehouse Staff',
      phone: '+10000000008',
      email: 'warehouse@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('WAREHOUSE')!,
      status: 'ACTIVE',
    },
  ];

  for (const userData of users) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        name: userData.name,
        phone: userData.phone,
        passwordHash: userData.passwordHash,
        roleId: userData.roleId,
        status: userData.status,
      },
      create: userData,
    });
  }

  console.log('✓ Users seeded');
}
