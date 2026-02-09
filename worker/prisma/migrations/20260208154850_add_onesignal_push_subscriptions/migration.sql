-- CreateTable
CREATE TABLE "OneSignalPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneSignalPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OneSignalPushSubscription_subscriptionId_key" ON "OneSignalPushSubscription"("subscriptionId");

-- CreateIndex
CREATE INDEX "OneSignalPushSubscription_userId_idx" ON "OneSignalPushSubscription"("userId");
