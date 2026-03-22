-- AlterTable
ALTER TABLE "v2_match_rounds" ADD COLUMN "shareCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "v2_match_rounds_shareCode_key" ON "v2_match_rounds"("shareCode");
