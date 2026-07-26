# 🚀 Quick Start Guide - Runner Commerce Platform

## Multi-Vendor Marketplace with Last-Mile Delivery

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Setup](#docker-setup)
4. [Testing the Platform](#testing-the-platform)
5. [API Documentation](#api-documentation)
6. [Troubleshooting](#troubleshooting)

---

## 🛠️ Prerequisites

### Required Software
- **Node.js** 20.x or higher
- **PostgreSQL** 15.x or higher
- **pnpm** or **npm** (pnpm recommended for faster builds)
- **Git**

### Optional (for Docker)
- **Docker** 20.x or higher
- **Docker Compose** 2.x or higher

---

## 💻 Local Development Setup

### 1. Clone and Install

```bash
# Navigate to project directory
cd c:\Users\ADMIN\runnercommercequen35plus

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies  
cd ../frontend
npm install
```

### 2. Database Setup

```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# OR start PostgreSQL locally on your machine

# Run migrations
cd backend
npx prisma migrate dev
npx prisma db seed
```

### 3. Environment Configuration

**Backend `.env`:**
``env
DATABASE_URL="postgresql://runnercommerce:securepassword123@localhost:5432/runnercommerce_db?schema=public"
JWT_SECRET=your-super-secret-jwt-key-change-in-production-2026
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 4. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Access Points:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Swagger Docs: http://localhost:3001/api/docs

---

## 🐳 Docker Setup

### Start Infrastructure Services

```bash
docker compose up -d postgres redis
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)

The backend API and frontend run on Windows through PM2 in the hybrid local
hosting setup. Use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-hybrid-local.ps1
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker compose logs -f postgres
docker compose logs -f redis
```

### Stop Services

```bash
docker-compose down

# With volumes (deletes data)
docker-compose down -v
```

### Rebuild After Changes

```bash
docker-compose up -d --build
```

---

## 🧪 Testing the Platform

### Test User Accounts (from seed data)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@runnercommerce.com | password123 |
| Shop Owner | maria@shop.com | password123 |
| Runner | mike@runner.com | password123 |
| Customer | john@example.com | password123 |

### Multi-Vendor Marketplace Workflows

#### 1. As a Runner

**Discover and Join Shops:**
1. Login as Runner
2. Go to `/runner/marketplace`
3. Click "Discover Shops" tab
4. Click "Request to Join" on a shop
5. Wait for owner approval

**After Approval:**
1. Go to "My Shops" tab - see approved shops
2. Go to "Marketplace" tab - browse products from joined shops
3. Create listings with your markup

#### 2. As a Shop Owner

**Manage Runner Requests:**
1. Login as Shop Owner
2. Go to `/shop-owner/runners`
3. Select your shop
4. See pending runner requests
5. Click ✓ to Approve or ✗ to Reject

**View Approved Runners:**
- See all runners approved for your shop
- Remove runners if needed

#### 3. As a Customer

**Find Runners:**
1. Add items to cart from different shops
2. At checkout, system suggests runners
3. Choose runner(s) based on shop coverage
4. Complete order

---

## 📚 API Documentation

### Key Endpoints

#### Runner-Shop Management

```bash
# Runner: Request to join shop
POST /api/runner-shops/join
{
  "shopId": "shop_123",
  "notes": "I'd like to deliver from your shop"
}

# Runner: Get my shops
GET /api/runner-shops/my-shops

# Runner: Get marketplace (products from approved shops)
GET /api/runner-shops/marketplace

# Shop Owner: Get runner requests
GET /api/runner-shops/shops/:shopId/requests

# Shop Owner: Approve/Reject runner
PATCH /api/runner-shops/shops/:shopId/runners
{
  "runnerId": "runner_456",
  "status": "APPROVED"
}

# Customer: Find runners for multi-shop order
POST /api/runner-shops/find-runners
{
  "shopIds": ["shop_1", "shop_2"]
}
```

#### Shopping Cart

```bash
# Get cart
GET /api/cart

# Add item
POST /api/cart/items
{
  "listingId": "listing_123",
  "quantity": 2
}

# Update quantity
PATCH /api/cart/items/:itemId
{
  "quantity": 3
}

# Checkout
POST /api/cart/checkout
```

#### Wishlist

```bash
# Get wishlist
GET /api/wishlist

# Add item
POST /api/wishlist/items/:productId

# Move to cart
POST /api/wishlist/move-to-cart/:productId
```

---

## 🔧 Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres

# Check database logs
docker-compose logs postgres
```

### Prisma Errors

```bash
# Regenerate Prisma Client
cd backend
npx prisma generate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Port Already in Use

```bash
# Change port in backend/.env
PORT=3002

# Change port in docker-compose.yml
ports:
  - "3002:3001"
```

### Frontend Build Errors

```bash
# Clear cache
cd frontend
rm -rf .next
npm run build
```

### Docker Build Issues

```bash
# Clean rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 📊 Database Schema

### Key Tables

- **Users** - All platform users
- **Shops** - Vendor shops (owned by users)
- **Products** - Shop inventory
- **RunnerShopLink** - Runner-Shop relationships (NEW!)
- **RunnerListing** - Runner product listings with markup
- **Orders** - Customer orders
- **OrderItems** - Order line items
- **Cart** - Shopping carts
- **Wishlist** - Customer wishlists
- **Coupons** - Discount codes
- **Notifications** - User notifications
- **SupportTicket** - Customer support

---

## 🎯 Next Steps

1. **Complete Your Profile**
   - Update user information
   - Add profile pictures
   - Configure notification preferences

2. **Explore Features**
   - Create/edit products (Shop Owners)
   - Join shops (Runners)
   - Browse marketplace (Customers)

3. **Customize**
   - Update branding in frontend
   - Configure email templates
   - Set up real payment keys

4. **Deploy to Production**
   - Update environment variables
   - Use production database
   - Configure SSL/HTTPS
   - Set up monitoring

---

## 📞 Support

For issues or questions:
- Check the [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- Review [MULTI_VENDOR_MARKETPLACE_IMPLEMENTATION.md](./MULTI_VENDOR_MARKETPLACE_IMPLEMENTATION.md)
- Check Swagger docs at http://localhost:3001/api/docs

---

**Last Updated:** March 17, 2026  
**Version:** 1.0.0
