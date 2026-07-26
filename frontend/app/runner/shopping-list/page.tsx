"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  Store,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useRunnerGuard } from "@/hooks/useRoleGuard";
import { runnerApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function mediaUrl(url?: string | null) {
  if (!url) return "";
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url;
}

type ShoppingCustomer = {
  orderId: string;
  orderItemId: string;
  itemStatus: string;
  customerName: string;
  customerPhone?: string | null;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  customerNote?: string | null;
  customerImageUrls?: string[];
  customerPaymentStatus?: string;
  createdAt: string;
};

type ShoppingLine = {
  key: string;
  productId: string;
  productName: string;
  category?: string | null;
  selectedSize?: string | null;
  selectedColor?: string | null;
  quantity: number;
  shopUnitPrice: number;
  runnerUnitPrice: number;
  shopCost: number;
  runnerValue: number;
  statusCounts: Record<string, number>;
  productImages: string[];
  customerImages: string[];
  itemIds: string[];
  customers: ShoppingCustomer[];
};

type ShopGroup = {
  shop: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
  };
  itemCount: number;
  totalQuantity: number;
  totalShopCost: number;
  totalRunnerValue: number;
  lines: ShoppingLine[];
};

type ShoppingListResponse = {
  generatedAt: string;
  summary: {
    shopCount: number;
    itemCount: number;
    totalQuantity: number;
    totalShopCost: number;
    totalRunnerValue: number;
    expectedRunnerFee: number;
  };
  data: ShopGroup[];
};

export default function RunnerShoppingListPage() {
  const { isReady } = useRunnerGuard();
  const [shoppingList, setShoppingList] = useState<ShoppingListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadShoppingList = async () => {
    setLoading(true);
    try {
      const response = await runnerApi.getShoppingList();
      setShoppingList(response.data);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to load shopping list",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isReady) {
      loadShoppingList();
    }
  }, [isReady]);

  const hasItems = Boolean(shoppingList?.data?.length);

  const updateLineStatus = async (line: ShoppingLine, status: string) => {
    setBusyKey(line.key);
    try {
      await runnerApi.updateShoppingListItemsStatus(line.itemIds, status);
      toast.success(`Marked ${status.toLowerCase().replace("_", " ")}`);
      await loadShoppingList();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update item");
    } finally {
      setBusyKey(null);
    }
  };

  const updateShopStatus = async (shopGroup: ShopGroup, status: string) => {
    const itemIds = shopGroup.lines.flatMap((line) => line.itemIds);
    setBusyKey(`shop:${shopGroup.shop.id}`);
    try {
      await runnerApi.updateShoppingListItemsStatus(itemIds, status);
      toast.success(`Updated ${shopGroup.shop.name}: ${status.toLowerCase()}`);
      await loadShoppingList();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update shop");
    } finally {
      setBusyKey(null);
    }
  };

  const generatedAt = useMemo(() => {
    if (!shoppingList?.generatedAt) return "";
    return new Date(shoppingList.generatedAt).toLocaleString();
  }, [shoppingList?.generatedAt]);

  if (!isReady || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Shop-by-Shop Shopping List
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Buy grouped items per supplier, then tick them off as bought.
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            WhatsApp commands: BUY LIST, SHOP 1, SHOP 1 BOUGHT, PACK LIST, PACK
            1.
          </p>
          {generatedAt && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Updated {generatedAt}
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={loadShoppingList}
          variant="outline"
          themed
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryTile
          label="Shops"
          value={shoppingList?.summary.shopCount || 0}
        />
        <SummaryTile
          label="Buy lines"
          value={shoppingList?.summary.itemCount || 0}
        />
        <SummaryTile
          label="Total qty"
          value={shoppingList?.summary.totalQuantity || 0}
        />
        <SummaryTile
          label="Shop cost"
          value={formatCurrency(shoppingList?.summary.totalShopCost || 0)}
        />
        <SummaryTile
          label="Runner fee"
          value={formatCurrency(shoppingList?.summary.expectedRunnerFee || 0)}
        />
      </div>

      {!hasItems ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
            color: "var(--text-secondary)",
          }}
        >
          No active shopping items yet.
        </div>
      ) : (
        <div className="space-y-5">
          {shoppingList?.data.map((shopGroup, shopIndex) => (
            <section
              key={shopGroup.shop.id}
              className="rounded-lg border"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: "var(--card-border)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    {shopIndex + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Store
                        className="h-4 w-4"
                        style={{ color: "var(--accent)" }}
                      />
                      <h2
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {shopGroup.shop.name}
                      </h2>
                    </div>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {shopGroup.totalQuantity} item(s) ·{" "}
                      {formatCurrency(shopGroup.totalShopCost)} shop cost
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {(shopGroup.shop.phone || shopGroup.shop.address) && (
                    <p
                      className="max-w-lg text-right text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {[shopGroup.shop.phone, shopGroup.shop.address]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    themed
                    disabled={busyKey === `shop:${shopGroup.shop.id}`}
                    onClick={() => updateShopStatus(shopGroup, "BOUGHT")}
                  >
                    <CheckSquare className="mr-1 h-4 w-4" />
                    All bought
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    themed
                    disabled={busyKey === `shop:${shopGroup.shop.id}`}
                    onClick={() => updateShopStatus(shopGroup, "UNAVAILABLE")}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    All unavailable
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    themed
                    disabled={busyKey === `shop:${shopGroup.shop.id}`}
                    onClick={() => updateShopStatus(shopGroup, "REQUESTED")}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Reset shop
                  </Button>
                </div>
              </div>

              <div
                className="divide-y"
                style={{ borderColor: "var(--card-border)" }}
              >
                {shopGroup.lines.map((line) => {
                  const image =
                    line.customerImages[0] || line.productImages[0] || null;
                  const boughtCount = line.statusCounts.BOUGHT || 0;
                  const allBought = boughtCount >= line.itemIds.length;
                  const busy = busyKey === line.key;

                  return (
                    <div
                      key={line.key}
                      className="grid gap-4 p-4 lg:grid-cols-[96px_1fr_auto]"
                    >
                      <div
                        className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border"
                        style={{
                          borderColor: "var(--card-border)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        {image ? (
                          <img
                            src={mediaUrl(image)}
                            alt={line.productName}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <ImageIcon
                            className="h-6 w-6"
                            style={{ color: "var(--text-muted)" }}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {line.productName}
                          </h3>
                          {allBought && (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                              Bought
                            </span>
                          )}
                          {(line.statusCounts.UNAVAILABLE || 0) > 0 && (
                            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                              Unavailable
                            </span>
                          )}
                        </div>

                        <div
                          className="mt-2 flex flex-wrap gap-2 text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span>Qty {line.quantity}</span>
                          {line.selectedSize && (
                            <span>Size {line.selectedSize}</span>
                          )}
                          {line.selectedColor && (
                            <span>Color {line.selectedColor}</span>
                          )}
                          <span>
                            Shop unit {formatCurrency(line.shopUnitPrice)}
                          </span>
                          <span>Total {formatCurrency(line.shopCost)}</span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {line.customers.map((customer) => (
                            <div
                              key={customer.orderItemId}
                              className="rounded-md px-3 py-2 text-xs"
                              style={{
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span>
                                  {customer.customerName}
                                  {customer.customerPhone
                                    ? ` · ${customer.customerPhone}`
                                    : ""}
                                </span>
                                <span>
                                  Qty {customer.quantity} ·{" "}
                                  {customer.customerPaymentStatus || "UNPAID"}
                                </span>
                              </div>
                              {customer.customerImageUrls?.[0] && (
                                <a
                                  href={mediaUrl(customer.customerImageUrls[0])}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block underline"
                                  style={{ color: "var(--accent)" }}
                                >
                                  Customer image
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 lg:items-end">
                        <Button
                          type="button"
                          size="sm"
                          themed
                          disabled={busy || allBought}
                          onClick={() => updateLineStatus(line, "BOUGHT")}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Bought
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busy}
                          onClick={() => updateLineStatus(line, "UNAVAILABLE")}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Unavailable
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          themed
                          disabled={busy}
                          onClick={() => updateLineStatus(line, "REQUESTED")}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Reset
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--card-bg)",
        borderColor: "var(--card-border)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-lg font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}
