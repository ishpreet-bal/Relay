-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('DISCOVERED', 'SCREENED_OUT', 'QUALIFIED', 'ANALYZED', 'DEEP_RESEARCHED');

-- CreateEnum
CREATE TYPE "OpportunityTier" AS ENUM ('HOT', 'WARM', 'EXPLORATORY', 'LOW', 'SUPPRESSED');

-- AlterEnum
ALTER TYPE "UsageType" ADD VALUE 'AI_DEEP_RESEARCH';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "contentFingerprint" TEXT,
ADD COLUMN     "fingerprintedAt" TIMESTAMP(3),
ADD COLUMN     "lastObservedAt" TIMESTAMP(3),
ADD COLUMN     "lastResearchedAt" TIMESTAMP(3),
ADD COLUMN     "nextRefreshAt" TIMESTAMP(3),
ADD COLUMN     "opportunityTier" "OpportunityTier",
ADD COLUMN     "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'DISCOVERED',
ADD COLUMN     "promotedAt" TIMESTAMP(3),
ADD COLUMN     "promotedById" UUID,
ADD COLUMN     "promotionNote" TEXT,
ADD COLUMN     "researchCostMillicents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "researchVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "screenedAt" TIMESTAMP(3),
ADD COLUMN     "screeningReasons" JSONB,
ADD COLUMN     "screeningScore" INTEGER,
ADD COLUMN     "stagePinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ResearchVersion" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "summary" TEXT,
    "facts" JSONB,
    "hypotheses" JSONB,
    "unknowns" JSONB,
    "sources" JSONB,
    "model" TEXT,
    "promptVersion" TEXT,
    "contentFingerprint" TEXT,
    "changedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "costMillicents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineSettings" (
    "organizationId" UUID NOT NULL,
    "screeningThreshold" INTEGER NOT NULL DEFAULT 55,
    "deepThreshold" INTEGER NOT NULL DEFAULT 70,
    "autoScreen" BOOLEAN NOT NULL DEFAULT true,
    "autoAnalyze" BOOLEAN NOT NULL DEFAULT false,
    "autoDeep" BOOLEAN NOT NULL DEFAULT false,
    "maxAnalysesPerDay" INTEGER NOT NULL DEFAULT 25,
    "maxDeepPerDay" INTEGER NOT NULL DEFAULT 5,
    "refreshDaysHot" INTEGER NOT NULL DEFAULT 14,
    "refreshDaysWarm" INTEGER NOT NULL DEFAULT 30,
    "refreshDaysExploratory" INTEGER NOT NULL DEFAULT 60,
    "refreshDaysLow" INTEGER NOT NULL DEFAULT 120,
    "refreshDaysScreenedOut" INTEGER NOT NULL DEFAULT 180,
    "globalBudgetCents" INTEGER,
    "discoveryBudgetCents" INTEGER,
    "analysisBudgetCents" INTEGER,
    "deepBudgetCents" INTEGER,
    "enrichmentBudgetCents" INTEGER,
    "outreachBudgetCents" INTEGER,
    "costAssumptions" JSONB,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "SystemAlert" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "severity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchVersion_organizationId_createdAt_idx" ON "ResearchVersion"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchVersion_accountId_stage_version_key" ON "ResearchVersion"("accountId", "stage", "version");

-- CreateIndex
CREATE INDEX "SystemAlert_resolvedAt_lastSeenAt_idx" ON "SystemAlert"("resolvedAt", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAlert_organizationId_dedupeKey_key" ON "SystemAlert"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Account_clientId_pipelineStage_screeningScore_idx" ON "Account"("clientId", "pipelineStage", "screeningScore" DESC);

-- CreateIndex
CREATE INDEX "Account_organizationId_pipelineStage_idx" ON "Account"("organizationId", "pipelineStage");

-- CreateIndex
CREATE INDEX "Account_nextRefreshAt_idx" ON "Account"("nextRefreshAt");


-- Accounts that were already researched start at the analysed stage, and
-- every existing account counts as observed when it was created.
UPDATE "Account" a SET "pipelineStage" = 'ANALYZED', "researchVersion" = 1, "lastResearchedAt" = r."refreshedAt"
FROM "Research" r WHERE r."accountId" = a."id" AND r."status" = 'COMPLETED';
UPDATE "Account" SET "lastObservedAt" = "createdAt" WHERE "lastObservedAt" IS NULL;

ALTER TABLE "ResearchVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemAlert" ENABLE ROW LEVEL SECURITY;
