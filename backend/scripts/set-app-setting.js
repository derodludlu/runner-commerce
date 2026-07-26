require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const [, , key, value] = process.argv;

if (!key || value === undefined) {
  console.error('Usage: node scripts/set-app-setting.js <key> <value>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const cleanKey = String(key).trim();
  const cleanValue = String(value).trim();

  if (!cleanKey) {
    throw new Error('Setting key is required');
  }

  await prisma.appSetting.upsert({
    where: { key: cleanKey },
    update: { value: cleanValue },
    create: { key: cleanKey, value: cleanValue },
  });

  console.log(`${cleanKey}=${cleanValue}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
