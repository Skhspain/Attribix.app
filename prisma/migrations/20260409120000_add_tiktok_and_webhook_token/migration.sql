-- AlterTable
ALTER TABLE "Review" ADD COLUMN "images" TEXT;

-- AlterTable
ALTER TABLE "TrackedEvent" ADD COLUMN "currency" TEXT;
ALTER TABLE "TrackedEvent" ADD COLUMN "orderId" TEXT;
ALTER TABLE "TrackedEvent" ADD COLUMN "revenue" REAL;

-- AlterTable
ALTER TABLE "TrackingSettings" ADD COLUMN "leadWebhookToken" TEXT;

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "channel" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "touchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PurchaseTouchpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "visitorId" TEXT,
    "touchpointId" TEXT,
    "position" INTEGER NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "revenue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "creditFirstTouch" REAL NOT NULL DEFAULT 0,
    "creditLastTouch" REAL NOT NULL DEFAULT 0,
    "creditLinear" REAL NOT NULL DEFAULT 0,
    "creditTimeDecay" REAL NOT NULL DEFAULT 0,
    "touchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReviewWidgetSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "primaryColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "starColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "borderColor" TEXT NOT NULL DEFAULT '#e5e7eb',
    "layout" TEXT NOT NULL DEFAULT 'list',
    "showVerifiedBadge" BOOLEAN NOT NULL DEFAULT true,
    "showReviewerName" BOOLEAN NOT NULL DEFAULT true,
    "showDate" BOOLEAN NOT NULL DEFAULT true,
    "allowImages" BOOLEAN NOT NULL DEFAULT true,
    "translateTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutomationFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutomationStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT NOT NULL DEFAULT '',
    "htmlContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutomationEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "triggeredBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutomationEnrollment_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "AutomationFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomDashboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widgets" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrgStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsletterImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TikTokConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "advertiserId" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TikTokCampaignDailyInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "spend" REAL NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "conversionValue" REAL NOT NULL DEFAULT 0,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TikTokAdDailyInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "adGroupId" TEXT NOT NULL,
    "adGroupName" TEXT,
    "adId" TEXT NOT NULL,
    "adName" TEXT,
    "spend" REAL NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "conversionValue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewSettings" (
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
    "discountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "discountValue" REAL NOT NULL DEFAULT 10,
    "discountExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ReviewSettings" ("autoApprove", "createdAt", "emailBody", "emailSubject", "requestDelayDays", "sendRequestEmail", "shop", "updatedAt") SELECT "autoApprove", "createdAt", "emailBody", "emailSubject", "requestDelayDays", "sendRequestEmail", "shop", "updatedAt" FROM "ReviewSettings";
DROP TABLE "ReviewSettings";
ALTER TABLE "new_ReviewSettings" RENAME TO "ReviewSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Touchpoint_shop_visitorId_touchedAt_idx" ON "Touchpoint"("shop", "visitorId", "touchedAt");

-- CreateIndex
CREATE INDEX "Touchpoint_shop_channel_idx" ON "Touchpoint"("shop", "channel");

-- CreateIndex
CREATE INDEX "Touchpoint_shop_touchedAt_idx" ON "Touchpoint"("shop", "touchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Touchpoint_shop_visitorId_sessionId_key" ON "Touchpoint"("shop", "visitorId", "sessionId");

-- CreateIndex
CREATE INDEX "PurchaseTouchpoint_shop_orderId_idx" ON "PurchaseTouchpoint"("shop", "orderId");

-- CreateIndex
CREATE INDEX "PurchaseTouchpoint_shop_channel_idx" ON "PurchaseTouchpoint"("shop", "channel");

-- CreateIndex
CREATE INDEX "PurchaseTouchpoint_shop_createdAt_idx" ON "PurchaseTouchpoint"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseTouchpoint_visitorId_idx" ON "PurchaseTouchpoint"("visitorId");

-- CreateIndex
CREATE INDEX "AutomationFlow_shop_trigger_enabled_idx" ON "AutomationFlow"("shop", "trigger", "enabled");

-- CreateIndex
CREATE INDEX "AutomationFlow_shop_idx" ON "AutomationFlow"("shop");

-- CreateIndex
CREATE INDEX "AutomationStep_flowId_position_idx" ON "AutomationStep"("flowId", "position");

-- CreateIndex
CREATE INDEX "AutomationEnrollment_status_nextSendAt_idx" ON "AutomationEnrollment"("status", "nextSendAt");

-- CreateIndex
CREATE INDEX "AutomationEnrollment_shop_idx" ON "AutomationEnrollment"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEnrollment_flowId_email_key" ON "AutomationEnrollment"("flowId", "email");

-- CreateIndex
CREATE INDEX "CustomerSegment_shop_idx" ON "CustomerSegment"("shop");

-- CreateIndex
CREATE INDEX "CustomDashboard_shop_idx" ON "CustomDashboard"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OrgStore_shop_key" ON "OrgStore"("shop");

-- CreateIndex
CREATE INDEX "OrgStore_orgId_idx" ON "OrgStore"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Org_clerkUserId_key" ON "Org"("clerkUserId");

-- CreateIndex
CREATE INDEX "NewsletterImage_shop_idx" ON "NewsletterImage"("shop");

-- CreateIndex
CREATE INDEX "NewsletterImage_createdAt_idx" ON "NewsletterImage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokConnection_shop_key" ON "TikTokConnection"("shop");

-- CreateIndex
CREATE INDEX "TikTokConnection_shop_idx" ON "TikTokConnection"("shop");

-- CreateIndex
CREATE INDEX "TikTokCampaignDailyInsight_shop_idx" ON "TikTokCampaignDailyInsight"("shop");

-- CreateIndex
CREATE INDEX "TikTokCampaignDailyInsight_shop_date_idx" ON "TikTokCampaignDailyInsight"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokCampaignDailyInsight_shop_date_campaignId_key" ON "TikTokCampaignDailyInsight"("shop", "date", "campaignId");

-- CreateIndex
CREATE INDEX "TikTokAdDailyInsight_shop_idx" ON "TikTokAdDailyInsight"("shop");

-- CreateIndex
CREATE INDEX "TikTokAdDailyInsight_shop_date_idx" ON "TikTokAdDailyInsight"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokAdDailyInsight_shop_date_adId_key" ON "TikTokAdDailyInsight"("shop", "date", "adId");

-- CreateIndex
CREATE INDEX "TrackedEvent_accountId_idx" ON "TrackedEvent"("accountId");

-- CreateIndex
CREATE INDEX "TrackedEvent_orderId_idx" ON "TrackedEvent"("orderId");

