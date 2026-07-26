# Developer Quick Reference Guide

## Role-Based Access Control

### 🚀 Quick Start

```typescript
// 1. Check user's role
const { user } = useAuth();
console.log(user?.role); // "ADMIN" | "CUSTOMER" | "RUNNER" | "SHOP_OWNER" | "WAREHOUSE"

// 2. Use appropriate guard hook
const { isReady } = useAdminGuard();      // For admin pages
const { isReady } = useShopOwnerGuard();  // For shop owner pages
const { isReady } = useRunnerGuard();     // For runner pages (checks runner entity!)
const { isReady } = useAuthGuard();       // For any authenticated user

// 3. Access role-specific data
if (user?.runner) {
  // User is a runner (has runner profile)
  console.log(user.runner.status); // "INACTIVE" | "PENDING" | "ACTIVE"
}

if (user?.shops) {
  // User owns shops
  console.log(user.shops.length);
}
```

---

## 📁 File Locations

### Frontend Layouts & Guards

| Role | Layout | Guard Hook | Dashboard |
|------|--------|------------|-----------|
| **ADMIN** | `app/admin/layout.tsx` | `useAdminGuard()` | `/admin/dashboard` |
| **SHOP_OWNER** | `app/shop-owner/layout.tsx` | `useShopOwnerGuard()` | `/shop-owner/dashboard` |
| **RUNNER** | `app/runner/layout.tsx` | `useRunnerGuard()` | `/runner/dashboard` |
| **CUSTOMER** | `app/layout.tsx` (root) | None | `/` (home) |
| **WAREHOUSE** | `app/layout.tsx` (root) | None | `/` (home) |

### Backend Controllers

| Role | Controller | Key Endpoints |
|------|-----------|---------------|
| **All** | `auth.controller.ts` | `/auth/login`, `/auth/register`, `/auth/me` |
| **ADMIN** | `admin.controller.ts` | `/admin/dashboard`, `/admin/users`, `/admin/shops` |
| **SHOP_OWNER** | `shops.controller.ts` | `/shops`, `/shops/my-shops`, `/products` |
| **RUNNER** | `runner.controller.ts` | `/runner/register`, `/runner/profile`, `/runner/listings` |
| **Both** | `runner-shops.controller.ts` | `/runner-shops/join`, `/runner-shops/marketplace` |

---

## 🔐 Guard Hook Usage

### Admin Pages

```typescript
// app/admin/users/page.tsx
"use client";

import { useAdminGuard } from "@/hooks/useRoleGuard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function AdminUsersPage() {
  const { user, isReady } = useAdminGuard();

  if (!isReady) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h1>Admin: {user?.name}</h1>
      {/* Admin content */}
    </div>
  );
}
```

### Shop Owner Pages

```typescript
// app/shop-owner/dashboard/page.tsx
"use client";

import { useShopOwnerGuard } from "@/hooks/useRoleGuard";

export default function ShopOwnerDashboard() {
  const { user, isReady } = useShopOwnerGuard();

  if (!isReady) return <LoadingSpinner />;

  return (
    <div>
      <h1>Shop Owner Dashboard</h1>
      {/* Shop management content */}
    </div>
  );
}
```

### Runner Pages

```typescript
// app/runner/dashboard/page.tsx
"use client";

import { useRunnerGuard } from "@/hooks/useRoleGuard";

export default function RunnerDashboard() {
  const { user, isReady } = useRunnerGuard();
  // Note: useRunnerGuard checks BOTH:
  // 1. user.role === "RUNNER"
  // 2. user.runner exists (completed registration)

  if (!isReady) return <LoadingSpinner />;

  return (
    <div>
      <h1>Runner Dashboard</h1>
      <p>Vehicle: {user?.runner?.vehicleType}</p>
      {/* Runner content */}
    </div>
  );
}
```

---

## 📊 Database Queries (Backend)

### Get User with Role

```typescript
// Find user by phone/email with role
const user = await prisma.user.findFirst({
  where: { phone: "+1234567890" },
  include: { role: true },
});

console.log(user.role.name); // "ADMIN", "CUSTOMER", etc.
```

### Get User with Runner Profile

```typescript
// Find user with runner profile
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    runner: {
      include: {
        wallet: true,
        _count: { select: { listings: true, orders: true } },
      },
    },
  },
});

if (user.runner) {
  console.log(user.runner.status); // "ACTIVE"
  console.log(user.runner.wallet.balance); // 1500.00
}
```

### Get User with Shops

```typescript
// Find user with their shops
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    shops: {
      where: { status: "ACTIVE" },
      include: {
        _count: { select: { products: true } },
      },
    },
  },
});

user.shops.forEach(shop => {
  console.log(shop.name, shop._count.products);
});
```

### Get Runner with Shop Assignments

```typescript
// Find runner with shop partnerships
const runner = await prisma.runner.findUnique({
  where: { userId: userId },
  include: {
    shopAssignments: {
      include: {
        shop: true,
      },
    },
  },
});

runner.shopAssignments.forEach(assignment => {
  console.log(
    assignment.shop.name,
    assignment.status // "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED"
  );
});
```

---

## 🎯 Common Scenarios

### Scenario 1: Check if User Can Access Runner Features

```typescript
// ✅ Correct way
const { isReady } = useRunnerGuard();
// This checks BOTH:
// - user.role === "RUNNER"
// - user.runner !== null (completed registration)

if (!isReady) {
  // Either not authenticated, wrong role, or hasn't completed runner registration
  return <LoadingSpinner />;
}
```

```typescript
// ❌ Wrong way - doesn't check runner entity
if (user?.role === "RUNNER") {
  // This user might not have completed runner registration!
  // Use useRunnerGuard() instead
}
```

### Scenario 2: Show Different Navigation Based on Role

```typescript
// Header.tsx
{user?.role === "ADMIN" && (
  <Link href="/admin/dashboard">⚙️ Admin</Link>
)}

{user?.role === "SHOP_OWNER" && (
  <Link href="/shop-owner/dashboard">🏪 My Shop</Link>
)}

{user?.runner && (  // ✅ Check runner entity, not just role
  <Link href="/runner/dashboard">🏃 Runner</Link>
)}
```

### Scenario 3: Redirect to Role-Specific Page

```typescript
// app/dashboard/page.tsx
import { getRoleHomePage } from "@/lib/rbac";

const homePage = getRoleHomePage(user.role);
// ADMIN → "/admin/dashboard"
// SHOP_OWNER → "/shop-owner/dashboard"
// RUNNER → "/runner/dashboard"
// CUSTOMER → "/"
// WAREHOUSE → "/"

router.push(homePage);
```

### Scenario 4: Handle Runner Registration Flow

```typescript
// Check if runner needs to complete registration
if (user?.role === "RUNNER" && !user.runner) {
  // User has RUNNER role but no runner profile
  // Redirect to registration
  router.push("/runner/register");
  return;
}

// User is a fully registered runner
if (user?.runner) {
  console.log("Runner status:", user.runner.status);
  // "INACTIVE" | "PENDING" | "ACTIVE"
}
```

---

## ⚠️ Common Pitfalls

### ❌ Pitfall 1: Assuming `user.runner` Always Exists for RUNNER Role

```typescript
// ❌ WRONG
if (user.role === "RUNNER") {
  // This might crash if user hasn't completed runner registration!
  console.log(user.runner.status); // TypeError: Cannot read property of undefined
}

// ✅ CORRECT
if (user.role === "RUNNER" && user.runner) {
  console.log(user.runner.status); // Safe!
}

// ✅ EVEN BETTER - use the guard hook
const { isReady } = useRunnerGuard();
if (isReady) {
  // Guaranteed to have user.runner
  console.log(user.runner.status);
}
```

### ❌ Pitfall 2: Using `(user as any).runner`

```typescript
// ❌ WRONG - bypasses type safety
if ((user as any).runner) { ... }

// ✅ CORRECT - use proper typing
if (user?.runner) { ... }
```

### ❌ Pitfall 3: Not Handling Shop Owner's Multiple Shops

```typescript
// ❌ WRONG - assumes one shop
const shop = user.shop; // undefined!

// ✅ CORRECT - shop owner can have multiple shops
const shops = user.shops; // Shop[]
const primaryShop = shops?.[0];
```

### ❌ Pitfall 4: Confusing Runner Status Values

```typescript
// ❌ WRONG - old enum values
const status: "ACTIVE" | "INACTIVE" | "BUSY" = "BUSY"; // Type error!

// ✅ CORRECT - backend enum values
const status: RunnerStatus = "ACTIVE"; // or "PENDING" or "INACTIVE"
```

---

## 🔧 Utility Functions

### Get Role Display Name

```typescript
import { roleLabel } from "@/lib/rbac";

roleLabel("ADMIN");      // "Administrator"
roleLabel("SHOP_OWNER"); // "Shop Owner"
roleLabel("RUNNER");     // "Runner"
roleLabel("CUSTOMER");   // "Customer"
roleLabel("WAREHOUSE");  // "Warehouse"
```

### Get Role Home Page

```typescript
import { getRoleHomePage } from "@/lib/rbac";

getRoleHomePage("ADMIN");      // "/admin/dashboard"
getRoleHomePage("SHOP_OWNER"); // "/shop-owner/dashboard"
getRoleHomePage("RUNNER");     // "/runner/dashboard"
getRoleHomePage("CUSTOMER");   // "/"
getRoleHomePage("WAREHOUSE");  // "/"
```

### Check if User Has Role

```typescript
import { hasRole } from "@/lib/rbac";

hasRole(user?.role, ["ADMIN", "SHOP_OWNER"]); // true if ADMIN or SHOP_OWNER
hasRole(user?.role, ["RUNNER"]);              // true if RUNNER
```

---

## 📝 API Response Examples

### Login Response (All Roles)

```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "uuid-123",
    "name": "Carlos Runner",
    "phone": "+1234567890",
    "email": "carlos@example.com",
    "role": "RUNNER",
    "runner": {
      "id": "runner-uuid",
      "status": "ACTIVE",
      "vehicleType": "Motorcycle"
    }
  }
}
```

### Runner Profile Response (Full Data)

```json
{
  "id": "runner-uuid",
  "userId": "user-uuid",
  "rating": 4.8,
  "totalOrders": 150,
  "totalEarnings": 5000.00,
  "status": "ACTIVE",
  "vehicleType": "Motorcycle",
  "vehicleNumber": "ABC123",
  "phone": "+1234567890",
  "serviceArea": "Downtown",
  "wallet": {
    "id": "wallet-uuid",
    "balance": 1500.00,
    "pending": 200.00
  },
  "_count": {
    "listings": 25,
    "orders": 150
  }
}
```

### Shop Owner's Shops Response

```json
[
  {
    "id": "shop-uuid-1",
    "name": "Diana's Electronics",
    "description": "Best electronics in town",
    "phone": "+1555666777",
    "address": "123 Main St",
    "status": "ACTIVE",
    "ownerId": "user-uuid",
    "_count": {
      "products": 150
    }
  },
  {
    "id": "shop-uuid-2",
    "name": "Diana's Fashion",
    "status": "ACTIVE",
    "_count": {
      "products": 85
    }
  }
]
```

---

## 🎯 Testing Checklist

### Test Role-Based Access

- [ ] Login as ADMIN → Can access `/admin/*` routes
- [ ] Login as CUSTOMER → Cannot access `/admin/*` (redirects to `/unauthorized`)
- [ ] Login as RUNNER (no profile) → Redirects to `/runner/register`
- [ ] Login as RUNNER (with profile) → Can access `/runner/*` routes
- [ ] Login as SHOP_OWNER → Can access `/shop-owner/*` routes
- [ ] Navigate to `/dashboard` → Redirects to role-specific page

### Test Runner Flow

- [ ] Register new user with RUNNER role
- [ ] Try to access `/runner/dashboard` → Redirects to `/runner/register`
- [ ] Complete runner registration
- [ ] Access `/runner/dashboard` → Shows dashboard
- [ ] Check header shows "🏃 Runner" link

### Test Shop Owner Flow

- [ ] Login as SHOP_OWNER
- [ ] Create a shop
- [ ] Add products to shop
- [ ] View runner requests
- [ ] Approve runner request

---

**Need Help?** See:
- `ROLE_BASED_ACCESS_CONTROL.md` - Detailed role explanations
- `DATABASE_SCHEMA_VISUALIZATION.md` - ER diagrams
- `FRONTEND_BACKEND_SYNCHRONIZATION.md` - Type synchronization details
