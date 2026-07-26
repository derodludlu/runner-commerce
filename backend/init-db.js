// Database initialization script for Runner Commerce
// This script creates tables and seeds data bypassing Prisma Migrate issues

const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function initDB() {
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();

    // Create tables manually
    console.log('🏗  Creating tables...');

    // Roles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Role" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        permissions JSONB
      );
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "roleId" TEXT NOT NULL REFERENCES "Role"(id),
        status TEXT DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "profileImage" TEXT,
        bio TEXT
      );
    `);

    // Shops table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Shop" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        status TEXT DEFAULT 'ACTIVE',
        "ownerId" TEXT NOT NULL REFERENCES "User"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "profileImage" TEXT,
        "coverImage" TEXT
      );
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Product" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        "basePrice" DECIMAL(12,2) NOT NULL,
        "stockQty" INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        category TEXT,
        "shopId" TEXT NOT NULL REFERENCES "Shop"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        images TEXT[] DEFAULT '{}'
      );
    `);

    // Run the rest of the table creation commands...
    // (We'll add the remaining tables here)

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Order" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        status TEXT DEFAULT 'PENDING',
        "paymentStatus" TEXT DEFAULT 'PENDING',
        "totalAmount" DECIMAL(12,2) NOT NULL,
        "customerId" TEXT NOT NULL REFERENCES "User"(id),
        "shopId" TEXT NOT NULL REFERENCES "Shop"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "OrderItem" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        quantity INTEGER NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        "productId" TEXT NOT NULL REFERENCES "Product"(id),
        "orderId" TEXT NOT NULL REFERENCES "Order"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Cart" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "customerId" TEXT NOT NULL REFERENCES "User"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CartItem" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        quantity INTEGER DEFAULT 1,
        "cartId" TEXT NOT NULL REFERENCES "Cart"(id),
        "productId" TEXT NOT NULL REFERENCES "Product"(id),
        "listingId" TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Coupon" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        "discountType" TEXT NOT NULL,
        "discountValue" DECIMAL(10,2) NOT NULL,
        "minOrderAmount" DECIMAL(10,2),
        "maxDiscount" DECIMAL(10,2),
        "usageLimit" INTEGER,
        "usedCount" INTEGER DEFAULT 0,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "createdBy" TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CouponUsage" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "couponId" TEXT NOT NULL REFERENCES "Coupon"(id),
        "customerId" TEXT NOT NULL REFERENCES "User"(id),
        "orderId" TEXT NOT NULL REFERENCES "Order"(id),
        "discountAmount" DECIMAL(10,2) NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Wishlist" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "customerId" TEXT UNIQUE NOT NULL REFERENCES "User"(id),
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "WishlistItem" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "wishlistId" TEXT NOT NULL REFERENCES "Wishlist"(id),
        "productId" TEXT NOT NULL REFERENCES "Product"(id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Review" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title TEXT,
        comment TEXT,
        verified BOOLEAN DEFAULT false,
        "productId" TEXT NOT NULL REFERENCES "Product"(id),
        "customerId" TEXT NOT NULL REFERENCES "User"(id),
        "orderId" TEXT REFERENCES "Order"(id),
        status TEXT DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Runner" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT UNIQUE NOT NULL REFERENCES "User"(id),
        "vehicleType" TEXT NOT NULL,
        "licensePlate" TEXT,
        status TEXT DEFAULT 'AVAILABLE',
        "currentLocation" JSONB,
        earnings DECIMAL(12,2) DEFAULT 0.0,
        "totalDeliveries" INTEGER DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "RunnerListing" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "productId" TEXT NOT NULL REFERENCES "Product"(id),
        "runnerId" TEXT NOT NULL REFERENCES "Runner"(id),
        price DECIMAL(12,2) NOT NULL,
        "stockQty" INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Payment" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId" TEXT UNIQUE NOT NULL REFERENCES "Order"(id),
        amount DECIMAL(12,2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'PENDING',
        provider TEXT NOT NULL,
        "providerId" TEXT,
        metadata JSONB,
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "refundedAt" TIMESTAMP WITH TIME ZONE,
        "refundReason" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL REFERENCES "User"(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        "readStatus" BOOLEAN DEFAULT false,
        metadata JSONB,
        "sentAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "SupportTicket" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'OTHER',
        priority TEXT DEFAULT 'MEDIUM',
        status TEXT DEFAULT 'OPEN',
        "customerId" TEXT NOT NULL REFERENCES "User"(id),
        "assignedTo" TEXT,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "SupportMessage" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "ticketId" TEXT NOT NULL REFERENCES "SupportTicket"(id),
        "senderId" TEXT NOT NULL REFERENCES "User"(id),
        message TEXT NOT NULL,
        attachments TEXT[] DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Batch" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "listingId" TEXT NOT NULL REFERENCES "RunnerListing"(id),
        quantity INTEGER NOT NULL,
        "expiryDate" TIMESTAMP WITH TIME ZONE,
        status TEXT DEFAULT 'VALID',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ReturnRecord" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId" TEXT NOT NULL REFERENCES "Order"(id),
        "productId" TEXT NOT NULL REFERENCES "Product"(id),
        quantity INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'REQUESTED',
        "requestedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "refundAmount" DECIMAL(10,2),
        "refundMethod" TEXT,
        notes TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "RunnerShop" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" TEXT NOT NULL REFERENCES "Shop"(id),
        "runnerId" TEXT NOT NULL REFERENCES "Runner"(id),
        status TEXT DEFAULT 'PENDING',
        "joinedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "leftAt" TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "RunnerShopJoinRequest" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" TEXT NOT NULL REFERENCES "Shop"(id),
        "runnerId" TEXT NOT NULL REFERENCES "Runner"(id),
        status TEXT DEFAULT 'PENDING',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "processedAt" TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT REFERENCES "User"(id),
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        "entityId" TEXT,
        "oldValue" JSONB,
        "newValue" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Wallet" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT UNIQUE NOT NULL REFERENCES "User"(id),
        balance DECIMAL(12,2) DEFAULT 0.0,
        currency TEXT DEFAULT 'USD',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "WalletTransaction" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "walletId" TEXT NOT NULL REFERENCES "Wallet"(id),
        type TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        "balanceAfter" DECIMAL(12,2) NOT NULL,
        description TEXT,
        "referenceId" TEXT,
        "referenceType" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ Tables created successfully');

    // Insert default roles
    console.log('🌱 Seeding default roles...');
    const roles = [
      { name: 'ADMIN', description: 'Administrator with full access' },
      { name: 'SHOP_OWNER', description: 'Shop owner who can manage shops' },
      { name: 'RUNNER', description: 'Delivery runner' },
      { name: 'CUSTOMER', description: 'Regular customer' },
    ];

    for (const role of roles) {
      await client.query(`
        INSERT INTO "Role" (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
      `, [role.name, role.description]);
    }

    // Insert default user (admin)
    console.log('🌱 Seeding default user...');
    const hashedPassword = '$2b$10$8K1TKTCmL/Xjvf8qhdG8l..SKHJeUJsqQJjc7z7QLdWVYR4UJPoIu'; // password123 (hashed)
    await client.query(`
      INSERT INTO "User" (name, phone, email, "passwordHash", "roleId", status)
      SELECT 
        'Admin User',
        '+10000000001',
        'admin@runnercommerce.com',
        $1,
        r.id,
        'ACTIVE'
      FROM "Role" r
      WHERE r.name = 'ADMIN'
      ON CONFLICT (phone) DO NOTHING
    `, [hashedPassword]);

    console.log('✅ Database initialized successfully!');
    console.log('📝 Default admin user:');
    console.log('   Phone: +10000000001');
    console.log('   Password: password123');

  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
  } finally {
    await client.end();
  }
}

initDB();