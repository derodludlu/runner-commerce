"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ImagePlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { getCartPricing, getItemPricing } from "@/lib/pricing";
import { customersApi } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { toast } from "sonner";

function mediaUrl(url: string) {
  return resolveMediaUrl(url);
}

export default function CartPage() {
  const {
    items,
    total,
    updateQuantity,
    removeItem,
    uploadReferenceImages,
    clearReferenceImages,
    clearCart,
    isLoading,
    cycleNotice,
  } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hasRunnerPreference, setHasRunnerPreference] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    if (user?.role !== "CUSTOMER") return;
    customersApi
      .getRunnerPreferences()
      .then((response) => {
        setHasRunnerPreference(
          (response.data || []).some((item: any) => item.status !== "INACTIVE"),
        );
      })
      .catch(() => setHasRunnerPreference(false));
  }, [user]);

  const handleCheckout = async () => {
    if (!user) {
      router.push("/login?redirect=/cart");
      return;
    }
    if (user.role === "CUSTOMER" && hasRunnerPreference === false) {
      toast.message(
        "You can continue. Checkout will ask you to confirm if the runner differs from your trusted runner setup.",
      );
    }
    setIsCheckingOut(true);
    try {
      router.push("/checkout");
    } catch (error) {
      setIsCheckingOut(false);
    }
  };

  const pricing = getCartPricing(items);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <ShoppingCart className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading your cart...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <ShoppingCart className="w-24 h-24 mx-auto text-gray-300" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            Your cart is empty
          </h1>
          <p className="mt-2 text-gray-500">
            Add some products to get started!
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm text-amber-700">
            {cycleNotice}
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Continue Shopping
            <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Shopping Cart</h1>
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {cycleNotice}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const listing = item.listing;
            const product = item.product || listing.product;

            if (!product || !listing) {
              return null;
            }

            const itemPricing = getItemPricing(product, listing, item.quantity);

            return (
              <div
                key={listing.id}
                className="bg-white rounded-lg shadow-md p-4 flex gap-4"
              >
                {/* Product Image */}
                <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                  {product.images &&
                  product.images.length > 0 &&
                  product.images[0] ? (
                    <img
                      src={mediaUrl(product.images[0])}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{product.name}</h3>
                  <p className="text-sm text-gray-500">
                    Sold by: {listing.runner?.user?.name || "Unknown"}
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <p className="text-primary font-bold text-xl">
                      {formatCurrency(listing.runnerPrice)}
                    </p>
                    {listing.markup > 0 && (
                      <p className="text-sm text-gray-500 line-through">
                        {formatCurrency(product.basePrice)}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    <p>
                      Runner fee {(listing.markup * 100).toFixed(0)}% included:{" "}
                      {formatCurrency(itemPricing.runnerFeeUnit)} per item
                    </p>
                    <p>No separate transport fee is added for this item.</p>
                  </div>
                  <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">
                        Customer reference image
                      </p>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
                          <ImagePlus className="h-4 w-4" />
                          Attach
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              const files = Array.from(
                                event.target.files || [],
                              );
                              if (files.length > 0) {
                                uploadReferenceImages(listing.id, files);
                                event.currentTarget.value = "";
                              }
                            }}
                          />
                        </label>
                        {(item.customerImageUrls || []).length > 0 && (
                          <button
                            type="button"
                            onClick={() => clearReferenceImages(listing.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    {(item.customerImageUrls || []).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.customerImageUrls || []).map((url) => (
                          <img
                            key={url}
                            src={mediaUrl(url)}
                            alt="Customer reference"
                            loading="lazy"
                            decoding="async"
                            className="h-20 w-20 rounded-md border border-gray-200 object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500">
                        Attach the screenshot/photo the customer wants the
                        runner to use when buying.
                      </p>
                    )}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => removeItem(listing.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateQuantity(listing.id, item.quantity - 1)
                      }
                      className="p-1 rounded-full hover:bg-gray-100"
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(listing.id, item.quantity + 1)
                      }
                      className="p-1 rounded-full hover:bg-gray-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="font-bold text-lg">
                    {formatCurrency(itemPricing.finalSubtotal)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
            <h2 className="text-xl font-bold mb-4">Order Summary</h2>

            <div className="space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Shop item prices</span>
                <span>{formatCurrency(pricing.shopSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Runner fees included</span>
                <span>{formatCurrency(pricing.runnerFeeTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Items subtotal</span>
                <span>{formatCurrency(pricing.itemsSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Transport fee</span>
                <span>No transport fee</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(pricing.total)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className="w-full mt-6 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingOut ? "Processing..." : "Proceed to Checkout"}
            </button>

            <button
              onClick={clearCart}
              className="w-full mt-3 text-red-500 py-2 hover:text-red-700 transition-colors"
            >
              Clear Cart
            </button>

            <Link
              href="/products"
              className="block mt-4 text-center text-primary hover:underline"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
