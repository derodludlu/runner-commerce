# Seed Data Quick Reference

## 🎯 Test Login Credentials

After running `npm run prisma:seed` in the backend directory, use these credentials to test:

### SUPERUSER (Full System Access)
```
Phone: +10000000000
Password: password123
Access: ALL routes (admin, shop-owner, runner)
```

### ADMIN
```
Phone: +10000000001
Password: password123
Access: /admin/* routes
```

### CUSTOMER
```
Phone: +10000000002 or +10000000003
Password: password123
Access: Public routes, cart, orders
```

### SHOP_OWNER
```
Phone: +10000000004 or +10000000005
Password: password123
Access: /shop-owner/* routes
```

### RUNNER
```
Phone: +10000000006 or +10000000007
Password: password123
Access: /runner/* routes (must complete runner registration)
```

### WAREHOUSE
```
Phone: +10000000008
Password: password123
Access: Warehouse features
```

---

## 🚀 Quick Start

```bash
# 1. Run seed
cd backend
npm run prisma:seed

# 2. Start backend
npm run start:dev

# 3. Start frontend
cd ../frontend
npm run dev

# 4. Login at http://localhost:3000/login
```

---

## 📊 What Gets Seeded

- ✅ 6 Roles (SUPERUSER, ADMIN, CUSTOMER, RUNNER, SHOP_OWNER, WAREHOUSE)
- ✅ 8 Users (1 per role, some roles have 2 users)
- ✅ 2 Shops (owned by Maria and David)
- ✅ Products for each shop
- ✅ 2 Runners (Mike and Sarah with full profiles)
- ✅ Runner listings
- ✅ Sample orders
- ✅ Batches for warehouse
- ✅ Payments

---

## 🎯 Testing Scenarios

### Test SUPERUSER Access
1. Login as SUPERUSER (`+10000000000`)
2. Navigate to `/admin/dashboard` → ✅ Should work
3. Navigate to `/shop-owner/dashboard` → ✅ Should work
4. Navigate to `/runner/dashboard` → ✅ Should work

### Test Role Separation
1. Login as CUSTOMER (`+10000000002`)
2. Try `/admin/dashboard` → ❌ Redirects to `/unauthorized`

### Test Runner Flow
1. Login as Runner (`+10000000006`)
2. Try `/runner/dashboard` → ✅ Should work (already registered)
3. Check runner profile has vehicle info

### Test Shop Owner Flow
1. Login as Shop Owner (`+10000000004`)
2. Navigate to `/shop-owner/dashboard` → ✅ Should work
3. View products and runner requests

---

## 📝 Files Modified

### Backend
- `prisma/migrations/seeds/01_roles.seed.ts` - Added SUPERUSER role
- `prisma/migrations/seeds/02_users.seed.ts` - Added SUPERUSER user

### Frontend
- `lib/rbac.ts` - Added SUPERUSER to types and permissions
- `lib/types.ts` - Added SUPERUSER to UserRole type

---

## 🔧 Troubleshooting

### Seed Fails
```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset
npm run prisma:seed
```

### Login Fails
```bash
# Check backend is running
curl http://localhost:3001/health

# Check database connection
npx prisma studio
```

### Role Access Issues
```bash
# Clear browser cookies
# Clear localStorage
# Refresh page
```

---

**Last Updated:** March 31, 2026  
**Status:** ✅ Ready for testing
