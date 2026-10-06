-- Foundry: outbound sales OS core domain.
--
-- Hand-written rather than generated: Prisma would DROP "Lead" and CREATE an
-- empty "Account". Every existing row is kept. Renames are metadata-only in
-- Postgres; new NOT NULL columns are added nullable, backfilled, then
-- constrained. Newly added enum values are never used inside this migration.
--
-- Data mapping decisions (see docs/ASSESSMENT.md):
--   * Every organization gets a "house" client that owns all pre-existing
--     leads, contacts, campaigns, messages, research, activity and meetings.
--   * Roles: OWNER→SUPER_ADMIN, ADMIN→FOUNDRY_ADMIN, OPERATOR and ANALYST keep
--     their names, VIEWER→CLIENT_MEMBER with no client (no data access until
--     an admin assigns a role) — a deliberate de-escalation.
--   * LeadStatus → AccountStatus; research progress lives on Research.status.
--   * Scores are marked stale (scoredAt NULL) so the worker recomputes them
--     against the client's ICP.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ClientStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED', 'CHURNED');
CREATE TYPE "Seniority" AS ENUM ('OWNER', 'C_LEVEL', 'VP', 'DIRECTOR', 'MANAGER', 'SENIOR', 'ENTRY', 'UNKNOWN');
CREATE TYPE "ProofPointKind" AS ENUM ('CASE_STUDY', 'TESTIMONIAL', 'CUSTOMER', 'RESULT', 'CERTIFICATION', 'CAPABILITY', 'OTHER');
CREATE TYPE "AccountStatus" AS ENUM ('DISCOVERED', 'ENRICHED', 'QUALIFIED', 'ACTIVE_OUTREACH', 'ENGAGED', 'CALLING', 'MEETING_BOOKED', 'WON', 'LOST', 'DISQUALIFIED');
CREATE TYPE "EnrichmentStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'ENRICHED', 'PARTIAL', 'FAILED');
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'GOOGLE_PLACES', 'OPENCORPORATES', 'COMPANY_WEBSITE', 'LINKEDIN', 'APOLLO', 'REFERRAL', 'INBOUND', 'OTHER', 'PROVIDER', 'RESEARCH', 'CLIENT_PROVIDED');
CREATE TYPE "PhoneStatus" AS ENUM ('UNVERIFIED', 'VALID', 'INVALID', 'WRONG_NUMBER');
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'BOUNCED', 'LEFT_COMPANY', 'WRONG_PERSON');
CREATE TYPE "ConsentBasis" AS ENUM ('UNKNOWN', 'IMPLIED_PUBLISHED', 'IMPLIED_RELATIONSHIP', 'EXPRESS');
CREATE TYPE "SignalType" AS ENUM ('HIRING', 'FUNDING', 'EXPANSION', 'NEW_LOCATION', 'NEW_CONTRACT', 'NEW_PRODUCT', 'TECHNOLOGY_CHANGE', 'LEADERSHIP_CHANGE', 'REGULATORY_EVENT', 'CUSTOM_SIGNAL');
CREATE TYPE "EvidenceStatus" AS ENUM ('VERIFIED', 'PROVIDER_REPORTED', 'UNVERIFIED', 'REJECTED');
CREATE TYPE "ApprovalMode" AS ENUM ('REVIEW_ALL', 'AUTO_APPROVE_VERIFIED');
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PARTIALLY_VERIFIED', 'REVIEW_REQUIRED', 'UNSUPPORTED', 'BLOCKED');
CREATE TYPE "ApprovalSource" AS ENUM ('HUMAN', 'POLICY');
CREATE TYPE "ReplyClass" AS ENUM ('UNCLASSIFIED', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'OUT_OF_OFFICE', 'REFERRAL', 'UNSUBSCRIBE');
CREATE TYPE "ClaimType" AS ENUM ('JOB_TITLE', 'COMPANY_LOCATION', 'COMPANY_INDUSTRY', 'COMPANY_SIZE', 'PRODUCTS_SERVICES', 'SERVICE_AREA', 'HIRING', 'EXPANSION', 'NEW_LOCATION', 'FUNDING', 'NEW_CONTRACT', 'NEW_PRODUCT', 'TECHNOLOGY_USED', 'LEADERSHIP_CHANGE', 'CUSTOMER_OR_PARTNER', 'AWARD_OR_CERTIFICATION', 'REGULATORY_EVENT', 'OTHER_FACT');
CREATE TYPE "ClaimKind" AS ENUM ('PROSPECT_FACT', 'SENDER_PROOF', 'GENERAL_COPY');
CREATE TYPE "ClaimStatus" AS ENUM ('SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED', 'STALE', 'NOT_REQUIRED');
CREATE TYPE "SuppressionChannel" AS ENUM ('ALL', 'EMAIL', 'PHONE');
CREATE TYPE "SuppressionSource" AS ENUM ('UNSUBSCRIBE_LINK', 'ONE_CLICK', 'EMAIL_REPLY', 'BOUNCE_WEBHOOK', 'COMPLAINT_WEBHOOK', 'CALL_OUTCOME', 'MANUAL', 'IMPORT', 'SYSTEM');
CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "CallOutcome" AS ENUM ('NO_ANSWER', 'VOICEMAIL', 'CONNECTED', 'NOT_INTERESTED', 'CALL_BACK', 'WRONG_PERSON', 'WRONG_NUMBER', 'REFERRED', 'INTERESTED', 'QUALIFIED', 'MEETING_BOOKED', 'DO_NOT_CALL');
CREATE TYPE "ObjectionType" AS ENUM ('TOO_EXPENSIVE', 'ALREADY_HAVE_PROVIDER', 'BAD_TIMING', 'NO_NEED', 'SEND_INFORMATION', 'NOT_DECISION_MAKER', 'OTHER');
CREATE TYPE "CallTaskStatus" AS ENUM ('OPEN', 'SNOOZED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CallTaskCategory" AS ENUM ('CALLBACK_DUE', 'REPLIED', 'ENGAGED', 'SIGNAL', 'HIGH_FIT', 'MANUAL');
CREATE TYPE "MeetingStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'RESCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "MeetingOutcome" AS ENUM ('PENDING', 'QUALIFIED_OPPORTUNITY', 'NOT_QUALIFIED', 'WON', 'LOST');
CREATE TYPE "MeetingSource" AS ENUM ('CALL', 'EMAIL_REPLY', 'CALENDAR_LINK', 'INBOUND', 'MANUAL');
CREATE TYPE "ProviderRecordStatus" AS ENUM ('SUCCESS', 'NOT_FOUND', 'ERROR');
CREATE TYPE "JobType" AS ENUM ('ACCOUNT_ENRICHMENT', 'CONTACT_ENRICHMENT', 'RESEARCH', 'VERIFICATION', 'CAMPAIGN_SCHEDULING', 'ANALYTICS', 'PROVIDER_SYNC', 'CALL_QUEUE_REFRESH', 'RESCORE', 'IMPORT');
CREATE TYPE "UsageType" AS ENUM ('ENRICHMENT_REQUEST', 'AI_RESEARCH', 'AI_PERSONALIZATION', 'AI_VERIFICATION', 'AI_OTHER', 'EMAIL_SENT', 'EMAIL_VERIFICATION', 'SMS', 'PHONE_LOOKUP', 'CALL_MINUTES', 'EXTERNAL_DATA');

ALTER TYPE "LeadTemperature" RENAME TO "Temperature";

-- Values added here are not used anywhere below.
ALTER TYPE "ActivityType" ADD VALUE 'SIGNAL_DETECTED';
ALTER TYPE "ActivityType" ADD VALUE 'ENRICHMENT';
ALTER TYPE "ActivityType" ADD VALUE 'SUPPRESSION';
ALTER TYPE "ActivityType" ADD VALUE 'SCORE_OVERRIDE';
ALTER TYPE "SuppressionReason" ADD VALUE 'DO_NOT_CALL';
ALTER TYPE "SuppressionScope" ADD VALUE 'PHONE';
ALTER TYPE "JobStatus" RENAME VALUE 'SUCCEEDED' TO 'COMPLETED';
ALTER TYPE "JobStatus" ADD VALUE 'RETRYING';

-- Roles
CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'FOUNDRY_ADMIN', 'OPERATOR', 'ANALYST', 'CALLER', 'CLIENT_ADMIN', 'CLIENT_MEMBER');
ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'OWNER' THEN 'SUPER_ADMIN'
    WHEN 'ADMIN' THEN 'FOUNDRY_ADMIN'
    WHEN 'OPERATOR' THEN 'OPERATOR'
    WHEN 'ANALYST' THEN 'ANALYST'
    ELSE 'CLIENT_MEMBER'
  END
)::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'CLIENT_MEMBER';

-- ---------------------------------------------------------------------------
-- 2. Clients, and a house client per organization for existing data
-- ---------------------------------------------------------------------------

CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'ONBOARDING',
    "websiteUrl" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "productsServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industriesServed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "differentiators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "existingCustomers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "averageDealValueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "senderName" TEXT,
    "senderTitle" TEXT,
    "bookingUrl" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "notes" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");
CREATE UNIQUE INDEX "Client_organizationId_slug_key" ON "Client"("organizationId", "slug");
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Client" ("id", "organizationId", "name", "slug", "status", "websiteUrl", "currency", "timezone", "notes", "onboardedAt", "updatedAt")
SELECT gen_random_uuid(), o."id", o."name", 'house', 'ACTIVE', o."websiteUrl", o."currency", o."timezone",
       'Created automatically to hold the prospects, campaigns and history that existed before clients were introduced.',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o;

CREATE TEMP TABLE "_house" AS
SELECT "organizationId", "id" AS "clientId" FROM "Client" WHERE "slug" = 'house';

-- ---------------------------------------------------------------------------
-- 3. Lead → Account
-- ---------------------------------------------------------------------------

ALTER TABLE "Lead" RENAME TO "Account";
ALTER TABLE "Account" RENAME CONSTRAINT "Lead_pkey" TO "Account_pkey";
ALTER TABLE "Account" RENAME CONSTRAINT "Lead_organizationId_fkey" TO "Account_organizationId_fkey";
ALTER TABLE "Account" RENAME CONSTRAINT "Lead_ownerId_fkey" TO "Account_ownerId_fkey";
ALTER TABLE "Account" RENAME CONSTRAINT "Lead_discoveryRunId_fkey" TO "Account_discoveryRunId_fkey";
ALTER INDEX "Lead_organizationId_industry_idx" RENAME TO "Account_organizationId_industry_idx";
ALTER INDEX "Lead_organizationId_city_idx" RENAME TO "Account_organizationId_city_idx";
ALTER INDEX "Lead_organizationId_nextFollowUpAt_idx" RENAME TO "Account_organizationId_nextFollowUpAt_idx";
DROP INDEX "Lead_organizationId_status_idx";
DROP INDEX "Lead_organizationId_score_idx";
DROP INDEX "Lead_organizationId_domain_key";

ALTER TABLE "Account" RENAME COLUMN "companyName" TO "name";

ALTER TABLE "Account"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "revenueRange" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "foundedYear" INTEGER,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "enrichedAt" TIMESTAMP(3),
  ADD COLUMN "researchSummary" TEXT,
  ADD COLUMN "icpId" UUID,
  ADD COLUMN "fitScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "engagementScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoredAt" TIMESTAMP(3),
  ADD COLUMN "scoreOverride" INTEGER,
  ADD COLUMN "scoreOverrideReason" TEXT,
  ADD COLUMN "scoreOverriddenById" UUID,
  ADD COLUMN "scoreOverriddenAt" TIMESTAMP(3),
  ADD COLUMN "disqualifiedReason" TEXT,
  ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastEngagedAt" TIMESTAMP(3);

UPDATE "Account" a SET "clientId" = h."clientId" FROM "_house" h WHERE h."organizationId" = a."organizationId";
ALTER TABLE "Account" ALTER COLUMN "clientId" SET NOT NULL;

-- Suppressed leads become do-not-contact accounts; the status itself moves
-- to the closest lifecycle stage.
UPDATE "Account" SET "doNotContact" = true, "disqualifiedReason" = COALESCE("suppressReason", 'Suppressed')
WHERE "status"::text = 'SUPPRESSED';

ALTER TABLE "Account" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Account" ALTER COLUMN "status" TYPE "AccountStatus" USING (
  CASE "status"::text
    WHEN 'DISCOVERED' THEN 'DISCOVERED'
    WHEN 'RESEARCHING' THEN 'DISCOVERED'
    WHEN 'RESEARCHED' THEN 'ENRICHED'
    WHEN 'DRAFTED' THEN 'QUALIFIED'
    WHEN 'APPROVED' THEN 'QUALIFIED'
    WHEN 'CONTACTED' THEN 'ACTIVE_OUTREACH'
    WHEN 'ENGAGED' THEN 'ENGAGED'
    WHEN 'MEETING_BOOKED' THEN 'MEETING_BOOKED'
    WHEN 'PROPOSAL_SENT' THEN 'MEETING_BOOKED'
    WHEN 'WON' THEN 'WON'
    WHEN 'LOST' THEN 'LOST'
    ELSE 'DISQUALIFIED'
  END
)::"AccountStatus";
ALTER TABLE "Account" ALTER COLUMN "status" SET DEFAULT 'DISCOVERED';
DROP TYPE "LeadStatus";

ALTER TABLE "Account" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Account" ALTER COLUMN "source" TYPE "DataSource" USING ("source"::text::"DataSource");
ALTER TABLE "Account" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
ALTER TABLE "DiscoveryRun" ALTER COLUMN "provider" TYPE "DataSource" USING ("provider"::text::"DataSource");
DROP TYPE "LeadSource";

CREATE INDEX "Account_organizationId_clientId_status_idx" ON "Account"("organizationId", "clientId", "status");
CREATE INDEX "Account_clientId_score_idx" ON "Account"("clientId", "score" DESC);
CREATE INDEX "Account_scoredAt_idx" ON "Account"("scoredAt");
CREATE UNIQUE INDEX "Account_clientId_domain_key" ON "Account"("clientId", "domain");
ALTER TABLE "Account" ADD CONSTRAINT "Account_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoveryRun" ADD COLUMN "clientId" UUID, ADD COLUMN "icpId" UUID;

-- ---------------------------------------------------------------------------
-- 4. leadId → accountId everywhere
-- ---------------------------------------------------------------------------

ALTER TABLE "Contact" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Contact" RENAME CONSTRAINT "Contact_leadId_fkey" TO "Contact_accountId_fkey";
ALTER INDEX "Contact_leadId_email_key" RENAME TO "Contact_accountId_email_key";

ALTER TABLE "Research" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Research" RENAME CONSTRAINT "Research_leadId_fkey" TO "Research_accountId_fkey";
ALTER INDEX "Research_leadId_key" RENAME TO "Research_accountId_key";

ALTER TABLE "CampaignEnrollment" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "CampaignEnrollment" RENAME CONSTRAINT "CampaignEnrollment_leadId_fkey" TO "CampaignEnrollment_accountId_fkey";
DROP INDEX "CampaignEnrollment_campaignId_leadId_key";
CREATE UNIQUE INDEX "CampaignEnrollment_campaignId_contactId_key" ON "CampaignEnrollment"("campaignId", "contactId");
CREATE INDEX "CampaignEnrollment_accountId_idx" ON "CampaignEnrollment"("accountId");
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Message" RENAME CONSTRAINT "Message_leadId_fkey" TO "Message_accountId_fkey";
ALTER INDEX "Message_leadId_createdAt_idx" RENAME TO "Message_accountId_createdAt_idx";

ALTER TABLE "Activity" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Activity" RENAME CONSTRAINT "Activity_leadId_fkey" TO "Activity_accountId_fkey";
ALTER INDEX "Activity_leadId_occurredAt_idx" RENAME TO "Activity_accountId_occurredAt_idx";

ALTER TABLE "Task" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Task" RENAME CONSTRAINT "Task_leadId_fkey" TO "Task_accountId_fkey";

ALTER TABLE "Meeting" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Meeting" RENAME CONSTRAINT "Meeting_leadId_fkey" TO "Meeting_accountId_fkey";

ALTER TABLE "Proposal" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "Proposal" RENAME CONSTRAINT "Proposal_leadId_fkey" TO "Proposal_accountId_fkey";

ALTER TABLE "PortfolioSite" RENAME COLUMN "leadId" TO "accountId";
ALTER TABLE "PortfolioSite" RENAME CONSTRAINT "PortfolioSite_leadId_fkey" TO "PortfolioSite_accountId_fkey";

ALTER TABLE "Invoice" RENAME COLUMN "leadId" TO "accountId";

-- ---------------------------------------------------------------------------
-- 5. Contacts
-- ---------------------------------------------------------------------------

ALTER TABLE "Contact"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "seniority" "Seniority" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "phoneStatus" "PhoneStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "directPhone" TEXT,
  ADD COLUMN "mobilePhone" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "sourceProvider" TEXT,
  ADD COLUMN "sourceRef" TEXT,
  ADD COLUMN "sourcedAt" TIMESTAMP(3),
  ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoreBreakdown" JSONB,
  ADD COLUMN "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN "lastRepliedAt" TIMESTAMP(3),
  ADD COLUMN "lastCalledAt" TIMESTAMP(3),
  ADD COLUMN "callAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unsubscribedAt" TIMESTAMP(3),
  ADD COLUMN "suppressedAt" TIMESTAMP(3),
  ADD COLUMN "suppressReason" TEXT,
  ADD COLUMN "consentBasis" "ConsentBasis" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "consentNote" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Contact" c SET "clientId" = a."clientId", "source" = a."source", "sourcedAt" = c."createdAt"
FROM "Account" a WHERE a."id" = c."accountId";
ALTER TABLE "Contact" ALTER COLUMN "clientId" SET NOT NULL;

-- The old single "role" splits into seniority, decision-maker and department.
UPDATE "Contact" SET "seniority" = 'OWNER', "isDecisionMaker" = true WHERE "role"::text = 'OWNER';
UPDATE "Contact" SET "isDecisionMaker" = true WHERE "role"::text = 'DECISION_MAKER';
UPDATE "Contact" SET "department" = CASE "role"::text
    WHEN 'OPERATIONS' THEN 'Operations'
    WHEN 'FINANCE' THEN 'Finance'
    WHEN 'IT' THEN 'IT'
    WHEN 'OFFICE_MANAGER' THEN 'Administration'
  END
WHERE "role"::text IN ('OPERATIONS', 'FINANCE', 'IT', 'OFFICE_MANAGER');
ALTER TABLE "Contact" DROP COLUMN "role";
DROP TYPE "ContactRole";

-- Last contact time per person, from what was actually sent.
UPDATE "Contact" c SET "lastContactedAt" = m."lastSent"
FROM (SELECT "contactId", max("sentAt") AS "lastSent" FROM "Message"
      WHERE "direction" = 'OUTBOUND' AND "sentAt" IS NOT NULL GROUP BY "contactId") m
WHERE m."contactId" = c."id";

CREATE INDEX "Contact_clientId_score_idx" ON "Contact"("clientId", "score" DESC);
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Client offers, ICPs, proof points, playbooks
-- ---------------------------------------------------------------------------

CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "valueProposition" TEXT,
    "callToAction" TEXT NOT NULL DEFAULT 'A 15-minute call',
    "typicalDealValueCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Offer_clientId_isActive_idx" ON "Offer"("clientId", "isActive");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IdealCustomerProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employeeMin" INTEGER,
    "employeeMax" INTEGER,
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredAttributes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetSeniorities" "Seniority"[] DEFAULT ARRAY[]::"Seniority"[],
    "smallCompanyMaxEmployees" INTEGER,
    "smallCompanyTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSignals" "SignalType"[] DEFAULT ARRAY[]::"SignalType"[],
    "signalKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IdealCustomerProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IdealCustomerProfile_clientId_isActive_idx" ON "IdealCustomerProfile"("clientId", "isActive");
ALTER TABLE "IdealCustomerProfile" ADD CONSTRAINT "IdealCustomerProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdealCustomerProfile" ADD CONSTRAINT "IdealCustomerProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "IdealCustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProofPoint" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "kind" "ProofPointKind" NOT NULL DEFAULT 'CAPABILITY',
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "customerName" TEXT,
    "industry" TEXT,
    "sourceUrl" TEXT,
    "evidenceNote" TEXT,
    "approvedForOutreach" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProofPoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProofPoint_clientId_isActive_idx" ON "ProofPoint"("clientId", "isActive");
ALTER TABLE "ProofPoint" ADD CONSTRAINT "ProofPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofPoint" ADD CONSTRAINT "ProofPoint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The agency's own industry statements were exactly this: claims the sender
-- stands behind. They become proof points on the house client.
INSERT INTO "ProofPoint" ("id", "organizationId", "clientId", "kind", "title", "statement", "industry", "evidenceNote",
                          "approvedForOutreach", "approvedAt", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), i."organizationId", h."clientId", 'CAPABILITY', left(i."statement", 80), i."statement",
       i."industry", i."evidenceNote", i."isActive", CASE WHEN i."isActive" THEN i."createdAt" END, i."isActive",
       i."createdAt", i."updatedAt"
FROM "IndustryContext" i JOIN "_house" h ON h."organizationId" = i."organizationId";
DROP TABLE "IndustryContext";

CREATE TABLE "Playbook" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "industryFocus" TEXT,
    "targetAccountTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usefulSignals" "SignalType"[] DEFAULT ARRAY[]::"SignalType"[],
    "signalKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedClaimTypes" "ClaimType"[] DEFAULT ARRAY[]::"ClaimType"[],
    "messagingAngles" JSONB,
    "sequenceTemplate" JSONB,
    "callOpener" TEXT,
    "discoveryQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "objectionHandling" JSONB,
    "qualificationCriteria" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoApproveThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourcePlaybookId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Playbook_clientId_idx" ON "Playbook"("clientId");
CREATE UNIQUE INDEX "Playbook_organizationId_slug_key" ON "Playbook"("organizationId", "slug");
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Memberships
-- ---------------------------------------------------------------------------

ALTER TABLE "Membership"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Membership_clientId_idx" ON "Membership"("clientId");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Campaigns, enrollments, messages, research, activity
-- ---------------------------------------------------------------------------

ALTER TABLE "Campaign"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "icpId" UUID,
  ADD COLUMN "offerId" UUID,
  ADD COLUMN "playbookId" UUID,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'REVIEW_ALL',
  ADD COLUMN "autoApproveThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
  ADD COLUMN "approvedClaimTypes" "ClaimType"[] DEFAULT ARRAY[]::"ClaimType"[],
  ADD COLUMN "maxContactsPerAccount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "callFollowUp" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Campaign" c SET "clientId" = h."clientId" FROM "_house" h WHERE h."organizationId" = c."organizationId";
ALTER TABLE "Campaign" ALTER COLUMN "clientId" SET NOT NULL;
-- Every existing campaign required approval; they stay that way.
ALTER TABLE "Campaign" DROP COLUMN "requireApproval";
CREATE INDEX "Campaign_clientId_status_idx" ON "Campaign"("clientId", "status");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "IdealCustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "verificationStatus" "VerificationStatus",
  ADD COLUMN "verificationScore" DOUBLE PRECISION,
  ADD COLUMN "verificationSummary" JSONB,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "approvalSource" "ApprovalSource",
  ADD COLUMN "approvalPolicy" JSONB,
  ADD COLUMN "stepOrder" INTEGER,
  ADD COLUMN "angle" TEXT,
  ADD COLUMN "ctaType" TEXT,
  ADD COLUMN "variantKey" TEXT,
  ADD COLUMN "signalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "accountScoreAtSend" INTEGER,
  ADD COLUMN "contactScoreAtSend" INTEGER,
  ADD COLUMN "replyClass" "ReplyClass",
  ADD COLUMN "replyClassifiedAt" TIMESTAMP(3);
UPDATE "Message" m SET "clientId" = a."clientId" FROM "Account" a WHERE a."id" = m."accountId";
ALTER TABLE "Message" ALTER COLUMN "clientId" SET NOT NULL;
-- Everything approved so far was approved by a person.
UPDATE "Message" SET "approvalSource" = 'HUMAN' WHERE "approvedAt" IS NOT NULL;
UPDATE "Message" m SET "stepOrder" = s."order" FROM "CampaignStep" s WHERE s."id" = m."campaignStepId";
UPDATE "Message" SET "replyClass" = 'UNCLASSIFIED' WHERE "direction" = 'INBOUND';
CREATE INDEX "Message_clientId_direction_sentAt_idx" ON "Message"("clientId", "direction", "sentAt");
CREATE INDEX "Message_contactId_createdAt_idx" ON "Message"("contactId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Research"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "offerId" UUID,
  ADD COLUMN "facts" JSONB,
  ADD COLUMN "relevance" JSONB;
UPDATE "Research" r SET "clientId" = a."clientId" FROM "Account" a WHERE a."id" = r."accountId";
ALTER TABLE "Research" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Research" ADD CONSTRAINT "Research_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
UPDATE "Account" a SET "researchSummary" = r."companySummary" FROM "Research" r WHERE r."accountId" = a."id";

ALTER TABLE "Activity"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "contactId" UUID,
  ADD COLUMN "campaignId" UUID;
UPDATE "Activity" x SET "clientId" = a."clientId" FROM "Account" a WHERE a."id" = x."accountId";
ALTER TABLE "Activity" ALTER COLUMN "clientId" SET NOT NULL;
CREATE INDEX "Activity_contactId_occurredAt_idx" ON "Activity"("contactId", "occurredAt" DESC);
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. Signals and claim verification
-- ---------------------------------------------------------------------------

CREATE TABLE "Signal" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "SignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sourceUrl" TEXT,
    "sourceQuote" TEXT,
    "sourceTitle" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'RESEARCH',
    "provider" TEXT,
    "providerRecordId" UUID,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidenceStatus" "EvidenceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "metadata" JSONB,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" UUID,
    "dismissReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Signal_accountId_detectedAt_idx" ON "Signal"("accountId", "detectedAt" DESC);
CREATE INDEX "Signal_clientId_type_detectedAt_idx" ON "Signal"("clientId", "type", "detectedAt");
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessageClaim" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "kind" "ClaimKind" NOT NULL,
    "claimType" "ClaimType",
    "status" "ClaimStatus" NOT NULL,
    "supportScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedType" BOOLEAN NOT NULL DEFAULT false,
    "factId" TEXT,
    "signalId" UUID,
    "proofPointId" UUID,
    "sourceUrl" TEXT,
    "sourceQuote" TEXT,
    "evidenceDate" TIMESTAMP(3),
    "freshnessDays" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageClaim_messageId_idx" ON "MessageClaim"("messageId");
CREATE INDEX "MessageClaim_organizationId_claimType_status_idx" ON "MessageClaim"("organizationId", "claimType", "status");
ALTER TABLE "MessageClaim" ADD CONSTRAINT "MessageClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageClaim" ADD CONSTRAINT "MessageClaim_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageClaim" ADD CONSTRAINT "MessageClaim_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 10. Suppression: channel, client scope, source
-- ---------------------------------------------------------------------------

DROP INDEX "Suppression_organizationId_scope_value_key";
ALTER TABLE "Suppression"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "channel" "SuppressionChannel" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "source" "SuppressionSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "contactId" UUID,
  ADD COLUMN "campaignId" UUID,
  ADD COLUMN "createdById" UUID;
-- Opt-outs, bounces and complaints are facts about an email address. They
-- block email for every client; they do not, on their own, block a call.
UPDATE "Suppression" SET "channel" = 'EMAIL', "source" = CASE "reason"::text
    WHEN 'UNSUBSCRIBE' THEN 'UNSUBSCRIBE_LINK'
    WHEN 'HARD_BOUNCE' THEN 'BOUNCE_WEBHOOK'
    ELSE 'COMPLAINT_WEBHOOK'
  END::"SuppressionSource"
WHERE "reason"::text IN ('UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_COMPLAINT');
CREATE INDEX "Suppression_organizationId_scope_value_idx" ON "Suppression"("organizationId", "scope", "value");
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mirror existing email suppressions onto the contacts they cover.
UPDATE "Contact" c SET "doNotEmail" = true,
       "doNotCall" = (s."channel" = 'ALL'),
       "suppressedAt" = s."createdAt",
       "suppressReason" = s."reason"::text,
       "unsubscribedAt" = CASE WHEN s."reason"::text = 'UNSUBSCRIBE' THEN s."createdAt" END
FROM "Suppression" s
WHERE s."organizationId" = c."organizationId"
  AND c."email" IS NOT NULL
  AND ((s."scope" = 'EMAIL' AND s."value" = lower(c."email"))
    OR (s."scope" = 'DOMAIN' AND lower(c."email") LIKE '%@' || s."value"));

-- ---------------------------------------------------------------------------
-- 11. Meetings
-- ---------------------------------------------------------------------------

ALTER TABLE "Meeting"
  ADD COLUMN "clientId" UUID,
  ADD COLUMN "contactId" UUID,
  ADD COLUMN "campaignId" UUID,
  ADD COLUMN "callId" UUID,
  ADD COLUMN "bookedById" UUID,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "meetingUrl" TEXT,
  ADD COLUMN "source" "MeetingSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "status" "MeetingStatus" NOT NULL DEFAULT 'BOOKED',
  ADD COLUMN "qualificationNotes" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "estimatedValueCents" INTEGER,
  ADD COLUMN "actualValueCents" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CAD',
  ADD COLUMN "outcomeRecordedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Meeting" m SET "clientId" = a."clientId" FROM "Account" a WHERE a."id" = m."accountId";
ALTER TABLE "Meeting" ALTER COLUMN "clientId" SET NOT NULL;
UPDATE "Meeting" SET "status" = 'NO_SHOW' WHERE "noShow";
UPDATE "Meeting" SET "notes" = "outcome";
ALTER TABLE "Meeting" DROP COLUMN "noShow";
ALTER TABLE "Meeting" DROP COLUMN "outcome";
ALTER TABLE "Meeting" ADD COLUMN "outcome" "MeetingOutcome" NOT NULL DEFAULT 'PENDING';
CREATE INDEX "Meeting_clientId_startsAt_idx" ON "Meeting"("clientId", "startsAt");
CREATE UNIQUE INDEX "Meeting_callId_key" ON "Meeting"("callId");
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 12. Calls and the call queue
-- ---------------------------------------------------------------------------

CREATE TABLE "Call" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "contactId" UUID,
    "campaignId" UUID,
    "callTaskId" UUID,
    "callerId" UUID,
    "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND',
    "phoneNumber" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "outcome" "CallOutcome" NOT NULL,
    "objections" "ObjectionType"[] DEFAULT ARRAY[]::"ObjectionType"[],
    "objectionNote" TEXT,
    "notes" TEXT,
    "callbackAt" TIMESTAMP(3),
    "referredTo" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerCallId" TEXT,
    "recordingUrl" TEXT,
    "queuePriorityAtCall" INTEGER,
    "queueReasonsAtCall" JSONB,
    "accountScoreAtCall" INTEGER,
    "contactScoreAtCall" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Call_organizationId_clientId_startedAt_idx" ON "Call"("organizationId", "clientId", "startedAt");
CREATE INDEX "Call_contactId_startedAt_idx" ON "Call"("contactId", "startedAt");
CREATE INDEX "Call_callerId_startedAt_idx" ON "Call"("callerId", "startedAt");
ALTER TABLE "Call" ADD CONSTRAINT "Call_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CallTask" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "campaignId" UUID,
    "assigneeId" UUID,
    "status" "CallTaskStatus" NOT NULL DEFAULT 'OPEN',
    "category" "CallTaskCategory" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastOutcome" "CallOutcome",
    "completedAt" TIMESTAMP(3),
    "completedReason" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallTask_contactId_key" ON "CallTask"("contactId");
CREATE INDEX "CallTask_organizationId_clientId_status_priority_idx" ON "CallTask"("organizationId", "clientId", "status", "priority" DESC);
CREATE INDEX "CallTask_assigneeId_status_idx" ON "CallTask"("assigneeId", "status");
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 13. Connectors, provenance, jobs, usage
-- ---------------------------------------------------------------------------

CREATE TABLE "ProviderRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "ProviderRecordStatus" NOT NULL,
    "request" JSONB,
    "response" JSONB,
    "normalized" JSONB,
    "confidence" DOUBLE PRECISION,
    "costMillicents" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "accountId" UUID,
    "contactId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ProviderRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProviderRecord_organizationId_provider_operation_lookupKey__idx" ON "ProviderRecord"("organizationId", "provider", "operation", "lookupKey", "requestedAt" DESC);
ALTER TABLE "ProviderRecord" ADD CONSTRAINT "ProviderRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DataProvenance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "accountId" UUID,
    "contactId" UUID,
    "field" TEXT NOT NULL,
    "value" TEXT,
    "source" "DataSource" NOT NULL,
    "provider" TEXT,
    "providerRecordId" UUID,
    "sourceUrl" TEXT,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    CONSTRAINT "DataProvenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataProvenance_accountId_field_idx" ON "DataProvenance"("accountId", "field");
CREATE INDEX "DataProvenance_contactId_field_idx" ON "DataProvenance"("contactId", "field");
ALTER TABLE "DataProvenance" ADD CONSTRAINT "DataProvenance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataProvenance" ADD CONSTRAINT "DataProvenance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataProvenance" ADD CONSTRAINT "DataProvenance_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed provenance for what already exists, honestly labelled by its source.
INSERT INTO "DataProvenance" ("id", "organizationId", "contactId", "field", "value", "source", "sourceUrl", "status", "retrievedAt")
SELECT gen_random_uuid(), c."organizationId", c."id", 'email', c."email", c."source", c."sourceUrl",
       CASE c."emailVerification"::text WHEN 'VALID' THEN 'VERIFIED' WHEN 'INVALID' THEN 'REJECTED' ELSE 'UNVERIFIED' END::"EvidenceStatus",
       c."createdAt"
FROM "Contact" c WHERE c."email" IS NOT NULL;

CREATE TABLE "ConnectorSetting" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "settings" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectorSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConnectorSetting_organizationId_provider_key" ON "ConnectorSetting"("organizationId", "provider");
ALTER TABLE "ConnectorSetting" ADD CONSTRAINT "ConnectorSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "clientId" UUID,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");
CREATE INDEX "Job_organizationId_type_createdAt_idx" ON "Job"("organizationId", "type", "createdAt");
CREATE INDEX "Job_dedupeKey_idx" ON "Job"("dedupeKey");
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UsageRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clientId" UUID,
    "campaignId" UUID,
    "accountId" UUID,
    "contactId" UUID,
    "provider" TEXT NOT NULL,
    "type" "UsageType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costMillicents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "aiRunId" UUID,
    "providerRecordId" UUID,
    "messageId" UUID,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageRecord_organizationId_occurredAt_idx" ON "UsageRecord"("organizationId", "occurredAt");
CREATE INDEX "UsageRecord_clientId_occurredAt_idx" ON "UsageRecord"("clientId", "occurredAt");
CREATE INDEX "UsageRecord_provider_occurredAt_idx" ON "UsageRecord"("provider", "occurredAt");
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing AI spend becomes usage, attributed to the house client where the
-- run was about an account.
INSERT INTO "UsageRecord" ("id", "organizationId", "clientId", "accountId", "provider", "type", "quantity", "costMillicents", "aiRunId", "metadata", "occurredAt")
SELECT gen_random_uuid(), r."organizationId", a."clientId", a."id", r."provider",
       CASE r."kind" WHEN 'research' THEN 'AI_RESEARCH' WHEN 'personalize' THEN 'AI_PERSONALIZATION' ELSE 'AI_OTHER' END::"UsageType",
       1, r."costCents" * 1000, r."id",
       jsonb_build_object('model', r."model", 'tokensIn', r."tokensIn", 'tokensOut', r."tokensOut", 'backfilled', true),
       r."createdAt"
FROM "AiRun" r LEFT JOIN "Account" a ON a."id" = r."entityId"
WHERE r."costCents" > 0;

DROP TABLE "_house";

-- ---------------------------------------------------------------------------
-- 14. Row-level security
-- ---------------------------------------------------------------------------
-- Enabled with no policies: Supabase's Data API roles (anon, authenticated)
-- can read nothing. The application connects as the table owner (or a role
-- with BYPASSRLS), which RLS does not restrict without FORCE. Tenant
-- isolation for the application itself is enforced in src/server/access.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
