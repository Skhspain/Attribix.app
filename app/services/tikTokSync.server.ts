// TikTok Ads sync — pulls campaign + ad data from TikTok Marketing API
import db from "~/db.server";
import {
  fetchTikTokCampaignInsights,
  fetchTikTokAdInsights,
} from "./tikTokAds.server";

const anyDb = db as any;

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

export async function syncTikTokAds(shop: string, days: number = 7) {
  const conn = await anyDb.tikTokConnection?.findUnique?.({ where: { shop } });
  if (!conn || !conn.accessToken || !conn.advertiserId) {
    return { ok: false, error: "TikTok not connected or no advertiser selected" };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  // Campaign-level sync
  try {
    const campaigns = await fetchTikTokCampaignInsights(
      conn.accessToken, conn.advertiserId, startStr, endStr
    );

    let campaignRows = 0;
    for (const row of campaigns) {
      const date = new Date(row.dimensions.stat_time_day);
      const campaignId = row.dimensions.campaign_id;
      const m = row.metrics;

      await anyDb.tikTokCampaignDailyInsight?.upsert?.({
        where: {
          shop_date_campaignId: { shop, date, campaignId },
        },
        create: {
          shop,
          date,
          campaignId,
          campaignName: m.campaign_name || null,
          spend: parseFloat(m.spend) || 0,
          impressions: parseInt(m.impressions) || 0,
          clicks: parseInt(m.clicks) || 0,
          conversions: parseInt(m.total_complete_payment || m.conversion) || 0,
          conversionValue: parseFloat(m.total_complete_payment_value) || 0,
          raw: JSON.stringify(row),
        },
        update: {
          campaignName: m.campaign_name || undefined,
          spend: parseFloat(m.spend) || 0,
          impressions: parseInt(m.impressions) || 0,
          clicks: parseInt(m.clicks) || 0,
          conversions: parseInt(m.total_complete_payment || m.conversion) || 0,
          conversionValue: parseFloat(m.total_complete_payment_value) || 0,
          raw: JSON.stringify(row),
        },
      });
      campaignRows++;
    }

    // Ad-level sync
    const ads = await fetchTikTokAdInsights(
      conn.accessToken, conn.advertiserId, startStr, endStr
    );

    let adRows = 0;
    for (const row of ads) {
      const date = new Date(row.dimensions.stat_time_day);
      const adId = row.dimensions.ad_id;
      const m = row.metrics;

      await anyDb.tikTokAdDailyInsight?.upsert?.({
        where: {
          shop_date_adId: { shop, date, adId },
        },
        create: {
          shop,
          date,
          campaignId: m.campaign_id,
          campaignName: m.campaign_name || null,
          adGroupId: m.adgroup_id,
          adGroupName: m.adgroup_name || null,
          adId,
          adName: m.ad_name || null,
          spend: parseFloat(m.spend) || 0,
          impressions: parseInt(m.impressions) || 0,
          clicks: parseInt(m.clicks) || 0,
          conversions: parseInt(m.total_complete_payment || m.conversion) || 0,
          conversionValue: parseFloat(m.total_complete_payment_value) || 0,
        },
        update: {
          campaignName: m.campaign_name || undefined,
          adGroupName: m.adgroup_name || undefined,
          adName: m.ad_name || undefined,
          spend: parseFloat(m.spend) || 0,
          impressions: parseInt(m.impressions) || 0,
          clicks: parseInt(m.clicks) || 0,
          conversions: parseInt(m.total_complete_payment || m.conversion) || 0,
          conversionValue: parseFloat(m.total_complete_payment_value) || 0,
        },
      });
      adRows++;
    }

    // Update last synced timestamp
    await anyDb.tikTokConnection?.update?.({
      where: { shop },
      data: { lastSyncedAt: new Date() },
    });

    return { ok: true, campaigns: campaignRows, ads: adRows };
  } catch (e: any) {
    console.error("[tiktok-sync] error:", e.message);
    return { ok: false, error: e.message };
  }
}
