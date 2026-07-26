import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();
const password = 'password123';

const roles = [
  ['SUPERUSER', 'Super administrator with full system access'],
  ['ADMIN', 'System administrator'],
  ['CUSTOMER', 'Customer account'],
  ['RUNNER', 'Delivery runner'],
  ['SHOP_OWNER', 'Shop owner'],
  ['WAREHOUSE', 'Warehouse staff'],
] as const;

const users = [
  ['Super User', '+26876154884', 'superuser@runnercommerce.com', 'SUPERUSER'],
  ['System Admin', '+10000000001', 'admin@runnercommerce.com', 'ADMIN'],
  ['John Customer', '+10000000002', 'john.customer@example.com', 'CUSTOMER'],
  ['Jane Customer', '+10000000003', 'jane.customer@example.com', 'CUSTOMER'],
  ['Shop Owner Maria', '+10000000004', 'maria@shopowner.com', 'SHOP_OWNER'],
  ['Shop Owner David', '+10000000005', 'david@shopowner.com', 'SHOP_OWNER'],
  ['Runner Mike', '+10000000006', 'mike@runner.com', 'RUNNER'],
  ['Runner Sarah', '+10000000007', 'sarah@runner.com', 'RUNNER'],
  [
    'Warehouse Staff',
    '+10000000008',
    'warehouse@runnercommerce.com',
    'WAREHOUSE',
  ],
] as const;

const shops = [
  [
    'Maria Grocery Store',
    'Fresh groceries and daily essentials',
    '+11000000001',
    '123 Main Street, Downtown',
    'maria@shopowner.com',
  ],
  [
    'Maria Organic Market',
    'Premium organic products',
    '+11000000002',
    '456 Oak Avenue, Uptown',
    'maria@shopowner.com',
  ],
  [
    'David Electronics',
    'Electronics and gadgets',
    '+11000000003',
    '789 Tech Boulevard, Silicon District',
    'david@shopowner.com',
  ],
  [
    'David Phone Hub',
    'Mobile phones and accessories',
    '+11000000004',
    '321 Mobile Lane, Tech Park',
    'david@shopowner.com',
  ],
] as const;

const products = [
  [
    'Maria Grocery Store',
    'Fresh Milk 1L',
    'Organic whole milk',
    3.99,
    100,
    'Dairy',
  ],
  [
    'Maria Grocery Store',
    'Whole Wheat Bread',
    'Freshly baked whole wheat bread',
    2.49,
    50,
    'Bakery',
  ],
  [
    'Maria Grocery Store',
    'Free Range Eggs (12 pack)',
    'Farm fresh eggs',
    4.99,
    80,
    'Dairy',
  ],
  [
    'Maria Grocery Store',
    'Organic Bananas 1kg',
    'Sweet organic bananas',
    1.99,
    200,
    'Produce',
  ],
  [
    'Maria Organic Market',
    'Organic Quinoa 500g',
    'Premium organic quinoa',
    6.99,
    40,
    'Grains',
  ],
  [
    'Maria Organic Market',
    'Cold Pressed Olive Oil 500ml',
    'Extra virgin olive oil',
    12.99,
    30,
    'Oils',
  ],
  [
    'David Electronics',
    'Wireless Bluetooth Headphones',
    'Noise cancelling over-ear headphones',
    79.99,
    20,
    'Audio',
  ],
  [
    'David Electronics',
    'USB-C Hub 7-in-1',
    'Multi-port USB-C adapter',
    34.99,
    35,
    'Accessories',
  ],
  [
    'David Electronics',
    'Portable Power Bank 20000mAh',
    'Fast charging power bank',
    44.99,
    45,
    'Accessories',
  ],
  [
    'David Phone Hub',
    'iPhone 15 Pro Max 256GB',
    'Latest iPhone model',
    1199.99,
    10,
    'Phones',
  ],
  [
    'David Phone Hub',
    'Samsung Galaxy S24 Ultra',
    'Flagship Android phone',
    1099.99,
    12,
    'Phones',
  ],
  [
    'David Phone Hub',
    'Phone Case - Universal',
    'Protective silicone case',
    14.99,
    100,
    'Accessories',
  ],
] as const;

async function upsertByName<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  return (await find()) ?? create();
}

async function main() {
  console.log('Seeding Runner Commerce demo data...');

  const passwordHash = await bcrypt.hash(password, 10);

  for (const [name, description] of roles) {
    await prisma.role.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
  }

  const roleMap = new Map(
    (await prisma.role.findMany()).map((role) => [role.name, role.id]),
  );

  for (const [name, phone, email, roleName] of users) {
    await prisma.user.upsert({
      where: { email },
      update: {
        name,
        phone,
        email,
        passwordHash,
        roleId: roleMap.get(roleName)!,
        status: 'ACTIVE',
      },
      create: {
        name,
        phone,
        email,
        passwordHash,
        roleId: roleMap.get(roleName)!,
        status: 'ACTIVE',
      },
    });
  }

  const userByEmail = new Map(
    (await prisma.user.findMany()).map((user) => [user.email, user]),
  );

  for (const [name, description, phone, address, ownerEmail] of shops) {
    const owner = userByEmail.get(ownerEmail);
    if (!owner) throw new Error(`Missing shop owner ${ownerEmail}`);

    await upsertByName(
      () => prisma.shop.findFirst({ where: { name } }),
      () =>
        prisma.shop.create({
          data: {
            name,
            description,
            phone,
            address,
            ownerId: owner.id,
            status: 'ACTIVE',
          },
        }),
    );
  }

  const shopMap = new Map(
    (await prisma.shop.findMany()).map((shop) => [shop.name, shop]),
  );

  for (const [
    shopName,
    name,
    description,
    basePrice,
    stockQty,
    category,
  ] of products) {
    const shop = shopMap.get(shopName);
    if (!shop) throw new Error(`Missing shop ${shopName}`);

    const imageText = encodeURIComponent(name);
    const images = [
      `https://dummyjson.com/image/400x300/e0f2fe/0369a1?text=${imageText}`,
    ] as Prisma.InputJsonValue;

    const existing = await prisma.product.findFirst({
      where: { shopId: shop.id, name },
    });

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          description,
          basePrice,
          stockQty,
          category,
          status: 'ACTIVE',
          images,
        },
      });
    } else {
      await prisma.product.create({
        data: {
          shopId: shop.id,
          name,
          description,
          basePrice,
          stockQty,
          category,
          status: 'ACTIVE',
          images,
        },
      });
    }
  }

  const mikeUser = userByEmail.get('mike@runner.com');
  const sarahUser = userByEmail.get('sarah@runner.com');
  if (!mikeUser || !sarahUser) throw new Error('Missing runner users');

  const runners = [
    [mikeUser.id, 'BIKE', 'RC-MIKE-01', '+10000000006', 'Downtown'],
    [sarahUser.id, 'CAR', 'RC-SARAH-01', '+10000000007', 'Uptown'],
  ] as const;

  for (const [
    userId,
    vehicleType,
    vehicleNumber,
    phone,
    serviceArea,
  ] of runners) {
    const runner = await prisma.runner.upsert({
      where: { userId },
      update: {
        vehicleType,
        vehicleNumber,
        phone,
        serviceArea,
        status: 'ACTIVE',
      },
      create: {
        userId,
        vehicleType,
        vehicleNumber,
        phone,
        serviceArea,
        status: 'ACTIVE',
      },
    });

    await prisma.runnerWallet.upsert({
      where: { runnerId: runner.id },
      update: {},
      create: { runnerId: runner.id, balance: 0, pending: 0 },
    });
  }

  const runnerRecords = await prisma.runner.findMany();
  const activeProducts = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
  });

  for (const runner of runnerRecords) {
    for (const product of activeProducts.slice(0, 8)) {
      const markup = runner.userId === mikeUser.id ? 0.1 : 0.15;
      await prisma.runnerListing.upsert({
        where: {
          runnerId_productId: { runnerId: runner.id, productId: product.id },
        },
        update: {
          markup,
          runnerPrice: Number((product.basePrice * (1 + markup)).toFixed(2)),
          status: 'ACTIVE',
          shopId: product.shopId,
        },
        create: {
          runnerId: runner.id,
          productId: product.id,
          markup,
          runnerPrice: Number((product.basePrice * (1 + markup)).toFixed(2)),
          status: 'ACTIVE',
          shopId: product.shopId,
        },
      });
    }
  }

  const john = userByEmail.get('john.customer@example.com');
  if (!john) throw new Error('Missing customer user');

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: { status: 'ACTIVE' },
    create: {
      code: 'WELCOME10',
      description: '10% off first order',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 10,
      perUserLimit: 1,
      validFrom: new Date(),
      status: 'ACTIVE',
    },
  });

  const listing = await prisma.runnerListing.findFirst({
    where: { status: 'ACTIVE' },
    include: { product: true, runner: true },
  });
  if (!listing) throw new Error('No runner listing available for order seed');

  const order = await upsertByName(
    () => prisma.order.findFirst({ where: { notes: 'Seed demo order' } }),
    () =>
      prisma.order.create({
        data: {
          customerPhone: john.phone,
          customerId: john.id,
          runnerId: listing.runnerId,
          shopId: listing.product.shopId,
          status: 'COMPLETED',
          subtotal: listing.runnerPrice,
          tax: 0,
          shippingFee: 5,
          totalAmount: listing.runnerPrice + 5,
          notes: 'Seed demo order',
          items: {
            create: {
              listingId: listing.id,
              productId: listing.productId,
              quantity: 1,
              unitPrice: listing.runnerPrice,
              shopPrice: listing.product.basePrice,
              commission: listing.runnerPrice - listing.product.basePrice,
              status: 'COMPLETED',
            },
          },
        },
      }),
  );

  await prisma.payment.upsert({
    where: { orderId: order.id },
    update: { status: 'SUCCEEDED' },
    create: {
      orderId: order.id,
      amount: order.totalAmount,
      method: 'CARD',
      status: 'SUCCEEDED',
      currency: 'usd',
      transactionId: 'seed_txn_001',
    },
  });

  const existingReview = await prisma.review.findFirst({
    where: { productId: listing.productId, customerId: john.id },
  });
  if (!existingReview) {
    await prisma.review.create({
      data: {
        productId: listing.productId,
        customerId: john.id,
        orderId: order.id,
        rating: 5,
        title: 'Great service',
        comment: 'Seeded review for demo browsing.',
        verified: true,
      },
    });
  }

  const existingNotification = await prisma.notification.findFirst({
    where: { userId: john.id, title: 'Welcome to Runner Commerce' },
  });
  if (!existingNotification) {
    await prisma.notification.create({
      data: {
        userId: john.id,
        title: 'Welcome to Runner Commerce',
        message: 'Your demo account is ready.',
        type: 'INFO',
        channel: 'IN_APP',
        status: 'PENDING',
      },
    });
  }

  await upsertByName(
    () =>
      prisma.supportTicket.findFirst({
        where: { subject: 'Seed support ticket' },
      }),
    () =>
      prisma.supportTicket.create({
        data: {
          customerId: john.id,
          subject: 'Seed support ticket',
          description: 'Demo support ticket for admin/support screens.',
          priority: 'MEDIUM',
          status: 'OPEN',
          category: 'OTHER',
          messages: {
            create: {
              senderId: john.id,
              message: 'Hello, I need help with a seeded demo order.',
            },
          },
        },
      }),
  );

  console.log('Seed complete.');
  console.log(`Demo password for all seeded users: ${password}`);
  console.log('Useful logins:');
  console.log('  admin@runnercommerce.com');
  console.log('  john.customer@example.com');
  console.log('  maria@shopowner.com');
  console.log('  mike@runner.com');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
