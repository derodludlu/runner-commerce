CREATE TABLE "WhatsAppDiscoveredGroupMember" (
    "id" TEXT NOT NULL,
    "discoveredGroupId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppDiscoveredGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerGroupConflict" (
    "id" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "runnerIds" JSONB NOT NULL,
    "groups" JSONB NOT NULL,
    "chosenRunnerId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroupConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppDiscoveredGroupMember_groupId_phone_key" ON "WhatsAppDiscoveredGroupMember"("groupId", "phone");
CREATE INDEX "WhatsAppDiscoveredGroupMember_discoveredGroupId_idx" ON "WhatsAppDiscoveredGroupMember"("discoveredGroupId");
CREATE INDEX "WhatsAppDiscoveredGroupMember_phone_idx" ON "WhatsAppDiscoveredGroupMember"("phone");
CREATE INDEX "WhatsAppDiscoveredGroupMember_status_idx" ON "WhatsAppDiscoveredGroupMember"("status");
CREATE INDEX "WhatsAppDiscoveredGroupMember_lastSeenAt_idx" ON "WhatsAppDiscoveredGroupMember"("lastSeenAt");

CREATE UNIQUE INDEX "CustomerGroupConflict_customerPhone_city_key" ON "CustomerGroupConflict"("customerPhone", "city");
CREATE INDEX "CustomerGroupConflict_status_idx" ON "CustomerGroupConflict"("status");
CREATE INDEX "CustomerGroupConflict_city_idx" ON "CustomerGroupConflict"("city");
CREATE INDEX "CustomerGroupConflict_customerPhone_idx" ON "CustomerGroupConflict"("customerPhone");
CREATE INDEX "CustomerGroupConflict_chosenRunnerId_idx" ON "CustomerGroupConflict"("chosenRunnerId");

ALTER TABLE "WhatsAppDiscoveredGroupMember" ADD CONSTRAINT "WhatsAppDiscoveredGroupMember_discoveredGroupId_fkey" FOREIGN KEY ("discoveredGroupId") REFERENCES "WhatsAppDiscoveredGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
