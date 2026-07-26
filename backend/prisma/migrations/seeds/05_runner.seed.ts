import { PrismaClient } from '@prisma/client';

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

export default async function seedRunner(prisma: PrismaTransaction) {
  const runnerUsers = await prisma.user.findMany({
    where: { role: { name: 'RUNNER' } },
  });

  const runners = [
    {
      userId: runnerUsers[0]?.id,
      rating: 4.8,
      totalOrders: 150,
      totalEarnings: 4500.0,
      status: 'ACTIVE',
      vehicleType: 'MOTORCYCLE',
    },
    {
      userId: runnerUsers[1]?.id,
      rating: 4.9,
      totalOrders: 200,
      totalEarnings: 6000.0,
      status: 'ACTIVE',
      vehicleType: 'CAR',
    },
  ];

  for (const runnerData of runners) {
    if (runnerData.userId) {
      const runner = await prisma.runner.upsert({
        where: { userId: runnerData.userId },
        update: {},
        create: runnerData,
      });

      // Create wallet for each runner
      await prisma.runnerWallet.upsert({
        where: { runnerId: runner.id },
        update: {},
        create: {
          runnerId: runner.id,
          balance: 0,
          pending: 0,
        },
      });
    }
  }

  console.log('✓ Runners seeded');
}
