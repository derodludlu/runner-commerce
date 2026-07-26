// frontend/app/products/page.tsx

import { productsApi } from "@/lib/api";
import ProductList from "@/components/products/ProductList";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { category?: string; shop?: string };
}) {
  // Fetch products from backend
  const params: Record<string, string> = { limit: "20", status: "ACTIVE" };
  if (searchParams.category) params.category = searchParams.category;
  if (searchParams.shop) params.shop = searchParams.shop;

  const response = await productsApi
    .getAll(params)
    .catch(() => ({ data: { data: [] } }));
  const products = response.data.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">All Products</h1>
          <p className="text-gray-600">{products.length} items available</p>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Categories</option>
            <option value="Electronics">Electronics</option>
            <option value="Fashion">Fashion</option>
            <option value="Home">Home & Garden</option>
          </select>
        </div>
      </div>

      {/* Product Grid */}
      {products.length > 0 ? (
        <ProductList products={products} />
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No products found</p>
          <p className="text-gray-400 text-sm mt-2">
            Try adjusting your filters
          </p>
        </div>
      )}
    </div>
  );
}
