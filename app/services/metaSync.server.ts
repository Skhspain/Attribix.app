// app/services/metaSync.server.ts
// Background cron that runs once on server boot.
// Every hour it checks all connected Meta shops and syncs any shop
// whose lastSyncedAt is older than 23 hours (effectively once a day).

import db from "~/db.server";
import { fetchCampaignDailyInsights, fetchCampaignObjectives } from "~/services/metaGraph.server";
import { sendEmail } from "~/services/resend.server";

function formatDay(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getPurchaseStats(row: any) {
  const actions = row.actions || [];
  const values = row.action_values || [];
  const purchaseAction = actions.find((a: any) => a.action_type === "purchase");
  const purchaseValue = values.find((a: any) => a.action_type === "purchase");
  return {
    purchases: purchaseAction ? Number(purchaseAction.value || 0) : 0,
    purchaseValue: purchaseValue ? Number(purchaseValue.value || 0) : 0,
  };
}

async function syncShop(shop: string, accessToken: string, adAccountId: string) {
  const until = new Date();
  const since = new Date();
  since.setDate(until.getDate() - 29); // last 30 days

  const sinceStr = formatDay(since);
  const untilStr = formatDay(until);
  const anyDb = db as any;

  // Fetch campaign objectives (id → objective) so we can tag each insight row
  const objectiveMap = await fetchCampaignObjectives({ accessToken, adAccountId }).catch(() => new Map<string, string>());

  // Campaign level
  const campaignInsights = await fetchCampaignDailyInsights({
    accessToken, adAccountId, since: sinceStr, until: untilStr, level: "campaign",
  });
  const campaignRows = campaignInsights?.data ?? [];

  for (const r of campaignRows) {
    const date = new Date(r.date_start);
    const spend = Number(r.spend || 0);
    const impressions = Number(r.impressions || 0);
    const clicks = Number(r.clicks || 0);
    const { purchases, purchaseValue } = getPurchaseStats(r);
    const objective = objectiveMap.get(String(r.campaign_id)) ?? null;

    try {
      await db.metaCampaignDailyInsight.upsert({
        where: { shop_date_campaignId: { shop, date, campaignId: String(r.campaign_id) } },
        create: { shop, date, campaignId: String(r.campaign_id), campaignName: r.campaign_name || null, objective, spend, impressions, clicks, purchases, purchaseValue },
        update: { campaignName: r.campaign_name || null, objective, spend, impressions, clicks, purchases, purchaseValue },
      });
    } catch (rowErr: any) {
      console.error(`[metaSync] Failed campaign row shop=${shop} campaignId=${r.campaign_id} date=${r.date_start}: ${rowErr?.message}`);
    }
  }

  // Ad level
  const adInsights = await fetchCampaignDailyInsights({
    accessToken, adAccountId, since: sinceStr, until: untilStr, level: "ad",
  });
  const adRows = adInsights?.data ?? [];

  for (const r of adRows) {
    const date = new Date(r.date_start);
    const spend = Number(r.spend || 0);
    const impressions = Number(r.impressions || 0);
    const clicks = Number(r.clicks || 0);
    const ctr = Number(r.ctr || 0);
    const cpc = Number(r.cpc || 0);
    const { purchases, purchaseValue } = getPurchaseStats(r);

    await anyDb.metaAdDailyInsight.upsert({
      where: { shop_date_adId: { shop, date, adId: String(r.ad_id) } },
      create: { shop, date, campaignId: String(r.campaign_id), campaignName: r.campaign_name || null, adSetId: String(r.adset_id || ""), adSetName: r.adset_name || null, adId: String(r.ad_id), adName: r.ad_name || null, spend, impressions, clicks, ctr, cpc, purchases, purchaseValue },
      update: { campaignName: r.campaign_name || null, adSetName: r.adset_name || null, adName: r.ad_name || null, spend, impressions, clicks, ctr, cpc, purchases, purchaseValue },
    });
  }

  // AdSpendDaily aggregate
  const byDate = new Map<string, number>();
  for (const r of campaignRows) {
    const k = String(r.date_start);
    byDate.set(k, (byDate.get(k) || 0) + Number(r.spend || 0));
  }
  for (const [k, v] of byDate.entries()) {
    const date = new Date(k);
    await anyDb.adSpendDaily.upsert({
      where: { shop_platform_date: { shop, platform: "meta", date } },
      create: { shop, date, platform: "meta", campaign: null, adset: null, ad: null, spend: v },
      update: { spend: v },
    });
  }

  // Update lastSyncedAt
  await db.metaConnection.update({
    where: { shop },
    data: { lastSyncedAt: new Date() },
  });

  console.log(`[metaSync] synced shop=${shop} campaigns=${campaignRows.length} ads=${adRows.length}`);
}

async function checkSpendAlert(shop: string) {
  try {
    const settings = await (db as any).trackingSettings?.findUnique?.({
      where: { shop },
      select: { alertSpendDrop: true, alertSpendDropPct: true, notifyEmail: true, lastAlertSentAt: true },
    }).catch(() => null);

    if (!settings?.alertSpendDrop || !settings?.notifyEmail) return;

    // Throttle: max one alert per 24h per shop
    if (settings.lastAlertSentAt && Date.now() - new Date(settings.lastAlertSentAt).getTime() < 24 * 60 * 60 * 1000) return;

    // Compare yesterday's spend to the prior 7-day daily average
    const since = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    const rows = await (db as any).metaCampaignDailyInsight?.groupBy?.({
      by: ["date"],
      where: { shop, date: { gte: since } },
      _sum: { spend: true },
      orderBy: { date: "desc" },
    }).catch(() => []) ?? [];

    if (rows.length < 2) return;

    const yesterday = rows[0]._sum?.spend ?? 0;
    const priorDays = rows.slice(1);
    const priorAvg = priorDays.reduce((s: number, r: any) => s + (r._sum?.spend ?? 0), 0) / priorDays.length;

    if (priorAvg < 1) return;

    const dropPct = ((priorAvg - yesterday) / priorAvg) * 100;
    const threshold = settings.alertSpendDropPct ?? 50;
    if (dropPct < threshold) return;

    const shopName = shop.replace(".myshopify.com", "");
    await sendEmail({
      from: process.env.SMTP_FROM_EMAIL || "alerts@attribix.com",
      to: settings.notifyEmail,
      subject: `Ad spend dropped ${Math.round(dropPct)}% — ${shopName}`,
      html: `<p>Your Meta ad spend yesterday was <strong>$${yesterday.toFixed(2)}</strong>, down ${Math.round(dropPct)}% from your recent daily average of <strong>$${priorAvg.toFixed(2)}</strong>.</p>
<p>This may indicate a paused campaign, budget cap, or account issue.</p>
<p><a href="https://attribix-app.fly.dev/app/meta-ads">View your Meta Ads dashboard →</a></p>`,
    });

    await (db as any).trackingSettings?.update?.({
      where: { shop },
      data: { lastAlertSentAt: new Date() },
    }).catch(() => null);

    console.log(`[metaSync] spend alert sent for ${shop}: ${Math.round(dropPct)}% drop`);
  } catch (e: any) {
    console.error(`[metaSync] checkSpendAlert error for ${shop}:`, e?.message);
  }
}

async function runSyncCycle() {
  const staleThreshold = new Date(Date.now() - 55 * 60 * 1000); // 55min ago → syncs every ~1h

  const connections = await db.metaConnection.findMany({
    where: {
      accessToken: { not: "__PENDING__" },
      adAccountId: { not: null },
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: staleThreshold } },
      ],
    },
  });

  for (const conn of connections) {
    try {
      await syncShop(conn.shop, conn.accessToken, conn.adAccountId!);
      await checkSpendAlert(conn.shop);
    } catch (err) {
      console.error(`[metaSync] failed for shop=${conn.shop}:`, err);
    }
  }
}

let started = false;

export function startMetaSyncCron() {
  if (started) return;
  started = true;

  // Run once immediately on boot (catches up any stale shops)
  setTimeout(() => {
    runSyncCycle().catch((e) => console.error("[metaSync] initial cycle error:", e));
  }, 10_000); // 10s after boot to let DB connections settle

  // Then check every hour
  setInterval(() => {
    runSyncCycle().catch((e) => console.error("[metaSync] cycle error:", e));
  }, 60 * 60 * 1000);

  console.log("[metaSync] cron started — will sync connected shops every ~24h");
}
