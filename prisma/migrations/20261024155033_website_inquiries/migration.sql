-- CreateTable
CREATE TABLE "Inquiry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "service" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categorySource" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "preferredTimes" JSONB,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT,
    "sourcePath" TEXT,
    "ipHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "spamReason" TEXT,
    "accountId" UUID,
    "contactId" UUID,
    "taskId" UUID,
    "meetingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inquiry_organizationId_status_createdAt_idx" ON "Inquiry"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_ipHash_createdAt_idx" ON "Inquiry"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_email_createdAt_idx" ON "Inquiry"("email", "createdAt");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
