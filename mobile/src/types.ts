export type UserRole =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'RUNNER'
  | 'SHOP_OWNER'
  | 'WAREHOUSE'
  | 'SUPERUSER';

export type ProductMediaSource = string[] | string | null | undefined;

export interface User {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export interface Shop {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

export interface WhatsAppImportSummary {
  caption?: string;
  mediaUrls?: ProductMediaSource;
  receivedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  stockQty?: number;
  category?: string;
  images?: ProductMediaSource;
  shop?: Shop;
  whatsappImports?: WhatsAppImportSummary[];
}

export interface RunnerListing {
  id: string;
  productId: string;
  runnerPrice: number;
  markup: number;
  status: 'ACTIVE' | 'INACTIVE';
  autoPostApproved?: boolean;
  lastPostedAt?: string;
  postCount?: number;
  product?: Product;
}

export interface RunnerProfile {
  id: string;
  phone?: string;
  serviceArea?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  whatsappGroup?: string;
  autoPostEnabled?: boolean;
  status?: string;
  user?: User;
}

export interface RunnerShopLink {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
  shopId: string;
  shop?: Shop;
}

export interface QueueCaptureResponse {
  id?: string;
  status?: string;
  shopCount?: number;
  message?: string;
}

export interface QueueRepostResponse {
  id?: string;
  status?: string;
  listingCount?: number;
  groupIdOrName?: string;
  message?: string;
}
