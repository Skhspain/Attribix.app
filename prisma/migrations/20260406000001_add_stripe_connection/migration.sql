CREATE TABLE "StripeConnection" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "shop"         TEXT NOT NULL,
  "apiKey"       TEXT NOT NULL,
  "accountName"  TEXT,
  "currency"     TEXT,
  "lastSyncedAt" DATETIME,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StripeConnection_shop_key" ON "StripeConnection"("shop");
