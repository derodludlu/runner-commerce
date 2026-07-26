ALTER TABLE "Product" ADD COLUMN "sourceRefreshedAt" TIMESTAMP(3);

ALTER TABLE "WhatsAppImport"
ADD COLUMN "resolutionOutcome" TEXT,
ADD COLUMN "matchedImportId" TEXT,
ADD COLUMN "matchedProductId" TEXT,
ADD COLUMN "matchConfidence" DOUBLE PRECISION,
ADD COLUMN "matchAgeDays" DOUBLE PRECISION,
ADD COLUMN "matchReason" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "WhatsAppImport_matchedProductId_idx" ON "WhatsAppImport"("matchedProductId");
CREATE INDEX "WhatsAppImport_resolutionOutcome_idx" ON "WhatsAppImport"("resolutionOutcome");
