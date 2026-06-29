-- Add branch room-card fee support for club management.
ALTER TABLE "clubs"
ADD COLUMN "branchRoomCardEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "club_room_card_branch_fees" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "masterAgentPlayerId" TEXT NOT NULL,
    "branchRoomCardFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_room_card_branch_fees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "club_room_card_branch_fees_clubId_masterAgentPlayerId_key"
ON "club_room_card_branch_fees"("clubId", "masterAgentPlayerId");

CREATE INDEX "club_room_card_branch_fees_masterAgentPlayerId_idx"
ON "club_room_card_branch_fees"("masterAgentPlayerId");

ALTER TABLE "club_room_card_branch_fees"
ADD CONSTRAINT "club_room_card_branch_fees_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_room_card_branch_fees"
ADD CONSTRAINT "club_room_card_branch_fees_masterAgentPlayerId_fkey"
FOREIGN KEY ("masterAgentPlayerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
