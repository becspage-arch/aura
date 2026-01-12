-- CreateTable
CREATE TABLE "Candle15s" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,
    "volume" DECIMAL(65,30),

    CONSTRAINT "Candle15s_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candle15s_symbol_time_idx" ON "Candle15s"("symbol", "time");

-- CreateIndex
CREATE UNIQUE INDEX "Candle15s_symbol_time_key" ON "Candle15s"("symbol", "time");
