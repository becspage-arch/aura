-- CreateTable
CREATE TABLE "Candle3m" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candle3m_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candle3m_symbol_time_idx" ON "Candle3m"("symbol", "time");

-- CreateIndex
CREATE UNIQUE INDEX "Candle3m_symbol_time_key" ON "Candle3m"("symbol", "time");
