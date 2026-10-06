-- Repair: unsubscribe links previously parsed the signed token by splitting on
-- every '.', so an opt-out for "jane.doe@acme.com" was recorded as "jane".
-- The token rows themselves always stored the full address, so every used
-- token is re-applied here as a correct suppression. Truncated rows are left
-- in place (they are harmless and part of the audit trail).
INSERT INTO "Suppression" ("id", "organizationId", "scope", "value", "reason", "note", "createdAt")
SELECT gen_random_uuid(), t."organizationId", 'EMAIL', lower(trim(t."email")), 'UNSUBSCRIBE',
       'Repaired: the unsubscribe link previously recorded a truncated address',
       t."usedAt"
FROM "UnsubscribeToken" t
WHERE t."usedAt" IS NOT NULL
ON CONFLICT ("organizationId", "scope", "value") DO NOTHING;

-- Anything still queued for a repaired address must not go out.
UPDATE "Message" m
SET "status" = 'CANCELLED', "failureReason" = 'Suppressed: UNSUBSCRIBE (repaired)'
FROM "Contact" c, "Suppression" s
WHERE m."contactId" = c."id"
  AND s."organizationId" = c."organizationId"
  AND s."scope" = 'EMAIL'
  AND s."value" = lower(c."email")
  AND s."reason" = 'UNSUBSCRIBE'
  AND m."status" IN ('GENERATING', 'DRAFT', 'NEEDS_EDIT', 'APPROVED', 'SCHEDULED');
