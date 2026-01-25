-- CreateTable
CREATE TABLE "TrackedEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "ip" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "utmSource" TEXT,

    CONSTRAINT "TrackedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AdSpendDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ga4Id" TEXT,
    "ga4Secret" TEXT,
    "fbPixelId" TEXT,
    "fbToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3),
    "adAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaignDailyInsight" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaignDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackedEvent_createdAt_idx" ON "TrackedEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TrackedEvent_eventName_idx" ON "TrackedEvent"("eventName");

-- CreateIndex
CREATE INDEX "TrackedEvent_sessionId_idx" ON "TrackedEvent"("sessionId");

-- CreateIndex
CREATE INDEX "TrackedEvent_utmSource_idx" ON "TrackedEvent"("utmSource");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSettings_shop_key" ON "TrackingSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_shop_key" ON "MetaConnection"("shop");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_shop_date_idx" ON "MetaCampaignDailyInsight"("shop", "date");

-- CreateIndex
CREATE INDEX "MetaCampaignDailyInsight_shop_campaignId_idx" ON "MetaCampaignDailyInsight"("shop", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignDailyInsight_shop_date_campaignId_key" ON "MetaCampaignDailyInsight"("shop", "date", "campaignId");
