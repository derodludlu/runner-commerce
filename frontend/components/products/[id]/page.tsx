// frontend/app/products/[id]/page.tsx

import { productsApi } from "@/lib/api";
import ProductGallery from "@/components/products/ProductGallery";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Fetch product details
  const product = await productsApi
    .getById(params.id)
    .then((res) => res.data)
    .catch(() => null);

  if (!product) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
        <a href="/products" className="text-indigo-600 hover:underline">
          ← Back to products
        </a>
      </div>
    );
  }

  // Get best listing
  const listing = product.listings?.[0];
  const lowestPrice = product.listings?.reduce(
    (min: number, l: any) => (l.runnerPrice < min ? l.runnerPrice : min),
    product.listings[0]?.runnerPrice || product.basePrice,
  );

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Product Images */}
      <div>
        <ProductGallery
          images={product.images || []}
          productName={product.name}
        />
      </div>

      {/* Product Info */}
      <div className="space-y-6">
        {/* Shop */}
        {product.shop && (
          <p className="text-sm text-gray-500">
            Sold by <span className="font-medium">{product.shop.name}</span>
          </p>
        )}

        {/* Title */}
        <h1 className="text-3xl font-bold">{product.name}</h1>

        {/* Description */}
        <p className="text-gray-600 leading-relaxed">{product.description}</p>

        {/* Price */}
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-indigo-600">
            {formatCurrency(lowestPrice)}
          </span>
          {product.basePrice && lowestPrice !== product.basePrice && (
            <span className="text-lg text-gray-400 line-through">
              {formatCurrency(product.basePrice)}
            </span>
          )}
        </div>

        {/* Stock */}
        <div className="flex items-center gap-2">
          {product.stockQty > 0 ? (
            <>
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm text-gray-600">
                {product.stockQty} in stock
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-sm text-gray-600">Out of stock</span>
            </>
          )}
        </div>

        {/* Runner Info */}
        {listing?.runner && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium mb-1">Delivery by Runner</p>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>⭐ {listing.runner.rating.toFixed(1)} rating</span>
              <span>🚴 {listing.runner.vehicleType}</span>
            </div>
          </div>
        )}

        {/* Add to Cart Button */}
        <AddToCartButton
          product={product}
          listing={listing}
          disabled={!listing || product.stockQty === 0}
        />
      </div>
    </div>
  );
}

// Client component for cart interaction
function AddToCartButton({
  product,
  listing,
  disabled,
}: {
  product: any;
  listing?: any;
  disabled: boolean;
}) {
  const { addItem } = useCart();

  const handleClick = () => {
    if (listing) {
      addItem(listing, product, 1);
      toast.success(`${product.name} added to cart!`);
    }
  };

  return (
    <Button
      onClick={handleClick}
      className="w-full"
      size="lg"
      disabled={disabled}
    >
      {disabled
        ? "Out of Stock"
        : `Add to Cart - ${formatCurrency(listing?.runnerPrice)}`}
    </Button>
  );
}
