-- CreateEnum
CREATE TYPE "StrategySignalStatus" AS ENUM ('DETECTED', 'BLOCKED', 'TAKEN');

-- CreateEnum
CREATE TYPE "StrategyBlockReason" AS ENUM ('IN_TRADE', 'PAUSED', 'KILL_SWITCH', 'NOT_LIVE_CANDLE', 'INVALID_BRACKET', 'EXECUTION_FAILED');

-- CreateTable
CREATE TABLE "StrategySignal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "brokerName" TEXT,
    "symbol" TEXT NOT NULL,
    "contractId" TEXT,
    "side" "OrderSide" NOT NULL,
    "entryTime" INTEGER NOT NULL,
    "fvgTime" INTEGER NOT NULL,
    "entryPrice" DECIMAL(65,30),
    "stopPrice" DECIMAL(65,30),
    "takeProfitPrice" DECIMAL(65,30),
    "stopTicks" DECIMAL(65,30),
    "tpTicks" DECIMAL(65,30),
    "rr" DECIMAL(65,30),
    "contracts" INTEGER,
    "riskUsdPlanned" DECIMAL(65,30),
    "status" "StrategySignalStatus" NOT NULL DEFAULT 'DETECTED',
    "blockReason" "StrategyBlockReason",
    "execKey" TEXT,
    "executionId" TEXT,
    "meta" JSONB,
    "signalKey" TEXT NOT NULL,

    CONSTRAINT "StrategySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategySignal_signalKey_key" ON "StrategySignal"("signalKey");

-- CreateIndex
CREATE INDEX "StrategySignal_userId_createdAt_idx" ON "StrategySignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategySignal_userId_strategy_createdAt_idx" ON "StrategySignal"("userId", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "StrategySignal_symbol_entryTime_idx" ON "StrategySignal"("symbol", "entryTime");

-- CreateIndex
CREATE INDEX "StrategySignal_executionId_idx" ON "StrategySignal"("executionId");
