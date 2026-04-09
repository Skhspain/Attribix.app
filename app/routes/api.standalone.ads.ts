// app/routes/api.standalone.ads.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import {
  authenticateStandalone,
  standaloneCors,
  standaloneOptions,
} from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);

  if (auth.shops.length === 0) {
    return standaloneCors(request, json({ ok: true, ads: [], campaigns: [] }));
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

  const shopFilter = { shop: { in: auth.shops } };

  // Current period: ad-level
  const currentAds = await db.metaAdDailyInsight.groupBy({
    by: ["adId", "adName", "adSetName", "campaignName", "campaignId"],
    where: { ...shopFilter, date: { gte: since } },
    _sum: { spend: true, purchases: true, purchaseValue: true, impressions: true, clicks: true },
  });

  // Previous period: ad-level
  const prevAds = await db.metaAdDailyInsight.groupBy({
    by: ["adId"],
    where: { ...shopFilter, date: { gte: prevSince, lt: since } },
    _sum: { spend: true, purchases: true, purchaseValue: true },
  });

  const prevMap = new Map(prevAds.map((p) => [p.adId, p._sum]));

  const ads = currentAds.map((a) => {
    const prev = prevMap.get(a.adId);
    return {
      id: a.adId,
      platform: "Meta" as const,
      name: a.adName || a.adId,
      campaign: a.campaignName || a.campaignId || "",
      adset: a.adSetName || "",
      spend: Math.round((a._sum.spend || 0) * 100) / 100,
      purchases: a._sum.purchases || 0,
      revenue: Math.round((a._sum.purchaseValue || 0) * 100) / 100,
      prevSpend: Math.round((prev?.spend || 0) * 100) / 100,
      prevPurchases: prev?.purchases || 0,
      prevRevenue: Math.round((prev?.purchaseValue || 0) * 100) / 100,
    };
  });

  // Sort by spend descending
  ads.sort((a, b) => b.spend - a.spend);

  // Campaign-level aggregation
  const campaignMap = new Map<string, { spend: number; purchases: number; revenue: number }>();
  for (const ad of ads) {
    const key = ad.campaign;
    const existing = campaignMap.get(key) || { spend: 0, purchases: 0, revenue: 0 };
    existing.spend += ad.spend;
    existing.purchases += ad.purchases;
    existing.revenue += ad.revenue;
    campaignMap.set(key, existing);
  }

  const campaigns = Array.from(campaignMap.entries())
    .map(([name, data]) => ({
      name,
      spend: Math.round(data.spend * 100) / 100,
      purchases: data.purchases,
      revenue: Math.round(data.revenue * 100) / 100,
      roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 100) / 100 : 0,
      cpp: data.purchases > 0 ? Math.round((data.spend / data.purchases) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Google ads (from AdSpendDaily)
  const googleSpend = await db.adSpendDaily.groupBy({
    by: ["campaign"],
    where: { ...shopFilter, platform: "google", date: { gte: since } },
    _sum: { spend: true },
  });

  const googleAds = googleSpend.map((g) => ({
    id: `google-${g.campaign || "unknown"}`,
    platform: "Google" as const,
    name: g.campaign || "Google Ads",
    campaign: g.campaign || "Google Ads",
    adset: "",
    spend: Math.round((g._sum.spend || 0) * 100) / 100,
    purchases: 0,
    revenue: 0,
    prevSpend: 0,
    prevPurchases: 0,
    prevRevenue: 0,
  }));

  return standaloneCors(
    request,
    json({ ok: true, ads: [...ads, ...googleAds], campaigns })
  );
}
