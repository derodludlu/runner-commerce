// frontend/lib/types.ts
// Synchronized with backend Prisma schema (backend/prisma/schema.prisma)

// ═══════════════════════════════════════════════════════════════
// USER & AUTH
// ═══════════════════════════════════════════════════════════════

export type UserRole =
  "ADMIN" | "CUSTOMER" | "RUNNER" | "SHOP_OWNER" | "WAREHOUSE" | "SUPERUSER";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

// Minimal runner info returned in auth responses (UserResponseDto)
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
  publicCode?: string;
  phone?: string;
  serviceArea?: string;
  user?: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  wallet?: RunnerWallet;
  listings?: RunnerListing[];
  shopAssignments?: RunnerShopLink[];
  _count?: {
    listings: number;
    orders: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type RunnerStatus = "INACTIVE" | "PENDING" | "ACTIVE";

export interface RunnerWallet {
  id: string;
  runnerId: string;
  balance: number;
  pending: number;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  status?: UserStatus;
  mustChangePassword?: boolean;
  impersonation?: {
    active: boolean;
    actorUserId?: string;
    actorName?: string | null;
    actorRole?: string;
  };
  // Relations (populated when fetching with include)
  runner?: MinimalRunner | Runner; // Can be minimal (from auth) or full (from runner endpoints)
  shops?: Shop[]; // For SHOP_OWNER role
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
  runnerPreference?: {
    city: string;
    runnerPhone: string;
    status: "MATCHED" | "PENDING_MATCH";
    runnerId?: string;
  };
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface RegisterData {
  name: string;
  phone: string;
  email?: string;
  password: string;
  roleId: string;
}

// ═══════════════════════════════════════════════════════════════
// RUNNER-SHOP RELATIONSHIP (Many-to-Many with approval workflow)
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// SHOPS
// ═══════════════════════════════════════════════════════════════

export type ShopStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface Batch {
  id: string;
  shopId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  priority: number;
  notes?: string;
  shop?: Shop;
  batchOrders?: BatchOrder[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchOrder {
  id: string;
  batchId: string;
  orderId: string;
  batch?: Batch;
  order?: Order;
}

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
  createdAt?: string;
  updatedAt?: string;
}

export interface Shop {
  id: string;
  name: string;
  description?: string;
  phone: string;
  address?: string;
  ownerId: string;
  owner?: User;
  status: ShopStatus;
  products?: Product[];
  batches?: Batch[];
  runnerAssignments?: RunnerShopLink[];
  runnerListings?: RunnerListing[];
  _count?: {
    products: number;
    batches?: number;
    runnerAssignments?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTS & LISTINGS
// ═══════════════════════════════════════════════════════════════

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  basePrice: number;
  stockQty: number;
  category?: string;
  images?: string[];
  whatsappImports?: Array<{
    parsedDraft?: ProductPricingDraft | null;
    receivedAt?: string;
  }>;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPricingDraft {
  unitPrice?: number;
  stockPrice?: number;
  eachPrice?: number;
  stockIsBulkPrice?: boolean;
  regularUnitPrice?: number;
  bulkUnitPrice?: number;
  bulkQuantity?: number;
  bulkTotal?: number;
  bulkSavings?: number;
  bulkSavingsPerItem?: number;
  bulkSavingsPercent?: number;
  priceConfidence?: "HIGH" | "MEDIUM" | "LOW";
  priceWarnings?: string[];
}

export interface RunnerListing {
  id: string;
  runnerId: string;
  productId: string;
  shopId?: string;
  markup: number;
  runnerPrice: number;
  status: "ACTIVE" | "INACTIVE";
  orderCode?: string;
  autoPostApproved?: boolean;
  lastPostedAt?: string;
  postCount?: number;
  repostLogs?: Array<{
    id: string;
    groupIdOrName: string;
    status: string;
    postedAt: string;
    jobId?: string | null;
  }>;
  runner?: Runner;
  product?: Product;
  shop?: Shop;
  orderItems?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppOrderRequest {
  id: string;
  runnerId?: string;
  listingId?: string;
  orderId?: string;
  orderCode?: string;
  customerPhone?: string;
  customerName?: string;
  recipientPhone?: string;
  customerImageUrls?: string[] | null;
  customerImageHashes?: Array<{
    url?: string;
    sha256?: string;
    perceptualHash?: string;
    mimetype?: string;
  }> | null;
  matchedStampedMediaLogId?: string | null;
  imageMatchConfidence?: number | null;
  imageMatchReason?: string | null;
  messageId?: string;
  messageText: string;
  status:
    | "NEW"
    | "UNMATCHED"
    | "AWAITING_CUSTOMER_DETAILS"
    | "CONTACTED"
    | "CONVERTED"
    | "CLOSED";
  confidence: number;
  receivedAt: string;
  createdAt?: string;
  updatedAt?: string;
  listing?: RunnerListing;
  matchedStampedMediaLog?: {
    id: string;
    orderCode?: string | null;
    groupIdOrName: string;
    sourceImageUrl: string;
    imageIndex: number;
    sentAt: string;
    returnedCount: number;
    lastReturnedAt?: string | null;
  } | null;
  order?: Pick<Order, "id" | "status" | "totalAmount" | "createdAt">;
}

// ═══════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════

export enum OrderStatus {
  CREATED = "CREATED",
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  PENDING_PAYMENT = "PENDING_PAYMENT",
  PAID = "PAID",
  BUYING_TRIP_PLANNED = "BUYING_TRIP_PLANNED",
  BUYING_IN_PROGRESS = "BUYING_IN_PROGRESS",
  PURCHASED_FROM_SHOPS = "PURCHASED_FROM_SHOPS",
  ARRIVED_FOR_PACKING = "ARRIVED_FOR_PACKING",
  BATCHED = "BATCHED",
  PICKED = "PICKED",
  PACKED = "PACKED",
  READY_FOR_HANDOVER = "READY_FOR_HANDOVER",
  OUT_FOR_HANDOVER = "OUT_FOR_HANDOVER",
  SHIPPED = "SHIPPED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export interface Order {
  id: string;
  customerPhone: string;
  customerId?: string;
  customer?: User;
  status: OrderStatus;
  totalAmount: number;
  subtotal: number;
  tax: number;
  shippingFee: number;
  shippingAddress: Address;
  items: OrderItem[];
  runnerId?: string;
  runner?: Runner;
  shopId?: string;
  shop?: Shop;
  fulfillmentMethod?: string;
  fulfillmentLocation?: string;
  fulfillmentContact?: string;
  fulfillmentNotes?: string;
  procurementCity?: string;
  procurementTripCode?: string;
  procuredAt?: string;
  packedAt?: string;
  handedOverAt?: string;
  notes?: string;
  payment?: Payment;
  batchOrders?: Order[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  listingId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  shopPrice: number;
  commission: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  customerNote?: string | null;
  customerImageUrls?: string[] | null;
  status: OrderStatus;
  product?: Product;
  listing?: RunnerListing;
  createdAt?: string;
  updatedAt?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  trackingNumber?: string;
  latitude?: number;
  longitude?: number;
}

export interface CreateOrderData {
  customerPhone: string;
  shippingAddress: Address;
  items: {
    listingId: string;
    productId: string;
    quantity: number;
  }[];
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════

export enum PaymentStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  transactionId?: string;
  metadata?: Record<string, any>;
  failureReason?: string;
  refundedAmount?: number;
  order?: Order;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInitialization {
  clientSecret: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  publishableKey: string;
}

export interface CreatePaymentData {
  orderId: string;
  amount: number;
  currency?: string;
  customerEmail?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════════════════════

export interface CartItem {
  id?: string;
  listingId?: string;
  productId?: string;
  listing: RunnerListing;
  product: Product;
  quantity: number;
  customerImageUrls?: string[] | null;
}

export interface CartState {
  items: CartItem[];
  total: number;
  itemCount: number;
}

// ═══════════════════════════════════════════════════════════════
// API RESPONSES
// ═══════════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  data: T;
  message?: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type Nullable<T> = T | null;
