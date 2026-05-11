-- 後台報表「自摸抽」：自摸局該家當局贏分 × 此百分比
ALTER TABLE "clubs" ADD COLUMN "selfDrawRakePercent" DOUBLE PRECISION NOT NULL DEFAULT 8;
