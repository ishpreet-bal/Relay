-- Outreach defaults for drafting outside a campaign. Without these the Drafts
-- page has no brief to hand the model, so one-off drafting was unreachable.
ALTER TABLE "Organization" ADD COLUMN "defaultSenderName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "offerBrief" TEXT;
ALTER TABLE "Organization" ADD COLUMN "toneGuidelines" TEXT;
ALTER TABLE "Organization" ADD COLUMN "bannedPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
