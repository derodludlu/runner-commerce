import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { WhatsAppImportsService } from '../src/modules/whatsapp-imports/whatsapp-imports.service';

const prisma = new PrismaClient();
const parser = new WhatsAppImportsService(
  null as never,
  null as never,
  null as never,
);

const pricingKeys = [
  'basePrice',
  'unitPrice',
  'stockPrice',
  'eachPrice',
  'stockIsBulkPrice',
  'regularUnitPrice',
  'bulkUnitPrice',
  'bulkQuantity',
  'bulkTotal',
  'bulkSavings',
  'bulkSavingsPerItem',
  'bulkSavingsPercent',
  'priceConfidence',
  'priceWarnings',
  'rawPriceCandidates',
] as const;

async function main() {
  const imports = await prisma.whatsAppImport.findMany({
    where: { productId: { not: null } },
    select: {
      id: true,
      caption: true,
      mediaUrls: true,
      parsedDraft: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const item of imports) {
    const parsed = (parser as any).parsePost(
      item.caption,
      Array.isArray(item.mediaUrls) ? item.mediaUrls : [],
    ) as Record<string, unknown> | null;
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const existing =
      item.parsedDraft &&
      typeof item.parsedDraft === 'object' &&
      !Array.isArray(item.parsedDraft)
        ? item.parsedDraft
        : {};
    const pricing: Record<string, unknown> = {};
    for (const key of pricingKeys) {
      if (parsed[key] !== undefined) pricing[key] = parsed[key];
    }

    await prisma.whatsAppImport.update({
      where: { id: item.id },
      data: {
        parsedDraft: {
          ...(existing as Record<string, unknown>),
          ...pricing,
        } as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ scanned: imports.length, updated, skipped }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
