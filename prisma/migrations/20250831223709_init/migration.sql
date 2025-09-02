/*
  Warnings:

  - You are about to drop the `PurchaseItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackedItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackedProduct` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackingSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WebSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `ad` on the `AdSpendDaily` table. All the data in the column will be lost.
  - You are about to drop the column `adset` on the `AdSpendDaily` table. All the data in the column will be lost.
  - You are about to drop the column `campaign` on the `AdSpendDaily` table. All the data in the column will be lost.
  - You are about to drop the column `platform` on the `AdSpendDaily` table. All the data in the column will be lost.
  - You are about to drop the column `customerEmailHash` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `fbclid` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `gclid` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyOrderId` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `utmCampaign` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `utmMedium` on the `Purchase` table. All the data in the column will be lost.
  - You are about to drop the column `utmSource` on the `Purchase` table. All the data in the column will be lost.
  - The primary key for the `TrackedEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `currency` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `fbclid` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `gclid` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `ip` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `msclkid` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `path` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `referrer` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `shop` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `ttclid` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `utmCampaign` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `utmMedium` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `utmSource` on the `TrackedEvent` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `TrackedEvent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PurchaseItem_productId_idx";

-- DropIndex
DROP INDEX "WebSession_utmSource_utmMedium_utmCampaign_idx";

-- DropIndex
DROP INDEX "WebSession_createdAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PurchaseItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TrackedItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TrackedProduct";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TrackingSettings";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WebSession";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdSpendDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "spend" REAL NOT NULL
);
INSERT INTO "new_AdSpendDaily" ("date", "id", "spend") SELECT "date", "id", "spend" FROM "AdSpendDaily";
DROP TABLE "AdSpendDaily";
ALTER TABLE "new_AdSpendDaily" RENAME TO "AdSpendDaily";
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValue" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD'
);
INSERT INTO "new_Purchase" ("createdAt", "currency", "id", "totalValue") SELECT "createdAt", "currency", "id", "totalValue" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE TABLE "new_Session" (
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
    "accountOwner" BOOLEAN,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN
);
INSERT INTO "new_Session" ("accessToken", "accountOwner", "collaborator", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "scope", "shop", "state", "userId") SELECT "accessToken", "accountOwner", "collaborator", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "scope", "shop", "state", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE TABLE "new_TrackedEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "sessionId" TEXT
);
INSERT INTO "new_TrackedEvent" ("createdAt", "eventName", "id", "sessionId") SELECT "createdAt", "eventName", "id", "sessionId" FROM "TrackedEvent";
DROP TABLE "TrackedEvent";
ALTER TABLE "new_TrackedEvent" RENAME TO "TrackedEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
