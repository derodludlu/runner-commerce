// frontend/context/CartContext.tsx

"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { CartItem, CartState, RunnerListing, Product } from "@/lib/types";
import { useAuth } from "./AuthContext";
import { cartApi } from "@/lib/api";
import { useFeatureFlags } from "./FeatureFlagsContext";
import { toast } from "sonner";

interface CartContextType {
  items: CartItem[];
  total: number;
  addItem: (
    listing: RunnerListing,
    product: Product,
    quantity?: number,
  ) => Promise<void>;
  removeItem: (listingId: string) => Promise<void>;
  updateQuantity: (listingId: string, quantity: number) => Promise<void>;
  uploadReferenceImages: (listingId: string, files: File[]) => Promise<void>;
  clearReferenceImages: (listingId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  itemCount: number;
  refreshCart: () => Promise<void>;
  isLoading: boolean;
  cycleNotice: string;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function normalizeCartItems(items: CartItem[] = []) {
  return items.map((item) => ({
    ...item,
    product: item.product || item.listing?.product,
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cycleNotice, setCycleNotice] = useState(
    "Baskets reset automatically when a new shopping cycle starts. Current cycle length is 14 days.",
  );
  const { user } = useAuth();
  const { phase2Enabled } = useFeatureFlags();
  const cartEnabled = phase2Enabled && (!user || user.role === "CUSTOMER");

  // Load cart from backend or localStorage on mount
  useEffect(() => {
    const loadCart = async () => {
      if (!cartEnabled) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      if (user) {
        try {
          const response = await cartApi.getCart();
          setItems(normalizeCartItems(response.data.items || []));
          if (response.data.cycleNotice) {
            setCycleNotice(response.data.cycleNotice);
          }
        } catch (error: any) {
          console.error("Failed to load cart:", error);
          // Fallback to localStorage
          const saved = localStorage.getItem("cart");
          if (saved) {
            try {
              setItems(normalizeCartItems(JSON.parse(saved)));
            } catch (parseError) {
              console.error("Failed to parse saved cart:", parseError);
              setItems([]);
            }
          } else {
            setItems([]);
          }
        }
      } else {
        // Load from localStorage for guest users
        const saved = localStorage.getItem("cart");
        const cycleStartedAt = Number(
          localStorage.getItem("cart_cycle_started_at") || 0,
        );
        const cycleMs = 14 * 24 * 60 * 60 * 1000;
        if (cycleStartedAt && Date.now() - cycleStartedAt > cycleMs) {
          localStorage.removeItem("cart");
          localStorage.setItem("cart_cycle_started_at", String(Date.now()));
          toast.info(
            "Your basket was reset automatically for the new shopping cycle.",
          );
          setItems([]);
          setIsLoading(false);
          return;
        }
        if (saved) {
          try {
            setItems(normalizeCartItems(JSON.parse(saved)));
          } catch (parseError) {
            console.error("Failed to parse saved cart:", parseError);
            setItems([]);
          }
        } else {
          setItems([]);
        }
      }
      setIsLoading(false);
    };

    loadCart();
  }, [cartEnabled, user]);

  // Save cart to localStorage on change (for guest users)
  useEffect(() => {
    if (cartEnabled && !user) {
      localStorage.setItem("cart", JSON.stringify(items));
      if (items.length > 0 && !localStorage.getItem("cart_cycle_started_at")) {
        localStorage.setItem("cart_cycle_started_at", String(Date.now()));
      }
      if (items.length === 0) {
        localStorage.removeItem("cart_cycle_started_at");
      }
    }
  }, [cartEnabled, items, user]);

  const calculateTotal = (cartItems: CartItem[]): number => {
    return cartItems.reduce((sum, item) => {
      return sum + item.listing.runnerPrice * item.quantity;
    }, 0);
  };

  const refreshCart = useCallback(async () => {
    if (cartEnabled && user) {
      try {
        const response = await cartApi.getCart();
        setItems(normalizeCartItems(response.data.items || []));
        if (response.data.cycleNotice) {
          setCycleNotice(response.data.cycleNotice);
        }
      } catch (error) {
        console.error("Failed to refresh cart:", error);
      }
    }
  }, [cartEnabled, user]);

  const addItem = async (
    listing: RunnerListing,
    product: Product,
    quantity: number = 1,
  ) => {
    if (user) {
      try {
        const response = await cartApi.addItem(listing.id, quantity);
        setItems(normalizeCartItems(response.data.items || []));
        if (response.data.cycleNotice) {
          setCycleNotice(response.data.cycleNotice);
        }
        toast.success("Added to cart");
      } catch (error: any) {
        toast.error(error.response?.data?.message || "Failed to add to cart");
      }
    } else {
      // Guest cart - localStorage
      setItems((prev) => {
        const existing = prev.find((item) => item.listing.id === listing.id);
        if (existing) {
          return prev.map((item) =>
            item.listing.id === listing.id
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        }
        return [...prev, { listing, product, quantity }];
      });
      toast.success("Added to cart");
    }
  };

  const removeItem = async (listingId: string) => {
    if (user) {
      try {
        const response = await cartApi.removeItem(listingId);
        setItems(normalizeCartItems(response.data.items || []));
        toast.success("Item removed");
      } catch (error: any) {
        toast.error(error.response?.data?.message || "Failed to remove item");
      }
    } else {
      setItems((prev) => prev.filter((item) => item.listing.id !== listingId));
      toast.success("Item removed");
    }
  };

  const updateQuantity = async (listingId: string, quantity: number) => {
    if (user) {
      try {
        const response = await cartApi.updateItem(listingId, quantity);
        setItems(normalizeCartItems(response.data.items || []));
      } catch (error: any) {
        toast.error(
          error.response?.data?.message || "Failed to update quantity",
        );
      }
    } else {
      if (quantity <= 0) {
        setItems((prev) =>
          prev.filter((item) => item.listing.id !== listingId),
        );
      } else {
        setItems((prev) =>
          prev.map((item) =>
            item.listing.id === listingId ? { ...item, quantity } : item,
          ),
        );
      }
    }
  };

  const uploadReferenceImages = async (listingId: string, files: File[]) => {
    if (!user) {
      toast.error("Please log in to attach item images");
      return;
    }

    try {
      const response = await cartApi.uploadReferenceImages(listingId, files);
      setItems(normalizeCartItems(response.data.items || []));
      toast.success("Reference image attached");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to attach image");
    }
  };

  const clearReferenceImages = async (listingId: string) => {
    if (!user) {
      return;
    }

    try {
      const response = await cartApi.clearReferenceImages(listingId);
      setItems(normalizeCartItems(response.data.items || []));
      toast.success("Reference images removed");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to remove images");
    }
  };

  const clearCart = async () => {
    if (user) {
      try {
        await cartApi.clearCart();
        setItems([]);
        toast.success("Cart cleared");
      } catch (error: any) {
        toast.error(error.response?.data?.message || "Failed to clear cart");
      }
    } else {
      setItems([]);
      localStorage.removeItem("cart");
      localStorage.removeItem("cart_cycle_started_at");
      toast.success("Cart cleared");
    }
  };

  const total = calculateTotal(items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const value = {
    items,
    total,
    addItem,
    removeItem,
    updateQuantity,
    uploadReferenceImages,
    clearReferenceImages,
    clearCart,
    itemCount,
    refreshCart,
    isLoading,
    cycleNotice,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
