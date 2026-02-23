-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "brokerAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Execution_brokerAccountId_createdAt_idx" ON "Execution"("brokerAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
