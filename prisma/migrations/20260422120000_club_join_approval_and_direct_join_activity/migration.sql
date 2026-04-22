-- AlterTable
ALTER TABLE "clubs" ADD COLUMN "joinRequiresOwnerApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
ALTER TYPE "ClubActivityType" ADD VALUE 'MEMBER_JOINED_DIRECT';
