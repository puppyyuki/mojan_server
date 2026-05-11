-- 後台報表「場抽」：每俱樂部可設定百分比（欄位存 5 表示 5%）
ALTER TABLE "clubs" ADD COLUMN "venueDrawPercent" DOUBLE PRECISION NOT NULL DEFAULT 5;
