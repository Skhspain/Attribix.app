-- CreateTable
CREATE TABLE "TrackedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "ip" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "utmSource" TEXT,
    "shop" TEXT,
    "visitorId" TEXT,
    "eventId" TEXT,
    "referrer" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "host" TEXT,
    "origin" TEXT,
    "accountId" TEXT
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "shop" TEXT,
    "orderId" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "fbclid" TEXT,
    "gclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "spend" REAL NOT NULL DEFAULT 0,
    "ad" TEXT,
    "adset" TEXT,
    "campaign" TEXT,
    "platform" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TrackingSettings" (
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
    "uninstalledAt" DATETIME
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "adAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MetaCampaignDailyInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "spend" REAL NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" REAL NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "adCustomerId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEvent_eventId_key" ON "TrackedEvent"("eventId");

-- CreateIndex
CREATE INDEX "TrackedEvent_createdAt_idx" ON "TrackedEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TrackedEvent_eventName_idx" ON "TrackedEvent"("eventName");

-- CreateIndex
CREATE INDEX "TrackedEvent_sessionId_idx" ON "TrackedEvent"("sessionId");

-- CreateIndex
CREATE INDEX "TrackedEvent_utmSource_idx" ON "TrackedEvent"("utmSource");

-- CreateIndex
CREATE INDEX "TrackedEvent_shop_idx" ON "TrackedEvent"("shop");

-- CreateIndex
CREATE INDEX "TrackedEvent_visitorId_idx" ON "TrackedEvent"("visitorId");

-- CreateIndex
CREATE INDEX "TrackedEvent_eventId_idx" ON "TrackedEvent"("eventId");

-- CreateIndex
CREATE INDEX "TrackedEvent_fbclid_idx" ON "TrackedEvent"("fbclid");

-- CreateIndex
CREATE INDEX "TrackedEvent_gclid_idx" ON "TrackedEvent"("gclid");

-- CreateIndex
CREATE INDEX "TrackedEvent_fbc_idx" ON "TrackedEvent"("fbc");

-- CreateIndex
CREATE INDEX "TrackedEvent_fbp_idx" ON "TrackedEvent"("fbp");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_orderId_key" ON "Purchase"("orderId");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "Purchase_shop_idx" ON "Purchase"("shop");

-- CreateIndex
CREATE INDEX "Purchase_orderId_idx" ON "Purchase"("orderId");

-- CreateIndex
CREATE INDEX "Purchase_visitorId_idx" ON "Purchase"("visitorId");

-- CreateIndex
CREATE INDEX "Purchase_sessionId_idx" ON "Purchase"("sessionId");

-- CreateIndex
CREATE INDEX "Purchase_fbclid_idx" ON "Purchase"("fbclid");

-- CreateIndex
CREATE INDEX "Purchase_gclid_idx" ON "Purchase"("gclid");

-- CreateIndex
CREATE INDEX "Purchase_fbc_idx" ON "Purchase"("fbc");

-- CreateIndex
CREATE INDEX "Purchase_fbp_idx" ON "Purchase"("fbp");

-- CreateIndex
CREATE INDEX "AdSpendDaily_date_idx" ON "AdSpendDaily"("date");

-- CreateIndex
CREATE INDEX "AdSpendDaily_platform_date_idx" ON "AdSpendDaily"("platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSettings_shop_key" ON "TrackingSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSettings_trackingKey_key" ON "TrackingSettings"("trackingKey");

-- CreateIndex
CREATE INDEX "TrackingSettings_shop_idx" ON "TrackingSettings"("shop");

-- CreateIndex
CREATE INDEX "TrackingSettings_trackingKey_idx" ON "TrackingSettings"("trackingKey");

-- CreateIndex
CREATE INDEX "TrackingSettings_trackingEnabled_idx" ON "TrackingSettings"("trackingEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_shop_key" ON "MetaConnection"("shop");

-- CreateIndex
CREATE INDEX "MetaConnection_shop_idx" ON "MetaConnection"("shop");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_shop_date_idx" ON "MetaCampaignDailyInsight"("shop", "date");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_date_idx" ON "MetaCampaignDailyInsight"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignDailyInsight_shop_date_campaignId_key" ON "MetaCampaignDailyInsight"("shop", "date", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_shop_key" ON "GoogleConnection"("shop");

-- CreateIndex
CREATE INDEX "GoogleConnection_shop_idx" ON "GoogleConnection"("shop");
