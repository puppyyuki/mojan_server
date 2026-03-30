-- Add per-agent club creation quota with default 1
ALTER TABLE "agent_applications"
ADD COLUMN "maxClubCreateCount" INTEGER NOT NULL DEFAULT 1;
