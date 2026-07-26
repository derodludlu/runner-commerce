"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedListings;
async function seedListings(prisma) {
    const runners = await prisma.runner.findMany();
    const products = await prisma.product.findMany();
    if (runners.length === 0 || products.length === 0) {
        console.log('⚠ Skipping listings - no runners or products found');
        return;
    }
    const listings = [];
    // Create listings for each runner with a markup on products
    for (const runner of runners) {
        // Each runner lists a subset of products with their markup
        const markupPercent = 0.15; // 15% markup
        for (const product of products) {
            const runnerPrice = product.basePrice * (1 + markupPercent);
            listings.push({
                runnerId: runner.id,
                productId: product.id,
                markup: markupPercent,
                runnerPrice: parseFloat(runnerPrice.toFixed(2)),
                status: 'ACTIVE',
            });
        }
    }
    for (const listingData of listings) {
        await prisma.runnerListing.upsert({
            where: {
                runnerId_productId: {
                    runnerId: listingData.runnerId,
                    productId: listingData.productId,
                },
            },
            update: {},
            create: listingData,
        });
    }
    console.log(`✓ Listings seeded (${listings.length} listings created)`);
}
//# sourceMappingURL=06_listings.seed.js.map