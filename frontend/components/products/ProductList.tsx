// frontend/components/products/ProductList.tsx

"use client";

import { Product } from "@/lib/types";
import ProductCard from "@/components/products/ProductCard";

interface ProductListProps {
  products: Product[];
  title?: string;
  emptyMessage?: string;
}

export default function ProductList({
  products,
  title = "Products",
  emptyMessage = "No products found",
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      {title && (
        <h2
          className="text-2xl font-bold mb-6"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
