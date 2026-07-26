import type { ProductPricingDraft } from "./types";

type PricingProduct = {
  basePrice?: number | null;
  whatsappImports?: Array<{ parsedDraft?: unknown }>;
};

const positiveMoney = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function productPricing(product?: PricingProduct | null) {
  const draft = product?.whatsappImports?.[0]?.parsedDraft as
    ProductPricingDraft | null | undefined;
  const stockPrice = positiveMoney(draft?.stockPrice);
  const eachPrice = positiveMoney(draft?.eachPrice);
  const stockIsBulkPrice =
    Boolean(draft?.stockIsBulkPrice) ||
    Boolean(stockPrice && eachPrice && stockPrice < eachPrice);
  const bulkQuantity = positiveMoney(draft?.bulkQuantity);
  const bulkTotal = positiveMoney(draft?.bulkTotal);
  const bulkUnitPrice =
    positiveMoney(draft?.bulkUnitPrice) ||
    (stockIsBulkPrice ? stockPrice : null) ||
    (bulkQuantity && bulkTotal ? bulkTotal / bulkQuantity : null);
  const regularUnitPrice =
    positiveMoney(draft?.regularUnitPrice) ||
    eachPrice ||
    (!bulkTotal ? positiveMoney(draft?.unitPrice) : null) ||
    (!bulkTotal ? positiveMoney(product?.basePrice) : null);
  const calculatedSavings =
    regularUnitPrice && bulkQuantity && bulkTotal
      ? Math.max(0, regularUnitPrice * bulkQuantity - bulkTotal)
      : 0;
  const bulkSavings = positiveMoney(draft?.bulkSavings) || calculatedSavings;
  const bulkSavingsPerItem =
    positiveMoney(draft?.bulkSavingsPerItem) ||
    (bulkSavings && bulkQuantity
      ? bulkSavings / bulkQuantity
      : stockIsBulkPrice && regularUnitPrice && bulkUnitPrice
        ? Math.max(0, regularUnitPrice - bulkUnitPrice)
        : 0);
  const regularBulkTotal =
    regularUnitPrice && bulkQuantity ? regularUnitPrice * bulkQuantity : 0;
  const bulkSavingsPercent =
    positiveMoney(draft?.bulkSavingsPercent) ||
    (bulkSavings && regularBulkTotal
      ? Math.round((bulkSavings / regularBulkTotal) * 100)
      : bulkSavingsPerItem && regularUnitPrice
        ? Math.round((bulkSavingsPerItem / regularUnitPrice) * 100)
        : 0);

  return {
    stockIsBulkPrice,
    regularUnitPrice,
    bulkUnitPrice,
    bulkQuantity,
    bulkTotal,
    bulkSavings,
    bulkSavingsPerItem,
    bulkSavingsPercent,
  };
}
