"use client";

import { useEffect, useState } from "react";
import { wishlistApi, cartApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Heart, ShoppingCart, Trash2, Package } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { parseProductMedia } from "@/lib/productMedia";

interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    basePrice: number;
    images: string[] | null;
    category: string | null;
    shop: {
      id: string;
      name: string;
    };
    listings: Array<{
      id: string;
      runnerPrice: number;
      markup: number;
      runner: {
        user: {
          name: string;
        };
      };
    }>;
  };
}

export default function WishlistPage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const router = useRouter();

  const loadWishlist = async () => {
    if (!user) {
      router.push("/login?redirect=/wishlist");
      return;
    }
    try {
      const response = await wishlistApi.getWishlist();
      setWishlistItems(response.data.items || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load wishlist");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWishlist();
  }, [user]);

  const handleRemoveFromWishlist = async (productId: string) => {
    try {
      await wishlistApi.removeItem(productId);
      setWishlistItems((prev) =>
        prev.filter((item) => item.productId !== productId),
      );
      toast.success("Removed from wishlist");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to remove item");
    }
  };

  const handleMoveToCart = async (productId: string) => {
    try {
      await wishlistApi.moveToCart(productId);
      setWishlistItems((prev) =>
        prev.filter((item) => item.productId !== productId),
      );
      toast.success("Moved to cart");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to move to cart");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Heart className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading your wishlist...</p>
        </div>
      </div>
    );
  }

  if (wishlistItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Heart className="w-24 h-24 mx-auto text-gray-300" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            Your wishlist is empty
          </h1>
          <p className="mt-2 text-gray-500">
            Save products you love to view them here!
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
        <Heart className="w-8 h-8 text-primary" />
        My Wishlist
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {wishlistItems.map((item) => {
          const listing = item.product.listings[0];
          const productImage = parseProductMedia(item.product.images)[0];
          return (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Product Image */}
              <Link href={`/products/${item.productId}`}>
                <div className="w-full h-48 bg-gray-100 overflow-hidden">
                  {productImage ? (
                    <img
                      src={productImage}
                      alt={item.product.name}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Package className="w-12 h-12" />
                    </div>
                  )}
                </div>
              </Link>

              {/* Product Details */}
              <div className="p-4">
                <Link href={`/products/${item.productId}`}>
                  <h3 className="font-semibold text-lg line-clamp-2 hover:text-primary">
                    {item.product.name}
                  </h3>
                </Link>
                <p className="text-sm text-gray-500 mt-1">
                  {item.product.shop.name}
                </p>

                {listing && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <p className="text-primary font-bold text-xl">
                        {formatCurrency(listing.runnerPrice)}
                      </p>
                      {listing.markup > 0 && (
                        <p className="text-sm text-gray-500 line-through">
                          {formatCurrency(item.product.basePrice)}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Sold by {listing.runner.user.name}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleMoveToCart(item.productId)}
                    className="flex-1 bg-primary text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </button>
                  <button
                    onClick={() => handleRemoveFromWishlist(item.productId)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove from wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
