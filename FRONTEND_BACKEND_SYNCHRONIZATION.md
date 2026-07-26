# Frontend-Backend Synchronization Report

**Date:** March 31, 2026  
**Status:** ✅ Complete

This document summarizes the synchronization between the frontend TypeScript types and the backend Prisma schema/database models.

---

## 📋 Changes Summary

### 1. **User Type Updates** (`lib/types.ts`)

#### Before:
```typescript
export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: "ADMIN" | "CUSTOMER" | "RUNNER" | "SHOP_OWNER" | "WAREHOUSE";
  runner?: Runner;  // Expected full Runner object
  shop?: Shop;      // Expected Shop object
}
```

#### After:
```typescript
export type UserRole = "ADMIN" | "CUSTOMER" | "RUNNER" | "SHOP_OWNER" | "WAREHOUSE";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

// Minimal runner info from auth responses (UserResponseDto)
export interface MinimalRunner {
  id: string;
  status: RunnerStatus;
  vehicleType?: string;
}

// Full Runner entity from Prisma schema
export interface Runner {
  id: string;
  userId: string;
  rating: number;
  totalOrders: number;
  totalEarnings: number;
  status: RunnerStatus; // "INACTIVE" | "PENDING" | "ACTIVE"
  vehicleType?: string;
  vehicleNumber?: string;
  phone?: string;
  serviceArea?: string;
  user?: { id: string; name: string; phone: string; email?: string };
  wallet?: RunnerWallet;
  listings?: RunnerListing[];
  shopAssignments?: RunnerShopLink[];
  _count?: { listings: number; orders: number };
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  status?: UserStatus;
  runner?: MinimalRunner | Runner;  // Can be minimal or full
  shops?: Shop[];  // For SHOP_OWNER role
}
```

**Why:** The backend's `UserResponseDto` (returned from login/register) only includes minimal runner data: `{ id, status, vehicleType }`. Full runner data is only available from dedicated runner endpoints.

---

### 2. **Runner Status Enum**

#### Backend (Prisma):
```prisma
status: String @default("INACTIVE") // INACTIVE, PENDING, ACTIVE
```

#### Frontend (Updated):
```typescript
export type RunnerStatus = "INACTIVE" | "PENDING" | "ACTIVE";
```

**Changed From:** `"ACTIVE" | "INACTIVE" | "BUSY"`  
**Changed To:** `"INACTIVE" | "PENDING" | "ACTIVE"`

---

### 3. **Shop Status Enum**

#### Backend (Prisma):
```prisma
status: String @default("ACTIVE") // ACTIVE, SUSPENDED, CLOSED
```

#### Frontend (Updated):
```typescript
export type ShopStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
```

**Changed From:** `"ACTIVE" | "INACTIVE"`  
**Changed To:** `"ACTIVE" | "SUSPENDED" | "CLOSED"`

---

### 4. **New Types Added**

#### RunnerShopLink (Many-to-Many Relationship)
```typescript
export type RunnerShopStatus = "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";

export interface RunnerShopLink {
  id: string;
  runnerId: string;
  shopId: string;
  status: RunnerShopStatus;
  joinedAt: string;
  approvedAt?: string;
  notes?: string;
  runner?: Runner;
  shop?: Shop;
}
```

**Purpose:** Represents the approval workflow where runners request to join shops and owners approve/reject.

#### RunnerWallet
```typescript
export interface RunnerWallet {
  id: string;
  runnerId: string;
  balance: number;
  pending: number;
  updatedAt?: string;
}
```

#### Batch & BatchOrder (Warehouse System)
```typescript
export interface Batch {
  id: string;
  shopId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  priority: number;
  notes?: string;
  shop?: Shop;
  batchOrders?: BatchOrder[];
}

export interface BatchOrder {
  id: string;
  batchId: string;
  orderId: string;
  batch?: Batch;
  order?: Order;
}
```

#### Review
```typescript
export interface Review {
  id: string;
  productId: string;
  customerId: string;
  orderId?: string;
  rating: number; // 1-5 stars
  title?: string;
  comment?: string;
  verified: boolean;
  status: "ACTIVE" | "HIDDEN";
  product?: Product;
  customer?: User;
}
```

---

### 5. **Product & RunnerListing Updates**

#### Product (Added Relations)
```typescript
export interface Product {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  basePrice: number;
  stockQty: number;
  category?: string;
  images?: string[];
  status: "ACTIVE" | "INACTIVE";
  shop?: Shop;
  listings?: RunnerListing[];
  orderItems?: OrderItem[];
  reviews?: Review[];
  _count?: {
    listings?: number;
    orders?: number;
    reviews?: number;
  };
}
```

#### RunnerListing (Added shopId)
```typescript
export interface RunnerListing {
  id: string;
  runnerId: string;
  productId: string;
  shopId?: string;  // Denormalized for faster queries
  markup: number;
  runnerPrice: number;
  status: "ACTIVE" | "INACTIVE";
  runner?: Runner;
  product?: Product;
  shop?: Shop;  // Added
  orderItems?: OrderItem[];
}
```

---

### 6. **Component Updates**

#### useRoleGuard Hook (`hooks/useRoleGuard.ts`)
- Updated to handle `MinimalRunner | Runner` types
- Added comment explaining dual runner data structure
- Runner entity check now works with both minimal and full runner data

#### Dashboard Redirect (`app/dashboard/page.tsx`)
- Updated runner check to use `user.runner` instead of `(user as any).runner`
- Properly handles minimal runner data from auth response

#### Header Component (`components/layout/Header.tsx`)
- Already correctly uses `user?.runner` (no changes needed)
- Works with both MinimalRunner and full Runner types

---

## 📊 Database Relationship Map

```
User (1) ──┬── (1) Runner
           │
           ├── (M) Shop (owner)
           │
           ├── (M) Order
           │
           └── (M) Review

Shop (1) ──┬── (M) Product
           │
           └── (M) RunnerShopLink ── (M) Runner

Runner (1) ──┬── (M) RunnerListing ── (M) Product
             │
             ├── (M) RunnerShopLink ── (M) Shop
             │
             └── (1) RunnerWallet
```

---

## 🔧 API Response Shapes

### Auth Response (Login/Register)
```typescript
{
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    role: UserRole;
    runner?: {
      id: string;
      status: RunnerStatus;
      vehicleType?: string;
    };
  };
}
```

### Runner Profile Endpoint (`GET /runner/profile`)
```typescript
{
  id: string;
  userId: string;
  rating: number;
  totalOrders: number;
  totalEarnings: number;
  status: RunnerStatus;
  vehicleType?: string;
  vehicleNumber?: string;
  phone?: string;
  serviceArea?: string;
  user: { ... };
  wallet: { ... };
  _count: {
    listings: number;
    orders: number;
  };
}
```

---

## ✅ Type Safety Improvements

1. **No more `(user as any).runner`** - Properly typed as `MinimalRunner | Runner`
2. **Status enums match backend** - No runtime surprises from mismatched values
3. **Relations properly typed** - All Prisma relations have corresponding TypeScript types
4. **Many-to-many relationships** - `RunnerShopLink` type captures approval workflow

---

## 🚨 Breaking Changes

### Components That May Need Updates

1. **Status Badge Components** - May need to handle new status values:
   - Runner: Add `"PENDING"` handling
   - Shop: Add `"SUSPENDED"`, `"CLOSED"` handling

2. **Forms** - If creating/updating runners or shops, ensure status values match new enums

3. **Filters** - Any status filters should use updated enum values

---

## 📝 Migration Guide

### For Existing Code

```typescript
// ❌ Old way (will cause type errors)
const status: "ACTIVE" | "INACTIVE" | "BUSY" = "BUSY";

// ✅ New way
const status: RunnerStatus = "ACTIVE"; // or "PENDING" or "INACTIVE"

// ❌ Old way
const shopStatus: "ACTIVE" | "INACTIVE" = "INACTIVE";

// ✅ New way
const shopStatus: ShopStatus = "SUSPENDED"; // or "ACTIVE" or "CLOSED"
```

---

## 🎯 Next Steps

1. **Update status badge components** to handle new enum values
2. **Add runtime validation** for API responses using Zod or similar
3. **Generate types from Prisma** automatically using `prisma generate` with a TypeScript generator
4. **Add integration tests** to verify API response shapes match TypeScript types

---

## 📚 Reference Files

| File | Description |
|------|-------------|
| `backend/prisma/schema.prisma` | Source of truth for database models |
| `frontend/lib/types.ts` | Synchronized TypeScript types |
| `backend/src/modules/auth/dto/user-response.dto.ts` | Auth response shape |
| `frontend/hooks/useRoleGuard.ts` | Updated guard hook |
| `frontend/app/dashboard/page.tsx` | Updated redirect logic |

---

**TypeScript Compilation:** ✅ Passing (0 errors)  
**Build Status:** ⚠️ Pre-existing SSR issues (unrelated to type sync)
