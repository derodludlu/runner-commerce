// frontend/components/cart/CartSummary.tsx

"use client";

import { CartItem } from "@/lib/types";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { getCartPricing } from "@/lib/pricing";

interface CartSummaryProps {
  items: CartItem[];
  total: number;
  showCheckout?: boolean;
}

export default function CartSummary({
  items,
  total,
  showCheckout = true,
}: CartSummaryProps) {
  const pricing = getCartPricing(items);

  return (
    <div
      className="rounded-xl p-6"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--card-border)",
      }}
    >
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Order Summary
      </h3>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span style={{ color: "var(--text-secondary)" }}>
            Shop item prices ({items.length} items)
          </span>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(pricing.shopSubtotal)}
          </span>
        </div>

        <div className="flex justify-between">
          <span style={{ color: "var(--text-secondary)" }}>
            Runner fees included
          </span>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(pricing.runnerFeeTotal)}
          </span>
        </div>

        <div className="flex justify-between">
          <span style={{ color: "var(--text-secondary)" }}>Items subtotal</span>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(pricing.itemsSubtotal)}
          </span>
        </div>

        <div className="flex justify-between">
          <span style={{ color: "var(--text-secondary)" }}>
            Transport fee
          </span>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            No transport fee
          </span>
        </div>

        <div
          className="border-t pt-3 flex justify-between text-base font-bold"
          style={{ borderColor: "var(--card-border)" }}
        >
          <span style={{ color: "var(--text-primary)" }}>Total</span>
          <span style={{ color: "var(--accent)" }}>
            {formatCurrency(pricing.total)}
          </span>
        </div>
      </div>

      {showCheckout && (
        <Link href="/checkout" className="block mt-6">
          <Button
            className="w-full"
            size="lg"
            themed
            disabled={items.length === 0}
          >
            Proceed to Checkout
          </Button>
        </Link>
      )}

      <p
        className="text-xs text-center mt-4"
        style={{ color: "var(--text-secondary)" }}
      >
        Runner fee is included in item prices and is non-refundable.
      </p>
    </div>
  );
}
