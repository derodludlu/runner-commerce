// frontend/components/products/ProductCard.tsx

"use client";

import Link from "next/link";
import { Product } from "@/lib/types";
import { useCart } from "@/context/CartContext";
import { Clock3, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";
import { ProductPricingSummary } from "@/components/products/ProductPricingSummary";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const listing = product.listings?.[0];

  const productMedia = parseProductMedia(product.images);
  const primaryMedia = productMedia[0];
  const lowestPrice = product.listings?.reduce(
    (min, l) => (l.runnerPrice < min ? l.runnerPrice : min),
    product.listings[0]?.runnerPrice || product.basePrice,
  );
  const capturedAt = product.whatsappImports?.[0]?.receivedAt || product.createdAt;
  const ageLabel = productAge(capturedAt);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listing) {
      toast.error("This product is not available for delivery");
      return;
    }
    addItem(listing, product, 1);
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <Link
      href={`/products/${product.id}`}
      className="group block rounded-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]"
      style={{
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Product Image */}
      <div
        className="relative h-48 overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {primaryMedia ? (
          isVideoMedia(primaryMedia) ? (
            <video
              src={primaryMedia}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={primaryMedia}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              decoding="async"
            />
          )
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <ShoppingBag className="w-12 h-12" />
          </div>
        )}

        {/* Stock Badge */}
        {product.stockQty > 0 ? (
          <span className="absolute top-2 left-2 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold shadow-lg">
            ✓ In Stock
          </span>
        ) : (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-3 py-1 rounded-full font-semibold shadow-lg">
            ✕ Out of Stock
          </span>
        )}

        {ageLabel && (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
            title={capturedAt ? `Captured ${new Date(capturedAt).toLocaleString()}` : undefined}
          >
            <Clock3 className="h-3.5 w-3.5" />
            {ageLabel}
          </span>
        )}

        {/* Quick Add Button */}
        <button
          onClick={handleAddToCart}
          className="absolute bottom-2 right-2 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
          style={{
            backgroundColor: "var(--bg-secondary)",
            color: "var(--accent)",
            border: "2px solid var(--accent)",
          }}
          aria-label="Add to cart"
        >
          <ShoppingBag className="w-5 h-5" />
        </button>
      </div>

      {/* Product Info */}
      <div className="p-4 space-y-2">
        {/* Shop Name */}
        {product.shop && (
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--text-secondary)" }}
          >
            {product.shop.name}
          </p>
        )}

        {/* Product Name */}
        <h3
          className="font-semibold line-clamp-2 group-hover:opacity-75 transition-colors text-lg"
          style={{ color: "var(--text-primary)" }}
        >
          {product.name}
        </h3>

        {/* Description */}
        <p
          className="text-sm line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {product.description}
        </p>

        <ProductPricingSummary
          product={product}
          compact
          runnerMarkup={listing?.markup}
        />

        {/* Price & Rating */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {lowestPrice && (
              <p
                className="text-xl font-bold"
                style={{ color: "var(--accent)" }}
              >
                {formatCurrency(lowestPrice)}
              </p>
            )}
            {product.basePrice && lowestPrice !== product.basePrice && (
              <p
                className="text-xs line-through"
                style={{ color: "var(--text-muted)" }}
              >
                {formatCurrency(product.basePrice)}
              </p>
            )}
            {listing && (
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Runner fee {(listing.markup * 100).toFixed(0)}% included; no
                separate transport fee
              </p>
            )}
          </div>

          {listing?.runner?.rating && (
            <div className="flex items-center" style={{ color: "#fbbf24" }}>
              <Star className="w-4 h-4 fill-current" />
              <span
                className="ml-1 font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {listing.runner.rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Delivery Info */}
        {listing?.runner && (
          <p
            className="text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            🚀 {listing.runner.vehicleType}
          </p>
        )}
      </div>
    </Link>
  );
}

function productAge(value?: string) {
  if (!value) return null;
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "New";
  if (hours < 24) return `${hours}h old`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d old`;
  const months = Math.floor(days / 30);
  return `${months}mo old`;
}
