// app/services/adStats.server.ts
import prisma from "~/db.server";
import type { AdPlatform } from "@prisma/client";

const SHOP_ID = "attribix-com.myshopify.com";

export type MetaAdTotals = {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number | null;
};

export type MetaAdDailyPoint = {
  date: string; // YYYY-MM-DD
  spend: number;
  revenue: number;
  conversions: number;
};

export type MetaAdCampaignRow = {
  campaignId: string;
  totalSpend: number;
  totalRevenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number | null;
};

export type MetaAdOverview = {
  totals: MetaAdTotals;
  daily: MetaAdDailyPoint[];
  campaigns: MetaAdCampaignRow[];
};

function startDateForRange(days: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  // zero out time to keep it clean
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getMetaAdOverview(rangeDays: number = 30): Promise<MetaAdOverview> {
  const since = startDateForRange(rangeDays);

  const rows = await prisma.adDailyStat.findMany({
    where: {
      shopId: SHOP_ID,
      platform: "META" as AdPlatform,
      date: {
        gte: since,
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  // Totals
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;

  // Daily series keyed by YYYY-MM-DD
  const dailyMap = new Map<string, MetaAdDailyPoint>();

  // Campaign aggregates
  const campaignMap = new Map<string, MetaAdCampaignRow>();

  for (const row of rows) {
    const spend = row.spend ?? 0;
    const revenue = row.revenue ?? 0;
    const impressions = row.impressions ?? 0;
    const clicks = row.clicks ?? 0;
    const conversions = row.conversions ?? 0;

    totalSpend += spend;
    totalRevenue += revenue;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;

    const dateKey = row.date.toISOString().slice(0, 10);

    // --- Daily ---
    const existingDaily = dailyMap.get(dateKey) ?? {
      date: dateKey,
      spend: 0,
      revenue: 0,
      conversions: 0,
    };

    existingDaily.spend += spend;
    existingDaily.revenue += revenue;
    existingDaily.conversions += conversions;

    dailyMap.set(dateKey, existingDaily);

    // --- Campaign ---
    const campaignId = row.campaignId || "unknown";
    const existingCampaign = campaignMap.get(campaignId) ?? {
      campaignId,
      totalSpend: 0,
      totalRevenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roas: null,
    };

    existingCampaign.totalSpend += spend;
    existingCampaign.totalRevenue += revenue;
    existingCampaign.impressions += impressions;
    existingCampaign.clicks += clicks;
    existingCampaign.conversions += conversions;

    campaignMap.set(campaignId, existingCampaign);
  }

  const roasTotals =
    totalSpend > 0 ? totalRevenue / totalSpend : null;

  const totals: MetaAdTotals = {
    spend: totalSpend,
    revenue: totalRevenue,
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    roas: roasTotals,
  };

  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const campaigns = Array.from(campaignMap.values())
    .map((c) => ({
      ...c,
      roas: c.totalSpend > 0 ? c.totalRevenue / c.totalSpend : null,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return {
    totals,
    daily,
    campaigns,
  };
}
