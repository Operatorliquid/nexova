-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "pendingSlotExpiresAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "pendingSlotHumanLabel" TEXT;
ALTER TABLE "Patient" ADD COLUMN "pendingSlotISO" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "pendingSlotReason" TEXT;
