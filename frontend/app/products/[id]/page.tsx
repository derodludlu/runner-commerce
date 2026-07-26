// frontend/app/products/[id]/page.tsx

import { productsApi } from "@/lib/api";
import ProductDetailContent from "./ProductDetailContent";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch product details
  const product = await productsApi
    .getById(id)
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

  return <ProductDetailContent product={product} />;
}
