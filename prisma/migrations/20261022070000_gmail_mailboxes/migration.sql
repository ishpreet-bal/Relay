-- AlterTable
ALTER TABLE "Mailbox" ADD COLUMN     "oauthConnectedAt" TIMESTAMP(3),
ADD COLUMN     "oauthEmail" TEXT,
ADD COLUMN     "oauthError" TEXT,
ADD COLUMN     "oauthRefreshTokenEnc" TEXT,
ADD COLUMN     "oauthScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
