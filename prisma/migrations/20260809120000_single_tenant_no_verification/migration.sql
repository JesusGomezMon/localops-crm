-- DropIndex
DROP INDEX "Account_provider_providerAccountId_key";
-- DropIndex
DROP INDEX "Account_userId_idx";
-- DropIndex
DROP INDEX "Session_userId_idx";
-- DropIndex
DROP INDEX "Session_sessionToken_key";
-- DropIndex
DROP INDEX "Tenant_slug_key";
-- DropIndex
DROP INDEX "VerificationToken_identifier_token_key";
-- DropIndex
DROP INDEX "VerificationToken_token_key";
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Account";
PRAGMA foreign_keys=on;
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Session";
PRAGMA foreign_keys=on;
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Tenant";
PRAGMA foreign_keys=on;
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VerificationToken";
PRAGMA foreign_keys=on;
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'staff',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraIds" TEXT NOT NULL DEFAULT '[]',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("branchId", "createdAt", "customerId", "endsAt", "extraIds", "id", "notes", "serviceId", "source", "startsAt", "status", "totalCents") SELECT "branchId", "createdAt", "customerId", "endsAt", "extraIds", "id", "notes", "serviceId", "source", "startsAt", "status", "totalCents" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE INDEX "Appointment_startsAt_idx" ON "Appointment"("startsAt");
CREATE INDEX "Appointment_branchId_startsAt_idx" ON "Appointment"("branchId", "startsAt");
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AuditLog" ("action", "actorUserId", "createdAt", "id", "model", "recordId") SELECT "action", "actorUserId", "createdAt", "id", "model", "recordId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openingHours" TEXT NOT NULL DEFAULT '{}',
    "vipOnly" BOOLEAN NOT NULL DEFAULT false,
    "amenities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Branch" ("active", "address", "amenities", "createdAt", "id", "name", "openingHours", "phone", "slug", "vipOnly") SELECT "active", "address", "amenities", "createdAt", "id", "name", "openingHours", "phone", "slug", "vipOnly" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE INDEX "Branch_slug_idx" ON "Branch"("slug");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("createdAt", "email", "id", "name", "notes", "phone") SELECT "createdAt", "email", "id", "name", "notes", "phone" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE TABLE "new_CustomerMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'solicitada',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "cancelledAt" DATETIME,
    "quotedTotalCents" INTEGER NOT NULL DEFAULT 0,
    "customerId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    CONSTRAINT "CustomerMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerMembership_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CustomerMembership" ("cancelledAt", "customerId", "id", "membershipId", "quotedTotalCents", "requestedAt", "startedAt", "status") SELECT "cancelledAt", "customerId", "id", "membershipId", "quotedTotalCents", "requestedAt", "startedAt", "status" FROM "CustomerMembership";
DROP TABLE "CustomerMembership";
ALTER TABLE "new_CustomerMembership" RENAME TO "CustomerMembership";
CREATE INDEX "CustomerMembership_status_idx" ON "CustomerMembership"("status");
CREATE INDEX "CustomerMembership_requestedAt_idx" ON "CustomerMembership"("requestedAt");
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalRef" TEXT,
    "checkoutUrl" TEXT,
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountCents", "appointmentId", "checkoutUrl", "createdAt", "currency", "customerId", "externalRef", "id", "issuedAt", "status") SELECT "amountCents", "appointmentId", "checkoutUrl", "createdAt", "currency", "customerId", "externalRef", "id", "issuedAt", "status" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE TABLE "new_Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "savingsCents" INTEGER,
    "plans" TEXT NOT NULL DEFAULT '[]',
    "benefits" TEXT NOT NULL DEFAULT '[]',
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Membership" ("active", "benefits", "createdAt", "highlight", "id", "name", "plans", "priceCents", "savingsCents", "sortOrder") SELECT "active", "benefits", "createdAt", "highlight", "id", "name", "plans", "priceCents", "savingsCents", "sortOrder" FROM "Membership";
DROP TABLE "Membership";
ALTER TABLE "new_Membership" RENAME TO "Membership";
CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'General',
    "tier" TEXT NOT NULL DEFAULT 'universal',
    "kind" TEXT NOT NULL DEFAULT 'service',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Service" ("active", "category", "createdAt", "description", "durationMin", "id", "kind", "name", "priceCents", "sortOrder", "tier") SELECT "active", "category", "createdAt", "description", "durationMin", "id", "kind", "name", "priceCents", "sortOrder", "tier" FROM "Service";
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
CREATE INDEX "Service_kind_tier_idx" ON "Service"("kind", "tier");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "image", "name", "role") SELECT "createdAt", "email", "id", "image", "name", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
