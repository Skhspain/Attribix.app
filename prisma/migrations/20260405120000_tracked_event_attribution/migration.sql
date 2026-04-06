-- AlterTable
ALTER TABLE "TrackedEvent"
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "revenue" DOUBLE PRECISION,
  ADD COLUMN "currency" TEXT;

-- CreateIndex
CREATE INDEX "TrackedEvent_accountId_idx" ON "TrackedEvent"("accountId");

-- CreateIndex
CREATE INDEX "TrackedEvent_orderId_idx" ON "TrackedEvent"("orderId");
