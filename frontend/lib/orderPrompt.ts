import { productPricing } from "./productPricing";

type PromptListing = {
  orderCode?: string | null;
  runnerPrice?: number | null;
  markup?: number | null;
  repostPriceMode?: string | null;
  repostOrderDetailsEnabled?: boolean | null;
  repostFeePercentageEnabled?: boolean | null;
  runner?: {
    repostPriceMode?: string | null;
    repostOrderDetailsEnabled?: boolean | null;
    repostFeePercentageEnabled?: boolean | null;
  } | null;
  product?: {
    basePrice?: number | null;
    description?: string | null;
    whatsappImports?: Array<{ parsedDraft?: unknown }>;
  } | null;
};

type ComputedRepostPricing =
  | {
      kind: "STOCK_EACH";
      markup: number;
      feePercent: number;
      stockBase: number;
      eachBase: number;
      stockTotal: number;
      eachTotal: number;
    }
  | {
      kind: "BULK";
      markup: number;
      feePercent: number;
      quantity: number;
      unitBase: number;
      bulkTotal: number;
      bulkUnit: number;
      runnerUnit: number;
      runnerBulkTotal: number;
      runnerBulkUnit: number;
    }
  | {
      kind: "SINGLE";
      markup: number;
      feePercent: number;
      basePrice: number;
      totalPrice: number;
      runnerFee: number;
    };

function labeledPrice(text: string, labels: string[]) {
  const normalized = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ř🅡®]/g, "R");
  const labelPattern = labels.join("|");
  const match = normalized.match(
    new RegExp(
      `(?:${labelPattern})(?:\\s*\\/\\s*\\w+)?\\s*[:=-]?\\s*R\\.?\\s*(\\d+(?:[.,]\\d{1,2})?)`,
      "i",
    ),
  );
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function parsePromptMoneyToken(value: string) {
  const clean = String(value || "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!clean) return 0;
  if (clean.includes(".")) return Number(clean);

  const digits = clean.replace(/\D/g, "");
  if (digits.length >= 4) return Number(digits) / 100;
  return Number(digits);
}

function explicitBulkPrice(text: string) {
  const normalized = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ř🅡®]/g, "R");
  const match = normalized.match(
    /\b(\d{1,3})\s*(?:for|x|@)\s*(?:(?:R|ZAR|E|SZL)|\$)?\.?\s*(\d+(?:[.,]\d{1,2})?)/i,
  );
  return match
    ? { quantity: Number(match[1]), total: parsePromptMoneyToken(match[2]) }
    : null;
}

function money(value: number) {
  return `R${Number(value || 0).toFixed(2)}`;
}

function separatorBlock(lines: string[]) {
  return ["---------------------", ...lines, "---------------------"].join(
    "\n",
  );
}

function runnerFeeText(feePercent: number, showFeePercentage: boolean) {
  return showFeePercentage && feePercent > 0
    ? `(Including ${feePercent}% Runner Fee)`
    : "(Including Runner Fee)";
}

function computedRepostPricing(
  listing: PromptListing,
): ComputedRepostPricing | null {
  const product = listing?.product || null;
  const structured = productPricing(product);
  const sourceCaption = product?.description || "";
  const explicitBulk = explicitBulkPrice(sourceCaption);
  const stockBase = labeledPrice(sourceCaption, ["stock", "bulk"]);
  const eachBase = labeledPrice(sourceCaption, ["each", "retail"]);
  const unitBase = labeledPrice(sourceCaption, ["unit", "price"]) || eachBase;
  const markup = Math.max(0, Number(listing?.markup || 0));
  const multiplier = 1 + markup;
  const basePrice = Number(product?.basePrice || 0);
  const totalPrice = Number(listing?.runnerPrice || 0);
  const feePercent = Math.round(markup * 100);

  if (
    structured.stockIsBulkPrice &&
    structured.bulkUnitPrice &&
    structured.regularUnitPrice &&
    !structured.bulkQuantity
  ) {
    return {
      kind: "STOCK_EACH",
      markup,
      feePercent,
      stockBase: structured.bulkUnitPrice,
      eachBase: structured.regularUnitPrice,
      stockTotal: structured.bulkUnitPrice * multiplier,
      eachTotal: structured.regularUnitPrice * multiplier,
    };
  }

  if (
    structured.bulkQuantity &&
    structured.bulkTotal &&
    structured.bulkUnitPrice
  ) {
    const regularUnit = structured.regularUnitPrice || structured.bulkUnitPrice;
    return {
      kind: "BULK",
      markup,
      feePercent,
      quantity: structured.bulkQuantity,
      unitBase: regularUnit,
      bulkTotal: structured.bulkTotal,
      bulkUnit: structured.bulkUnitPrice,
      runnerUnit: regularUnit * multiplier,
      runnerBulkTotal: structured.bulkTotal * multiplier,
      runnerBulkUnit: structured.bulkUnitPrice * multiplier,
    };
  }

  if (stockBase > 0 && eachBase > 0) {
    return {
      kind: "STOCK_EACH",
      markup,
      feePercent,
      stockBase,
      eachBase,
      stockTotal: stockBase * multiplier,
      eachTotal: eachBase * multiplier,
    };
  }

  if (explicitBulk && explicitBulk.quantity > 0 && explicitBulk.total > 0) {
    const bulkUnit = explicitBulk.total / explicitBulk.quantity;
    const regularUnit = unitBase || basePrice || bulkUnit;
    return {
      kind: "BULK",
      markup,
      feePercent,
      quantity: explicitBulk.quantity,
      unitBase: regularUnit,
      bulkTotal: explicitBulk.total,
      bulkUnit,
      runnerUnit: regularUnit * multiplier,
      runnerBulkTotal: explicitBulk.total * multiplier,
      runnerBulkUnit: bulkUnit * multiplier,
    };
  }

  const singleBase =
    basePrice || (totalPrice > 0 ? totalPrice / multiplier : 0);
  const singleTotal = totalPrice || singleBase * multiplier;
  if (singleBase > 0 || singleTotal > 0) {
    return {
      kind: "SINGLE",
      markup,
      feePercent:
        singleBase > 0
          ? Math.round(((singleTotal - singleBase) / singleBase) * 100)
          : feePercent,
      basePrice: singleBase,
      totalPrice: singleTotal,
      runnerFee: Math.max(0, singleTotal - singleBase),
    };
  }

  return null;
}

function totalOnlyBlock(
  pricing: ComputedRepostPricing,
  showFeePercentage: boolean,
) {
  if (pricing.kind === "STOCK_EACH") {
    return separatorBlock([
      runnerFeeText(pricing.feePercent, showFeePercentage),
      `*STOCK ${money(pricing.stockTotal)}*`,
      `*EACH ${money(pricing.eachTotal)}*`,
    ]);
  }

  if (pricing.kind === "BULK") {
    return separatorBlock([
      runnerFeeText(pricing.feePercent, showFeePercentage),
      `*${pricing.quantity} FOR ${money(pricing.runnerBulkTotal)}*`,
      `*EACH ${money(pricing.runnerUnit)}*`,
      `(${money(pricing.runnerBulkUnit)} each when buying ${pricing.quantity})`,
    ]);
  }

  return separatorBlock([
    `*Runner Price: ${money(pricing.totalPrice)}*`,
    showFeePercentage && pricing.feePercent > 0
      ? `(Includes ${pricing.feePercent}% Runner Fee)`
      : "(Includes Runner Fee)",
  ]);
}

function feeBreakdownBlock(
  pricing: ComputedRepostPricing,
  showFeePercentage: boolean,
) {
  if (pricing.kind === "STOCK_EACH") {
    return separatorBlock([
      `Original STOCK: ${money(pricing.stockBase)}`,
      `Original EACH: ${money(pricing.eachBase)}`,
      showFeePercentage && pricing.feePercent > 0
        ? `Runner Fee: ${pricing.feePercent}%`
        : "Runner Fee included",
      `*Runner STOCK: ${money(pricing.stockTotal)}*`,
      `*Runner EACH: ${money(pricing.eachTotal)}*`,
    ]);
  }

  if (pricing.kind === "BULK") {
    return separatorBlock([
      `Original unit: ${money(pricing.unitBase)}`,
      `Original ${pricing.quantity} FOR: ${money(pricing.bulkTotal)} (${money(
        pricing.bulkUnit,
      )} each)`,
      showFeePercentage && pricing.feePercent > 0
        ? `Runner Fee: ${pricing.feePercent}%`
        : "Runner Fee included",
      `*Runner unit: ${money(pricing.runnerUnit)}*`,
      `*Runner ${pricing.quantity} FOR: ${money(
        pricing.runnerBulkTotal,
      )} (${money(pricing.runnerBulkUnit)} each)*`,
    ]);
  }

  return separatorBlock([
    `Unit Price: ${money(pricing.basePrice)}`,
    `Runner Fee: ${money(pricing.runnerFee)}${
      showFeePercentage ? ` (${pricing.feePercent}%)` : ""
    }`,
    `*Total Price: ${money(pricing.totalPrice)}*`,
  ]);
}

function stockEachTotalsBlock(
  pricing: ComputedRepostPricing,
  showFeePercentage: boolean,
) {
  if (pricing.kind === "STOCK_EACH") {
    return separatorBlock([
      runnerFeeText(pricing.feePercent, showFeePercentage),
      `*STOCK ${money(pricing.stockTotal)}*`,
      `*EACH ${money(pricing.eachTotal)}*`,
    ]);
  }

  if (pricing.kind === "BULK") {
    return separatorBlock([
      runnerFeeText(pricing.feePercent, showFeePercentage),
      `*${pricing.quantity} FOR ${money(pricing.runnerBulkTotal)}*`,
      `*EACH ${money(pricing.runnerUnit)}*`,
      `(${money(pricing.runnerBulkUnit)} each when buying ${pricing.quantity})`,
    ]);
  }

  return separatorBlock([
    `*Runner Price: ${money(pricing.totalPrice)}*`,
    runnerFeeText(pricing.feePercent, showFeePercentage),
  ]);
}

export function orderPromptFields(_listing: PromptListing) {
  void _listing;
  return [];
}

export function customerOrderTemplate(listing: PromptListing) {
  return orderPromptFields(listing).join("\n");
}

export function stripCustomerOrderPrompts(message: string) {
  return String(message || "")
    .split("\n")
    .filter((line) => {
      const clean = line.trim();

      return (
        !/^to order,\s*fill and send:?$/i.test(clean) &&
        !/^size\s*:/i.test(clean) &&
        !/^color\s*:/i.test(clean) &&
        !/^quantity\s*:/i.test(clean) &&
        !/^(?:base price|total price)\s*:/i.test(clean.replace(/\*/g, "")) &&
        !/^runner fee\s*:\s*R\s*\d/i.test(clean) &&
        !/^order code\s*:/i.test(clean) &&
        !/^order\s*:\s*https?:\/\/wa\.me\/\d+/i.test(clean) &&
        !/^[-_=─━]{10,}$/.test(clean) &&
        !/^order(?:\s+RC-[A-Z0-9-]+)?\s*:/i.test(clean) &&
        !/^forward your order with code\s*:/i.test(clean) &&
        !/^forward your order (?:to|here):\s*https?:\/\/wa\.me\/\d+/i.test(
          clean,
        )
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function runnerOrderLinkLine(
  listing: PromptListing,
  runnerWhatsAppLink: string,
) {
  const code = String(listing?.orderCode || "").trim();
  const linkWithCode =
    runnerWhatsAppLink && code
      ? `${runnerWhatsAppLink}?text=${encodeURIComponent(`Order code: ${code}`)}`
      : runnerWhatsAppLink;
  const priceMode = String(
    listing?.repostPriceMode || listing?.runner?.repostPriceMode || "ORIGINAL",
  ).toUpperCase();
  const showOrderDetails =
    listing?.repostOrderDetailsEnabled ??
    listing?.runner?.repostOrderDetailsEnabled ??
    true;
  const showFeePercentage =
    listing?.repostFeePercentageEnabled ??
    listing?.runner?.repostFeePercentageEnabled ??
    true;
  const sections: string[] = [];
  const pricing = computedRepostPricing(listing);

  if (pricing && priceMode === "STOCK_EACH_TOTALS") {
    sections.push(stockEachTotalsBlock(pricing, showFeePercentage));
  } else if (pricing && priceMode === "TOTAL_ONLY") {
    sections.push(totalOnlyBlock(pricing, showFeePercentage));
  } else if (pricing && priceMode === "FEE_BREAKDOWN") {
    sections.push(feeBreakdownBlock(pricing, showFeePercentage));
  }

  if (showOrderDetails) {
    sections.push(
      [
        priceMode === "ORIGINAL" ? "---------------------" : "",
        code ? `Order code: ${code}` : "",
        linkWithCode
          ? `Order: ${linkWithCode}`
          : "Order: Contact your runner on WhatsApp",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return sections.filter(Boolean).join("\n");
}
