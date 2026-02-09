-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "broker" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "symbol" TEXT,
    "ts" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last" DECIMAL(65,30),
    "bid" DECIMAL(65,30),
    "ask" DECIMAL(65,30),
    "volume" DECIMAL(65,30),
    "raw" JSONB,

    CONSTRAINT "MarketQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketQuote_broker_instrumentId_receivedAt_idx" ON "MarketQuote"("broker", "instrumentId", "receivedAt");

-- CreateIndex
CREATE INDEX "MarketQuote_symbol_receivedAt_idx" ON "MarketQuote"("symbol", "receivedAt");

-- CreateIndex
CREATE INDEX "MarketQuote_receivedAt_idx" ON "MarketQuote"("receivedAt");
