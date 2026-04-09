// app/routes/api.standalone.google-ads.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, campaigns: [], daily: [], hasData: false }));

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const shopFilter = { shop: { in: auth.shops } };

  const [spendData, googleConn] = await Promise.all([
    db.adSpendDaily.findMany({
      where: { ...shopFilter, platform: "google", date: { gte: since } },
      select: { date: true, spend: true, campaign: true, adset: true, ad: true },
      orderBy: { date: "asc" },
    }),
    db.googleConnection.findFirst({ where: shopFilter, select: { adCustomerId: true, createdAt: true } }),
  ]);

  // Aggregate by campaign
  const campaignMap = new Map<string, { spend: number; days: number }>();
  for (const s of spendData) {
    const key = s.campaign || "Google Ads";
    const existing = campaignMap.get(key) || { spend: 0, days: 0 };
    existing.spend += s.spend; existing.days++;
    campaignMap.set(key, existing);
  }

  const campaigns = Array.from(campaignMap.entries()).map(([name, d]) => ({
    name, spend: Math.round(d.spend * 100) / 100, days: d.days,
  })).sort((a, b) => b.spend - a.spend);

  // Daily trend
  const dailyMap = new Map<string, number>();
  for (const s of spendData) {
    const d = s.date.toISOString().slice(0, 10);
    dailyMap.set(d, (dailyMap.get(d) || 0) + s.spend);
  }
  const daily = Array.from(dailyMap.entries()).map(([date, spend]) => ({
    date, spend: Math.round(spend * 100) / 100,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  return standaloneCors(request, json({
    ok: true, hasData: campaigns.length > 0,
    campaigns, daily,
    totalSpend: Math.round(totalSpend * 100) / 100,
    connected: !!googleConn,
  }));
}
