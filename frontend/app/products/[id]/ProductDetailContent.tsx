// frontend/app/products/[id]/ProductDetailContent.tsx

"use client";

import { useState, useCallback } from "react";
import ProductGallery from "@/components/products/ProductGallery";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Star, Truck, Shield, ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ReviewForm, ReviewList, StarRating } from "@/components/reviews";
import { formatCurrency } from "@/lib/currency";
import { getItemPricing } from "@/lib/pricing";
import { ProductPricingSummary } from "@/components/products/ProductPricingSummary";

export default function ProductDetailContent({ product }: { product: any }) {
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [reviewKey, setReviewKey] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);

  const handleReviewSuccess = useCallback(() => {
    setShowReviewForm(false);
    setReviewKey((k) => k + 1); // Force ReviewList to refresh
  }, []);

  const activeListings =
    product.listings?.filter((l: any) => l.status === "ACTIVE") ?? [];
  const requestedListingId =
    searchParams.get("listing") || searchParams.get("listingId");
  const sharedListing = activeListings.find(
    (listing: any) => listing.id === requestedListingId,
  );

  // Use the shared runner listing when present, otherwise use the lowest price.
  const bestListing =
    sharedListing ||
    activeListings
      ?.filter((l: any) => l.status === "ACTIVE")
      .sort((a: any, b: any) => a.runnerPrice - b.runnerPrice)[0];

  const handleAddToCart = () => {
    if (!bestListing) {
      toast.error("This product is not available for delivery");
      return;
    }

    addItem(bestListing, product, quantity);
    toast.success(`${product.name} added to cart!`);
  };

  const images = product.images || [];
  const pricing = bestListing
    ? getItemPricing(product, bestListing, quantity)
    : null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back Button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center text-sm font-medium mb-6 hover:opacity-75"
        style={{ color: "var(--text-primary)" }}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Products
      </button>

      <div
        className="rounded-xl shadow-lg border p-6 md:p-8"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="grid md:grid-cols-2 gap-8">
          {/* Product Image */}
          <div>
            <ProductGallery images={images} productName={product.name} />
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Shop Info */}
            {product.shop && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield
                  className="w-4 h-4"
                  style={{ color: "var(--accent)" }}
                />
                <span style={{ color: "var(--text-secondary)" }}>
                  Sold by {product.shop.name}
                </span>
              </div>
            )}

            {/* Product Name */}
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {product.name}
            </h1>

            {/* Rating */}
            {bestListing?.runner?.rating && (
              <div className="flex items-center gap-2">
                <div className="flex items-center" style={{ color: "#fbbf24" }}>
                  <Star className="w-5 h-5 fill-current" />
                  <span
                    className="ml-1 font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {bestListing.runner.rating.toFixed(1)}
                  </span>
                </div>
                <span style={{ color: "var(--text-muted)" }}>•</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {bestListing.runner.user?.name}
                </span>
              </div>
            )}

            {/* Description */}
            <p
              className="leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {product.description || "No description available"}
            </p>

            <ProductPricingSummary
              product={product}
              runnerMarkup={bestListing?.markup}
            />

            {/* Price */}
            <div className="space-y-2">
              {bestListing ? (
                <>
                  <div
                    className="text-4xl font-bold"
                    style={{ color: "var(--accent)" }}
                  >
                    {formatCurrency(bestListing.runnerPrice)}
                  </div>
                  {product.basePrice &&
                    bestListing.runnerPrice !== product.basePrice && (
                      <div
                        className="text-lg line-through"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatCurrency(product.basePrice)}
                      </div>
                    )}
                  <div
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Advertised item price includes the runner fee.
                  </div>
                  {pricing && (
                    <div
                      className="mt-3 rounded-lg border p-3 text-sm"
                      style={{
                        borderColor: "var(--card-border)",
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <div className="flex justify-between">
                        <span>Shop price</span>
                        <span>{formatCurrency(pricing.shopUnitPrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Runner fee {(pricing.runnerFeeRate * 100).toFixed(0)}%
                        </span>
                        <span>{formatCurrency(pricing.runnerFeeUnit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transport fee</span>
                        <span>No transport fee</span>
                      </div>
                      <div
                        className="mt-2 flex justify-between border-t pt-2 font-bold"
                        style={{
                          borderColor: "var(--card-border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <span>Transparent total per item</span>
                        <span>{formatCurrency(pricing.finalUnitPrice)}</span>
                      </div>
                      <p className="mt-2 text-xs">
                        Runner fee is non-refundable.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="text-2xl font-bold"
                  style={{ color: "var(--text-muted)" }}
                >
                  Not available for delivery
                </div>
              )}
            </div>

            {/* Stock Status */}
            {product.stockQty > 0 ? (
              <div
                className="flex items-center gap-2"
                style={{ color: "#22c55e" }}
              >
                <Truck className="w-5 h-5" />
                <span className="font-medium">In Stock</span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  ({product.stockQty} available)
                </span>
              </div>
            ) : (
              <div
                className="flex items-center gap-2"
                style={{ color: "#ef4444" }}
              >
                <Shield className="w-5 h-5" />
                <span className="font-medium">Out of Stock</span>
              </div>
            )}

            {/* Quantity & Add to Cart */}
            {product.stockQty > 0 && bestListing && (
              <div
                className="space-y-4 pt-4"
                style={{ borderTop: "1px solid var(--card-border)" }}
              >
                <div className="flex items-center gap-4">
                  <label
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Quantity:
                  </label>
                  <div
                    className="flex items-center border rounded-lg"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 py-2 hover:opacity-75 transition-opacity"
                      style={{ color: "var(--text-primary)" }}
                    >
                      -
                    </button>
                    <span
                      className="px-4 py-2 border-x font-medium"
                      style={{
                        borderColor: "var(--card-border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {quantity}
                    </span>
                    <button
                      onClick={() =>
                        setQuantity(Math.min(product.stockQty, quantity + 1))
                      }
                      className="px-4 py-2 hover:opacity-75 transition-opacity"
                      style={{ color: "var(--text-primary)" }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleAddToCart}
                  className="w-full"
                  size="lg"
                  themed
                >
                  Add to Cart
                </Button>
              </div>
            )}

            {/* Delivery Info */}
            {bestListing?.runner && (
              <div
                className="rounded-lg p-4 space-y-2"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--card-border)",
                }}
              >
                <h3
                  className="font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Delivery Information
                </h3>
                <div
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <p>Delivered by {bestListing.runner.user?.name}</p>
                  <p>Vehicle: {bestListing.runner.vehicleType}</p>
                  <p>
                    Runner fee: {(bestListing.markup * 100).toFixed(0)}%; no
                    separate transport fee
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div
        className="mt-12 rounded-xl p-6"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Customer Reviews
          </h2>
          <Button
            variant="outline"
            themed
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = `/login?redirect=/products/${product.id}`;
                return;
              }
              setShowReviewForm(!showReviewForm);
            }}
          >
            {showReviewForm ? "Cancel" : "Write a Review"}
          </Button>
        </div>

        {showReviewForm && (
          <div
            className="mb-8 p-6 rounded-xl"
            style={{ backgroundColor: "var(--card-bg)" }}
          >
            <h3
              className="text-lg font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Write Your Review
            </h3>
            <ReviewForm
              productId={product.id}
              onSuccess={handleReviewSuccess}
            />
          </div>
        )}

        {!showReviewForm && !isAuthenticated && (
          <div
            className="mb-6 p-4 rounded-lg text-center"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--card-border)",
            }}
          >
            <p className="mb-3" style={{ color: "var(--text-secondary)" }}>
              🔒 Login to write a review for this product
            </p>
            <Button
              themed
              onClick={() =>
                (window.location.href = `/login?redirect=/products/${product.id}`)
              }
            >
              Sign In to Review
            </Button>
          </div>
        )}

        <ReviewList key={reviewKey} productId={product.id} />
      </div>
    </div>
  );
}
