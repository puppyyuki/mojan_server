-- CreateEnum
CREATE TYPE "ClubInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "club_invitations" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "inviterPlayerId" TEXT NOT NULL,
    "inviteePlayerId" TEXT NOT NULL,
    "status" "ClubInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_invitations_inviteePlayerId_status_idx" ON "club_invitations"("inviteePlayerId", "status");

-- CreateIndex
CREATE INDEX "club_invitations_clubId_inviterPlayerId_idx" ON "club_invitations"("clubId", "inviterPlayerId");

-- AddForeignKey
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_inviterPlayerId_fkey" FOREIGN KEY ("inviterPlayerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_inviteePlayerId_fkey" FOREIGN KEY ("inviteePlayerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
