CREATE TABLE "ProductDuplicateReviewDismissal" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "leftProductId" TEXT NOT NULL,
  "rightProductId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reason" TEXT NOT NULL DEFAULT 'KEEP_SEPARATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductDuplicateReviewDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductDuplicateReviewDismissal_shopId_leftProductId_rightProductId_key"
ON "ProductDuplicateReviewDismissal"("shopId", "leftProductId", "rightProductId");
CREATE INDEX "ProductDuplicateReviewDismissal_shopId_idx"
ON "ProductDuplicateReviewDismissal"("shopId");
