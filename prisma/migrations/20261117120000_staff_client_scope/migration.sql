-- Operators, analysts and callers can be limited to chosen clients. Empty means every client.
ALTER TABLE "Membership" ADD COLUMN "clientIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
