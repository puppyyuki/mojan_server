-- CreateTable
CREATE TABLE "club_card_replenish_records" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actorPlayerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "playerPreviousCount" INTEGER NOT NULL,
    "playerNewCount" INTEGER NOT NULL,
    "clubPreviousCount" INTEGER NOT NULL,
    "clubNewCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_card_replenish_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "club_card_replenish_records" ADD CONSTRAINT "club_card_replenish_records_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_card_replenish_records" ADD CONSTRAINT "club_card_replenish_records_actorPlayerId_fkey" FOREIGN KEY ("actorPlayerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
