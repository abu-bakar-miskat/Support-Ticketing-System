-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_commentId_fkey";

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "preferences" DROP NOT NULL;
