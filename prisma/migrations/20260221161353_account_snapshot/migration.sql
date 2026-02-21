-- AlterTable
ALTER TABLE "BrokerAccount" ALTER COLUMN "lastHeartbeatAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "brokerAccountId" TEXT NOT NULL,
    "equityUsd" DECIMAL(65,30),
    "balanceUsd" DECIMAL(65,30),
    "availableUsd" DECIMAL(65,30),
    "unrealizedPnlUsd" DECIMAL(65,30),
    "marginUsedUsd" DECIMAL(65,30),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountSnapshot_brokerAccountId_ts_idx" ON "AccountSnapshot"("brokerAccountId", "ts");

-- CreateIndex
CREATE INDEX "AccountSnapshot_ts_idx" ON "AccountSnapshot"("ts");

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
