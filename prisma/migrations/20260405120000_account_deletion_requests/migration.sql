-- CreateEnum
CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('PENDING', 'REVOKED');

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "submittedNickname" TEXT NOT NULL,
    "submittedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDeletionAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_requests_playerId_idx" ON "account_deletion_requests"("playerId");

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests"("status");

-- CreateIndex
CREATE INDEX "account_deletion_requests_createdAt_idx" ON "account_deletion_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
