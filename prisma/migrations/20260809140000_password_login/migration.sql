-- Password sign-in: adds `username` (unique, required) and `passwordHash` to User,
-- and makes `email` optional because nothing in this app sends mail any more.
--
-- BACKFILL NOTE: `username` is NOT NULL, so the generated INSERT would have violated
-- the constraint on existing rows. The SELECT below derives a username from the
-- local part of the old email address (owner@kasterz.test -> "owner"), falling back
-- to the row id if the address is missing or malformed. The seed then upserts the
-- "admin" account with its password.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "role", "username")
SELECT
    "createdAt",
    "email",
    "id",
    "name",
    "role",
    COALESCE(
        NULLIF(substr("email", 1, instr("email", '@') - 1), ''),
        'user_' || "id"
    )
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
