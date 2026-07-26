/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function transpileTypescript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { runnerOrderLinkLine } = require(
  path.join(__dirname, "..", "lib", "orderPrompt.ts"),
);

function listing(overrides = {}) {
  return {
    orderCode: "RC-TEST",
    markup: 0.3,
    runnerPrice: 130,
    repostOrderDetailsEnabled: true,
    repostFeePercentageEnabled: true,
    product: {
      basePrice: 100,
      description: "Plain item R100",
    },
    ...overrides,
  };
}

test("formats a single final runner price", () => {
  const message = runnerOrderLinkLine(
    listing({ repostPriceMode: "TOTAL_ONLY" }),
    "https://wa.me/26876000000",
  );

  assert.match(message, /\*Runner Price: R130\.00\*/);
  assert.match(message, /Includes 30% Runner Fee/);
  assert.match(message, /Order code: RC-TEST/);
});

test("formats stock and each prices in every non-original mode", () => {
  const stockEachListing = listing({
    repostPriceMode: "TOTAL_ONLY",
    product: {
      basePrice: 95,
      description: "STOCK R95\nEACH R100",
      whatsappImports: [
        {
          parsedDraft: {
            stockPrice: 95,
            eachPrice: 100,
            stockIsBulkPrice: true,
          },
        },
      ],
    },
  });

  const total = runnerOrderLinkLine(stockEachListing, "");
  assert.match(total, /\*STOCK R123\.50\*/);
  assert.match(total, /\*EACH R130\.00\*/);

  const breakdown = runnerOrderLinkLine(
    { ...stockEachListing, repostPriceMode: "FEE_BREAKDOWN" },
    "",
  );
  assert.match(breakdown, /Original STOCK: R95\.00/);
  assert.match(breakdown, /\*Runner STOCK: R123\.50\*/);
  assert.match(breakdown, /\*Runner EACH: R130\.00\*/);

  const salesForward = runnerOrderLinkLine(
    { ...stockEachListing, repostPriceMode: "STOCK_EACH_TOTALS" },
    "",
  );
  assert.match(salesForward, /\*STOCK R123\.50\*/);
  assert.match(salesForward, /\*EACH R130\.00\*/);
});

test("formats structured bulk specials with runner totals and each equivalents", () => {
  const bulkListing = listing({
    repostPriceMode: "TOTAL_ONLY",
    product: {
      basePrice: 60,
      description: "3 for R150\nEACH R60",
      whatsappImports: [
        {
          parsedDraft: {
            bulkQuantity: 3,
            bulkTotal: 150,
            bulkUnitPrice: 50,
            regularUnitPrice: 60,
          },
        },
      ],
    },
  });

  const total = runnerOrderLinkLine(bulkListing, "");
  assert.match(total, /\*3 FOR R195\.00\*/);
  assert.match(total, /\*EACH R78\.00\*/);
  assert.match(total, /R65\.00 each when buying 3/);

  const breakdown = runnerOrderLinkLine(
    { ...bulkListing, repostPriceMode: "FEE_BREAKDOWN" },
    "",
  );
  assert.match(breakdown, /Original unit: R60\.00/);
  assert.match(breakdown, /Original 3 FOR: R150\.00 \(R50\.00 each\)/);
  assert.match(breakdown, /\*Runner 3 FOR: R195\.00 \(R65\.00 each\)\*/);
});

test("falls back to stored runner price when structured pricing is missing", () => {
  const message = runnerOrderLinkLine(
    listing({
      repostPriceMode: "FEE_BREAKDOWN",
      repostFeePercentageEnabled: false,
      product: { basePrice: 100, description: "" },
    }),
    "",
  );

  assert.match(message, /Unit Price: R100\.00/);
  assert.match(message, /Runner Fee: R30\.00/);
  assert.doesNotMatch(message, /\(30%\)/);
  assert.match(message, /\*Total Price: R130\.00\*/);
});

test("respects the order code and link toggle", () => {
  const message = runnerOrderLinkLine(
    listing({
      repostPriceMode: "TOTAL_ONLY",
      repostOrderDetailsEnabled: false,
    }),
    "https://wa.me/26876000000",
  );

  assert.doesNotMatch(message, /Order code:/);
  assert.doesNotMatch(message, /https:\/\/wa\.me/);
});
