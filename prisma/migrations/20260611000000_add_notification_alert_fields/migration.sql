-- Add onboardingCompletedAt (missed in earlier postgres sync)
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP;

-- Notification settings
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "storeCurrency" TEXT;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "weeklyDigest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "alertLowRoas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "alertRoasThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "alertNewOrders" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "alertSpendDrop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "alertSpendDropPct" DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "TrackingSettings" ADD COLUMN IF NOT EXISTS "lastAlertSentAt" TIMESTAMP;
