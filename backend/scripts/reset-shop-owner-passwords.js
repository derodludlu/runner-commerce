require('dotenv/config');

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const targetPassword = process.env.RESET_SHOP_OWNER_PASSWORD || 'password123';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      role: { name: 'SHOP_OWNER' },
      email: null,
      shops: { some: {} },
    },
    include: {
      role: true,
      shops: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  const passwordHash = await bcrypt.hash(targetPassword, 10);
  const reset = [];
  const skipped = [];

  for (const user of users) {
    const alreadyMatches = await bcrypt.compare(
      targetPassword,
      user.passwordHash,
    );

    if (alreadyMatches) {
      skipped.push({
        name: user.name,
        phone: user.phone,
        reason: 'already matches target password',
      });
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    reset.push({
      name: user.name,
      phone: user.phone,
      shops: user.shops.map((shop) => shop.name),
    });
  }

  console.log(
    JSON.stringify(
      {
        password: targetPassword,
        resetCount: reset.length,
        skippedCount: skipped.length,
        reset,
        skipped,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
