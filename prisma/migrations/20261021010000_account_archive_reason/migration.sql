-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "archiveReason" TEXT;

-- Existing archived accounts: merged ones point at their survivor; the rest
-- were archived by a person.
UPDATE "Account" SET "archiveReason" = 'MERGED' WHERE "deletedAt" IS NOT NULL AND "mergedIntoId" IS NOT NULL;
UPDATE "Account" SET "archiveReason" = 'USER' WHERE "deletedAt" IS NOT NULL AND "mergedIntoId" IS NULL;

-- An archived account no longer holds its domain, so the same company can be
-- added again without colliding on the (clientId, domain) unique key.
UPDATE "Account" SET "domain" = NULL WHERE "deletedAt" IS NOT NULL AND "domain" IS NOT NULL;
