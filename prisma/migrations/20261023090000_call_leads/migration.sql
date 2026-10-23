-- CreateTable
CREATE TABLE "CallLead" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "profileId" UUID,
    "runId" UUID,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "searchTerm" TEXT,
    "searchCity" TEXT,
    "searchRegion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "callbackAt" TIMESTAMP(3),
    "calls" INTEGER NOT NULL DEFAULT 0,
    "lastCalledAt" TIMESTAMP(3),
    "lastCalledById" UUID,
    "accountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallLead_organizationId_clientId_status_idx" ON "CallLead"("organizationId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CallLead_organizationId_provider_externalId_key" ON "CallLead"("organizationId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "CallLead" ADD CONSTRAINT "CallLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLead" ADD CONSTRAINT "CallLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
