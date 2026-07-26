"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const bcrypt = __importStar(require("bcrypt"));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not found in .env');
}
const pool = new pg_1.Pool({ connectionString: DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('🌱 Starting database seed...\n');
    console.log('📋 Creating roles...');
    const roles = [
        { id: 'admin', name: 'ADMIN', description: 'System Administrator' },
        { id: 'customer', name: 'CUSTOMER', description: 'Customer' },
        { id: 'runner', name: 'RUNNER', description: 'Delivery Runner' },
        { id: 'shop_owner', name: 'SHOP_OWNER', description: 'Shop Owner' },
        { id: 'warehouse', name: 'WAREHOUSE', description: 'Warehouse Staff' },
    ];
    for (const role of roles) {
        await prisma.role.upsert({
            where: { id: role.id },
            update: {},
            create: role,
        });
    }
    console.log('✅ Roles created:', roles.map((r) => r.name).join(', '));
    console.log('\n👤 Creating users...');
    const users = [
        {
            id: 'admin-user',
            phone: '+1000000000',
            name: 'Admin User',
            email: 'admin@runnercommerce.com',
            password: 'admin123',
            roleId: 'admin',
        },
        {
            id: 'customer-user',
            phone: '+1000000001',
            name: 'Test Customer',
            email: 'customer@runnercommerce.com',
            password: 'customer123',
            roleId: 'customer',
        },
        {
            id: 'shop-owner-user',
            phone: '+1000000002',
            name: 'Multi Shop Owner',
            email: 'owner@runnercommerce.com',
            password: 'shop123',
            roleId: 'shop_owner',
        },
        {
            id: 'runner-user',
            phone: '+1000000003',
            name: 'Demo Runner',
            email: 'runner@runnercommerce.com',
            password: 'runner123',
            roleId: 'runner',
        },
        {
            id: 'warehouse-user',
            phone: '+1000000004',
            name: 'Warehouse Staff',
            email: 'warehouse@runnercommerce.com',
            password: 'warehouse123',
            roleId: 'warehouse',
        },
    ];
    for (const u of users) {
        const passwordHash = await bcrypt.hash(u.password, 10);
        await prisma.user.upsert({
            where: { phone: u.phone },
            update: {},
            create: {
                id: u.id,
                name: u.name,
                phone: u.phone,
                email: u.email,
                passwordHash,
                roleId: u.roleId,
            },
        });
        console.log(`   ✅ User: ${u.name} (${u.phone})`);
    }
    console.log('\n🏬 Creating shops...');
    const shops = [
        {
            id: 'shop-electronics',
            name: 'Electronics Store',
            description: 'Latest gadgets and electronics',
            phone: '+1555111111',
            address: '123 Tech St, Silicon Valley, CA',
        },
        {
            id: 'shop-fashion',
            name: 'Fashion Boutique',
            description: 'Trendy clothing and accessories',
            phone: '+1555222222',
            address: '456 Fashion Ave, NYC, NY',
        },
        {
            id: 'shop-home',
            name: 'Home & Garden',
            description: 'Everything for your home',
            phone: '+1555333333',
            address: '789 Garden Ln, Portland, OR',
        },
    ];
    for (const shop of shops) {
        await prisma.shop.upsert({
            where: { id: shop.id },
            update: {},
            create: {
                ...shop,
                ownerId: 'shop-owner-user',
                status: 'ACTIVE',
            },
        });
        console.log(`   ✅ Shop: ${shop.name}`);
    }
    console.log('\n📦 Creating products...');
    const productsByShop = {
        'shop-electronics': [
            {
                id: 'prod-iphone-15',
                name: 'iPhone 15 Pro',
                description: 'Latest Apple smartphone with A17 Pro chip',
                basePrice: 999.0,
                stockQty: 50,
                category: 'Phones',
            },
            {
                id: 'prod-macbook-air',
                name: 'MacBook Air M2',
                description: 'Lightweight laptop with M2 chip',
                basePrice: 1199.0,
                stockQty: 30,
                category: 'Laptops',
            },
            {
                id: 'prod-airpods-pro',
                name: 'AirPods Pro 2',
                description: 'Wireless earbuds with noise cancellation',
                basePrice: 249.0,
                stockQty: 100,
                category: 'Audio',
            },
        ],
        'shop-fashion': [
            {
                id: 'prod-tshirt-basic',
                name: 'Basic Cotton T-Shirt',
                description: 'Comfortable everyday t-shirt',
                basePrice: 25.0,
                stockQty: 200,
                category: 'Clothing',
            },
            {
                id: 'prod-jeans-classic',
                name: 'Classic Denim Jeans',
                description: 'Timeless denim jeans',
                basePrice: 79.0,
                stockQty: 150,
                category: 'Clothing',
            },
            {
                id: 'prod-sneakers-run',
                name: 'Running Sneakers',
                description: 'Lightweight running shoes',
                basePrice: 129.0,
                stockQty: 80,
                category: 'Footwear',
            },
        ],
        'shop-home': [
            {
                id: 'prod-lamp-desk',
                name: 'LED Desk Lamp',
                description: 'Adjustable LED desk lamp with USB',
                basePrice: 45.0,
                stockQty: 100,
                category: 'Lighting',
            },
            {
                id: 'prod-plant-pot',
                name: 'Ceramic Plant Pot Set',
                description: 'Set of 3 decorative pots',
                basePrice: 35.0,
                stockQty: 150,
                category: 'Garden',
            },
            {
                id: 'prod-tool-kit',
                name: 'Home Tool Kit',
                description: 'Essential tools for home repairs',
                basePrice: 89.0,
                stockQty: 60,
                category: 'Tools',
            },
        ],
    };
    let productCount = 0;
    for (const [shopId, products] of Object.entries(productsByShop)) {
        for (const product of products) {
            await prisma.product.upsert({
                where: { id: product.id },
                update: {},
                create: {
                    ...product,
                    shopId,
                    status: 'ACTIVE',
                },
            });
            productCount++;
        }
    }
    console.log(`✅ Products created: ${productCount} across ${Object.keys(productsByShop).length} shops`);
    console.log('\n🏃 Creating runner profile...');
    const runnerUser = await prisma.user.findUnique({
        where: { id: 'runner-user' },
    });
    if (runnerUser) {
        const runner = await prisma.runner.upsert({
            where: { userId: runnerUser.id },
            update: {},
            create: {
                userId: runnerUser.id,
                rating: 5.0,
                totalOrders: 0,
                totalEarnings: 0,
                status: 'ACTIVE',
                vehicleType: 'Motorcycle',
            },
        });
        console.log(`   ✅ Runner Profile: ${runner.id}`);
        await prisma.runnerWallet.upsert({
            where: { runnerId: runner.id },
            update: {},
            create: {
                runnerId: runner.id,
                balance: 0,
                pending: 0,
            },
        });
        console.log(`   ✅ Runner Wallet created`);
    }
    console.log('\n🔗 Creating runner listings (products + runners)...');
    const runner = await prisma.runner.findFirst({ where: { status: 'ACTIVE' } });
    if (runner) {
        const allProducts = await prisma.product.findMany({
            where: { status: 'ACTIVE' },
        });
        for (const product of allProducts) {
            const markup = 5 + Math.random() * 10;
            const runnerPrice = Math.round(product.basePrice * (1 + markup / 100) * 100) / 100;
            await prisma.runnerListing.upsert({
                where: {
                    runnerId_productId: {
                        runnerId: runner.id,
                        productId: product.id,
                    },
                },
                update: {},
                create: {
                    runnerId: runner.id,
                    productId: product.id,
                    markup,
                    runnerPrice,
                    status: 'ACTIVE',
                },
            });
        }
        console.log(`✅ Runner listings created: ${allProducts.length} products listed`);
    }
    console.log('\n🛒 Creating sample orders...');
    const customerUser = await prisma.user.findUnique({
        where: { id: 'customer-user' },
    });
    const activeListings = await prisma.runnerListing.findMany({
        where: { status: 'ACTIVE' },
        include: { product: true },
        take: 2,
    });
    if (customerUser && activeListings.length >= 1) {
        const listing = activeListings[0];
        const subtotal = listing.runnerPrice * 2;
        const tax = Math.round(subtotal * 0.1 * 100) / 100;
        const shippingFee = 50;
        const totalAmount = subtotal + tax + shippingFee;
        const sampleOrder = await prisma.order.upsert({
            where: { id: 'sample-order-1' },
            update: {},
            create: {
                id: 'sample-order-1',
                customerPhone: customerUser.phone,
                customerId: customerUser.id,
                status: 'CREATED',
                totalAmount,
                subtotal,
                tax,
                shippingFee,
                shippingAddress: {
                    street: '123 Main Street',
                    city: 'New York',
                    state: 'NY',
                    zipCode: '10001',
                    country: 'USA',
                },
                notes: 'Sample order for testing',
                items: {
                    create: {
                        listingId: listing.id,
                        productId: listing.productId,
                        quantity: 2,
                        unitPrice: listing.runnerPrice,
                        shopPrice: listing.product.basePrice,
                        commission: listing.runnerPrice - listing.product.basePrice,
                    },
                },
            },
        });
        console.log(`✅ Sample order created: ${sampleOrder.id} (Status: ${sampleOrder.status})`);
    }
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DATABASE SEED COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📝 LOGIN CREDENTIALS:');
    console.log('   Admin:     +1000000000 / admin123');
    console.log('   Customer:  +1000000001 / customer123');
    console.log('   Shop Owner:+1000000002 / shop123');
    console.log('   Runner:    +1000000003 / runner123');
    console.log('   Warehouse: +1000000004 / warehouse123');
    console.log('\n📊 SEED SUMMARY:');
    console.log('   - Roles: 5');
    console.log('   - Users: 5');
    console.log('   - Shops: 3');
    console.log('   - Products: 9');
    console.log('   - Runner Listings: 9 (all products listed)');
    console.log('   - Sample Orders: 1');
    console.log('='.repeat(60));
}
main()
    .catch((e) => {
    console.error('❌ Seed process failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
});
//# sourceMappingURL=seed.js.map