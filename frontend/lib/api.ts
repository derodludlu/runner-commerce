// frontend/lib/api.ts

import axios, { AxiosInstance } from "axios";
import { AuthResponse, LoginCredentials } from "./types";

const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const API_URL =
  typeof window !== "undefined" &&
  configuredApiUrl.startsWith("http") &&
  !configuredApiUrl.includes(window.location.host)
    ? "/api/backend"
    : configuredApiUrl;

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

export const systemApi = {
  getFeatures: () => api.get("/health/features"),
};

export const customersApi = {
  getRunnerPreferences: () => api.get("/customers/me/runner-preferences"),
  setRunnerPreference: (city: string, runnerPhone: string) =>
    api.put(`/customers/me/runner-preferences/${city}`, { runnerPhone }),
  removeRunnerPreference: (city: string) =>
    api.delete(`/customers/me/runner-preferences/${city}`),
};

// Request interceptor: Add legacy bearer token when present.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor: Handle 401 errors.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isSessionProbe = error.config?.url === "/auth/me";
    const isAuthenticationAttempt = [
      "/auth/login",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/password",
    ].includes(error.config?.url);
    if (
      typeof window !== "undefined" &&
      error.response?.status === 401 &&
      !isSessionProbe &&
      !isAuthenticationAttempt
    ) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await axios.post<AuthResponse>(
      "/api/auth/login",
      credentials,
      { withCredentials: true },
    );
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (userData: any) => {
    const response = await axios.post<AuthResponse>(
      "/api/auth/register",
      userData,
      { withCredentials: true },
    );
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout: async () => {
    try {
      await axios.post("/api/auth/logout", null, { withCredentials: true });
    } catch {
      // Local cleanup still needs to happen even if the server is unavailable.
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  },

  me: async () => {
    const response = await axios.get("/api/auth/me", { withCredentials: true });
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(response.data));
    }
    return response.data;
  },

  updateMe: async (data: { name?: string; phone?: string; email?: string }) => {
    const response = await api.patch("/auth/me", data);
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(response.data));
    }
    return response.data;
  },

  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch("/auth/password", { currentPassword, newPassword }),

  forgotPassword: (identifier: string) =>
    api.post("/auth/forgot-password", { identifier }),

  resetPassword: (identifier: string, code: string, newPassword: string) =>
    api.post("/auth/reset-password", { identifier, code, newPassword }),

  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken: () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
  },
};

// Products API
export const productsApi = {
  getAll: (params?: {
    limit?: number;
    status?: string;
    category?: string;
    search?: string;
    shopId?: string;
    shop?: string;
    offset?: number;
    sortBy?: string;
    order?: "asc" | "desc";
    inStock?: boolean;
  }) => api.get("/products", { params }),

  imageSearch: (image: File, params?: { limit?: number; shopId?: string }) => {
    const formData = new FormData();
    formData.append("image", image);
    return api.post("/products/image-search", formData, {
      params,
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30000,
    });
  },

  backfillImageSearch: (limit = 1000) =>
    api.post("/products/image-search/backfill", null, { params: { limit } }),

  getDuplicateCandidates: (shopId: string) =>
    api.get(`/products/shops/${shopId}/duplicate-candidates`, {
      timeout: 120000,
    }),

  mergeDuplicate: (
    shopId: string,
    keepProductId: string,
    removeProductId: string,
  ) =>
    api.post(`/products/shops/${shopId}/duplicate-candidates/merge`, {
      keepProductId,
      removeProductId,
    }),

  keepDuplicateSeparate: (
    shopId: string,
    leftProductId: string,
    rightProductId: string,
  ) =>
    api.post(`/products/shops/${shopId}/duplicate-candidates/keep-separate`, {
      leftProductId,
      rightProductId,
    }),

  getById: (id: string) => api.get(`/products/${id}`),

  getByShop: (shopId: string) => api.get(`/products/shops/${shopId}`),

  create: (
    shopId: string,
    data: {
      name: string;
      description?: string;
      basePrice: number;
      stockQty: number;
      category?: string;
      images?: string[];
    },
  ) => api.post(`/products/shops/${shopId}`, data),

  importWhatsApp: (
    shopId: string,
    items: Array<{
      name: string;
      description?: string;
      basePrice: number;
      stockQty: number;
      category?: string;
      images?: string[];
      sourceText?: string;
    }>,
  ) => api.post(`/products/shops/${shopId}/import/whatsapp`, { items }),

  update: (
    shopId: string,
    productId: string,
    data: Partial<{
      name: string;
      description: string;
      basePrice: number;
      stockQty: number;
      category: string;
      status: string;
      images: string[];
    }>,
  ) => api.patch(`/products/shops/${shopId}/${productId}`, data),

  delete: (shopId: string, productId: string) =>
    api.delete(`/products/shops/${shopId}/${productId}`),
};

// WhatsApp Imports API
export const whatsappImportsApi = {
  getDiscoveredGroups: (params?: {
    bridgeAccountId?: string;
    availability?: string;
  }) => api.get("/whatsapp-imports/discovered-groups", { params }),

  getDiscoveredChannels: (params?: {
    bridgeAccountId?: string;
    availability?: string;
  }) => api.get("/whatsapp-imports/discovered-channels", { params }),

  importDiscoveredGroupAsShop: (groupId: string) =>
    api.post(
      `/whatsapp-imports/discovered-groups/${encodeURIComponent(groupId)}/import-shop`,
    ),

  linkDiscoveredGroupToShop: (
    groupId: string,
    data: {
      shopId: string;
      groupRole?: "SOURCE" | "SHOP_REPOST_DESTINATION";
      isPrimarySource?: boolean;
    },
  ) =>
    api.post(
      `/whatsapp-imports/discovered-groups/${encodeURIComponent(groupId)}/link-shop`,
      data,
    ),

  importDiscoveredGroupAsRunnerAdvertising: (groupId: string) =>
    api.post(
      `/whatsapp-imports/discovered-groups/${encodeURIComponent(groupId)}/import-runner-advertising`,
    ),

  deleteDiscoveredGroup: (groupId: string) =>
    api.delete(
      `/whatsapp-imports/discovered-groups/${encodeURIComponent(groupId)}`,
    ),

  getCustomerGroupConflicts: (params?: { status?: string }) =>
    api.get("/whatsapp-imports/customer-group-conflicts", { params }),

  resolveCustomerGroupConflict: (
    conflictId: string,
    data: { runnerId: string; note?: string },
  ) =>
    api.post(
      `/whatsapp-imports/customer-group-conflicts/${conflictId}/resolve`,
      data,
    ),

  getGroupMappings: (params?: { shopId?: string; status?: string }) =>
    api.get("/whatsapp-imports/group-mappings", { params }),

  createGroupMapping: (data: {
    shopId: string;
    groupId: string;
    sourceGroup: string;
    participants?: number;
    status?: "ACTIVE" | "PAUSED" | "INACTIVE";
    groupRole?: "SOURCE" | "SHOP_REPOST_DESTINATION";
    isPrimarySource?: boolean;
    captureEnabled?: boolean;
    postingEnabled?: boolean;
    captureLimitPerRun?: number;
    listingLimitPerRun?: number;
    inviteLink?: string;
    notes?: string;
  }) => api.post("/whatsapp-imports/group-mappings", data),

  updateGroupMapping: (
    mappingId: string,
    data: Partial<{
      shopId: string;
      groupId: string;
      sourceGroup: string;
      participants: number;
      status: "ACTIVE" | "PAUSED" | "INACTIVE";
      groupRole: "SOURCE" | "SHOP_REPOST_DESTINATION";
      isPrimarySource: boolean;
      captureEnabled: boolean;
      postingEnabled: boolean;
      captureLimitPerRun: number;
      listingLimitPerRun: number;
      inviteLink: string;
      notes: string;
    }>,
  ) => api.patch(`/whatsapp-imports/group-mappings/${mappingId}`, data),

  deactivateGroupMapping: (mappingId: string) =>
    api.delete(`/whatsapp-imports/group-mappings/${mappingId}`),

  unlinkGroupMapping: (mappingId: string) =>
    api.delete(`/whatsapp-imports/group-mappings/${mappingId}/link`),

  ingest: (
    shopId: string,
    data: {
      caption: string;
      sourceGroup?: string;
      senderPhone?: string;
      messageId?: string;
      mediaUrls?: string[];
      receivedAt?: string;
    },
  ) => api.post(`/whatsapp-imports/shops/${shopId}`, data),

  getByShop: (
    shopId: string,
    params?: { status?: string; limit?: number; offset?: number },
  ) => api.get(`/whatsapp-imports/shops/${shopId}`, { params }),

  getCaptureStats: (shopId: string) =>
    api.get(`/whatsapp-imports/shops/${shopId}/capture-stats`),

  importSelected: (shopId: string, ids: string[]) =>
    api.post(`/whatsapp-imports/shops/${shopId}/import`, { ids }),

  enrich: (shopId: string, importId: string) =>
    api.post(`/whatsapp-imports/shops/${shopId}/${importId}/enrich`),

  enrichSelected: (shopId: string, ids: string[]) =>
    api.post(`/whatsapp-imports/shops/${shopId}/enrich`, { ids }),

  update: (
    shopId: string,
    importId: string,
    data: {
      parsedDraft?: Partial<{
        name: string;
        description: string;
        basePrice: number;
        stockQty: number;
        category: string;
        images: string[];
      }>;
      status?: "PARSED" | "NEEDS_REVIEW" | "IGNORED";
    },
  ) => api.patch(`/whatsapp-imports/shops/${shopId}/${importId}`, data),
};

// Orders API
export const ordersApi = {
  getAll: (params?: { status?: string }) => api.get("/orders", { params }),

  getById: (id: string) => api.get(`/orders/${id}`),

  getByShop: (shopId: string, params?: { status?: string; limit?: number }) =>
    api.get(`/orders/shop/${shopId}`, { params }),

  create: (orderData: any) => api.post("/orders", orderData),

  uploadPaymentProof: (id: string, proof: File) => {
    const formData = new FormData();
    formData.append("proof", proof);
    return api.post(`/orders/${id}/payment-proof`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  submitCustomerPayment: (
    id: string,
    data: {
      method: string;
      reference?: string;
      proofUrl?: string;
      amount?: number;
      notes?: string;
    },
  ) => api.patch(`/orders/${id}/customer-payment`, data),

  updateStatus: (
    id: string,
    status: string,
    details: Record<string, unknown> = {},
  ) => api.patch(`/orders/${id}/status`, { status, ...details }),

  updateManualTracking: (
    id: string,
    data: {
      customerPaymentStatus?: string;
      customerPaymentMethod?: string;
      customerPaymentReference?: string;
      customerPaymentProofUrl?: string;
      shopPaymentStatus?: string;
      shopPaymentMethod?: string;
      shopPaymentReference?: string;
      shopPaymentProofUrl?: string;
      runnerPurchaseStatus?: string;
      handoverStatus?: string;
    },
  ) => api.patch(`/orders/${id}/manual-tracking`, data),

  cancel: (id: string) => api.delete(`/orders/${id}/cancel`),

  adminUpdate: (id: string, data: Record<string, unknown>) =>
    api.patch(`/orders/${id}/admin`, data),

  adminDelete: (id: string) => api.delete(`/orders/${id}`),
};

// Billing API
export const billingApi = {
  getPlans: () => api.get("/billing/plans"),
  getMine: () => api.get("/billing/me"),
  getInvoices: () => api.get("/billing/invoices"),
  getEvents: () => api.get("/billing/events"),
  getSubscriptions: () => api.get("/billing/subscriptions"),
  createSubscription: (data: {
    planCode: string;
    shopId?: string;
    automationAddonEnabled?: boolean;
    orderWorkflowAddonEnabled?: boolean;
    priceEditingAddonEnabled?: boolean;
    shopPriceImageAddonEnabled?: boolean;
  }) => api.post("/billing/subscriptions", data),
  changeSubscriptionPlan: (
    subscriptionId: string,
    data: {
      planCode: string;
      automationAddonEnabled?: boolean;
      orderWorkflowAddonEnabled?: boolean;
      priceEditingAddonEnabled?: boolean;
      shopPriceImageAddonEnabled?: boolean;
    },
  ) => api.patch(`/billing/subscriptions/${subscriptionId}/plan`, data),
  updateSubscriptionStatus: (
    subscriptionId: string,
    data: { status: string; notes?: string },
  ) => api.patch(`/billing/subscriptions/${subscriptionId}/status`, data),
  generateCurrentInvoice: (subscriptionId: string) =>
    api.post(`/billing/subscriptions/${subscriptionId}/invoice`),
  submitInvoicePayment: (
    invoiceId: string,
    data: {
      amount: number;
      method: string;
      reference?: string;
      runnerReference?: string;
      proofUrl?: string;
      proofText?: string;
      proofImageUrls?: string[];
      notes?: string;
    },
  ) => api.post(`/billing/invoices/${invoiceId}/manual-payment`, data),
  uploadInvoicePaymentProof: (invoiceId: string, proof: File) => {
    const formData = new FormData();
    formData.append("proof", proof);
    return api.post(
      `/billing/invoices/${invoiceId}/payment-proof-upload`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
  },
  updateManualPayment: (
    paymentId: string,
    data: { status: "VERIFIED" | "REJECTED"; notes?: string },
  ) => api.patch(`/billing/manual-payments/${paymentId}`, data),
  updateInvoiceStatus: (
    invoiceId: string,
    data: { status: string; notes?: string },
  ) => api.patch(`/billing/invoices/${invoiceId}/status`, data),
  deleteManualPayment: (paymentId: string) =>
    api.delete(`/billing/manual-payments/${paymentId}`),
  deleteInvoice: (invoiceId: string) =>
    api.delete(`/billing/invoices/${invoiceId}`),
  deleteSubscription: (subscriptionId: string) =>
    api.delete(`/billing/subscriptions/${subscriptionId}`),
  resetBilling: () => api.delete("/billing/dev/reset"),
};

// Payments API
export const paymentsApi = {
  create: (paymentData: {
    orderId: string;
    amount: number;
    customerEmail?: string;
  }) => api.post("/payments", paymentData),

  confirm: (paymentId: string, paymentIntentId: string) =>
    api.post(`/payments/${paymentId}/confirm`, { paymentIntentId }),

  getById: (id: string) => api.get(`/payments/${id}`),

  refund: (id: string, amount?: number, reason?: string) =>
    api.post(`/payments/${id}/refund`, { amount, reason }),
};

// Shops API
export const shopsApi = {
  getAll: (params?: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    order?: "asc" | "desc";
  }) => api.get("/shops", { params }),
  getById: (id: string) => api.get(`/shops/${id}`),
  getMyShops: () => api.get("/shops/my-shops"),
  mergeInto: (sourceId: string, targetId: string, reason?: string) =>
    api.post(`/shops/${sourceId}/merge-into/${targetId}`, { reason }),
  adminHardDelete: (id: string) => api.delete(`/shops/${id}/hard`),
};

// Reviews API
export const reviewsApi = {
  create: (reviewData: {
    productId: string;
    rating: number;
    title?: string;
    comment?: string;
    orderId?: string;
  }) => api.post("/reviews", reviewData),

  getByProduct: (productId: string, limit = 10, offset = 0) =>
    api.get(`/reviews/product/${productId}`, { params: { limit, offset } }),

  getAverage: (productId: string) =>
    api.get(`/reviews/product/${productId}/average`),

  delete: (reviewId: string) => api.delete(`/reviews/${reviewId}`),
};

// Runner API
export const runnerApi = {
  register: (data: {
    vehicleType: string;
    vehicleNumber?: string;
    phone?: string;
    serviceArea?: string;
  }) => api.post("/runner/register", data),

  getPhase1Status: () => api.get("/runner/phase1/status"),

  discoverPhase1Shops: (params?: {
    search?: string;
    location?: string;
    category?: string;
    limit?: number;
  }) => api.get("/runner/phase1/shops", { params }),

  selectPhase1Shops: (shopIds: string[], scope?: "test" | "live") =>
    api.post("/runner/phase1/shops", { shopIds, scope }),

  removePhase1Shop: (shopId: string) =>
    api.delete(`/runner/phase1/shops/${shopId}`),

  submitShopLinks: (links: string | string[]) =>
    api.post("/runner/phase1/submitted-shop-links", { links }),

  submitRepostingGroup: (data: {
    inviteLink: string;
    groupName?: string;
    isTestGroup?: boolean;
  }) => api.post("/runner/phase1/reposting-groups", data),

  confirmBotAdmin: (groupId: string) =>
    api.patch(`/runner/phase1/reposting-groups/${groupId}/admin-confirmed`),

  commandReposting: (message: string) =>
    api.post("/runner/phase1/commands", { message }),

  getProfile: () => api.get("/runner/profile"),

  getPublicRunner: (runnerCode: string, orderCode?: string) =>
    api.get(`/runner/public/${encodeURIComponent(runnerCode)}`, {
      params: orderCode ? { code: orderCode } : undefined,
    }),

  getAutomationMetrics: (params?: {
    intervalMinutes?: 30 | 60;
    hours?: number;
    selectionScope?: "test" | "live" | "all";
  }) => api.get("/runner/automation-metrics", { params }),

  getListingSummary: () => api.get("/runner/listings/summary"),

  getListingRepostStatus: (destinationGroup: string) =>
    api.get("/runner/listings/repost-status", {
      params: { destinationGroup },
    }),

  updateProfile: (data: {
    name?: string;
    phone?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    serviceArea?: string;
    whatsappGroup?: string;
    autoPostEnabled?: boolean;
    autoPostIntervalMinutes?: number;
    maxPostsPerRun?: number;
    repostPriceMode?:
      "ORIGINAL" | "FEE_BREAKDOWN" | "TOTAL_ONLY" | "STOCK_EACH_TOTALS";
    repostOrderDetailsEnabled?: boolean;
    repostFeePercentageEnabled?: boolean;
    repostOriginalPricePerImageEnabled?: boolean;
  }) => api.patch("/runner/profile", data),

  applyRepostPriceFormat: (data: {
    repostPriceMode?:
      "ORIGINAL" | "FEE_BREAKDOWN" | "TOTAL_ONLY" | "STOCK_EACH_TOTALS";
  }) => api.post("/runner/repost-price-format/apply-now", data),

  getListings: (params?: {
    search?: string;
    page?: number;
    limit?: number;
    paginated?: boolean;
    capturedFrom?: string;
    capturedTo?: string;
    status?: string;
    captionIssue?: boolean;
  }) => api.get("/runner/listings", { params }),

  getOrderRequests: () => api.get("/runner/order-requests"),

  getShoppingList: () => api.get("/runner/shopping-list"),

  getPackingList: () => api.get("/runner/packing-list"),

  updateShoppingListItemsStatus: (itemIds: string[], status: string) =>
    api.patch("/runner/shopping-list/items/status", { itemIds, status }),

  updateOrderRequestStatus: (
    orderRequestId: string,
    status:
      | "NEW"
      | "UNMATCHED"
      | "AWAITING_CUSTOMER_DETAILS"
      | "CONTACTED"
      | "CONVERTED"
      | "CLOSED",
  ) => api.patch(`/runner/order-requests/${orderRequestId}/status`, { status }),

  convertOrderRequest: (
    orderRequestId: string,
    data: {
      quantity?: number;
      customerPhone?: string;
      customerName?: string;
      size?: string;
      color?: string;
      street?: string;
      city?: string;
      notes?: string;
    },
  ) => api.post(`/runner/order-requests/${orderRequestId}/convert`, data),

  createListing: (productId: string, markup: number) =>
    api.post(`/runner/products/${productId}/listing`, { markup }),

  deleteListing: (listingId: string) =>
    api.delete(`/runner/listings/${listingId}`),

  skipListing: (listingId: string, reason?: string) =>
    api.post(`/runner/listings/${listingId}/skip`, { reason }),

  deleteListingsOlderThan: (days: number) =>
    api.delete(`/runner/listings/older-than/${days}`),

  deleteListingsOlderThanHours: (hours: number) =>
    api.delete(`/runner/listings/older-than-hours/${hours}`),

  deleteListingsOlderThanCapture: (days: number) =>
    api.delete(`/runner/listings/older-than-capture/${days}`),

  deleteListingsOlderThanCaptureHours: (hours: number) =>
    api.delete(`/runner/listings/older-than-capture-hours/${hours}`),

  updateListingAutoPost: (listingId: string, autoPostApproved: boolean) =>
    api.patch(`/runner/listings/${listingId}/auto-post`, {
      autoPostApproved,
    }),

  recoverListingCaptionsAutomatically: (listingIds: string[]) =>
    api.patch("/runner/listings/caption-recovery/automatic", { listingIds }),

  updateListingRepostControl: (
    listingId: string,
    data: {
      action: "START_NOW" | "SCHEDULE" | "PAUSE" | "RESUME" | "STOP";
      scheduledStartAt?: string;
      repostFrequencyMinutes?: number;
      maximumListingAgeDays?: number;
      expiryDate?: string;
    },
  ) => api.patch(`/runner/listings/${listingId}/repost-control`, data),

  queueWhatsAppSessionRepost: (data: {
    listingIds: string[];
    groupIdOrName: string;
    captionOverrides?: Record<string, string>;
    imageOverrides?: Record<string, string[]>;
    forceRepost?: boolean;
  }) => api.post("/runner/listings/repost-whatsapp-session", data),

  getEarnings: () => api.get("/runner/earnings"),

  getAvailableProducts: () => api.get("/runner/products/available"),
};

// Cart API
export const cartApi = {
  getCart: () => api.get("/cart"),

  addItem: (listingId: string, quantity: number = 1) =>
    api.post("/cart/items", { listingId, quantity }),

  updateItem: (itemId: string, quantity: number) =>
    api.patch(`/cart/items/${itemId}`, { quantity }),

  removeItem: (itemId: string) => api.delete(`/cart/items/${itemId}`),

  uploadReferenceImages: (itemId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    return api.post(`/cart/items/${itemId}/reference-images`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  clearReferenceImages: (itemId: string) =>
    api.delete(`/cart/items/${itemId}/reference-images`),

  clearCart: () => api.delete("/cart"),

  checkout: () => api.post("/cart/checkout"),
};

// Wishlist API
export const wishlistApi = {
  getWishlist: () => api.get("/wishlist"),

  addItem: (productId: string) => api.post(`/wishlist/items/${productId}`),

  removeItem: (productId: string) => api.delete(`/wishlist/items/${productId}`),

  checkItem: (productId: string) => api.get(`/wishlist/check/${productId}`),

  clearWishlist: () => api.delete("/wishlist"),

  moveToCart: (productId: string) =>
    api.post(`/wishlist/move-to-cart/${productId}`),
};

// Coupons API
export const couponsApi = {
  apply: (
    code: string,
    orderAmount: number,
    shopId?: string,
    category?: string,
  ) => api.post("/coupons/apply", { code, orderAmount, shopId, category }),

  validate: (code: string) => api.get(`/coupons/validate/${code}`),

  getMyUsage: () => api.get("/coupons/my-usage"),

  getAll: () => api.get("/coupons"),

  getById: (id: string) => api.get(`/coupons/${id}`),

  create: (data: {
    code: string;
    description?: string;
    discountType: "PERCENTAGE" | "FIXED";
    discountValue: number;
    minOrderAmount?: number;
    maxDiscount?: number;
    usageLimit?: number;
    perUserLimit?: number;
    validFrom: string;
    validUntil?: string;
  }) => api.post("/coupons", data),

  update: (
    id: string,
    data: Partial<{
      description: string;
      discountType: "PERCENTAGE" | "FIXED";
      discountValue: number;
      minOrderAmount: number;
      maxDiscount: number;
      usageLimit: number;
      perUserLimit: number;
      validFrom: string;
      validUntil: string;
    }>,
  ) => api.patch(`/coupons/${id}`, data),

  delete: (id: string) => api.delete(`/coupons/${id}`),
};

// Notifications API
export const notificationsApi = {
  getNotifications: (limit = 20, offset = 0) =>
    api.get("/notifications", { params: { limit, offset } }),

  getUnreadCount: () => api.get("/notifications/unread-count"),

  markAsRead: (notificationId: string) =>
    api.patch(`/notifications/${notificationId}/read`),

  markAllAsRead: () => api.post("/notifications/mark-all-read"),

  getPreferences: () => api.get("/notifications/preferences"),

  updatePreferences: (prefs: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    orderUpdates?: boolean;
    promotions?: boolean;
  }) => api.patch("/notifications/preferences", prefs),
};

// Admin API
export const adminApi = {
  getDashboard: () => api.get("/admin/dashboard"),

  getSalesAnalytics: (startDate: string, endDate: string) =>
    api.get("/admin/analytics/sales", { params: { startDate, endDate } }),

  getUserAnalytics: () => api.get("/admin/analytics/users"),

  getOrderStatusBreakdown: () => api.get("/admin/analytics/orders"),

  getRevenueByPeriod: (period: "day" | "week" | "month" | "year" = "month") =>
    api.get("/admin/analytics/revenue", { params: { period } }),

  getTopProducts: (limit = 10) =>
    api.get("/admin/products/top", { params: { limit } }),

  getTopRunners: (limit = 10) =>
    api.get("/admin/runners/top", { params: { limit } }),

  getRunners: (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get("/admin/runners", { params }),

  getPhase1Runners: (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get("/admin/phase1/runners", { params }),

  getPhase1Prospects: (params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get("/admin/phase1/prospects", { params }),

  updateRunnerPhase1Access: (
    runnerId: string,
    data: {
      status?: string;
      trialStatus?: string;
      subscriptionStatus?: string;
      repostingStatus?: string;
      activateTrial?: boolean;
      trialEndsAt?: string;
    },
  ) => api.patch(`/admin/phase1/runners/${runnerId}/access`, data),

  mergeLegacyRunnerReposting: (runnerId: string) =>
    api.patch(`/admin/phase1/runners/${runnerId}/merge-legacy-reposting`),

  autoMergeLegacyRunnerReposting: (data?: { limit?: number }) =>
    api.patch("/admin/phase1/runners/merge-legacy-reposting/auto", data || {}),

  verifyRunnerRepostingGroup: (
    groupId: string,
    data: Partial<{
      status: string;
      botJoinStatus: string;
      botAdminStatus: string;
      whatsappGroupId: string;
      groupName: string;
      isTestGroup: boolean;
      notes: string;
      autoImportRunnerAdvertising: boolean;
    }>,
  ) => api.patch(`/admin/phase1/reposting-groups/${groupId}/verify`, data),

  deleteRunnerRepostingGroup: (groupId: string) =>
    api.delete(`/admin/phase1/reposting-groups/${groupId}`),

  reviewSubmittedShopLink: (
    linkId: string,
    data: { status: string; notes?: string; bridgeAccountId?: string },
  ) => api.patch(`/admin/phase1/submitted-shop-links/${linkId}/review`, data),

  approvePhase1ProspectInviteLink: (
    sessionId: string,
    data: {
      inviteLink: string;
      bridgeAccountId: string;
      linkType?: "SUBMITTED_SHOP" | "REPOSTING_GROUP";
    },
  ) =>
    api.post(
      `/admin/phase1/prospects/${encodeURIComponent(sessionId)}/invite-links/approve`,
      data,
    ),

  updateRunnerStatus: (
    runnerId: string,
    status: "ACTIVE" | "PENDING" | "INACTIVE",
  ) => api.patch(`/admin/runners/${runnerId}/status`, { status }),

  assignRunnerBridge: (runnerId: string, bridgeAccountId?: string | null) =>
    api.patch(`/admin/runners/${runnerId}/bridge-account`, {
      bridgeAccountId: bridgeAccountId || null,
    }),

  updateRunnerPhase2Controls: (
    runnerId: string,
    data: Partial<{
      whatsappOrderIntakeEnabled: boolean;
      whatsappOrderTemplatesVerified: boolean;
      markWhatsAppOrderTested: boolean;
      clearWhatsAppOrderTested: boolean;
      refundMode:
        "MANUAL_REFUND_ONLY" | "STRIPE_ELIGIBLE" | "STORE_CREDIT_OR_EXCHANGE";
      shippingMode:
        | "MANUAL_HANDOVER"
        | "MANUAL_TRACKING"
        | "PROVIDER_RATE_QUOTE"
        | "PROVIDER_LABELS";
      supervisionMode: "SUPERVISED" | "ASSISTED" | "AUTOMATION_REVIEW";
      phase2ReadinessNotes: string;
    }>,
  ) => api.patch(`/admin/runners/${runnerId}/phase2-controls`, data),

  impersonateRunner: (runnerId: string) =>
    api.post(`/admin/runners/${runnerId}/impersonate`),

  updateRunnerServiceCities: (runnerId: string, cities: string[]) =>
    api.patch(`/admin/runners/${runnerId}/service-cities`, { cities }),

  updateShopProcurementCity: (shopId: string, city: string) =>
    api.patch(`/admin/shops/${shopId}/procurement-city`, { city }),

  getPendingRunnerPreferences: () =>
    api.get("/admin/customer-runner-preferences/pending"),

  resolveRunnerPreference: (preferenceId: string, runnerId: string) =>
    api.patch(`/admin/customer-runner-preferences/${preferenceId}/resolve`, {
      runnerId,
    }),

  getWhatsAppBridges: () => api.get("/admin/whatsapp-bridges"),

  getWhatsAppDestinationConflicts: () =>
    api.get("/admin/whatsapp-destination-conflicts"),

  getWhatsAppBridgeLogs: (bridgeId: string, lines = 240) =>
    api.get(`/admin/whatsapp-bridges/${bridgeId}/logs`, {
      params: { lines },
    }),

  createWhatsAppBridge: (data: {
    name: string;
    phone?: string;
    expectedPhone?: string;
    mode?: string;
    sessionName?: string;
    workerKey?: string;
    capacityRunners?: number;
    maxPostsPerRun?: number;
    runtimeSettings?: Record<string, unknown>;
    notes?: string;
    status?: string;
  }) => api.post("/admin/whatsapp-bridges", data),

  updateWhatsAppBridge: (
    bridgeId: string,
    data: Partial<{
      name: string;
      phone: string | null;
      expectedPhone: string | null;
      mode: string;
      sessionName: string | null;
      workerKey: string | null;
      capacityRunners: number;
      maxPostsPerRun: number;
      runtimeSettings: Record<string, unknown>;
      notes: string | null;
      status: string;
    }>,
  ) => api.patch(`/admin/whatsapp-bridges/${bridgeId}`, data),

  setWhatsAppBotBridge: (bridgeId: string) =>
    api.post(`/admin/whatsapp-bridges/${bridgeId}/bot-bridge`),

  deleteWhatsAppBridge: (bridgeId: string) =>
    api.delete(`/admin/whatsapp-bridges/${bridgeId}`),

  getTopShops: (limit = 10) =>
    api.get("/admin/shops/top", { params: { limit } }),

  getRecentOrders: (limit = 20) =>
    api.get("/admin/orders/recent", { params: { limit } }),

  getUsers: (params?: {
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get("/admin/users", { params }),

  updateUserRole: (
    userId: string,
    role: "CUSTOMER" | "RUNNER" | "SHOP_OWNER",
  ) => api.patch(`/admin/users/${userId}/role`, { role }),

  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),

  resetUserPassword: (userId: string) =>
    api.post(`/admin/users/${userId}/reset-password`),

  getDevelopmentState: () => api.get("/admin/dev/state"),

  updateRunnerShopAutoApproval: (enabled: boolean) =>
    api.patch("/admin/dev/settings/runner-shop-auto-approval", { enabled }),

  updateWhatsAppOrderTracking: (enabled: boolean) =>
    api.patch("/admin/dev/settings/whatsapp-order-tracking", { enabled }),

  updateWhatsAppReposting: (enabled: boolean) =>
    api.patch("/admin/dev/settings/whatsapp-reposting", { enabled }),

  getOperationsState: () => api.get("/admin/operations/state"),

  updateMaintenanceMode: (enabled: boolean) =>
    api.patch("/admin/operations/maintenance", { enabled }),

  safeShutdown: (stopBridges = true) =>
    api.post("/admin/operations/safe-shutdown", { stopBridges }),

  updatePhase2: (enabled: boolean) =>
    api.patch("/admin/dev/settings/phase-2", { enabled }),

  resetOrders: () => api.delete("/admin/dev/orders"),

  resetListings: () => api.delete("/admin/dev/listings"),

  resetShopsAndWhatsAppGroups: () =>
    api.delete("/admin/dev/shops-and-whatsapp-groups"),

  deleteProductsOlderThanCapture: (days: number) =>
    api.delete(`/admin/dev/products/older-than-capture/${days}`),

  deleteProductsOlderThanCaptureHours: (hours: number) =>
    api.delete(`/admin/dev/products/older-than-capture-hours/${hours}`),

  deleteShopsNotConnectedToAnyBridge: () =>
    api.delete("/admin/dev/shops/not-connected-to-any-bridge"),

  deleteOrphanedWhatsAppGroups: () =>
    api.delete("/admin/dev/whatsapp-groups/orphaned"),
};

// Runner-Shops API
export const runnerShopsApi = {
  joinShop: (shopId: string, notes?: string) =>
    api.post("/runner-shops/join", { shopId, notes }),

  getMyShops: (params?: {
    status?: string;
    selectionScope?: "test" | "live" | "all";
  }) => api.get("/runner-shops/my-shops", { params }),

  getDestinationGroups: (params?: { includeCandidates?: boolean }) =>
    api.get("/runner-shops/destination-groups", { params }),

  updateDestinationGroupScope: (groupId: string, isTestGroup: boolean) =>
    api.patch(
      `/runner-shops/destination-groups/${encodeURIComponent(groupId)}/scope`,
      { isTestGroup },
    ),

  captureApprovedShops: (shopIds?: string[]) =>
    api.post("/runner-shops/capture-approved-shops", { shopIds }),

  updateAutomation: (
    shopId: string,
    data: Partial<{
      autoListEnabled: boolean;
      autoPostEnabled: boolean;
      markupPercent: number;
      destinationGroup: string;
      maxPostsPerRun: number;
      maximumListingAgeDays: number;
      minPrice: number | null;
      maxPrice: number | null;
      categoryFilter: string;
      requireMedia: boolean;
      selectionScope: "test" | "live" | "all";
    }>,
  ) => api.patch(`/runner-shops/my-shops/${shopId}/automation`, data),

  updateAllAutomation: (
    data: Partial<{
      autoListEnabled: boolean;
      autoPostEnabled: boolean;
      markupPercent: number;
      destinationGroup: string;
      maxPostsPerRun: number;
      maximumListingAgeDays: number;
      minPrice: number | null;
      maxPrice: number | null;
      categoryFilter: string;
      requireMedia: boolean;
      selectionScope: "test" | "live" | "all";
    }>,
  ) => api.patch("/runner-shops/my-shops/automation", data),

  cancelJoinRequest: (shopId: string) =>
    api.delete(`/runner-shops/my-shops/${shopId}/request`),

  getMarketplace: () => api.get("/runner-shops/marketplace"),

  leaveShop: (shopId: string) => api.delete(`/runner-shops/leave/${shopId}`),

  getShopRunners: (shopId: string) =>
    api.get(`/runner-shops/shops/${shopId}/runners`),

  getShopRequests: (shopId: string) =>
    api.get(`/runner-shops/shops/${shopId}/requests`),

  updateRunnerStatus: (
    shopId: string,
    runnerId: string,
    status: "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED",
  ) => api.patch(`/runner-shops/shops/${shopId}/runners`, { runnerId, status }),

  removeRunner: (shopId: string, runnerId: string) =>
    api.delete(`/runner-shops/shops/${shopId}/runners/${runnerId}`),

  findRunners: (shopIds: string[]) =>
    api.post("/runner-shops/find-runners", { shopIds }),
};

// Returns API
export const returnsApi = {
  createReturn: (data: {
    orderId: string;
    orderItemId?: string;
    reason: string;
    description?: string;
    refundType?: "ORIGINAL_PAYMENT" | "STORE_CREDIT" | "EXCHANGE";
  }) => api.post("/returns", data),

  getMyReturns: () => api.get("/returns/my-returns"),

  getReturn: (id: string) => api.get(`/returns/${id}`),
};

// Support API
export const supportApi = {
  createTicket: (data: {
    subject: string;
    description: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    category?: "ORDER" | "PAYMENT" | "PRODUCT" | "TECHNICAL" | "OTHER";
    orderId?: string;
  }) => api.post("/support", data),

  getTickets: () => api.get("/support"),

  getTicket: (id: string) => api.get(`/support/${id}`),

  addMessage: (ticketId: string, message: string) =>
    api.post(`/support/${ticketId}/messages`, { message }),

  updateTicket: (id: string, data: { status?: string; priority?: string }) =>
    api.patch(`/support/${id}`, data),
};

export default api;
