// app/services/googleSync.server.ts
// Background cron that runs once on server boot.
// Every hour it checks all connected Google Ads shops and syncs any shop
// whose lastSyncedAt is older than 23 hours (effectively once a day).

import db from "~/db.server";
import { syncGoogleCampaignInsights } from "~/services/googleAds.server";
import { getValidGoogleToken } from "~/services/tokenRefresh.server";

async function syncShop(shop: string, adCustomerId: string) {
  // Get a valid (auto-refreshed) Google access token
  const tokenResult = await getValidGoogleToken(shop);
  if (!tokenResult.ok) {
    console.warn(`[googleSync] Token unavailable for ${shop}: ${tokenResult.reason}`);
    return;
  }

  const result = await syncGoogleCampaignInsights({
    shop,
    accessToken: tokenResult.accessToken,
    customerId: adCustomerId,
  });

  // Update lastSyncedAt
  await (db as any).googleConnection.update({
    where: { shop },
    data: { lastSyncedAt: new Date() },
  });

  console.log(`[googleSync] synced shop=${shop} upserted=${result.upserted} total=${result.total}`);
}

async function runSyncCycle() {
  const staleThreshold = new Date(Date.now() - 55 * 60 * 1000); // 55min ago → syncs every ~1h

  const connections = await (db as any).googleConnection.findMany({
    where: {
      adCustomerId: { not: null },
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: staleThreshold } },
      ],
    },
  }).catch(() => []);

  for (const conn of connections) {
    try {
      await syncShop(conn.shop, conn.adCustomerId!);
    } catch (err) {
      console.error(`[googleSync] failed for shop=${conn.shop}:`, err);
    }
  }
}

let started = false;

export function startGoogleSyncCron() {
  if (started) return;
  started = true;

  // Run once on boot (after 15s to let DB connections settle)
  setTimeout(() => {
    runSyncCycle().catch((e) => console.error("[googleSync] initial cycle error:", e));
  }, 15_000);

  // Then check every hour
  setInterval(() => {
    runSyncCycle().catch((e) => console.error("[googleSync] cycle error:", e));
  }, 60 * 60 * 1000);

  console.log("[googleSync] cron started — will sync connected Google Ads shops every ~24h");
}
