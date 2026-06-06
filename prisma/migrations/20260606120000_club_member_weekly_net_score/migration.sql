-- 俱樂部成員當週淨分（分數上限 enforcement 用）
ALTER TABLE "club_members" ADD COLUMN "weeklyNetScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "club_members" ADD COLUMN "weeklyScoreWeekKey" TEXT;
