-- Full lint output (blockers and warnings) from the last draft or edit; gates approve/send.
ALTER TABLE "Message" ADD COLUMN "lintFindings" JSONB;
