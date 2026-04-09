-- AlterTable
ALTER TABLE "MetaConnection" ADD COLUMN "lastSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "city" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "country" TEXT;

-- CreateTable
CREATE TABLE "MetaAdDailyInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "adSetId" TEXT NOT NULL,
    "adSetName" TEXT,
    "adId" TEXT NOT NULL,
    "adName" TEXT,
    "spend" REAL NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "cpc" REAL NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsletterSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "replyTo" TEXT NOT NULL DEFAULT '',
    "footerText" TEXT NOT NULL DEFAULT '',
    "monthlyEmailLimit" INTEGER NOT NULL DEFAULT 2500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'subscribed',
    "source" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "unsubscribedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsletterCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "designJson" JSONB,
    "htmlContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "segmentFilter" JSONB,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "unsubCount" INTEGER NOT NULL DEFAULT 0,
    "revenueAttributed" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "tags" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "referrer" TEXT,
    "convertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "orderId" TEXT,
    "customerId" TEXT,
    "reviewerName" TEXT NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT,
    "repliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "sendRequestEmail" BOOLEAN NOT NULL DEFAULT true,
    "requestDelayDays" INTEGER NOT NULL DEFAULT 7,
    "emailSubject" TEXT NOT NULL DEFAULT 'How was your order from {shop}?',
    "emailBody" TEXT NOT NULL DEFAULT 'Hi {name},

Thank you for your recent order! We''d love to hear what you think.

Click the link below to leave a quick review — it only takes a minute.

{review_link}

Thank you!',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdSpendDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL DEFAULT '',
    "date" DATETIME NOT NULL,
    "spend" REAL NOT NULL DEFAULT 0,
    "ad" TEXT,
    "adset" TEXT,
    "campaign" TEXT,
    "platform" TEXT NOT NULL
);
INSERT INTO "new_AdSpendDaily" ("ad", "adset", "campaign", "date", "id", "platform", "spend") SELECT "ad", "adset", "campaign", "date", "id", "platform", "spend" FROM "AdSpendDaily";
DROP TABLE "AdSpendDaily";
ALTER TABLE "new_AdSpendDaily" RENAME TO "AdSpendDaily";
CREATE INDEX "AdSpendDaily_shop_idx" ON "AdSpendDaily"("shop");
CREATE INDEX "AdSpendDaily_date_idx" ON "AdSpendDaily"("date");
CREATE INDEX "AdSpendDaily_platform_date_idx" ON "AdSpendDaily"("platform", "date");
CREATE UNIQUE INDEX "AdSpendDaily_shop_platform_date_key" ON "AdSpendDaily"("shop", "platform", "date");
CREATE TABLE "new_TrackingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ga4Id" TEXT,
    "ga4Secret" TEXT,
    "fbPixelId" TEXT,
    "fbToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "trackingKey" TEXT,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pixelLastSeenAt" DATETIME,
    "lastEventAt" DATETIME,
    "installedAt" DATETIME,
    "uninstalledAt" DATETIME,
    "attributionModel" TEXT NOT NULL DEFAULT 'last_touch',
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 7
);
INSERT INTO "new_TrackingSettings" ("createdAt", "fbPixelId", "fbToken", "ga4Id", "ga4Secret", "id", "installedAt", "lastEventAt", "pixelLastSeenAt", "shop", "trackingEnabled", "trackingKey", "uninstalledAt", "updatedAt") SELECT "createdAt", "fbPixelId", "fbToken", "ga4Id", "ga4Secret", "id", "installedAt", "lastEventAt", "pixelLastSeenAt", "shop", "trackingEnabled", "trackingKey", "uninstalledAt", "updatedAt" FROM "TrackingSettings";
DROP TABLE "TrackingSettings";
ALTER TABLE "new_TrackingSettings" RENAME TO "TrackingSettings";
CREATE UNIQUE INDEX "TrackingSettings_shop_key" ON "TrackingSettings"("shop");
CREATE UNIQUE INDEX "TrackingSettings_trackingKey_key" ON "TrackingSettings"("trackingKey");
CREATE INDEX "TrackingSettings_shop_idx" ON "TrackingSettings"("shop");
CREATE INDEX "TrackingSettings_trackingKey_idx" ON "TrackingSettings"("trackingKey");
CREATE INDEX "TrackingSettings_trackingEnabled_idx" ON "TrackingSettings"("trackingEnabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_shop_date_idx" ON "MetaAdDailyInsight"("shop", "date");

-- CreateIndex
CREATE INDEX "MetaAdDailyInsight_campaignId_idx" ON "MetaAdDailyInsight"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdDailyInsight_shop_date_adId_key" ON "MetaAdDailyInsight"("shop", "date", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSettings_shop_key" ON "NewsletterSettings"("shop");

-- CreateIndex
CREATE INDEX "NewsletterSettings_shop_idx" ON "NewsletterSettings"("shop");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_shop_status_idx" ON "NewsletterSubscriber"("shop", "status");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_shop_createdAt_idx" ON "NewsletterSubscriber"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_email_idx" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_shop_email_key" ON "NewsletterSubscriber"("shop", "email");

-- CreateIndex
CREATE INDEX "NewsletterCampaign_shop_status_idx" ON "NewsletterCampaign"("shop", "status");

-- CreateIndex
CREATE INDEX "NewsletterCampaign_shop_createdAt_idx" ON "NewsletterCampaign"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "NewsletterCampaign_sentAt_idx" ON "NewsletterCampaign"("sentAt");

-- CreateIndex
CREATE INDEX "Lead_shop_status_idx" ON "Lead"("shop", "status");

-- CreateIndex
CREATE INDEX "Lead_shop_source_idx" ON "Lead"("shop", "source");

-- CreateIndex
CREATE INDEX "Lead_shop_createdAt_idx" ON "Lead"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_shop_email_key" ON "Lead"("shop", "email");

-- CreateIndex
CREATE INDEX "Review_shop_productId_status_idx" ON "Review"("shop", "productId", "status");

-- CreateIndex
CREATE INDEX "Review_shop_status_idx" ON "Review"("shop", "status");

-- CreateIndex
CREATE INDEX "Review_shop_createdAt_idx" ON "Review"("shop", "createdAt");
