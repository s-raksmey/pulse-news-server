-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "isAdminCreated" BOOLEAN NOT NULL DEFAULT false;

-- Mark all existing topics as NOT admin-created by default
-- This will hide them from dropdowns until they are explicitly approved
UPDATE "Topic" SET "isAdminCreated" = false;

-- If you want to mark specific legitimate topics as admin-created, 
-- you can run additional UPDATE statements here, for example:
-- UPDATE "Topic" SET "isAdminCreated" = true WHERE "slug" IN ('legitimate-topic-1', 'legitimate-topic-2');

