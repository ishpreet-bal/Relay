-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "buildHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setupCostCents" INTEGER NOT NULL DEFAULT 0,
    "hostingCents" INTEGER NOT NULL DEFAULT 0,
    "databaseCents" INTEGER NOT NULL DEFAULT 0,
    "aiCents" INTEGER NOT NULL DEFAULT 0,
    "thirdPartyCents" INTEGER NOT NULL DEFAULT 0,
    "domainCents" INTEGER NOT NULL DEFAULT 0,
    "monitoringCents" INTEGER NOT NULL DEFAULT 0,
    "supportHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maintenanceHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetMarginPct" INTEGER NOT NULL DEFAULT 40,
    "priceSetupCents" INTEGER,
    "priceMonthlyCents" INTEGER,
    "includedUsage" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePackage_organizationId_service_idx" ON "ServicePackage"("organizationId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePackage_organizationId_name_key" ON "ServicePackage"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
