-- AlterTable
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "appleUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "players_appleUserId_key" ON "players"("appleUserId");
