-- AlterTable
ALTER TABLE "UserProfile" ALTER COLUMN "clerkUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserTradingState" ADD COLUMN     "isKillSwitched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "killSwitchedAt" TIMESTAMP(3);
