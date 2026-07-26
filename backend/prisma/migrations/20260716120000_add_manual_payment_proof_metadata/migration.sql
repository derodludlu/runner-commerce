ALTER TABLE "ManualPaymentRecord"
  ADD COLUMN "runnerReference" TEXT,
  ADD COLUMN "proofText" TEXT,
  ADD COLUMN "proofImageUrls" JSONB,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WEB',
  ADD COLUMN "sourceMessageId" TEXT;

CREATE INDEX "ManualPaymentRecord_runnerReference_idx" ON "ManualPaymentRecord"("runnerReference");
CREATE INDEX "ManualPaymentRecord_source_idx" ON "ManualPaymentRecord"("source");
CREATE INDEX "ManualPaymentRecord_sourceMessageId_idx" ON "ManualPaymentRecord"("sourceMessageId");
