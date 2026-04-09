// api/standalone/creative — Ad creative / ad-level analytics for standalone dashboard
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, ads: [], hasData: false }));

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const shopFilter = { shop: { in: auth.shops } };

  // Meta ad-level insights
  const metaAds = await db.metaAdDailyInsight.findMany({
    where: { ...shopFilter, date: { gte: since } },
    select: {
      adId: true, adName: true, adSetName: true, campaignName: true,
      spend: true, impressions: true, clicks: true, ctr: true, cpc: true,
      purchases: true, purchaseValue: true,
    },
  }).catch(() => []);

  // Aggregate by ad
  const adMap = new Map<string, any>();
  for (const a of metaAds) {
    const key = a.adId;
    const existing = adMap.get(key) || {
      adId: key, adName: a.adName, adSetName: a.adSetName, campaignName: a.campaignName,
      platform: "meta",
      spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0,
    };
    existing.spend += a.spend;
    existing.impressions += a.impressions;
    existing.clicks += a.clicks;
    existing.purchases += a.purchases;
    existing.purchaseValue += a.purchaseValue;
    if (a.adName) existing.adName = a.adName;
    if (a.adSetName) existing.adSetName = a.adSetName;
    if (a.campaignName) existing.campaignName = a.campaignName;
    adMap.set(key, existing);
  }

  const ads = Array.from(adMap.values()).map((a) => ({
    ...a,
    spend: Math.round(a.spend * 100) / 100,
    purchaseValue: Math.round(a.purchaseValue * 100) / 100,
    ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
    cpc: a.clicks > 0 ? Math.round((a.spend / a.clicks) * 100) / 100 : 0,
    roas: a.spend > 0 ? Math.round((a.purchaseValue / a.spend) * 100) / 100 : 0,
    cpa: a.purchases > 0 ? Math.round((a.spend / a.purchases) * 100) / 100 : 0,
  })).sort((a, b) => b.spend - a.spend);

  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalValue = ads.reduce((s, a) => s + a.purchaseValue, 0);
  const bestAd = ads.filter(a => a.spend > 0).sort((a, b) => b.roas - a.roas)[0] || null;
  const worstAd = ads.filter(a => a.spend > 0 && a.roas < 1).sort((a, b) => a.roas - b.roas)[0] || null;

  return standaloneCors(request, json({
    ok: true,
    hasData: ads.length > 0,
    ads,
    totals: {
      spend: Math.round(totalSpend * 100) / 100,
      value: Math.round(totalValue * 100) / 100,
      roas: totalSpend > 0 ? Math.round((totalValue / totalSpend) * 100) / 100 : 0,
      adCount: ads.length,
    },
    bestAd,
    worstAd,
    days,
  }));
}
