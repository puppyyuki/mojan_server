-- Add independent branch-mode agent room-card fee values.
ALTER TABLE "agent_club_bindings"
ADD COLUMN "branchAgentRoomCardFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
