/*
  Warnings:

  - Added the required column `brokerAccountId` to the `StrategySignal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brokerAccountId` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "StrategySignal_userId_createdAt_idx";

-- DropIndex
DROP INDEX "StrategySignal_userId_strategy_createdAt_idx";

-- DropIndex
DROP INDEX "Trade_clerkUserId_closedAt_idx";

-- DropIndex
DROP INDEX "Trade_clerkUserId_openedAt_idx";

-- AlterTable
ALTER TABLE "StrategySignal" ADD COLUMN     "brokerAccountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "brokerAccountId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "StrategySignal_brokerAccountId_createdAt_idx" ON "StrategySignal"("brokerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategySignal_brokerAccountId_strategy_createdAt_idx" ON "StrategySignal"("brokerAccountId", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_brokerAccountId_closedAt_idx" ON "Trade"("brokerAccountId", "closedAt");

-- CreateIndex
CREATE INDEX "Trade_brokerAccountId_openedAt_idx" ON "Trade"("brokerAccountId", "openedAt");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySignal" ADD CONSTRAINT "StrategySignal_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
