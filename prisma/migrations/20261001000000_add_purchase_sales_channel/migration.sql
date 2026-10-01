-- Which Shopify channel an order came from, so offline orders aren't reported as untracked visits
ALTER TABLE "Purchase" ADD COLUMN "salesChannel" TEXT;
