// app/routes/api.standalone.behavior.ts
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
    return standaloneCors(request, json({ ok: true, steps: [], metrics: [] }));
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

  const shopFilter = { shop: { in: auth.shops } };

  // Get top pages by visit count
  const topPages = await db.trackedEvent.groupBy({
    by: ["url"],
    where: { ...shopFilter, createdAt: { gte: since }, eventName: "page_viewed" },
    _count: true,
    orderBy: { _count: { url: "desc" } },
    take: 20,
  });

  // Current + previous period metrics
  const [currentEvents, prevEvents, currentPurchases, prevPurchases, currentSpend, prevSpend] =
    await Promise.all([
      db.trackedEvent.count({ where: { ...shopFilter, createdAt: { gte: since } } }),
      db.trackedEvent.count({ where: { ...shopFilter, createdAt: { gte: prevSince, lt: since } } }),
      db.purchase.count({ where: { ...shopFilter, createdAt: { gte: since } } }),
      db.purchase.count({ where: { ...shopFilter, createdAt: { gte: prevSince, lt: since } } }),
      db.adSpendDaily.aggregate({ where: { ...shopFilter, date: { gte: since } }, _sum: { spend: true } }),
      db.adSpendDaily.aggregate({ where: { ...shopFilter, date: { gte: prevSince, lt: since } }, _sum: { spend: true } }),
    ]);

  const spend = currentSpend._sum?.spend || 0;
  const pSpend = prevSpend._sum?.spend || 0;

  function pctChange(curr: number, prev: number): string {
    if (prev === 0) return curr > 0 ? "+100%" : "0%";
    const pct = ((curr - prev) / prev) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }

  const metrics = [
    { label: "Total visits (30d)", value: currentEvents.toLocaleString(), change: pctChange(currentEvents, prevEvents), positive: currentEvents >= prevEvents },
    { label: "Conversions", value: currentPurchases.toLocaleString(), change: pctChange(currentPurchases, prevPurchases), positive: currentPurchases >= prevPurchases },
    { label: "Ad Spend", value: `$${spend.toFixed(0)}`, change: pctChange(spend, pSpend), positive: spend <= pSpend },
    { label: "ROAS", value: spend > 0 ? `${(currentPurchases > 0 ? (currentPurchases / spend * 100).toFixed(0) : 0)}%` : "—", change: "", positive: true },
  ];

  // Build page flow steps from top pages
  const totalVisits = topPages.reduce((sum, p) => sum + (typeof p._count === "number" ? p._count : 0), 0);
  const pages = topPages
    .filter((p) => p.url)
    .map((p) => {
      const count = typeof p._count === "number" ? p._count : 0;
      let path = p.url || "/";
      try { path = new URL(p.url!).pathname; } catch {}
      return {
        title: path,
        path,
        share: totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0,
        visits: count,
      };
    });

  const steps = [
    { label: "Top pages", pages: pages.slice(0, 8) },
  ];

  return standaloneCors(request, json({ ok: true, steps, metrics }));
}
