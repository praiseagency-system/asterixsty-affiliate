-- Pre-migration: fix licenseKey column before prisma db push
-- Existing rows have licenseKey = '' which violates UNIQUE when made nullable.
-- Steps: drop constraint → remove NOT NULL + DEFAULT → clear '' → prisma re-adds UNIQUE.

ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_licenseKey_key";
ALTER TABLE "Workspace" ALTER COLUMN "licenseKey" DROP NOT NULL;
ALTER TABLE "Workspace" ALTER COLUMN "licenseKey" DROP DEFAULT;
UPDATE "Workspace" SET "licenseKey" = NULL WHERE "licenseKey" = '';
