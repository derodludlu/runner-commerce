ALTER TABLE "Runner" ADD COLUMN "publicCode" TEXT;

UPDATE "Runner"
SET "publicCode" = 'RUN-' || upper(substr(replace("id", '-', ''), 1, 10))
WHERE "publicCode" IS NULL;

CREATE UNIQUE INDEX "Runner_publicCode_key" ON "Runner"("publicCode");
