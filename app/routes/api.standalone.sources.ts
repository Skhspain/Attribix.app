// app/routes/api.standalone.sources.ts
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
  const url = new URL(request.url);

  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const eventWhere: any =
    auth.shops.length > 0
      ? { OR: [{ shop: { in: auth.shops } }, { accountId: auth.accountId }], createdAt: { gte: since } }
      : { accountId: auth.accountId, createdAt: { gte: since } };

  const purchaseWhere: any =
    auth.shops.length > 0
      ? { shop: { in: auth.shops }, createdAt: { gte: since } }
      : { id: "___none___" };

  const [eventsBySource, purchasesBySource, totalEvents, totalPurchases] =
    await Promise.all([
      db.trackedEvent.groupBy({
        by: ["utmSource"],
        where: eventWhere,
        _count: true,
        orderBy: { _count: { id: "desc" } },
        take: 20,
      }),
      db.purchase.groupBy({
        by: ["utmSource"],
        where: purchaseWhere,
        _count: true,
        _sum: { totalValue: true },
        orderBy: { _sum: { totalValue: "desc" } },
        take: 20,
      }),
      db.trackedEvent.count({ where: eventWhere }),
      db.purchase.count({ where: purchaseWhere }),
    ]);

  const sourceMap = new Map<string, { events: number; purchases: number; revenue: number }>();

  for (const s of eventsBySource) {
    const key = s.utmSource || "direct";
    const count = typeof s._count === "number" ? s._count : (s._count as any)?.id || 0;
    sourceMap.set(key, { events: count, purchases: 0, revenue: 0 });
  }

  for (const s of purchasesBySource) {
    const key = s.utmSource || "direct";
    const count = typeof s._count === "number" ? s._count : (s._count as any)?.id || 0;
    const existing = sourceMap.get(key) || { events: 0, purchases: 0, revenue: 0 };
    existing.purchases = count;
    existing.revenue = s._sum?.totalValue || 0;
    sourceMap.set(key, existing);
  }

  const sources = Array.from(sourceMap.entries())
    .map(([source, data]) => ({
      source,
      events: data.events,
      purchases: data.purchases,
      revenue: Math.round(data.revenue * 100) / 100,
      cvr: data.events > 0 ? Math.round((data.purchases / data.events) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return standaloneCors(
    request,
    json({ ok: true, sources, totals: { events: totalEvents, purchases: totalPurchases } })
  );
}
