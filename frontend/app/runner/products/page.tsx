// frontend/app/runner/products/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { runnerApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { isVideoMedia, parseProductMedia } from "@/lib/productMedia";
import { useAuth } from "@/context/AuthContext";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CheckSquare,
  Copy,
  MessageCircle,
  Plus,
  Search,
  Send,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  runnerOrderLinkLine,
  stripCustomerOrderPrompts,
} from "@/lib/orderPrompt";

export default function RunnerProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [markups, setMarkups] = useState<Record<string, number>>({});
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isPreparingPack, setIsPreparingPack] = useState(false);
  const [runnerProfile, setRunnerProfile] = useState<any>(null);
  const { user } = useAuth();
  const { isReady } = useRunnerGuard();

  useEffect(() => {
    if (!isReady) return;
    loadProducts();
    loadRunnerProfile();
  }, [isReady]);

  const loadProducts = async () => {
    try {
      const response = await runnerApi.getAvailableProducts();
      setProducts(response.data || []);
    } catch (error) {
      console.error("Failed to load products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const loadRunnerProfile = async () => {
    try {
      const response = await runnerApi.getProfile();
      setRunnerProfile(response.data || null);
    } catch (error) {
      console.error("Failed to load runner profile:", error);
    }
  };

  const productImages = (images: any): string[] => {
    return parseProductMedia(images);
  };

  const originalImportForProduct = (product: any) =>
    Array.isArray(product?.whatsappImports) ? product.whatsappImports[0] : null;

  const productMedia = (product: any): string[] => {
    const importMedia = parseProductMedia(
      originalImportForProduct(product)?.mediaUrls,
    );
    return importMedia.length > 0
      ? importMedia
      : productImages(product?.images);
  };

  const whatsappDigits = (phone?: string) =>
    String(phone || "").replace(/\D/g, "");

  const runnerWhatsAppLink = () => {
    const digits =
      whatsappDigits(process.env.NEXT_PUBLIC_WHATSAPP_ORDER_INTAKE_PHONE) ||
      whatsappDigits(
        runnerProfile?.phone || runnerProfile?.user?.phone || user?.phone,
      );
    return digits ? `https://wa.me/${digits}` : "";
  };

  const runnerOrderLine = (listing?: any) => {
    const link = runnerWhatsAppLink();
    return runnerOrderLinkLine(
      {
        ...listing,
        runner: {
          ...(listing?.runner || {}),
          publicCode: listing?.runner?.publicCode || runnerProfile?.publicCode,
        },
      },
      link,
    );
  };

  const withOrderInstructions = (
    listing: any,
    product: any,
    message: string,
  ) => {
    const listingWithProduct = {
      ...listing,
      product,
      repostPriceMode: runnerProfile?.repostPriceMode,
    };
    const text = stripCustomerOrderPrompts(message);
    const runnerLine = runnerOrderLine(listingWithProduct);

    return [text, runnerLine && !text.includes(runnerLine) ? runnerLine : ""]
      .filter(Boolean)
      .join("\n\n");
  };

  const generateRepostMessage = (listing: any, product: any) => {
    const originalCaption = String(
      originalImportForProduct(product)?.caption || "",
    ).trim();

    if (originalCaption) {
      return withOrderInstructions(listing, product, originalCaption);
    }

    const baseMessage = [
      `*${product.name}*`,
      "",
      `Price: ${formatCurrency(listing.runnerPrice)}`,
      product.description ? product.description : "",
    ]
      .filter(Boolean)
      .join("\n");

    return withOrderInstructions(listing, product, baseMessage);
  };

  const generateRepostPackMessage = (messages: string[]) =>
    [
      "*New items available*",
      "Prices include runner service. Reply with the item you want.",
      "",
      messages.join("\n\n━━━━━━━━━━━━\n\n"),
    ].join("\n");

  const createListing = async (product: any, markup: number) => {
    const response = await runnerApi.createListing(product.id, markup);
    return response.data;
  };

  const handleAddMarkup = async (productId: string) => {
    const markup = markups[productId] || 0.3; // Default 30%
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    try {
      await createListing(product, markup);
      toast.success("Product added to your listings!");
      // Remove from available products
      setProducts(products.filter((p) => p.id !== productId));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to add product");
    }
  };

  const handleCopyRepost = async (product: any, markup: number) => {
    try {
      const listing = await createListing(product, markup);
      const message = generateRepostMessage(listing, product);
      await navigator.clipboard.writeText(message);
      toast.success("WhatsApp repost message copied");
      setProducts(products.filter((item) => item.id !== product.id));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to prepare repost");
    }
  };

  const handleWhatsAppShare = async (product: any, markup: number) => {
    try {
      const listing = await createListing(product, markup);
      const message = generateRepostMessage(listing, product);
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
      );
      toast.success("Listing created for this repost");
      setProducts(products.filter((item) => item.id !== product.id));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to prepare repost");
    }
  };

  const shops = useMemo(
    () =>
      Array.from(
        new Map(
          products
            .filter((product) => product.shop?.id)
            .map((product) => [product.shop.id, product.shop]),
        ).values(),
      ),
    [products],
  );

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase()) ||
      p.shop?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesShop = !shopFilter || p.shop?.id === shopFilter;
    return matchesSearch && matchesShop;
  });

  const selectedProducts = filteredProducts.filter((product) =>
    selectedProductIds.includes(product.id),
  );

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  const selectVisibleProducts = () => {
    setSelectedProductIds((current) =>
      Array.from(
        new Set([...current, ...filteredProducts.map((product) => product.id)]),
      ),
    );
  };

  const clearSelection = () => setSelectedProductIds([]);

  const prepareRepostPack = async (openWhatsApp: boolean) => {
    if (selectedProducts.length === 0) {
      toast.error("Select products to repost first");
      return;
    }

    setIsPreparingPack(true);
    const createdProductIds: string[] = [];

    try {
      const messages: string[] = [];

      for (const product of selectedProducts) {
        const markup = markups[product.id] || 0.3;
        const listing = await createListing(product, markup);
        createdProductIds.push(product.id);
        messages.push(generateRepostMessage(listing, product));
      }

      const packMessage = generateRepostPackMessage(messages);
      await navigator.clipboard.writeText(packMessage);

      if (openWhatsApp && packMessage.length < 7000) {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(packMessage)}`,
          "_blank",
        );
        toast.success("Repost pack created and copied");
      } else if (openWhatsApp) {
        toast.success(
          "Repost pack copied. Paste it into WhatsApp in smaller batches.",
        );
      } else {
        toast.success("Repost pack copied");
      }

      setProducts((current) =>
        current.filter((product) => !createdProductIds.includes(product.id)),
      );
      setSelectedProductIds((current) =>
        current.filter((id) => !createdProductIds.includes(id)),
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to prepare repost pack",
      );
    } finally {
      setIsPreparingPack(false);
    }
  };

  if (!isReady) {
    return (
      <div className="text-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--text-secondary)" }}>Loading products...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Browse Products
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Add products to your listings and set your markup
          </p>
        </div>
        <Link href="/runner/dashboard">
          <Button variant="outline" themed>
            ← Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Repost controls */}
      <div
        className="rounded-xl p-4 space-y-4"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search products, category, or shop..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12"
              style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                borderColor: "var(--input-border)",
              }}
            />
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
              style={{ color: "var(--text-muted)" }}
            />
          </div>

          <select
            value={shopFilter}
            onChange={(event) => setShopFilter(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All joined shops</option>
            {shops.map((shop: any) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <Button variant="outline" themed onClick={selectVisibleProducts}>
              <CheckSquare className="w-4 h-4 mr-1" />
              Select visible
            </Button>
            <Button variant="outline" themed onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {selectedProducts.length} selected from {filteredProducts.length}{" "}
            visible products
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              themed
              disabled={isPreparingPack || selectedProducts.length === 0}
              isLoading={isPreparingPack}
              onClick={() => prepareRepostPack(false)}
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy repost pack
            </Button>
            <Button
              themed
              disabled={isPreparingPack || selectedProducts.length === 0}
              isLoading={isPreparingPack}
              onClick={() => prepareRepostPack(true)}
            >
              <Send className="w-4 h-4 mr-1" />
              Open WhatsApp pack
            </Button>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-secondary)" }}>
            {search
              ? "No products match your search"
              : "No more products available"}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-xl overflow-hidden relative"
              style={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleProductSelection(product.id)}
                className="absolute left-3 top-3 z-10 rounded-lg p-2 shadow-md"
                style={{
                  backgroundColor: "var(--surface-raised)",
                  color: selectedProductIds.includes(product.id)
                    ? "var(--accent)"
                    : "var(--text-muted)",
                  border: "1px solid var(--card-border)",
                }}
                title={
                  selectedProductIds.includes(product.id)
                    ? "Remove from repost pack"
                    : "Add to repost pack"
                }
              >
                {selectedProductIds.includes(product.id) ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>

              {/* Product Image */}
              <div className="relative h-48 bg-gray-200">
                {productMedia(product)[0] ? (
                  isVideoMedia(productMedia(product)[0]) ? (
                    <video
                      src={productMedia(product)[0]}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={productMedia(product)[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  )
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    📦
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-4 space-y-4">
                <div>
                  <h3
                    className="font-semibold text-lg"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {product.name}
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {product.shop?.name}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {formatCurrency(product.basePrice)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Base price
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Stock: {product.stockQty}
                    </p>
                  </div>
                </div>

                {/* Markup Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Your Markup
                    </label>
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {((markups[product.id] || 0.3) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={markups[product.id] || 0.3}
                    onChange={(e) =>
                      setMarkups({
                        ...markups,
                        [product.id]: parseFloat(e.target.value),
                      })
                    }
                    className="w-full"
                  />
                  <div
                    className="flex justify-between text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Price Preview */}
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Your Price:
                    </span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCurrency(
                        product.basePrice * (1 + (markups[product.id] || 0.3)),
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Your Profit:
                    </span>
                    <span className="text-sm font-bold text-green-500">
                      +
                      {formatCurrency(
                        product.basePrice * (markups[product.id] || 0.3),
                      )}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    themed
                    onClick={() => handleAddMarkup(product.id)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add to Listings
                  </Button>
                  <Button
                    variant="outline"
                    themed
                    onClick={() =>
                      handleCopyRepost(product, markups[product.id] || 0.3)
                    }
                    title="Copy WhatsApp repost"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    themed
                    onClick={() =>
                      handleWhatsAppShare(product, markups[product.id] || 0.3)
                    }
                  >
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
