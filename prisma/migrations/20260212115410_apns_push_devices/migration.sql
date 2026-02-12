/*
  Warnings:

  - A unique constraint covering the columns `[onesignalId]` on the table `OneSignalPushSubscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "OneSignalPushSubscription" ADD COLUMN     "onesignalId" TEXT;

-- CreateTable
CREATE TABLE "ApnsPushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "deviceName" TEXT,

    CONSTRAINT "ApnsPushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApnsPushDevice_deviceToken_key" ON "ApnsPushDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "ApnsPushDevice_userId_idx" ON "ApnsPushDevice"("userId");

-- CreateIndex
CREATE INDEX "ApnsPushDevice_environment_idx" ON "ApnsPushDevice"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "OneSignalPushSubscription_onesignalId_key" ON "OneSignalPushSubscription"("onesignalId");
