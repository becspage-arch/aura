-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('INTENT_CREATED', 'ORDER_SUBMITTED', 'ORDER_ACCEPTED', 'ORDER_FILLED', 'BRACKET_SUBMITTED', 'BRACKET_ACTIVE', 'POSITION_OPEN', 'POSITION_CLOSED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "symbol" TEXT,
    "execKey" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "entryType" TEXT NOT NULL,
    "stopLossTicks" INTEGER,
    "takeProfitTicks" INTEGER,
    "customTag" TEXT,
    "entryOrderId" TEXT,
    "stopOrderId" TEXT,
    "tpOrderId" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'INTENT_CREATED',
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Execution_execKey_key" ON "Execution"("execKey");

-- CreateIndex
CREATE INDEX "Execution_userId_createdAt_idx" ON "Execution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_brokerName_createdAt_idx" ON "Execution"("brokerName", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_contractId_createdAt_idx" ON "Execution"("contractId", "createdAt");
