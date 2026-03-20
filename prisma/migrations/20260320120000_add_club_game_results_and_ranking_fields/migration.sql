-- AlterTable
ALTER TABLE "club_members"
ADD COLUMN "bigWinnerCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "roomCardConsumed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "club_game_results" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomInternalId" TEXT,
    "multiplayerVersion" "MultiplayerVersion" NOT NULL DEFAULT 'V2',
    "totalRounds" INTEGER NOT NULL DEFAULT 1,
    "deduction" TEXT NOT NULL DEFAULT 'AA_DEDUCTION',
    "roomCardConsumedTotal" INTEGER NOT NULL DEFAULT 0,
    "bigWinnerPlayerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoresBySeat" JSONB,
    "players" JSONB,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_game_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_game_results_roomId_key" ON "club_game_results"("roomId");

-- CreateIndex
CREATE INDEX "club_game_results_clubId_endedAt_idx" ON "club_game_results"("clubId", "endedAt");

-- AddForeignKey
ALTER TABLE "club_game_results"
ADD CONSTRAINT "club_game_results_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "clubs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
