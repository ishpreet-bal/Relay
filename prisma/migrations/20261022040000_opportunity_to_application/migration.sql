-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "internalHourlyCostCents" INTEGER NOT NULL DEFAULT 6000;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "acceptanceEvidence" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "opportunityId" UUID;

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "proposedAutomation" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "researchVersionId" UUID,
    "evidenceFactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "howToValidate" TEXT,
    "integrationBarriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "templateId" UUID,
    "templateVersionId" UUID,
    "reusability" TEXT,
    "reusabilityReasons" JSONB,
    "matchScore" DOUBLE PRECISION,
    "matchOverridden" BOOLEAN NOT NULL DEFAULT false,
    "estimatedBuildHours" INTEGER,
    "fromScratchHours" INTEGER,
    "estimateBasis" JSONB,
    "assessment" JSONB,
    "projection" JSONB,
    "proposalId" UUID,
    "customerClientId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityDemo" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "configVersionId" UUID NOT NULL,
    "sampleRuns" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityDemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProject" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "opportunityId" UUID,
    "proposalId" UUID,
    "applicationId" UUID,
    "templateId" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "reusability" TEXT,
    "estimatedHours" INTEGER NOT NULL,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "priceSetupCents" INTEGER NOT NULL DEFAULT 0,
    "priceMonthlyCents" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTimeEntry" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID,
    "category" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "workDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_status_idx" ON "Opportunity"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_accountId_idx" ON "Opportunity"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_researchVersionId_title_key" ON "Opportunity"("researchVersionId", "title");

-- CreateIndex
CREATE INDEX "OpportunityDemo_opportunityId_idx" ON "OpportunityDemo"("opportunityId");

-- CreateIndex
CREATE INDEX "DeliveryProject_organizationId_status_idx" ON "DeliveryProject"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DeliveryProject_clientId_idx" ON "DeliveryProject"("clientId");

-- CreateIndex
CREATE INDEX "DeliveryProject_templateId_closedAt_idx" ON "DeliveryProject"("templateId", "closedAt");

-- CreateIndex
CREATE INDEX "ProjectTimeEntry_projectId_workDate_idx" ON "ProjectTimeEntry"("projectId", "workDate");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDemo" ADD CONSTRAINT "OpportunityDemo_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProject" ADD CONSTRAINT "DeliveryProject_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTimeEntry" ADD CONSTRAINT "ProjectTimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DeliveryProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
