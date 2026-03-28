-- Attribution pipeline migration
-- Adds fields needed to link Shopify orders to tracked sessions/UTMs

-- TrackedEvent: add email, phone, orderId for order matching
ALTER TABLE "TrackedEvent" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "TrackedEvent" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "TrackedEvent" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- Purchase: add attribution fields
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shop" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "shopifyOrderId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "customerEmailHash" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "gclid" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "fbclid" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_shopifyOrderId_key" ON "Purchase"("shopifyOrderId") WHERE "shopifyOrderId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Purchase_createdAt_idx" ON "Purchase"("createdAt");
CREATE INDEX IF NOT EXISTS "Purchase_utmSource_utmMedium_utmCampaign_idx" ON "Purchase"("utmSource", "utmMedium", "utmCampaign");

-- AdSpendDaily: add shop + platform for multi-shop support and unique upsert
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "shop" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'meta';
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "campaign" TEXT;
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "adset" TEXT;
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "ad" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AdSpendDaily_shop_date_key" ON "AdSpendDaily"("shop", "date");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_date_idx" ON "AdSpendDaily"("date");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_platform_date_idx" ON "AdSpendDaily"("platform", "date");

-- PurchaseItem: new table for order line items
CREATE TABLE IF NOT EXISTS "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: MetaConnection and MetaCampaignDailyInsight tables already exist
-- from migration 20260122163722_meta_ads_tables. They are included in the
-- Prisma schema for client generation only — no DDL needed here.
