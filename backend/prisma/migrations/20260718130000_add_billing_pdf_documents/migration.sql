-- Add PDF document delivery metadata for RunnerBot billing.
ALTER TABLE "WhatsAppOutboundMessage"
ADD COLUMN "mediaUrl" TEXT,
ADD COLUMN "filename" TEXT,
ADD COLUMN "mimeType" TEXT;

ALTER TABLE "PlatformInvoice"
ADD COLUMN "invoicePdfUrl" TEXT;

ALTER TABLE "ManualPaymentRecord"
ADD COLUMN "receiptNumber" TEXT,
ADD COLUMN "receiptPdfUrl" TEXT;
