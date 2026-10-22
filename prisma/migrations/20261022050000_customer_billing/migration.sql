-- CreateTable
CREATE TABLE "CustomerSubscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "applicationId" UUID,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL DEFAULT 'ledger',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "setupFeeCents" INTEGER NOT NULL DEFAULT 0,
    "monthlyCents" INTEGER NOT NULL,
    "includedRuns" INTEGER NOT NULL DEFAULT 0,
    "overageMillicentsPerRun" INTEGER NOT NULL DEFAULT 0,
    "authorizedById" UUID,
    "authorizedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeteredUsage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeteredUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerInvoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "provider" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "idempotencyKey" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSubscription_stripeSubscriptionId_key" ON "CustomerSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CustomerSubscription_organizationId_status_idx" ON "CustomerSubscription"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CustomerSubscription_clientId_idx" ON "CustomerSubscription"("clientId");

-- CreateIndex
CREATE INDEX "CustomerSubscription_status_currentPeriodEnd_idx" ON "CustomerSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "MeteredUsage_subscriptionId_metric_periodStart_key" ON "MeteredUsage"("subscriptionId", "metric", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvoice_stripeInvoiceId_key" ON "CustomerInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvoice_idempotencyKey_key" ON "CustomerInvoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerInvoice_organizationId_issuedAt_idx" ON "CustomerInvoice"("organizationId", "issuedAt");

-- CreateIndex
CREATE INDEX "CustomerInvoice_clientId_issuedAt_idx" ON "CustomerInvoice"("clientId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvoice_organizationId_number_key" ON "CustomerInvoice"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeteredUsage" ADD CONSTRAINT "MeteredUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
