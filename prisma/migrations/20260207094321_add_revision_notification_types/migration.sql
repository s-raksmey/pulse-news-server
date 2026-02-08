-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REVISION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVISION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'REVISION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVISION_CONSUMED';

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_toUserId_fkey";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
