-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SCREENING';
ALTER TYPE "JobType" ADD VALUE 'DEEP_RESEARCH';
ALTER TYPE "JobType" ADD VALUE 'OPPORTUNITY_ASSESSMENT';
ALTER TYPE "JobType" ADD VALUE 'RECORD_REFRESH';
ALTER TYPE "JobType" ADD VALUE 'DEMO_BUILD';
ALTER TYPE "JobType" ADD VALUE 'WORKFLOW_EXECUTION';
ALTER TYPE "JobType" ADD VALUE 'BILLING_SYNC';
ALTER TYPE "JobType" ADD VALUE 'SYNTHETIC_TASK';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "deadLetteredAt" TIMESTAMP(3),
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "failureKind" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "queue" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "waitingReason" TEXT;

-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN     "actualCostMillicents" INTEGER,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "jobId" UUID,
ADD COLUMN     "operation" TEXT;

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "outcome" TEXT,
    "error" TEXT,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueSetting" (
    "queue" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "concurrency" INTEGER,
    "maxPerMinute" INTEGER,
    "perOrgConcurrency" INTEGER,
    "timeoutMs" INTEGER,
    "maxAttempts" INTEGER,
    "retryBaseMs" INTEGER,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueSetting_pkey" PRIMARY KEY ("queue")
);

-- CreateTable
CREATE TABLE "ProviderThrottle" (
    "provider" TEXT NOT NULL,
    "maxPerMinute" INTEGER,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "failureThreshold" INTEGER NOT NULL DEFAULT 5,
    "circuitOpenUntil" TIMESTAMP(3),
    "cooldownMs" INTEGER NOT NULL DEFAULT 60000,
    "lastError" TEXT,
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "totalFailures" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderThrottle_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobsProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "version" TEXT,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE INDEX "JobAttempt_jobId_attempt_idx" ON "JobAttempt"("jobId", "attempt");

-- CreateIndex
CREATE INDEX "JobAttempt_startedAt_idx" ON "JobAttempt"("startedAt");

-- CreateIndex
CREATE INDEX "Job_queue_status_priority_runAt_idx" ON "Job"("queue", "status", "priority", "runAt");

-- CreateIndex
CREATE INDEX "Job_deadLetteredAt_idx" ON "Job"("deadLetteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_queue_idempotencyKey_key" ON "Job"("queue", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UsageRecord_jobId_idx" ON "UsageRecord"("jobId");

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing jobs go to the queue their type now belongs to.
UPDATE "Job" SET "queue" = CASE "type"::text
  WHEN 'DISCOVERY_RUN' THEN 'discovery'
  WHEN 'IMPORT' THEN 'normalize'
  WHEN 'RESEARCH' THEN 'research'
  WHEN 'ACCOUNT_ENRICHMENT' THEN 'enrichment'
  WHEN 'CONTACT_ENRICHMENT' THEN 'enrichment'
  WHEN 'VERIFICATION' THEN 'verification'
  WHEN 'RESCORE' THEN 'scoring'
  WHEN 'CALL_QUEUE_REFRESH' THEN 'scoring'
  ELSE 'maintenance' END;

-- Jobs that already gave up are dead letters.
UPDATE "Job" SET "deadLetteredAt" = COALESCE("finishedAt", "updatedAt"), "failureKind" = 'EXHAUSTED' WHERE "status" = 'FAILED';

-- Keep the Supabase REST API closed on new tables, like every other table.
ALTER TABLE "JobAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QueueSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkerHeartbeat" ENABLE ROW LEVEL SECURITY;
