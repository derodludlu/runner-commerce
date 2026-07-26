ALTER TABLE "WhatsAppRepostLog"
ADD COLUMN "captionStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "captionVerifiedAt" TIMESTAMP(3),
ADD COLUMN "captionFallbackSent" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WhatsAppRepostLog_captionStatus_idx"
ON "WhatsAppRepostLog"("captionStatus");
