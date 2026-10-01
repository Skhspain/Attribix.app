-- Store the verified sending domain so senders on other domains aren't used as From
ALTER TABLE "NewsletterSettings" ADD COLUMN "resendDomainName" TEXT;
