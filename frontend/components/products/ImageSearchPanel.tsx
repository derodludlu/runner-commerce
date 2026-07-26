"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Search, X } from "lucide-react";
import { toast } from "sonner";
import { productsApi } from "@/lib/api";
import ProductCard from "@/components/products/ProductCard";

type ImageSearchResult = {
  product: any;
  matchedImageUrl?: string;
  confidence: number;
  distance?: number | null;
  label: "Exact" | "Strong" | "Possible" | string;
  reason?: string;
  orderCode?: string | null;
  listingId?: string | null;
};

export default function ImageSearchPanel({
  shopId,
  title = "Search by Image",
  compact = false,
}: {
  shopId?: string;
  title?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lastFileName, setLastFileName] = useState("");

  const runSearch = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }

    setIsSearching(true);
    setLastFileName(file.name);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const response = await productsApi.imageSearch(file, {
        limit: compact ? 8 : 24,
        shopId,
      });
      setResults(response.data?.results || []);
      if ((response.data?.results || []).length === 0) {
        toast.message("No close product image matches found");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Image search failed");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResults([]);
    setLastFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section
      className="rounded-xl border p-4"
      style={{
        backgroundColor: "var(--card-bg)",
        borderColor: "var(--card-border)",
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2
            className="flex items-center gap-2 text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            <ImageIcon className="h-5 w-5" />
            {title}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Upload an original or order-code-stamped image to find its product and runner listing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void runSearch(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isSearching}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Search className="h-4 w-4" />
            {isSearching ? "Searching..." : "Choose Image"}
          </button>
          {(previewUrl || results.length > 0) && (
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold"
              style={{
                color: "var(--text-primary)",
                borderColor: "var(--card-border)",
              }}
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <img
            src={previewUrl}
            alt="Search reference"
            className="h-24 w-24 rounded-lg object-cover"
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {lastFileName}
            </p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {results.length} image match{results.length === 1 ? "" : "es"} found
            </p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((result) => (
            <div key={`${result.product.id}-${result.listingId || "product"}`} className="relative">
              <div className="absolute left-3 top-3 z-10 rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white">
                {result.label} {(result.confidence * 100).toFixed(0)}%
              </div>
              {result.orderCode && (
                <div className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-950 shadow">
                  {result.orderCode}
                </div>
              )}
              <ProductCard product={result.product} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
