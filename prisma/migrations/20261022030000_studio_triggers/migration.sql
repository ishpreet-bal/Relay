-- AlterTable
ALTER TABLE "ClientApplication" ADD COLUMN     "scheduleState" JSONB,
ADD COLUMN     "webhookTokenHash" TEXT;

