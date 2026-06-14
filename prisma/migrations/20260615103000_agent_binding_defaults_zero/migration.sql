-- 新增代理綁定未指定時，代理房卡與代理%數預設為 0
ALTER TABLE "agent_club_bindings" ALTER COLUMN "agentRoomCardFee" SET DEFAULT 0;
ALTER TABLE "agent_club_bindings" ALTER COLUMN "agentPercentage" SET DEFAULT 0;
