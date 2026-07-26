# SUPERUSER Role Implementation Guide

**Date:** March 31, 2026  
**Status:** ✅ Complete

---

## 🎯 Overview

The **SUPERUSER** role is a super-administrator role with unrestricted access to all parts of the system, including:
- Admin dashboard and all admin features
- Shop owner portal
- Runner portal
- All role-gated routes

This is useful for:
- System owners
- Technical support staff
- Multi-role testing
- Emergency override access

---

## 📊 Database Changes

### Roles Table

The following roles now exist in the system:

| Role ID | Name | Description |
|---------|------|-------------|
| `role-superuser-uuid` | **SUPERUSER** | Super administrator with full system access |
| `role-admin-uuid` | ADMIN | System administrator |
| `role-customer-uuid` | CUSTOMER | Customer account |
| `role-runner-uuid` | RUNNER | Delivery runner |
| `role-shop-owner-uuid` | SHOP_OWNER | Shop owner |
| `role-warehouse-uuid` | WAREHOUSE | Warehouse staff |

---

## 🔐 Permissions

### SUPERUSER Access Matrix

| Feature | SUPERUSER | ADMIN | SHOP_OWNER | RUNNER | CUSTOMER |
|---------|-----------|-------|------------|--------|----------|
| `/admin/*` routes | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/shop-owner/*` routes | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/runner/*` routes | ✅ | ❌ | ❌ | ✅ | ❌ |
| Public routes | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create shops | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage all users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve runners | ✅ | ✅ | ✅ | ❌ | ❌ |
| Place orders | ✅ | ✅ | ✅ | ✅ | ✅ |

### How It Works

The SUPERUSER role is added to **all role-gated route permissions**:

```typescript
// frontend/lib/rbac.ts
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/admin": ["ADMIN", "SUPERUSER"],      // ← SUPERUSER added
  "/shop-owner": ["SHOP_OWNER", "SUPERUSER"], // ← SUPERUSER added
  "/runner": ["RUNNER", "SUPERUSER"],    // ← SUPERUSER added
};
```

The middleware automatically grants access to SUPERUSER for all protected routes.

---

## 👤 Seed Data - Test Accounts

After running the seed script, you can login with these accounts:

### SUPERUSER Account
```
Email: superuser@runnercommerce.com
Phone: +10000000000
Password: password123
Role: SUPERUSER
```

### ADMIN Account
```
Email: admin@runnercommerce.com
Phone: +10000000001
Password: password123
Role: ADMIN
```

### CUSTOMER Accounts
```
Email: john.customer@example.com
Phone: +10000000002
Password: password123
Role: CUSTOMER

Email: jane.customer@example.com
Phone: +100000000003
Password: password123
Role: CUSTOMER
```

### SHOP_OWNER Accounts
```
Email: maria@shopowner.com
Phone: +10000000004
Password: password123
Role: SHOP_OWNER

Email: david@shopowner.com
Phone: +10000000005
Password: password123
Role: SHOP_OWNER
```

### RUNNER Accounts
```
Email: mike@runner.com
Phone: +10000000006
Password: password123
Role: RUNNER

Email: sarah@runner.com
Phone: +10000000007
Password: password123
Role: RUNNER
```

### WAREHOUSE Account
```
Email: warehouse@runnercommerce.com
Phone: +10000000008
Password: password123
Role: WAREHOUSE
```

---

## 🚀 How to Run the Seed

```bash
# Navigate to backend directory
cd backend

# Run the seed script
npm run prisma:seed

# Or using Prisma directly
npx prisma db seed
```

### Expected Output

```
🌱 Starting database seed...

✓ Roles seeded
✓ Users seeded
✓ Shops seeded
✓ Products seeded
✓ Runners seeded
✓ Listings seeded
✓ Orders seeded
✓ Batches seeded
✓ Payments seeded

✅ Database seeded successfully
```

---

## 🧪 Testing SUPERUSER Access

### Test 1: Login as SUPERUSER

1. Navigate to: `http://localhost:3000/login`
2. Login with:
   - **Phone:** `+10000000000`
   - **Password:** `password123`
3. **Expected:** Redirected to `/admin/dashboard`

### Test 2: Access Admin Routes

```
/admin/dashboard     → ✅ Should load
/admin/users         → ✅ Should load
/admin/shops         → ✅ Should load
/admin/coupons       → ✅ Should load
```

### Test 3: Access Shop Owner Routes

```
/shop-owner/dashboard    → ✅ Should load
/shop-owner/runners      → ✅ Should load
```

### Test 4: Access Runner Routes

```
/runner/dashboard        → ✅ Should load
/runner/marketplace      → ✅ Should load
/runner/listings         → ✅ Should load
/runner/products         → ✅ Should load
/runner/earnings         → ✅ Should load
```

### Test 5: Smart Dashboard Redirect

```
/dashboard → ✅ Redirects to /admin/dashboard
```

---

## 📝 Code Changes Summary

### Backend Changes

#### 1. `prisma/migrations/seeds/01_roles.seed.ts`
Added SUPERUSER role to the roles list.

#### 2. `prisma/migrations/seeds/02_users.seed.ts`
Added SUPERUSER user account and renumbered other users' phone numbers.

### Frontend Changes

#### 1. `lib/rbac.ts`
- Added `SUPERUSER` to `UserRole` type
- Added `SUPERUSER` to all `ROUTE_PERMISSIONS`
- Added `SUPERUSER` to `ROLE_HOME` mapping
- Added `SUPERUSER` case to `roleLabel()` function

#### 2. `lib/types.ts`
- Added `SUPERUSER` to `UserRole` type

#### 3. `middleware.ts`
- No changes needed - automatically handles SUPERUSER via `ROUTE_PERMISSIONS`

---

## 🔧 Adding SUPERUSER to Existing Systems

If you already have a running database, you can add the SUPERUSER role and user manually:

### Option 1: Run Seed (Recommended)

```bash
npm run prisma:seed
```

This will upsert the SUPERUSER role and user without affecting existing data.

### Option 2: Manual SQL (PostgreSQL)

```sql
-- Add SUPERUSER role
INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'SUPERUSER', 'Super administrator with full system access', NOW(), NOW());

-- Get the role ID
SELECT id FROM "Role" WHERE name = 'SUPERUSER';

-- Add SUPERUSER user (replace ROLE_ID with actual UUID from above)
INSERT INTO "User" (id, name, phone, email, "passwordHash", "roleId", status, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Super User',
  '+10000000000',
  'superuser@runnercommerce.com',
  '$2a$10$[YOUR_HASHED_PASSWORD]',
  'ROLE_ID',
  'ACTIVE',
  NOW(),
  NOW()
);
```

### Option 3: Prisma Studio

```bash
npx prisma studio
```

1. Open Prisma Studio
2. Add new Role: `SUPERUSER`
3. Add new User with the SUPERUSER role

---

## 🛡️ Security Considerations

### When to Use SUPERUSER

✅ **Good Use Cases:**
- System owner access
- Technical support staff
- Development/testing environments
- Emergency override scenarios

❌ **When NOT to Use:**
- Regular admin tasks (use ADMIN role instead)
- Shared accounts (each person should have their own account)
- Production without audit logging

### Best Practices

1. **Strong Password:** Change the default password immediately
2. **Limited Distribution:** Only a few trusted individuals should have SUPERUSER access
3. **Audit Logging:** Log all SUPERUSER actions (consider implementing audit trails)
4. **2FA:** Enable two-factor authentication for SUPERUSER accounts
5. **Regular Rotation:** Change SUPERUSER credentials periodically

---

## 📚 Related Documentation

- `ROLE_BASED_ACCESS_CONTROL.md` - Complete role system explanation
- `DATABASE_SCHEMA_VISUALIZATION.md` - Database ER diagrams
- `DEVELOPER_QUICK_REFERENCE.md` - Developer guide
- `FRONTEND_BACKEND_SYNCHRONIZATION.md` - Type synchronization details

---

## 🎯 Summary

The SUPERUSER role provides:
- ✅ **Full system access** - All admin, shop owner, and runner features
- ✅ **Automatic route permissions** - Added to all protected routes
- ✅ **Smart redirects** - Goes to admin dashboard by default
- ✅ **Easy testing** - One account to test all features
- ✅ **Backwards compatible** - Doesn't break existing roles

### Quick Login Reference

| Role | Phone | Password |
|------|-------|----------|
| **SUPERUSER** | `+10000000000` | `password123` |
| ADMIN | `+10000000001` | `password123` |
| CUSTOMER | `+10000000002` | `password123` |
| SHOP_OWNER | `+10000000004` | `password123` |
| RUNNER | `+10000000006` | `password123` |
| WAREHOUSE | `+10000000008` | `password123` |

---

**TypeScript Compilation:** ✅ Passing (0 errors)  
**Seed Status:** ✅ Ready to run
