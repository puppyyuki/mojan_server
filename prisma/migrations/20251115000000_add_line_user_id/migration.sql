-- AlterTable
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "players_lineUserId_key" ON "players"("lineUserId");

