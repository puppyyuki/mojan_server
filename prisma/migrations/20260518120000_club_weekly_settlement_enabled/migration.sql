-- App 排行榜「週結」：積分扣除與後台報表「自摸抽」相同規則（含俱樂部自摸抽％）
ALTER TABLE "clubs" ADD COLUMN "weeklySettlementEnabled" BOOLEAN NOT NULL DEFAULT false;
