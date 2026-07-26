# Role-Based Access Control Architecture

**Date:** March 31, 2026

This document explains the multi-role architecture, database design decisions, and how different user types interact with the system.

---

## 📊 Current Database Design

### **Single User Table with Role Differentiation** ✅

The system uses a **single `User` table** with a foreign key to a `Role` table. This is the **correct approach** for several reasons.

```prisma
model Role {
  id          String   @id @default(uuid())
  name        String   @unique  // "ADMIN", "CUSTOMER", "RUNNER", "SHOP_OWNER", "WAREHOUSE"
  description String?
  permissions Json?
  users       User[]
}

model User {
  id           String    @id @default(uuid())
  name         String
  phone        String    @unique
  email        String?   @unique
  passwordHash String
  roleId       String    // FK to Role
  status       String    @default("ACTIVE")
  
  role    Role    @relation(fields: [roleId], references: [id])
  shops   Shop[]  // User can own multiple shops
  runner  Runner? // Optional runner profile (one-to-one)
  // ... other relations
}
```

### **Why This Design is Correct:**

1. ✅ **Single Source of Truth** - All users in one table
2. ✅ **Shared Authentication** - Same login flow for all roles
3. ✅ **Easy Role Changes** - Just update `roleId`
4. ✅ **Shared Properties** - All users have `name`, `phone`, `email`, etc.
5. ✅ **Role-Specific Extensions** - Optional `Runner` profile for runners only

---

## 👥 User Roles Explained

### **1. ADMIN** 🎯

**Purpose:** System administrators who manage the entire platform

**Database Structure:**
```
User {
  id: "uuid-123"
  name: "Alice Admin"
  phone: "+1234567890"
  email: "admin@example.com"
  roleId: "role-admin-uuid"  // → Role.name = "ADMIN"
  runner: null                // Admins don't have runner profiles
  shops: []                   // Admins don't own shops (typically)
}
```

**Permissions:**
- Access to `/admin/*` routes
- Manage all users, shops, runners
- View analytics and reports
- Create/delete coupons
- Moderate content

**Frontend Access:**
```typescript
// Layout: app/admin/layout.tsx
// Guard: useAdminGuard()
// Redirect: /admin/dashboard
```

---

### **2. CUSTOMER** 🛒

**Purpose:** Regular users who browse and purchase products

**Database Structure:**
```
User {
  id: "uuid-456"
  name: "Bob Customer"
  phone: "+1987654321"
  email: "bob@example.com"
  roleId: "role-customer-uuid"  // → Role.name = "CUSTOMER"
  runner: null                  // Not a runner
  shops: []                     // Doesn't own shops
  cart: Cart?                   // Has shopping cart
  wishlist: Wishlist?           // Has wishlist
  orders: Order[]               // Can place orders
}
```

**Permissions:**
- Browse products (public)
- Add to cart
- Place orders
- Write reviews
- Track orders
- Create support tickets

**Frontend Access:**
```typescript
// No special layout - uses root layout
// Routes: /cart, /orders, /wishlist, /products
// Dashboard redirect: / (home page)
```

---

### **3. RUNNER** 🏃

**Purpose:** Delivery personnel who promote and deliver products

**Database Structure:**
```
User {
  id: "uuid-789"
  name: "Carlos Runner"
  phone: "+1122334455"
  email: "carlos@example.com"
  roleId: "role-runner-uuid"  // → Role.name = "RUNNER"
  
  // ✅ Has a runner profile (one-to-one relation)
  runner: Runner {
    id: "runner-uuid"
    userId: "uuid-789"        // FK back to User
    status: "ACTIVE"          // INACTIVE | PENDING | ACTIVE
    vehicleType: "Motorcycle"
    vehicleNumber: "ABC123"
    rating: 4.8
    totalOrders: 150
    totalEarnings: 5000.00
    wallet: RunnerWallet {
      balance: 1500.00
      pending: 200.00
    }
    shopAssignments: [        // Many-to-many with shops
      { shopId: "shop-1", status: "APPROVED" },
      { shopId: "shop-2", status: "PENDING" }
    ]
  }
  
  shops: []  // Runners typically don't own shops
}
```

**Key Concept:** A user with `RUNNER` role **must** complete runner registration to access runner features.

**Two-Step Process:**
1. **User registers** → Gets `RUNNER` role but no `runner` profile yet
2. **User completes runner registration** → Gets `Runner` profile with vehicle info

**Permissions:**
- Access to `/runner/*` routes
- Browse marketplace (products from approved shops)
- Create listings (add markup to products)
- Manage deliveries
- Track earnings

**Frontend Access:**
```typescript
// Layout: app/runner/layout.tsx
// Guard: useRunnerGuard() - checks BOTH role AND runner entity
// Redirect: /runner/dashboard

// The guard checks:
if (user.role === "RUNNER" && !user.runner) {
  router.push("/runner/register");  // Must complete registration
}
```

**Runner-Specific Tables:**
```prisma
model Runner {
  userId        String    @unique  // One-to-one with User
  rating        Float?    @default(0)
  totalOrders   Int       @default(0)
  totalEarnings Float     @default(0)
  status        String    @default("INACTIVE")
  vehicleType   String?
  vehicleNumber String?
  phone         String?
  serviceArea   String?
  
  user         User              @relation(...)
  listings     RunnerListing[]   // Products they're reselling
  orders       Order[]           // Orders they're delivering
  wallet       RunnerWallet?
  shopAssignments RunnerShopLink[]  // Shops they work with
}
```

---

### **4. SHOP_OWNER** 🏪

**Purpose:** Business owners who sell products through the platform

**Database Structure:**
```
User {
  id: "uuid-101"
  name: "Diana Owner"
  phone: "+1555666777"
  email: "diana@example.com"
  roleId: "role-shop-owner-uuid"  // → Role.name = "SHOP_OWNER"
  
  // ✅ Can own MULTIPLE shops (one-to-many relation)
  shops: [
    Shop {
      id: "shop-uuid-1"
      ownerId: "uuid-101"
      name: "Diana's Electronics"
      status: "ACTIVE"
      products: [...]
      runnerAssignments: [  // Runners approved to sell from this shop
        { runnerId: "runner-uuid", status: "APPROVED" }
      ]
    },
    Shop {
      id: "shop-uuid-2"
      ownerId: "uuid-101"
      name: "Diana's Fashion"
      status: "ACTIVE"
    }
  ]
  
  runner: null  // Shop owners typically aren't runners
}
```

**Key Concept:** A shop owner can own **multiple shops**, each with its own inventory, products, and runner partnerships.

**Permissions:**
- Access to `/shop-owner/*` routes
- Create/manage shops
- Add/edit/delete products
- Approve/reject runner requests
- View shop analytics

**Frontend Access:**
```typescript
// Layout: app/shop-owner/layout.tsx
// Guard: useShopOwnerGuard()
// Redirect: /shop-owner/dashboard
```

**Shop-Specific Tables:**
```prisma
model Shop {
  id          String    @id @default(uuid())
  name        String
  description String?
  phone       String
  address     String?
  ownerId     String    // FK to User (NO @unique = can have multiple shops)
  status      String    @default("ACTIVE")
  
  owner    User      @relation(...)
  products Product[]
  runnerAssignments RunnerShopLink[]  // Runners working with this shop
}
```

---

### **5. WAREHOUSE** 📦

**Purpose:** Warehouse staff who manage inventory and order fulfillment

**Database Structure:**
```
User {
  id: "uuid-202"
  name: "Eve Warehouse"
  phone: "+1999888777"
  email: "eve@example.com"
  roleId: "role-warehouse-uuid"  // → Role.name = "WAREHOUSE"
  runner: null
  shops: []
}
```

**Permissions:**
- Access to warehouse management features
- Manage batches
- Pick and pack orders
- Update inventory

**Frontend Access:**
```typescript
// Currently redirects to home page
// Future: /warehouse/* routes
```

---

## 🔐 Authentication & Authorization Flow

### **Login Flow**

```
1. User enters credentials (phone/email + password)
         ↓
2. Backend validates credentials
         ↓
3. Backend returns:
   {
     accessToken: "...",
     user: {
       id: "...",
       name: "...",
       role: "RUNNER",      // ← Role determines access
       runner: {            // ← Optional (only for runners)
         id: "...",
         status: "ACTIVE"
       }
     }
   }
         ↓
4. Frontend stores user in localStorage
         ↓
5. Frontend sets role cookie for middleware
         ↓
6. User redirected to role-specific dashboard
```

### **Role Guard Logic**

```typescript
// app/runner/layout.tsx
export default function RunnerLayout({ children }) {
  const { isReady } = useRunnerGuard({ 
    roles: ["RUNNER"], 
    requireRunnerEntity: true  // ← Checks user.runner exists
  });
  
  if (!isReady) return <LoadingSpinner />;
  
  return (
    <div>
      <RunnerSidebar />
      <main>{children}</main>
    </div>
  );
}
```

### **Middleware Protection**

```typescript
// middleware.ts (Edge Runtime)
export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token");
  const userRole = request.cookies.get("user_role");
  
  // Check if route requires specific role
  const requiredRoles = ROUTE_PERMISSIONS[pathname];
  
  if (requiredRoles && !requiredRoles.includes(userRole)) {
    return NextResponse.redirect("/unauthorized");
  }
}
```

---

## 📋 Role Comparison Table

| Feature | ADMIN | CUSTOMER | RUNNER | SHOP_OWNER | WAREHOUSE |
|---------|-------|----------|--------|------------|-----------|
| **User Table** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Role** | `ADMIN` | `CUSTOMER` | `RUNNER` | `SHOP_OWNER` | `WAREHOUSE` |
| **Runner Profile** | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Own Shops** | ❌ | ❌ | ❌ | ✅ (multiple) | ❌ |
| **Shopping Cart** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Place Orders** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin Dashboard** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Runner Dashboard** | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Shop Dashboard** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Approve Runners** | ✅ | ❌ | ❌ | ✅ | ❌ |

---

## 🤔 Why Not Separate Tables?

### **❌ Wrong Approach: Separate User Tables**

```prisma
// DON'T DO THIS
model AdminUser { ... }
model CustomerUser { ... }
model RunnerUser { ... }
model ShopOwnerUser { ... }
```

**Problems:**
1. ❌ **Duplicate Data** - Same fields (name, phone, email) in multiple tables
2. ❌ **Complex Authentication** - Need to check 4 tables on login
3. ❌ **Hard to Change Roles** - Can't easily promote customer to runner
4. ❌ **No Shared Features** - Can't share cart, orders, etc.
5. ❌ **Data Inconsistency** - Different validation rules per table

### **✅ Correct Approach: Single User Table + Role**

```prisma
model User {
  id       String @id
  name     String
  phone    String @unique
  email    String @unique
  roleId   String  // ← Differentiates user type
  role     Role    @relation(...)
  runner   Runner? // ← Optional extension for runners
  shops    Shop[]  // ← Optional extension for shop owners
}
```

**Benefits:**
1. ✅ **Single Source** - All users in one place
2. ✅ **Simple Auth** - Check one table on login
3. ✅ **Easy Role Changes** - Update `roleId`
4. ✅ **Shared Features** - All users can have cart, orders, etc.
5. ✅ **Extensible** - Add new roles without schema changes

---

## 🔄 Multi-Role Scenarios

### **Can a User Have Multiple Roles?**

**Current Design:** No - one role per user

**Workaround:** A user can have multiple **capabilities**:
```
User {
  role: "RUNNER"
  runner: Runner { ... }     // Acts as runner
  shops: [Shop { ... }]      // Also owns shops!
}
```

**Example:** Carlos is a runner but also owns a shop:
- Primary role: `RUNNER`
- Has `Runner` profile
- Also owns `Shop` (via `shops` relation)
- Can access both `/runner/*` and `/shop-owner/*` routes

**Future Enhancement:** Add many-to-many `User.roles[]` for true multi-role support.

---

## 🎯 Summary

### **Database Design:**
- ✅ **Single `User` table** - All users together
- ✅ **`Role` table** - Defines user type
- ✅ **Optional extensions** - `Runner` profile, `Shop` ownership
- ✅ **Shared authentication** - Same login for all

### **Frontend Architecture:**
- ✅ **Role-based layouts** - `/admin`, `/shop-owner`, `/runner`
- ✅ **Guard hooks** - `useAdminGuard`, `useRunnerGuard`, etc.
- ✅ **Smart redirects** - `/dashboard` → role-specific page
- ✅ **Middleware protection** - Server-side role checks

### **Access Control:**
1. Check if user is authenticated
2. Check if user has correct role
3. For runners, also check if `user.runner` exists
4. Redirect to appropriate page

This architecture is **scalable**, **maintainable**, and follows **best practices** for role-based access control!
