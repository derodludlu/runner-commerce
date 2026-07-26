import { Platform } from 'react-native';
import {
  AuthResponse,
  Product,
  QueueCaptureResponse,
  QueueRepostResponse,
  RunnerListing,
  RunnerProfile,
  RunnerShopLink,
} from './types';

export const defaultApiUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
export const phoneLanApiUrl = 'http://10.102.220.145:3001';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string | null,
  ) {}

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async login(identifier: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { identifier, password },
      includeAuth: false,
    });
  }

  async health() {
    return this.request<{ status: string; timestamp?: string }>('/health', {
      includeAuth: false,
    });
  }

  async getProfile() {
    return this.request<RunnerProfile | null>('/runner/profile');
  }

  async updateProfile(data: Partial<RunnerProfile> & { name?: string }) {
    return this.request<RunnerProfile>('/runner/profile', {
      method: 'PATCH',
      body: data,
    });
  }

  async getListings() {
    return this.request<RunnerListing[]>('/runner/listings');
  }

  async getAvailableProducts() {
    return this.request<Product[]>('/runner/products/available');
  }

  async createListing(productId: string, markup: number) {
    return this.request<RunnerListing>(`/runner/products/${productId}/listing`, {
      method: 'POST',
      body: { markup },
    });
  }

  async updateListingAutoPost(listingId: string, autoPostApproved: boolean) {
    return this.request<RunnerListing>(`/runner/listings/${listingId}/auto-post`, {
      method: 'PATCH',
      body: { autoPostApproved },
    });
  }

  async deleteListing(listingId: string) {
    return this.request<{ message?: string }>(`/runner/listings/${listingId}`, {
      method: 'DELETE',
    });
  }

  async queueRepost(data: {
    listingIds: string[];
    groupIdOrName: string;
    captionOverrides?: Record<string, string>;
    imageOverrides?: Record<string, string[]>;
  }) {
    return this.request<QueueRepostResponse>(
      '/runner/listings/repost-whatsapp-session',
      {
        method: 'POST',
        body: data,
      },
    );
  }

  async getMyShops(status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<RunnerShopLink[]>(`/runner-shops/my-shops${query}`);
  }

  async captureApprovedShops(shopIds?: string[]) {
    return this.request<QueueCaptureResponse>(
      '/runner-shops/capture-approved-shops',
      {
        method: 'POST',
        body: { shopIds },
      },
    );
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      includeAuth?: boolean;
    } = {},
  ): Promise<T> {
    const includeAuth = options.includeAuth !== false;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (includeAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new Error(
        `Network request failed for ${this.baseUrl}. Use http://10.0.2.2:3001 for an Android emulator, or your laptop Wi-Fi IP such as ${phoneLanApiUrl} for a real phone. Make sure the backend is running and Windows firewall allows port 3001.`,
      );
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        data?.message || `Request failed with HTTP ${response.status}`,
      );
    }

    return data as T;
  }
}

export const formatCurrency = (value?: number | string | null) => {
  const amount = Number(value || 0);
  return `R ${amount.toFixed(2)}`;
};

export const parseProductMedia = (media: unknown): string[] => {
  if (!media) return [];
  if (Array.isArray(media)) {
    return media.filter((item): item is string => typeof item === 'string');
  }

  if (typeof media !== 'string') return [];

  try {
    const parsed = JSON.parse(media);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return media ? [media] : [];
  }
};

export const originalCaptionForProduct = (product?: Product | null) =>
  String(product?.whatsappImports?.[0]?.caption || '').trim();

export const mediaForProduct = (product?: Product | null) => {
  const originalMedia = parseProductMedia(product?.whatsappImports?.[0]?.mediaUrls);
  return originalMedia.length > 0 ? originalMedia : parseProductMedia(product?.images);
};
