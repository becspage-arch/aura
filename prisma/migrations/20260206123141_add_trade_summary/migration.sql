-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clerkUserId" TEXT NOT NULL,
    "execKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "contractId" TEXT,
    "side" "OrderSide" NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER,
    "plannedStopTicks" INTEGER,
    "plannedTakeProfitTicks" INTEGER,
    "plannedRiskUsd" DECIMAL(65,30),
    "plannedRR" DECIMAL(65,30),
    "entryPriceAvg" DECIMAL(65,30) NOT NULL,
    "exitPriceAvg" DECIMAL(65,30) NOT NULL,
    "realizedPnlTicks" INTEGER NOT NULL,
    "realizedPnlUsd" DECIMAL(65,30) NOT NULL,
    "rrAchieved" DECIMAL(65,30),
    "exitReason" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_execKey_key" ON "Trade"("execKey");

-- CreateIndex
CREATE INDEX "Trade_clerkUserId_closedAt_idx" ON "Trade"("clerkUserId", "closedAt");

-- CreateIndex
CREATE INDEX "Trade_clerkUserId_openedAt_idx" ON "Trade"("clerkUserId", "openedAt");
