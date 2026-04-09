// app/routes/api.standalone.overview.ts
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

  // TrackedEvent: filter by shops OR accountId
  const eventWhere: any =
    auth.shops.length > 0
      ? { OR: [{ shop: { in: auth.shops } }, { accountId: auth.accountId }], createdAt: { gte: since } }
      : { accountId: auth.accountId, createdAt: { gte: since } };

  // Purchase: filter by shops only (no accountId on Purchase model yet)
  const purchaseWhere: any =
    auth.shops.length > 0
      ? { shop: { in: auth.shops }, createdAt: { gte: since } }
      : { id: "___none___" }; // no shops = no purchases visible yet

  const spendWhere: any =
    auth.shops.length > 0
      ? { shop: { in: auth.shops }, date: { gte: since } }
      : { id: "___none___" };

  const [totalEvents, totalPurchases, revenueAgg, spendAgg, sourceBreakdown, recentPurchases] =
    await Promise.all([
      db.trackedEvent.count({ where: eventWhere }),
      db.purchase.count({ where: purchaseWhere }),
      db.purchase.aggregate({ where: purchaseWhere, _sum: { totalValue: true } }),
      auth.shops.length > 0
        ? db.adSpendDaily.aggregate({ where: spendWhere, _sum: { spend: true } })
        : Promise.resolve({ _sum: { spend: 0 } }),
      db.trackedEvent.groupBy({
        by: ["utmSource"],
        where: eventWhere,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      db.purchase.findMany({
        where: purchaseWhere,
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          totalValue: true,
          currency: true,
          orderId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
        },
      }),
    ]);

  const revenue = revenueAgg._sum?.totalValue || 0;
  const spend = (spendAgg._sum as any)?.spend || 0;
  const orders = totalPurchases;
  const aov = orders > 0 ? revenue / orders : 0;
  const roas = spend > 0 ? revenue / spend : 0;

  const sources = sourceBreakdown.map((s) => ({
    source: s.utmSource || "direct",
    count: s._count.id,
  }));

  return standaloneCors(
    request,
    json({
      ok: true,
      accountId: auth.accountId,
      shops: auth.shops,
      period: { days, since: since.toISOString() },
      metrics: {
        revenue: Math.round(revenue * 100) / 100,
        orders,
        aov: Math.round(aov * 100) / 100,
        spend: Math.round(spend * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        totalEvents,
      },
      sources,
      recentPurchases,
    })
  );
}
