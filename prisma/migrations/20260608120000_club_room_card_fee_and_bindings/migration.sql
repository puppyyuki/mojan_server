-- AlterTable
ALTER TABLE "clubs" ADD COLUMN "roomCardFee" DOUBLE PRECISION NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "agent_club_bindings" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "upstreamAgentPlayerId" TEXT,
    "agentLevel" TEXT NOT NULL DEFAULT 'agent',
    "agentRoomCardFee" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_club_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_club_upstream_bindings" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "upstreamAgentPlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_club_upstream_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_club_bindings_playerId_clubId_key" ON "agent_club_bindings"("playerId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "player_club_upstream_bindings_playerId_clubId_key" ON "player_club_upstream_bindings"("playerId", "clubId");

-- AddForeignKey
ALTER TABLE "agent_club_bindings" ADD CONSTRAINT "agent_club_bindings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_club_bindings" ADD CONSTRAINT "agent_club_bindings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_club_bindings" ADD CONSTRAINT "agent_club_bindings_upstreamAgentPlayerId_fkey" FOREIGN KEY ("upstreamAgentPlayerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_club_upstream_bindings" ADD CONSTRAINT "player_club_upstream_bindings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_club_upstream_bindings" ADD CONSTRAINT "player_club_upstream_bindings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_club_upstream_bindings" ADD CONSTRAINT "player_club_upstream_bindings_upstreamAgentPlayerId_fkey" FOREIGN KEY ("upstreamAgentPlayerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
