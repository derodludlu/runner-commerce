const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const runnerId = process.argv[2];
  const feeRate = Number(process.argv[3]);

  if (!runnerId) {
    throw new Error('Usage: node scripts/apply-runner-fee-policy.js <runnerId> <feeRate>');
  }

  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
    throw new Error('feeRate must be a decimal between 0 and 1');
  }

  const runner = await prisma.runner.findUnique({
    where: { id: runnerId },
    select: {
      id: true,
      phone: true,
      user: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!runner) {
    throw new Error(`Runner ${runnerId} not found`);
  }

  const updatedShopLinks = await prisma.runnerShopLink.updateMany({
    where: {
      runnerId,
      markupPercent: { not: feeRate },
    },
    data: {
      markupPercent: feeRate,
    },
  });

  const listings = await prisma.runnerListing.findMany({
    where: {
      runnerId,
      markup: { not: feeRate },
    },
    select: {
      id: true,
      product: {
        select: {
          basePrice: true,
        },
      },
    },
  });

  for (const listing of listings) {
    const runnerPrice =
      Math.round(Number(listing.product.basePrice || 0) * (1 + feeRate) * 100) /
      100;

    await prisma.runnerListing.update({
      where: { id: listing.id },
      data: {
        markup: feeRate,
        runnerPrice,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        runner,
        feeRate,
        updatedShopLinks: updatedShopLinks.count,
        updatedListings: listings.length,
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
