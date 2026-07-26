// frontend/app/products/page.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProductList from "@/components/products/ProductList";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { Filter, Grid, List } from "lucide-react";
import { productsApi, shopsApi } from "@/lib/api";

const PRODUCT_PAGE_SIZE = 24;
type ProductsViewCache = {
  products: any[];
  categories: string[];
  total: number;
  hasMore: boolean;
  scrollY: number;
};
const productsViewCache = new Map<string, ProductsViewCache>();
const ImageSearchPanel = dynamic(
  () => import("@/components/products/ImageSearchPanel"),
  {
    loading: () => (
      <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
    ),
  },
);

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const shopId = searchParams.get("shopId") || searchParams.get("shop");
  const cacheKey = searchParams.toString() || "all-products";
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [productTotal, setProductTotal] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);

  const selectedShop = shops.find((shop) => shop.id === shopId);

  const fetchProducts = useCallback(
    async (offset = 0, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const productParams: {
          limit: number;
          offset: number;
          status: string;
          category?: string;
          search?: string;
          shopId?: string;
        } = {
          limit: PRODUCT_PAGE_SIZE,
          offset,
          status: "ACTIVE",
        };
        if (category) productParams.category = category;
        if (q) productParams.search = q;
        if (shopId) productParams.shopId = shopId;

        const response = await productsApi.getAll(productParams);
        const data = response?.data?.data || [];
        const meta = response?.data?.meta;
        setProducts((current) => (append ? [...current, ...data] : data));
        setProductTotal(meta?.total ?? data.length);
        setHasMoreProducts(Boolean(meta?.hasNext));

        const nextCategories = data
          .map((product: any) => product.category)
          .filter(Boolean);
        setCategories((current) =>
          append
            ? [...new Set([...current, ...nextCategories])]
            : [...new Set(nextCategories)],
        );
      } catch (error: any) {
        console.error("Failed to fetch products:", error?.message || error);
        if (!append) setProducts([]);
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [category, q, shopId],
  );

  useEffect(() => {
    const cached = productsViewCache.get(cacheKey);
    if (cached) {
      setProducts(cached.products);
      setCategories(cached.categories);
      setProductTotal(cached.total);
      setHasMoreProducts(cached.hasMore);
      setLoading(false);
      window.requestAnimationFrame(() => window.scrollTo(0, cached.scrollY));
      return;
    }
    fetchProducts();
  }, [cacheKey, fetchProducts]);

  useEffect(() => {
    if (loading) return;
    const previous = productsViewCache.get(cacheKey);
    productsViewCache.set(cacheKey, {
      products,
      categories,
      total: productTotal,
      hasMore: hasMoreProducts,
      scrollY: previous?.scrollY || 0,
    });
  }, [cacheKey, categories, hasMoreProducts, loading, productTotal, products]);

  useEffect(() => {
    return () => {
      const cached = productsViewCache.get(cacheKey);
      if (cached) cached.scrollY = window.scrollY;
    };
  }, [cacheKey]);

  useEffect(() => {
    let active = true;
    shopsApi
      .getAll({
        limit: 100,
        status: "ACTIVE",
        sortBy: "name",
        order: "asc",
      })
      .then((response) => {
        if (active) {
          setShops(response?.data?.data || response?.data || []);
        }
      })
      .catch((error) =>
        console.error("Failed to fetch shops:", error?.message || error),
      );
    return () => {
      active = false;
    };
  }, []);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("category", e.target.value);
    } else {
      params.delete("category");
    }
    router.push(`/products?${params.toString()}`);
  };

  const handleShopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("shop");
    if (e.target.value) {
      params.set("shopId", e.target.value);
    } else {
      params.delete("shopId");
    }
    router.push(`/products?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchQuery = formData.get("q") as string;
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }
    router.push(`/products?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-gray-200 rounded animate-pulse w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="h-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {selectedShop ? selectedShop.name : "All Products"}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {productTotal} {productTotal === 1 ? "item" : "items"}
          {selectedShop ? " from this shop" : " available"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Grid className="w-4 h-4 mr-1" />
            Grid
          </Button>
          <Button variant="outline" size="sm">
            <List className="w-4 h-4 mr-1" />
            List
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex items-center gap-2 font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* Shop Filter */}
          <select
            className="text-sm border rounded-lg px-3 py-2"
            value={shopId || ""}
            onChange={handleShopChange}
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              borderColor: "var(--card-border)",
            }}
          >
            <option value="">All Shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            className="text-sm border rounded-lg px-3 py-2"
            value={category || ""}
            onChange={handleCategoryChange}
            style={{
              backgroundColor: "var(--bg-primary)",
              color: "var(--text-primary)",
              borderColor: "var(--card-border)",
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <input
              type="search"
              name="q"
              placeholder="Search product, shop, caption, or RC order code..."
              defaultValue={q || ""}
              className="w-full text-sm border rounded-lg px-3 py-2"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                borderColor: "var(--card-border)",
              }}
            />
          </form>

          {/* Clear Filters */}
          {(category || q || shopId) && (
            <a
              href="/products"
              className="text-sm hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Clear all
            </a>
          )}
        </div>
      </div>

      {/* Product Grid */}
      <ImageSearchPanel shopId={shopId || undefined} />

      {products.length > 0 ? (
        <>
          <ProductList products={products} />
          {hasMoreProducts && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                themed
                disabled={loadingMore}
                isLoading={loadingMore}
                onClick={() => fetchProducts(products.length, true)}
              >
                Load more products
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
            No products found
          </p>
          <a
            href="/products"
            className="hover:underline mt-2 inline-block"
            style={{ color: "var(--accent)" }}
          >
            Reset filters
          </a>
        </div>
      )}
    </div>
  );
}
