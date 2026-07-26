# Database Schema Visualization

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER SYSTEM                                    │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │     Role     │
    ├──────────────┤
    │ id (PK)      │
    │ name         │◄── "ADMIN", "CUSTOMER", "RUNNER", 
    │ description  │    "SHOP_OWNER", "WAREHOUSE"
    │ permissions  │
    └──────┬───────┘
           │ 1
           │
           │ N
    ┌──────▼───────────────────────────────────────────────┐
    │                      User                             │
    ├───────────────────────────────────────────────────────┤
    │ id (PK)                                               │
    │ name                                                  │
    │ phone (UNIQUE)                                        │
    │ email (UNIQUE)                                        │
    │ passwordHash                                          │
    │ roleId (FK) ──────────────────────────────────┐       │
    │ status                                        │       │
    └──┬──────────────┬──────────────┬──────────────┘       │
       │              │              │                      │
       │ 1            │ 1            │ N                    │
       │              │              │                      │
       │ N            │ 0..1         │ 1                    │
 ┌─────▼────┐  ┌──────▼──────┐  ┌───▼────────┐            │
 │  Shop[]  │  │   Runner?   │  │  Order[]   │            │
 │ (owner)  │  │ (profile)   │  │(customer)  │            │
 └──────────┘  └──────┬──────┘  └────────────┘            │
                      │                                    │
                      │                                    │
    ┌─────────────────┼─────────────────┐                 │
    │                 │                 │                 │
    │ 1               │ 1               │ N               │
    │                 │                 │                 │
    │ N               │ N               │ 1               │
┌───▼──────────┐ ┌───▼──────────┐ ┌────▼────────┐       │
│RunnerListing │ │ RunnerWallet │ │RunnerShopLink│       │
├──────────────┤ ├──────────────┤ ├─────────────┤       │
│ id           │ │ id           │ │ id          │       │
│ runnerId     │ │ runnerId     │ │ runnerId    │       │
│ productId    │ │ balance      │ │ shopId      │       │
│ shopId       │ │ pending      │ │ status      │       │
│ markup       │ │              │ │ joinedAt    │       │
│ runnerPrice  │ │              │ │ approvedAt  │       │
└──────────────┘ └──────────────┘ └──────┬──────┘       │
                                         │               │
                                         │ N             │
                                         │               │
                                         │ 1             │
                                  ┌──────▼────────┐     │
                                  │     Shop      │◄────┘
                                  ├───────────────┤
                                  │ id (PK)       │
                                  │ name          │
                                  │ ownerId (FK) ─┼──────┐
                                  │ status        │      │
                                  │ description   │      │
                                  │ phone         │      │
                                  │ address       │      │
                                  └───────────────┘      │
                                                         │
                    ┌────────────────────────────────────┘
                    │
                    │ Shop owns many Products
                    │
              ┌─────▼────────┐
              │   Product    │
              ├──────────────┤
              │ id (PK)      │
              │ shopId (FK)  │
              │ name         │
              │ basePrice    │
              │ stockQty     │
              │ status       │
              └──────────────┘
```

---

## User Role Differentiation

### All Users Share the Same `User` Table

```
┌─────────────────────────────────────────────────────────────────┐
│                            User Table                            │
├─────────────────────────────────────────────────────────────────┤
│ id  │ name        │ phone      │ roleId    │ role.name         │
├─────────────────────────────────────────────────────────────────┤
│ u1  │ Alice Admin │ +123456789 │ role_admin│ ADMIN             │
│ u2  │ Bob Customer│ +198765432 │ role_cust │ CUSTOMER          │
│ u3  │ Carlos Run  │ +112233445 │ role_run  │ RUNNER            │
│ u4  │ Diana Owner │ +155566677 │ role_shop │ SHOP_OWNER        │
│ u5  │ Eve Warehouse│+199988877 │ role_wh   │ WAREHOUSE         │
└─────────────────────────────────────────────────────────────────┘
```

### Role-Specific Extensions

```
RUNNER User (u3) has additional Runner profile:
┌──────────────────────────────────────────────────┐
│ Runner Table (userId = u3)                       │
├──────────────────────────────────────────────────┤
│ id       │ userId │ status  │ vehicleType       │
│ runner3  │ u3     │ ACTIVE  │ Motorcycle         │
│                                                  │
│ rating │ totalOrders │ totalEarnings │ wallet   │
│ 4.8    │ 150         │ 5000.00        │ ✅      │
└──────────────────────────────────────────────────┘

SHOP_OWNER User (u4) has additional Shops:
┌──────────────────────────────────────────────────┐
│ Shop Table (ownerId = u4)                        │
├──────────────────────────────────────────────────┤
│ id     │ ownerId │ name              │ status   │
│ shop1  │ u4      │ Diana's Electronics│ ACTIVE  │
│ shop2  │ u4      │ Diana's Fashion   │ ACTIVE  │
└──────────────────────────────────────────────────┘

CUSTOMER User (u2) has NO extensions:
┌──────────────────────────────────────────────────┐
│ Runner Table (userId = u2)                       │
├──────────────────────────────────────────────────┤
│ (NO RECORD - customer is not a runner)           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Shop Table (ownerId = u2)                        │
├──────────────────────────────────────────────────┤
│ (NO RECORD - customer doesn't own shops)         │
└──────────────────────────────────────────────────┘
```

---

## Authentication Flow

```
┌──────────────┐
│   Login      │ phone/email + password
│   Screen     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  POST /auth/login                            │
│  Body: { identifier, password }              │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  Backend validates credentials               │
│  1. Find user by phone/email                 │
│  2. Verify password hash                     │
│  3. Load role                                │
│  4. Optionally load runner profile           │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  Response:                                   │
│  {                                           │
│    accessToken: "...",                       │
│    user: {                                   │
│      id: "u3",                               │
│      name: "Carlos Runner",                  │
│      role: "RUNNER",                         │
│      runner: {                               │
│        id: "runner3",                        │
│        status: "ACTIVE",                     │
│        vehicleType: "Motorcycle"             │
│      }                                       │
│    }                                         │
│  }                                           │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  Frontend stores:                            │
│  - localStorage: auth_token, user            │
│  - cookie: user_role=RUNNER                  │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  Redirect based on role:                     │
│  ADMIN      → /admin/dashboard               │
│  CUSTOMER   → /                              │
│  RUNNER     → /runner/dashboard              │
│  SHOP_OWNER → /shop-owner/dashboard          │
│  WAREHOUSE  → /                              │
└──────────────────────────────────────────────┘
```

---

## Route Protection Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Next.js Middleware (Edge Runtime)                 │
├─────────────────────────────────────────────────────────────┤
│ - Runs before page renders                                  │
│ - Checks: auth_token cookie, user_role cookie              │
│ - Redirects unauthorized users to /login or /unauthorized  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Layout Component (Client-Side)                    │
├─────────────────────────────────────────────────────────────┤
│ - app/runner/layout.tsx                                     │
│ - Uses useRunnerGuard() hook                                │
│ - Checks: user.role === "RUNNER" AND user.runner exists    │
│ - Shows LoadingSpinner while checking                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Page Component (Client-Side)                      │
├─────────────────────────────────────────────────────────────┤
│ - app/runner/dashboard/page.tsx                             │
│ - Also uses useRunnerGuard() for extra safety              │
│ - Fetches data only if authorized                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Runner-Specific Logic

### Two-Step Registration Process

```
Step 1: User Registration
┌──────────────────────────────────────────────┐
│ POST /auth/register                          │
│ {                                           │
│   name: "Carlos",                           │
│   phone: "+1122334455",                     │
│   password: "...",                          │
│   roleId: "role-runner-uuid"  ← RUNNER role│
│ }                                            │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ User created:                                │
│ {                                           │
│   id: "u3",                                 │
│   role: "RUNNER",                           │
│   runner: null  ← NO runner profile yet!   │
│ }                                            │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ User tries to access /runner/dashboard       │
│ useRunnerGuard() checks:                     │
│ 1. user.role === "RUNNER" ✅                 │
│ 2. user.runner exists ❌                      │
│                                              │
│ Result: Redirect to /runner/register         │
└──────────────────────────────────────────────┘

Step 2: Complete Runner Registration
┌──────────────────────────────────────────────┐
│ POST /runner/register                        │
│ {                                           │
│   vehicleType: "Motorcycle",                │
│   vehicleNumber: "ABC123",                  │
│   phone: "+1122334455",                     │
│   serviceArea: "Downtown"                   │
│ }                                            │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ Runner profile created:                      │
│ {                                           │
│   id: "runner3",                            │
│   userId: "u3",                             │
│   status: "PENDING",                        │
│   vehicleType: "Motorcycle",                │
│   ...                                       │
│ }                                            │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ User accesses /runner/dashboard              │
│ useRunnerGuard() checks:                     │
│ 1. user.role === "RUNNER" ✅                 │
│ 2. user.runner exists ✅                      │
│                                              │
│ Result: Access granted! Show dashboard       │
└──────────────────────────────────────────────┘
```

---

## Shop Owner - Multiple Shops

```
User: Diana (SHOP_OWNER)
┌──────────────────────────────────────────────┐
│ User {                                       │
│   id: "u4",                                 │
│   name: "Diana Owner",                      │
│   role: "SHOP_OWNER",                       │
│   shops: [                                   │
│     { id: "shop1", name: "Electronics" },   │
│     { id: "shop2", name: "Fashion" }        │
│   ]                                          │
│ }                                            │
└──────────────────────────────────────────────┘

Each Shop can have multiple Runner partnerships:
┌──────────────────────────────────────────────┐
│ Shop: "Diana's Electronics"                  │
│ runnerAssignments: [                         │
│   { runnerId: "r1", status: "APPROVED" },    │
│   { runnerId: "r2", status: "PENDING" },     │
│   { runnerId: "r3", status: "REJECTED" }     │
│ ]                                            │
└──────────────────────────────────────────────┘

Runner can partner with multiple Shops:
┌──────────────────────────────────────────────┐
│ Runner: "Carlos"                             │
│ shopAssignments: [                           │
│   { shopId: "shop1", status: "APPROVED" },   │
│   { shopId: "shop3", status: "APPROVED" },   │
│   { shopId: "shop5", status: "PENDING" }     │
│ ]                                            │
└──────────────────────────────────────────────┘
```

---

## Summary

### Key Design Principles:

1. **Single User Table** - All users in one place, differentiated by `roleId`
2. **Optional Extensions** - `Runner` profile and `Shop` ownership are optional
3. **Role-Based Access** - Middleware + Layout guards enforce permissions
4. **Two-Step Runner Flow** - Role assignment ≠ Runner registration
5. **Multi-Shop Support** - One user can own multiple shops
6. **Many-to-Many Runner-Shop** - Runners can partner with multiple shops

This design is **scalable**, **flexible**, and follows **relational database best practices**!
