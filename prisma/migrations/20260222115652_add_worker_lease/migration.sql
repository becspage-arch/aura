-- CreateEnum
CREATE TYPE "WorkerLeaseStatus" AS ENUM ('RUNNING', 'STOPPED', 'ERROR');

-- CreateTable
CREATE TABLE "WorkerLease" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "WorkerLeaseStatus" NOT NULL DEFAULT 'RUNNING',
    "workerName" TEXT,
    "workerEnv" TEXT,
    "meta" JSONB,

    CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLease_brokerAccountId_key" ON "WorkerLease"("brokerAccountId");

-- CreateIndex
CREATE INDEX "WorkerLease_status_lastSeenAt_idx" ON "WorkerLease"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "WorkerLease_instanceId_idx" ON "WorkerLease"("instanceId");

-- AddForeignKey
ALTER TABLE "WorkerLease" ADD CONSTRAINT "WorkerLease_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
