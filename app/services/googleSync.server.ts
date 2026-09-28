// app/services/googleSync.server.ts
// Background cron that runs once on server boot.
// Every hour it checks all connected Google Ads shops and syncs any shop
// whose lastSyncedAt is older than 23 hours (effectively once a day).

import db from "~/db.server";
import { googleAdsSearchStream, syncGoogleCampaignInsights } from "~/services/googleAds.server";
import { getValidGoogleToken } from "~/services/tokenRefresh.server";

/** Short, merchant-readable reason for a failed sync. */
function describeGoogleError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "Unknown error");
  if (/only approved for use with test accounts/i.test(msg)) {
    return "Attribix's Google Ads API access is still limited to test accounts, so real ad accounts can't be read yet.";
  }
  if (/PERMISSION_DENIED|USER_PERMISSION_DENIED|\(403\)/i.test(msg)) return "Google denied access to this ad account. Check that the connected Google user can view it.";
  if (/invalid_grant|UNAUTHENTICATED|\(401\)/i.test(msg)) return "The Google connection has expired. Reconnect Google Ads.";
  return msg.split("\n")[0].slice(0, 300);
}

async function syncShop(shop: string, adCustomerId: string) {
  const anyDb = db as any;
  await anyDb.googleConnection.update({ where: { shop }, data: { lastSyncAttemptAt: new Date() } }).catch(() => null);

  try {
    // Get a valid (auto-refreshed) Google access token
    const tokenResult = await getValidGoogleToken(shop);
    if (!tokenResult.ok) throw new Error(`Google token unavailable: ${tokenResult.reason}`);

    // Account currency, so spend can be converted into the store currency.
    const currencyRows = await googleAdsSearchStream({
      accessToken: tokenResult.accessToken,
      customerId: adCustomerId,
      query: "SELECT customer.currency_code FROM customer LIMIT 1",
    }).catch(() => []);
    const currencyCode = (currencyRows as any[]).flatMap((c) => c?.results ?? [])[0]?.customer?.currencyCode ?? null;

    const result = await syncGoogleCampaignInsights({
      shop,
      accessToken: tokenResult.accessToken,
      customerId: adCustomerId,
    });

    await anyDb.googleConnection.update({
      where: { shop },
      data: { lastSyncedAt: new Date(), lastSyncError: null, ...(currencyCode && { currencyCode }) },
    });
    console.log(`[googleSync] synced shop=${shop} upserted=${result.upserted} total=${result.total}`);
  } catch (err) {
    await anyDb.googleConnection.update({ where: { shop }, data: { lastSyncError: describeGoogleError(err) } }).catch(() => null);
    throw err;
  }
}

async function runSyncCycle() {
  const staleThreshold = new Date(Date.now() - 55 * 60 * 1000); // 55min ago → syncs every ~1h

  const connections = await (db as any).googleConnection.findMany({
    where: {
      adCustomerId: { not: null },
      // Throttle on the last attempt (not the last success) so a failing
      // account isn't retried on every boot.
      OR: [
        { lastSyncAttemptAt: null },
        { lastSyncAttemptAt: { lt: staleThreshold } },
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
