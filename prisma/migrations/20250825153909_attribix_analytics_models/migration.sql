/*
  Warnings:

  - Made the column `url` on table `TrackedEvent` required. This step will fail if there are existing NULL values in that column.

*/
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
CREATE TABLE "TrackedItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TrackedProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trackedEventId" INTEGER NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "TrackedProduct_trackedEventId_fkey" FOREIGN KEY ("trackedEventId") REFERENCES "TrackedEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrackingSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "pixelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "anonId" TEXT,
    "clientId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "firstTouchAt" DATETIME,
    "lastTouchAt" DATETIME,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    "consentAdvertising" BOOLEAN DEFAULT false,
    "consentMarketing" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifyOrderId" TEXT NOT NULL,
    "totalValue" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "customerEmailHash" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "sessionId" TEXT,
    CONSTRAINT "Purchase_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WebSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "platform" TEXT NOT NULL,
    "campaign" TEXT,
    "adset" TEXT,
    "ad" TEXT,
    "spend" REAL NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrackedEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "value" REAL,
    "currency" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "orderId" TEXT,
    "shop" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT,
    "referrer" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "msclkid" TEXT,
    CONSTRAINT "TrackedEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WebSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TrackedEvent" ("createdAt", "currency", "email", "eventName", "id", "ip", "phone", "url", "userAgent", "utmCampaign", "utmMedium", "utmSource", "value") SELECT "createdAt", "currency", "email", "eventName", "id", "ip", "phone", "url", "userAgent", "utmCampaign", "utmMedium", "utmSource", "value" FROM "TrackedEvent";
DROP TABLE "TrackedEvent";
ALTER TABLE "new_TrackedEvent" RENAME TO "TrackedEvent";
CREATE INDEX "TrackedEvent_createdAt_idx" ON "TrackedEvent"("createdAt");
CREATE INDEX "TrackedEvent_eventName_idx" ON "TrackedEvent"("eventName");
CREATE INDEX "TrackedEvent_utmSource_utmMedium_utmCampaign_idx" ON "TrackedEvent"("utmSource", "utmMedium", "utmCampaign");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WebSession_createdAt_idx" ON "WebSession"("createdAt");

-- CreateIndex
CREATE INDEX "WebSession_utmSource_utmMedium_utmCampaign_idx" ON "WebSession"("utmSource", "utmMedium", "utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_shopifyOrderId_key" ON "Purchase"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "Purchase_utmSource_utmMedium_utmCampaign_idx" ON "Purchase"("utmSource", "utmMedium", "utmCampaign");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "AdSpendDaily_date_idx" ON "AdSpendDaily"("date");

-- CreateIndex
CREATE INDEX "AdSpendDaily_platform_date_idx" ON "AdSpendDaily"("platform", "date");
