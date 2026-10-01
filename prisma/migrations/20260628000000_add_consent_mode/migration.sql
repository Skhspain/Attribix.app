-- AlterTable
ALTER TABLE "TrackingSettings" ADD COLUMN "consentModeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingSettings" ADD COLUMN "consentModeDefault" TEXT NOT NULL DEFAULT 'denied';
