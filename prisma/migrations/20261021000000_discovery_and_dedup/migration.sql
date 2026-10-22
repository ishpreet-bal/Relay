-- CreateEnum
CREATE TYPE "BuyingRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'CHAMPION', 'GATEKEEPER', 'END_USER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DiscoveryTrigger" AS ENUM ('MANUAL', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "DiscoveryFrequency" AS ENUM ('MANUAL', 'EVERY_6_HOURS', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DiscoveryOutcome" AS ENUM ('CREATED', 'UPDATED', 'DUPLICATE', 'EXCLUDED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'DISCOVERY_RUN';
ALTER TYPE "JobType" ADD VALUE 'RETENTION_SWEEP';
ALTER TYPE "JobType" ADD VALUE 'MAINTENANCE';

-- AlterEnum
ALTER TYPE "UsageType" ADD VALUE 'DISCOVERY_REQUEST';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "businessModel" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "parentAccountId" UUID,
ADD COLUMN     "socialProfiles" JSONB;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "buyingRole" "BuyingRole" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DataProvenance" ADD COLUMN     "retentionUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DiscoveryRun" ADD COLUMN     "costMillicents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "excluded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "needsReview" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profileId" UUID,
ADD COLUMN     "queriesRun" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trigger" "DiscoveryTrigger" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "updated" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "provider" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN     "isEstimate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DiscoveryProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "icpId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT NOT NULL DEFAULT 'CA',
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusKm" INTEGER,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employeeMin" INTEGER,
    "employeeMax" INTEGER,
    "maxResultsPerRun" INTEGER NOT NULL DEFAULT 60,
    "monthlyBudgetCents" INTEGER NOT NULL DEFAULT 2000,
    "frequency" "DiscoveryFrequency" NOT NULL DEFAULT 'WEEKLY',
    "autoResearch" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "JobStatus",
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryResult" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "outcome" "DiscoveryOutcome" NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "reason" TEXT,
    "accountId" UUID,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryIdentifier" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "source" TEXT,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryProfile_organizationId_isActive_nextRunAt_idx" ON "DiscoveryProfile"("organizationId", "isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "DiscoveryResult_accountId_idx" ON "DiscoveryResult"("accountId");

-- CreateIndex
CREATE INDEX "DiscoveryResult_expiresAt_idx" ON "DiscoveryResult"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryResult_runId_provider_externalId_key" ON "DiscoveryResult"("runId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "DiscoveryIdentifier_accountId_idx" ON "DiscoveryIdentifier"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryIdentifier_clientId_provider_externalId_key" ON "DiscoveryIdentifier"("clientId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_organizationId_clientId_status_idx" ON "DuplicateCandidate"("organizationId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_accountId_candidateId_key" ON "DuplicateCandidate"("accountId", "candidateId");

-- CreateIndex
CREATE INDEX "SavedView_organizationId_scope_idx" ON "SavedView"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "Account_clientId_normalizedName_idx" ON "Account"("clientId", "normalizedName");

-- CreateIndex
CREATE INDEX "Account_parentAccountId_idx" ON "Account"("parentAccountId");

-- CreateIndex
CREATE INDEX "DataProvenance_retentionUntil_idx" ON "DataProvenance"("retentionUntil");

-- CreateIndex
CREATE INDEX "DiscoveryRun_profileId_createdAt_idx" ON "DiscoveryRun"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DiscoveryProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryProfile" ADD CONSTRAINT "DiscoveryProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryProfile" ADD CONSTRAINT "DiscoveryProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryResult" ADD CONSTRAINT "DiscoveryResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiscoveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryIdentifier" ADD CONSTRAINT "DiscoveryIdentifier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep Supabase's auto-generated REST API closed on the new tables, as on
-- every other table (see 20261006010000_outbound_os_core_domain).
ALTER TABLE "DiscoveryProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoveryResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoveryIdentifier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DuplicateCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
