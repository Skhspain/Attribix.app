-- CreateTable
CREATE TABLE "TrackedEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "shopDomain" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "url" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
