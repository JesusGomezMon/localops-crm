-- CreateTable
CREATE TABLE "CustomerMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'solicitada',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "cancelledAt" DATETIME,
    "quotedTotalCents" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    CONSTRAINT "CustomerMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerMembership_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomerMembership_tenantId_status_idx" ON "CustomerMembership"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomerMembership_tenantId_requestedAt_idx" ON "CustomerMembership"("tenantId", "requestedAt");
