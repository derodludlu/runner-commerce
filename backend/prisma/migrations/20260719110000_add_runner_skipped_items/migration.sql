CREATE TABLE "RunnerSkippedItem" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "listingId" TEXT,
    "shopId" TEXT,
    "orderCode" TEXT,
    "sourceMessageId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'RUNNER_SKIP_COMMAND',
    "reason" TEXT,
    "productName" TEXT,
    "productImageUrls" JSONB,
    "productImageHashes" JSONB,
    "imageLabels" JSONB,
    "matchedSkippedItemId" TEXT,
    "matchScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "skippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunnerSkippedItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunnerSkippedItem_runnerId_productId_key" ON "RunnerSkippedItem"("runnerId", "productId");
CREATE INDEX "RunnerSkippedItem_runnerId_idx" ON "RunnerSkippedItem"("runnerId");
CREATE INDEX "RunnerSkippedItem_productId_idx" ON "RunnerSkippedItem"("productId");
CREATE INDEX "RunnerSkippedItem_shopId_idx" ON "RunnerSkippedItem"("shopId");
CREATE INDEX "RunnerSkippedItem_orderCode_idx" ON "RunnerSkippedItem"("orderCode");
CREATE INDEX "RunnerSkippedItem_status_idx" ON "RunnerSkippedItem"("status");
CREATE INDEX "RunnerSkippedItem_skippedAt_idx" ON "RunnerSkippedItem"("skippedAt");
