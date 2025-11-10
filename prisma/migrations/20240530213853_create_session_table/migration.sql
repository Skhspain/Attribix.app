-- CreateTable
CREATE TABLE "TrackedEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "eventName" TEXT NOT NULL,
  "url" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "value" REAL,
  "currency" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);