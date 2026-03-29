-- CreateTable
CREATE TABLE "club_admin_card_recharge_records" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "previousCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_admin_card_recharge_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_admin_card_recharge_records_createdAt_idx" ON "club_admin_card_recharge_records"("createdAt");

-- AddForeignKey
ALTER TABLE "club_admin_card_recharge_records" ADD CONSTRAINT "club_admin_card_recharge_records_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_admin_card_recharge_records" ADD CONSTRAINT "club_admin_card_recharge_records_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
