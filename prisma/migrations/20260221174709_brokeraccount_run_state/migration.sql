-- AlterTable
ALTER TABLE "BrokerAccount" ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isKillSwitched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "killSwitchedAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3);
