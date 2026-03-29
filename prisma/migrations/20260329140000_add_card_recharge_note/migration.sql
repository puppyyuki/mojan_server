-- AlterTable
ALTER TABLE "card_recharge_records" ADD COLUMN "note" TEXT;

-- CreateIndex
CREATE INDEX "card_recharge_records_createdAt_idx" ON "card_recharge_records"("createdAt");
