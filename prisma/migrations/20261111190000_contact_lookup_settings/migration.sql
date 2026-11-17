-- Contact lookup runs on its own allowance instead of waiting for AI research.
ALTER TABLE "PipelineSettings" ADD COLUMN "autoContacts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PipelineSettings" ADD COLUMN "maxContactLookupsPerDay" INTEGER NOT NULL DEFAULT 40;
