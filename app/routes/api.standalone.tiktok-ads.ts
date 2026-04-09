// api/standalone/tiktok-ads — TikTok ad performance for standalone dashboard
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, campaigns: [], ads: [], daily: [], hasData: false }));

  const anyDb = db as any;
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const shopFilter = { shop: { in: auth.shops } };

  const [campaignInsights, adInsights, tikTokConn] = await Promise.all([
    anyDb.tikTokCampaignDailyInsight?.findMany?.({
      where: { ...shopFilter, date: { gte: since } },
      orderBy: { date: "asc" },
    }).catch(() => []) ?? [],
    anyDb.tikTokAdDailyInsight?.findMany?.({
      where: { ...shopFilter, date: { gte: since } },
    }).catch(() => []) ?? [],
    anyDb.tikTokConnection?.findFirst?.({ where: shopFilter, select: { lastSyncedAt: true, advertiserId: true } }).catch(() => null),
  ]);

  // Aggregate campaigns
  const campaignMap = new Map<string, any>();
  for (const c of campaignInsights) {
    const key = c.campaignId;
    const existing = campaignMap.get(key) || { campaignId: key, campaignName: c.campaignName, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
    existing.spend += c.spend; existing.impressions += c.impressions; existing.clicks += c.clicks;
    existing.conversions += c.conversions; existing.conversionValue += c.conversionValue;
    if (c.campaignName) existing.campaignName = c.campaignName;
    campaignMap.set(key, existing);
  }

  const campaigns = Array.from(campaignMap.values()).map((c) => ({
    ...c,
    spend: Math.round(c.spend * 100) / 100,
    conversionValue: Math.round(c.conversionValue * 100) / 100,
    ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
    roas: c.spend > 0 ? Math.round((c.conversionValue / c.spend) * 100) / 100 : 0,
  })).sort((a, b) => b.spend - a.spend);

  // Aggregate ads
  const adMap = new Map<string, any>();
  for (const a of adInsights) {
    const key = a.adId;
    const existing = adMap.get(key) || { adId: key, adName: a.adName, adGroupName: a.adGroupName, campaignName: a.campaignName, spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
    existing.spend += a.spend; existing.impressions += a.impressions; existing.clicks += a.clicks;
    existing.conversions += a.conversions; existing.conversionValue += a.conversionValue;
    if (a.adName) existing.adName = a.adName;
    adMap.set(key, existing);
  }

  const ads = Array.from(adMap.values()).map((a) => ({
    ...a,
    spend: Math.round(a.spend * 100) / 100,
    conversionValue: Math.round(a.conversionValue * 100) / 100,
    ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
    roas: a.spend > 0 ? Math.round((a.conversionValue / a.spend) * 100) / 100 : 0,
  })).sort((a, b) => b.spend - a.spend);

  // Daily trend
  const dailyMap = new Map<string, { spend: number; value: number }>();
  for (const c of campaignInsights) {
    const d = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : String(c.date).slice(0, 10);
    const existing = dailyMap.get(d) || { spend: 0, value: 0 };
    existing.spend += c.spend; existing.value += c.conversionValue;
    dailyMap.set(d, existing);
  }
  const daily = Array.from(dailyMap.entries()).map(([date, d]) => ({
    date, spend: Math.round(d.spend * 100) / 100, value: Math.round(d.value * 100) / 100,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalValue = campaigns.reduce((s, c) => s + c.conversionValue, 0);

  const bestCampaign = campaigns.filter((c) => c.spend > 0).sort((a, b) => b.roas - a.roas)[0] || null;
  const worstCampaign = campaigns.filter((c) => c.spend > 0 && c.roas < 1).sort((a, b) => a.roas - b.roas)[0] || null;

  return standaloneCors(request, json({
    ok: true, hasData: campaigns.length > 0,
    campaigns, ads, daily,
    totals: {
      spend: Math.round(totalSpend * 100) / 100,
      impressions: totalImpressions, clicks: totalClicks,
      conversions: totalConversions, value: Math.round(totalValue * 100) / 100,
      ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
      roas: totalSpend > 0 ? Math.round((totalValue / totalSpend) * 100) / 100 : 0,
    },
    bestCampaign, worstCampaign,
    lastSyncedAt: tikTokConn?.lastSyncedAt?.toISOString() || null,
    connected: !!tikTokConn,
  }));
}
