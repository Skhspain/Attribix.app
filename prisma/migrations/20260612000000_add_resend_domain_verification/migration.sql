-- Add Resend domain verification fields to NewsletterSettings
ALTER TABLE "NewsletterSettings" ADD COLUMN IF NOT EXISTS "resendDomainId" TEXT;
ALTER TABLE "NewsletterSettings" ADD COLUMN IF NOT EXISTS "resendDomainStatus" TEXT;
ALTER TABLE "NewsletterSettings" ADD COLUMN IF NOT EXISTS "resendDomainRecords" JSONB;
