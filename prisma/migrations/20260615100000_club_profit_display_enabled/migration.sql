-- App 俱樂部代理成員列表「自摸抽」欄位顯示開關，既有俱樂部預設開啟
ALTER TABLE "clubs" ADD COLUMN "profitDisplayEnabled" BOOLEAN NOT NULL DEFAULT true;
