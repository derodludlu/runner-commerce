"use client";

import { formatCurrency } from "@/lib/currency";
import { productPricing } from "@/lib/productPricing";
import type { Product } from "@/lib/types";

export function ProductPricingSummary({
  product,
  compact = false,
  runnerMarkup,
}: {
  product?: Partial<Product> | null;
  compact?: boolean;
  runnerMarkup?: number | null;
}) {
  const pricing = productPricing(product);
  const markup = Math.max(0, Number(runnerMarkup || 0));
  const runnerBulkTotal = pricing.bulkTotal
    ? pricing.bulkTotal * (1 + markup)
    : 0;
  const runnerBulkUnitPrice = pricing.bulkUnitPrice
    ? pricing.bulkUnitPrice * (1 + markup)
    : 0;
  const stockUnitPrice = Number(pricing.bulkUnitPrice || 0);
  const eachUnitPrice = Number(pricing.regularUnitPrice || 0);
  const dualStockEach = Boolean(
    pricing.stockIsBulkPrice &&
      pricing.bulkUnitPrice &&
      pricing.regularUnitPrice &&
      !pricing.bulkQuantity,
  );
  if (!pricing.regularUnitPrice && !pricing.bulkTotal) return null;

  return (
    <div
      className={`grid gap-x-4 gap-y-1 border-t pt-2 text-xs ${
        compact ? "grid-cols-1" : "sm:grid-cols-2"
      }`}
      style={{ borderColor: "var(--card-border)" }}
    >
      {dualStockEach && (
        <div
          className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:col-span-2"
          style={{ borderColor: "var(--card-border)", backgroundColor: "var(--bg-secondary)" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Shop prices</p>
            <p style={{ color: "var(--text-secondary)" }}>STOCK <strong style={{ color: "var(--text-primary)" }}>{formatCurrency(stockUnitPrice)}</strong></p>
            <p style={{ color: "var(--text-secondary)" }}>EACH <strong style={{ color: "var(--text-primary)" }}>{formatCurrency(eachUnitPrice)}</strong></p>
          </div>
          {markup > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase" style={{ color: "var(--accent)" }}>Including {(markup * 100).toFixed(0)}% runner fee</p>
              <p style={{ color: "var(--accent)" }}>STOCK <strong>{formatCurrency(stockUnitPrice * (1 + markup))}</strong></p>
              <p style={{ color: "var(--accent)" }}>EACH <strong>{formatCurrency(eachUnitPrice * (1 + markup))}</strong></p>
            </div>
          )}
        </div>
      )}
      {!dualStockEach && pricing.regularUnitPrice && (
        <p style={{ color: "var(--text-secondary)" }}>
          {pricing.stockIsBulkPrice ? "Each/Retail price: " : "Unit price: "}
          <strong style={{ color: "var(--text-primary)" }}>
            {formatCurrency(pricing.regularUnitPrice)}
          </strong>
        </p>
      )}
      {!dualStockEach && pricing.stockIsBulkPrice &&
        pricing.bulkUnitPrice &&
        !pricing.bulkQuantity && (
          <p style={{ color: "var(--text-secondary)" }}>
            Stock/Bulk price:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {formatCurrency(pricing.bulkUnitPrice)} per item
            </strong>
          </p>
        )}
      {pricing.bulkQuantity && pricing.bulkTotal && (
        <p style={{ color: "var(--text-secondary)" }}>
          Bulk price:{" "}
          <strong style={{ color: "var(--text-primary)" }}>
            {pricing.bulkQuantity} for {formatCurrency(pricing.bulkTotal)}
          </strong>
          {pricing.bulkUnitPrice
            ? ` (${formatCurrency(pricing.bulkUnitPrice)} each)`
            : ""}
        </p>
      )}
      {pricing.bulkSavings > 0 && (
        <p className="font-semibold text-green-700 sm:col-span-2">
          Save {formatCurrency(pricing.bulkSavings)} per bulk purchase
          {pricing.bulkSavingsPerItem
            ? ` (${formatCurrency(pricing.bulkSavingsPerItem)} each, ${pricing.bulkSavingsPercent}% off)`
            : ""}
        </p>
      )}
      {pricing.stockIsBulkPrice &&
        !pricing.bulkQuantity &&
        pricing.bulkSavingsPerItem > 0 && (
          <p className="font-semibold text-green-700 sm:col-span-2">
            Save {formatCurrency(pricing.bulkSavingsPerItem)} per item at the
            stock/bulk price ({pricing.bulkSavingsPercent}% off)
          </p>
        )}
      {markup > 0 && !dualStockEach &&
        pricing.stockIsBulkPrice &&
        pricing.bulkUnitPrice &&
        pricing.regularUnitPrice &&
        !pricing.bulkQuantity && (
          <p
            className="font-semibold sm:col-span-2"
            style={{ color: "var(--accent)" }}
          >
            Stock/bulk with runner fee:{" "}
            {formatCurrency(pricing.bulkUnitPrice * (1 + markup))} per item
            <br />
            Each/retail with runner fee:{" "}
            {formatCurrency(pricing.regularUnitPrice * (1 + markup))} per item
            <br />
            Includes {(markup * 100).toFixed(0)}% runner fee
          </p>
        )}
      {markup > 0 && pricing.bulkQuantity && runnerBulkTotal > 0 && (
        <p
          className="font-semibold sm:col-span-2"
          style={{ color: "var(--accent)" }}
        >
          Bulk with runner fee: {pricing.bulkQuantity} for{" "}
          {formatCurrency(runnerBulkTotal)}
          {runnerBulkUnitPrice > 0
            ? ` (${formatCurrency(runnerBulkUnitPrice)} each)`
            : ""}{" "}
          - includes {(markup * 100).toFixed(0)}% runner fee
        </p>
      )}
    </div>
  );
}
