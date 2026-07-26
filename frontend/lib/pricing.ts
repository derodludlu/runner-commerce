import type { CartItem, Product, RunnerListing } from "@/lib/types";

export const DEFAULT_RUNNER_FEE_RATE = 0.3;
export const DEFAULT_TRANSPORT_FEE_RATE = 0;

export function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function getItemPricing(
  product: Pick<Product, "basePrice">,
  listing: Pick<RunnerListing, "runnerPrice" | "markup">,
  quantity = 1,
) {
  const qty = Math.max(1, Number(quantity || 1));
  const shopUnitPrice = Number(product.basePrice || 0);
  const runnerUnitPrice = Number(listing.runnerPrice || shopUnitPrice);
  const runnerFeeUnit = Math.max(0, runnerUnitPrice - shopUnitPrice);
  const transportFeeUnit = 0;

  return {
    quantity: qty,
    shopUnitPrice: money(shopUnitPrice),
    runnerFeeRate: Number(listing.markup || 0),
    runnerFeeUnit: money(runnerFeeUnit),
    advertisedUnitPrice: money(runnerUnitPrice),
    transportFeeRate: DEFAULT_TRANSPORT_FEE_RATE,
    transportFeeUnit,
    finalUnitPrice: money(runnerUnitPrice),
    shopSubtotal: money(shopUnitPrice * qty),
    runnerFeeSubtotal: money(runnerFeeUnit * qty),
    advertisedSubtotal: money(runnerUnitPrice * qty),
    transportFeeSubtotal: money(transportFeeUnit * qty),
    finalSubtotal: money(runnerUnitPrice * qty),
  };
}

export function getCartPricing(items: CartItem[], discount = 0) {
  const rows = items
    .map((item) => ({
      item,
      product: item.product || item.listing?.product,
      listing: item.listing,
    }))
    .filter((row) => row.product && row.listing)
    .map((item) => ({
      item: item.item,
      pricing: getItemPricing(item.product, item.listing, item.item.quantity),
    }));

  const shopSubtotal = money(
    rows.reduce((sum, row) => sum + row.pricing.shopSubtotal, 0),
  );
  const runnerFeeTotal = money(
    rows.reduce((sum, row) => sum + row.pricing.runnerFeeSubtotal, 0),
  );
  const itemsSubtotal = money(
    rows.reduce((sum, row) => sum + row.pricing.advertisedSubtotal, 0),
  );
  const transportFee = money(
    rows.reduce((sum, row) => sum + row.pricing.transportFeeSubtotal, 0),
  );
  const total = money(itemsSubtotal + transportFee - Number(discount || 0));

  return {
    rows,
    shopSubtotal,
    runnerFeeTotal,
    itemsSubtotal,
    transportFee,
    discount: money(Number(discount || 0)),
    total,
  };
}
