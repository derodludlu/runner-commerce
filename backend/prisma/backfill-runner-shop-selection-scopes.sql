UPDATE "RunnerShopLink"
SET "selectedForTest" = true
WHERE "status" IN ('PENDING', 'APPROVED')
  AND COALESCE("notes", '') LIKE 'Phase 1%';

UPDATE "RunnerShopLink"
SET "selectedForLive" = true
WHERE "status" IN ('PENDING', 'APPROVED')
  AND COALESCE("notes", '') NOT LIKE 'Phase 1%';
