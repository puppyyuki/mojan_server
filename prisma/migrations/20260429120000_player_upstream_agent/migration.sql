-- AlterTable
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "upstreamAgentPlayerId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_upstreamAgentPlayerId_fkey'
  ) THEN
    ALTER TABLE "players" ADD CONSTRAINT "players_upstreamAgentPlayerId_fkey"
      FOREIGN KEY ("upstreamAgentPlayerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
