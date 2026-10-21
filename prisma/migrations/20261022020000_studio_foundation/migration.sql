-- CreateTable
CREATE TABLE "AppTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "useCases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buildHoursEstimate" INTEGER,
    "monthlyInfraCentsEstimate" INTEGER,
    "recommendedSetupCents" INTEGER,
    "recommendedMonthlyCents" INTEGER,
    "knownLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppTemplateVersion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "changelog" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "testsPassedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "AppTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientApplication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "templateId" UUID,
    "templateVersionId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deployment" TEXT NOT NULL DEFAULT 'SHARED',
    "activeConfigVersionId" UUID,
    "maxExecutionsPerDay" INTEGER NOT NULL DEFAULT 500,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 2,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ClientApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfigVersion" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "overrides" JSONB NOT NULL,
    "manifest" JSONB NOT NULL,
    "templateVersionId" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validationErrors" JSONB,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppDeployment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "configVersionId" UUID NOT NULL,
    "previousConfigVersionId" UUID,
    "environment" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DEPLOY',
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "notes" TEXT,
    "deployedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "encryptedSecret" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "configVersionId" UUID NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "output" JSONB,
    "steps" JSONB,
    "error" TEXT,
    "jobId" UUID,
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRecord" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "collection" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdByExecutionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppTemplate_industry_idx" ON "AppTemplate"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "AppTemplate_organizationId_slug_key" ON "AppTemplate"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AppTemplateVersion_templateId_version_key" ON "AppTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "ClientApplication_organizationId_status_idx" ON "ClientApplication"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientApplication_clientId_slug_key" ON "ClientApplication"("clientId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfigVersion_applicationId_version_key" ON "AppConfigVersion"("applicationId", "version");

-- CreateIndex
CREATE INDEX "AppDeployment_applicationId_createdAt_idx" ON "AppDeployment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationConnection_clientId_provider_idx" ON "IntegrationConnection"("clientId", "provider");

-- CreateIndex
CREATE INDEX "WorkflowExecution_applicationId_createdAt_idx" ON "WorkflowExecution"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowExecution_clientId_status_idx" ON "WorkflowExecution"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_applicationId_idempotencyKey_key" ON "WorkflowExecution"("applicationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AppRecord_applicationId_collection_createdAt_idx" ON "AppRecord"("applicationId", "collection", "createdAt");

-- CreateIndex
CREATE INDEX "AppRecord_clientId_idx" ON "AppRecord"("clientId");

-- AddForeignKey
ALTER TABLE "AppTemplateVersion" ADD CONSTRAINT "AppTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AppTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApplication" ADD CONSTRAINT "ClientApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApplication" ADD CONSTRAINT "ClientApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApplication" ADD CONSTRAINT "ClientApplication_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfigVersion" ADD CONSTRAINT "AppConfigVersion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ClientApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDeployment" ADD CONSTRAINT "AppDeployment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ClientApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ClientApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRecord" ADD CONSTRAINT "AppRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ClientApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "AppTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppConfigVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppDeployment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppRecord" ENABLE ROW LEVEL SECURITY;
