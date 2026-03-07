-- CreateEnum
CREATE TYPE "BrokerAccountType" AS ENUM ('LIVE', 'DEMO');

-- AlterTable
ALTER TABLE "BrokerAccount" ADD COLUMN     "brokerAccountType" "BrokerAccountType" NOT NULL DEFAULT 'LIVE';
