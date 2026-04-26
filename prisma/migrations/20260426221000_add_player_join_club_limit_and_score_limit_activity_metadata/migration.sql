-- 玩家可加入俱樂部上限（可由後台調整）
ALTER TABLE "players"
ADD COLUMN "maxJoinClubCount" INTEGER NOT NULL DEFAULT 3;

-- 俱樂部動態：分數上限設定／累加
ALTER TYPE "ClubActivityType" ADD VALUE 'SCORE_LIMIT_SET';
ALTER TYPE "ClubActivityType" ADD VALUE 'SCORE_LIMIT_INCREASED';

-- 俱樂部動態擴充欄位（記錄分數上限值等）
ALTER TABLE "club_activities"
ADD COLUMN "metadata" JSONB;
