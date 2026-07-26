"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/hooks/useRoleGuard";
import { shopsApi, adminApi, productsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  GitMerge,
  Package,
  Search,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import ShopWhatsAppAvatars, {
  ShopWhatsAppGroupAvatar,
} from "@/components/shops/ShopWhatsAppAvatars";

interface Shop {
  id: string;
  name: string;
  description: string | null;
  phone: string;
  address: string | null;
  status: string;
  procurementCity: string;
  owner: {
    name: string;
    email: string;
    phone: string;
  };
  _count?: {
    products: number;
    runnerAssignments?: number;
    whatsappImports?: number;
    whatsappGroupMappings?: number;
  };
  relatedWhatsAppGroups?: ShopWhatsAppGroupAvatar[];
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [topShops, setTopShops] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [duplicateShopId, setDuplicateShopId] = useState("");
  const [productDuplicates, setProductDuplicates] = useState<any[]>([]);
  const [scanningProducts, setScanningProducts] = useState(false);
  const [resolvingProductPair, setResolvingProductPair] = useState<
    string | null
  >(null);
  const [editingDuplicateProduct, setEditingDuplicateProduct] = useState<
    any | null
  >(null);
  const [duplicateEditForm, setDuplicateEditForm] = useState({
    name: "",
    basePrice: 0,
    stockQty: 0,
    category: "",
  });
  const { user, isReady } = useAdminGuard();

  useEffect(() => {
    if (!isReady || !user) return;
    loadData();
  }, [isReady]);

  const loadData = async () => {
    try {
      const [shopsRes, topRes] = await Promise.all([
        shopsApi.getAll({ limit: 500, sortBy: "name", order: "asc" }),
        adminApi.getTopShops(5),
      ]);
      setShops(shopsRes.data?.data || shopsRes.data || []);
      setTopShops(topRes.data || []);
    } catch {
      toast.error("Failed to load shops");
    } finally {
      setIsLoading(false);
    }
  };

  const handleHardDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Permanently delete shop "${name}"? This removes its products, listings, imports, mappings, and runner joins. This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const response = await shopsApi.adminHardDelete(id);
      toast.success(response.data?.message || `Shop "${name}" deleted`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete shop");
    }
  };

  const updateProcurementCity = async (shopId: string, city: string) => {
    try {
      await adminApi.updateShopProcurementCity(shopId, city);
      setShops((current) =>
        current.map((shop) =>
          shop.id === shopId ? { ...shop, procurementCity: city } : shop,
        ),
      );
      toast.success("Shop procurement city updated");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update city");
    }
  };

  const duplicateTargets = useMemo(() => {
    const targets = new Map<string, Shop>();
    for (const shop of shops) {
      const candidates = shops.filter(
        (candidate) =>
          candidate.id !== shop.id &&
          hasMatchingCreatorPhone(shop, candidate) &&
          areLikelySameShopName(shop.name, candidate.name),
      );

      if (candidates.length === 0) continue;

      const [target] = [shop, ...candidates].sort(
        (a, b) => shopMergeScore(b) - shopMergeScore(a),
      );
      if (target.id !== shop.id) {
        targets.set(shop.id, target);
      }
    }
    return targets;
  }, [shops]);

  const duplicateCount = duplicateTargets.size;

  const scanProductDuplicates = async () => {
    if (!duplicateShopId) return;
    setScanningProducts(true);
    try {
      const response =
        await productsApi.getDuplicateCandidates(duplicateShopId);
      setProductDuplicates(response.data?.data || []);
      toast.success(`Found ${response.data?.total || 0} candidate pairs`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Duplicate scan failed");
    } finally {
      setScanningProducts(false);
    }
  };

  const resolveProductDuplicate = async (
    pair: any,
    action: "merge" | "delete",
    keep: any,
    remove: any,
  ) => {
    const message =
      action === "merge"
        ? `Keep “${keep.name}” and merge “${remove.name}” into it?`
        : `Deactivate “${remove.name}”?`;
    if (!confirm(message)) return;
    setResolvingProductPair(pair.id);
    try {
      if (action === "merge") {
        await productsApi.mergeDuplicate(duplicateShopId, keep.id, remove.id);
      } else {
        await productsApi.delete(duplicateShopId, remove.id);
      }
      toast.success(
        action === "merge" ? "Products merged" : "Product deactivated",
      );
      await scanProductDuplicates();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Could not resolve candidate",
      );
    } finally {
      setResolvingProductPair(null);
    }
  };

  const keepProductsSeparate = async (pair: any) => {
    setResolvingProductPair(pair.id);
    try {
      await productsApi.keepDuplicateSeparate(
        duplicateShopId,
        pair.left.id,
        pair.right.id,
      );
      setProductDuplicates((current) =>
        current.filter((item) => item.id !== pair.id),
      );
      toast.success("Products marked as separate");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save review");
    } finally {
      setResolvingProductPair(null);
    }
  };

  const openDuplicateEditor = (product: any) => {
    setEditingDuplicateProduct(product);
    setDuplicateEditForm({
      name: product.name || "",
      basePrice: Number(product.basePrice || 0),
      stockQty: Number(product.stockQty || 0),
      category: product.category || "",
    });
  };

  const saveDuplicateProduct = async () => {
    if (!editingDuplicateProduct) return;
    try {
      await productsApi.update(
        duplicateShopId,
        editingDuplicateProduct.id,
        duplicateEditForm,
      );
      toast.success("Product updated");
      setEditingDuplicateProduct(null);
      await scanProductDuplicates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not update product");
    }
  };

  const handleMergeDuplicate = async (source: Shop, target: Shop) => {
    if (
      !confirm(
        `Merge duplicate shop "${source.name}" into "${target.name}"? Products, WhatsApp mappings, imports, listings, orders, and billing records will move to the target shop. The duplicate shop record will be removed.`,
      )
    ) {
      return;
    }

    setMergingId(source.id);
    try {
      const response = await shopsApi.mergeInto(
        source.id,
        target.id,
        "Admin duplicate cleanup from shop management UI",
      );
      toast.success(response.data?.message || "Duplicate shop merged");
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to merge shop");
    } finally {
      setMergingId(null);
    }
  };

  const filtered = shops.filter((s) => {
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.owner?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "SUSPENDED":
        return "bg-red-100 text-red-800";
      case "CLOSED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Store className="w-16 h-16 mx-auto text-gray-300 animate-pulse" />
          <p className="mt-4 text-gray-500">Loading shops...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
        <Store className="w-8 h-8" />
        Shop Management
      </h1>

      <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-sm font-semibold">
              Product duplicate review
            </label>
            <select
              value={duplicateShopId}
              onChange={(event) => {
                setDuplicateShopId(event.target.value);
                setProductDuplicates([]);
              }}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a shop</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={scanProductDuplicates}
            disabled={!duplicateShopId || scanningProducts}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {scanningProducts ? "Scanning…" : "Scan products"}
          </button>
        </div>

        {productDuplicates.length > 0 && (
          <div className="mt-4 space-y-3">
            {productDuplicates.map((pair) => (
              <div key={pair.id} className="rounded-lg border bg-white p-4">
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-1 font-semibold ${pair.captureGroupingWarning ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {pair.captureGroupingWarning
                      ? "Capture grouping warning"
                      : "Likely duplicate"}
                  </span>
                  <span className="py-1 text-gray-500">
                    {pair.reason.replaceAll("_", " ")} ·{" "}
                    {Math.round(pair.confidence * 100)}%
                  </span>
                  <button
                    disabled={resolvingProductPair === pair.id}
                    onClick={() => keepProductsSeparate(pair)}
                    className="ml-auto rounded border border-green-300 bg-green-50 px-2 py-1 font-semibold text-green-800 disabled:opacity-50"
                  >
                    Keep each
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[pair.left, pair.right].map(
                    (product: any, index: number) => {
                      const other = index === 0 ? pair.right : pair.left;
                      return (
                        <div key={product.id} className="rounded border p-3">
                          <div className="flex gap-3">
                            {product.images?.[0] ? (
                              <img
                                src={product.images[0]}
                                alt=""
                                className="h-16 w-16 rounded object-cover"
                              />
                            ) : (
                              <Package className="h-16 w-16 rounded bg-gray-100 p-4 text-gray-300" />
                            )}
                            <div>
                              <p className="font-semibold">{product.name}</p>
                              <p className="text-sm text-gray-500">
                                R{Number(product.basePrice).toFixed(2)} ·{" "}
                                {product._count.listings} listing(s)
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => openDuplicateEditor(product)}
                              className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700"
                            >
                              Edit
                            </button>
                            <button
                              disabled={resolvingProductPair === pair.id}
                              onClick={() =>
                                resolveProductDuplicate(
                                  pair,
                                  "delete",
                                  other,
                                  product,
                                )
                              }
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                            >
                              Delete
                            </button>
                            <button
                              disabled={resolvingProductPair === pair.id}
                              onClick={() =>
                                resolveProductDuplicate(
                                  pair,
                                  "merge",
                                  product,
                                  other,
                                )
                              }
                              className="rounded bg-primary px-2 py-1 text-xs text-white disabled:opacity-50"
                            >
                              Keep & merge other
                            </button>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingDuplicateProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">Edit matched product</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm">
                Name
                <input
                  value={duplicateEditForm.name}
                  onChange={(e) =>
                    setDuplicateEditForm((form) => ({
                      ...form,
                      name: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={duplicateEditForm.basePrice}
                  onChange={(e) =>
                    setDuplicateEditForm((form) => ({
                      ...form,
                      basePrice: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Stock
                <input
                  type="number"
                  min="0"
                  value={duplicateEditForm.stockQty}
                  onChange={(e) =>
                    setDuplicateEditForm((form) => ({
                      ...form,
                      stockQty: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              <label className="sm:col-span-2 text-sm">
                Category
                <input
                  value={duplicateEditForm.category}
                  onChange={(e) =>
                    setDuplicateEditForm((form) => ({
                      ...form,
                      category: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingDuplicateProduct(null)}
                className="rounded border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveDuplicateProduct}
                className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Shops */}
      {topShops.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Top Shops by Revenue
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            {topShops.map((shop, i) => (
              <div
                key={shop.id}
                className="text-center p-3 bg-gray-50 rounded-lg"
              >
                <div className="text-2xl font-bold text-gray-400">#{i + 1}</div>
                <div className="font-semibold text-sm mt-1">{shop.name}</div>
                <div className="text-xs text-gray-500">{shop.owner}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${statusColor(shop.status)}`}
                >
                  {shop.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search shops or owners..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CLOSED">Closed</option>
        </select>
        <span className="flex items-center text-sm text-gray-500">
          {filtered.length} shop{filtered.length !== 1 ? "s" : ""}
        </span>
        {duplicateCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {duplicateCount} possible duplicate
            {duplicateCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Shops List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-white py-12 text-center text-gray-500 shadow-md">
            No shops found.
          </div>
        ) : (
          filtered.map((shop) => {
            const duplicateTarget = duplicateTargets.get(shop.id);
            return (
              <div
                key={shop.id}
                className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <ShopWhatsAppAvatars
                      shopName={shop.name}
                      groups={shop.relatedWhatsAppGroups}
                      max={5}
                      variant="buttons"
                      showLabel
                      className="mb-3"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">
                        {shop.name}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${statusColor(shop.status)}`}
                      >
                        {shop.status}
                      </span>
                      {duplicateTarget && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                          <AlertTriangle className="h-3 w-3" />
                          Possible duplicate
                        </span>
                      )}
                    </div>

                    {shop.address && (
                      <div className="mt-1 text-xs text-gray-500">
                        {shop.address}
                      </div>
                    )}

                    <div className="mt-3 grid gap-3 text-sm text-gray-600 md:grid-cols-3">
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-400">
                          Owner
                        </div>
                        <div className="font-medium text-gray-800">
                          {shop.owner?.name || "Unknown"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {shop.owner?.email || "No email"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-400">
                          Contact
                        </div>
                        <div>{shop.phone}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-gray-400">
                          Records
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-4 w-4 text-gray-400" />
                            {shop._count?.products ?? 0} products
                          </span>
                          <span>
                            {shop._count?.whatsappGroupMappings ?? 0} groups
                          </span>
                          <span>
                            {shop._count?.whatsappImports ?? 0} imports
                          </span>
                        </div>
                      </div>
                    </div>

                    {duplicateTarget && (
                      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        This looks like a duplicate. Recommended target:{" "}
                        <strong>{duplicateTarget.name}</strong>.
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                    <select
                      value={shop.procurementCity || "DURBAN"}
                      onChange={(event) =>
                        updateProcurementCity(shop.id, event.target.value)
                      }
                      className="rounded-lg border px-3 py-2 text-sm font-semibold"
                      aria-label={`Procurement city for ${shop.name}`}
                    >
                      <option value="DURBAN">Durban</option>
                      <option value="JOHANNESBURG">Johannesburg</option>
                      <option value="MAPUTO">Maputo</option>
                    </select>
                    {duplicateTarget && (
                      <button
                        onClick={() =>
                          handleMergeDuplicate(shop, duplicateTarget)
                        }
                        disabled={mergingId === shop.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-200 disabled:opacity-50"
                        title={`Merge into ${duplicateTarget.name}`}
                      >
                        <GitMerge className="h-4 w-4" />
                        {mergingId === shop.id
                          ? "Removing..."
                          : "Remove duplicate"}
                      </button>
                    )}
                    <button
                      onClick={() => handleHardDelete(shop.id, shop.name)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
                      title="Delete permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function shopMergeScore(shop: Shop) {
  return (
    (shop._count?.whatsappGroupMappings || 0) * 10 +
    (shop._count?.whatsappImports || 0) * 3 +
    (shop._count?.products || 0) +
    (shop._count?.runnerAssignments || 0)
  );
}

function hasMatchingCreatorPhone(left: Shop, right: Shop) {
  const leftPhones = new Set([
    ...phoneCandidates(left.owner?.phone),
    ...phoneCandidates(left.phone),
  ]);
  return [
    ...phoneCandidates(right.owner?.phone),
    ...phoneCandidates(right.phone),
  ].some((phone) => leftPhones.has(phone));
}

function phoneCandidates(value?: string | null) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  const withoutPlus = normalized.replace(/^\+/, "");
  return [normalized, withoutPlus, `+${withoutPlus}`];
}

function normalizePhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (/@(?:lid|g\.us)\b/i.test(raw)) return "";

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("120363")) {
    return "";
  }
  return `+${digits}`;
}

function areLikelySameShopName(left: string, right: string) {
  const leftCanonical = canonicalShopName(left);
  const rightCanonical = canonicalShopName(right);
  if (!leftCanonical || !rightCanonical) return false;
  if (leftCanonical === rightCanonical) return true;

  const [shorter, longer] =
    leftCanonical.length <= rightCanonical.length
      ? [leftCanonical, rightCanonical]
      : [rightCanonical, leftCanonical];

  if (shorter.length < 8) return false;
  return longer.startsWith(`${shorter} `) || longer.startsWith(`${shorter}-`);
}

function canonicalShopName(value: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(?:shop|group)\b/g, " ")
    .replace(/\bg\s*\/\s*s\s*\d+\w*\b/g, " ")
    .replace(/\bg\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\bgrp\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\bgroup\s*[-#]?\s*\d+\w*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
