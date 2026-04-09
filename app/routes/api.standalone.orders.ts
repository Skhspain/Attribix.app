// app/routes/api.standalone.orders.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, orders: [], stats: {} }));

  const shopFilter = { shop: { in: auth.shops } };
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [orders, totalRevenue, orderCount] = await Promise.all([
    db.purchase.findMany({
      where: { ...shopFilter, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, orderId: true, totalValue: true, currency: true,
        createdAt: true, utmSource: true, utmMedium: true, utmCampaign: true,
        fbclid: true, gclid: true, country: true, city: true,
        visitorId: true, referrer: true, landingPage: true,
      },
    }),
    db.purchase.aggregate({
      where: { ...shopFilter, createdAt: { gte: since } },
      _sum: { totalValue: true },
    }),
    db.purchase.count({
      where: { ...shopFilter, createdAt: { gte: since } },
    }),
  ]);

  const revenue = totalRevenue._sum?.totalValue || 0;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  return standaloneCors(request, json({
    ok: true,
    orders,
    stats: {
      totalOrders: orderCount,
      totalRevenue: Math.round(revenue * 100) / 100,
      aov: Math.round(aov * 100) / 100,
      currency: orders[0]?.currency || "USD",
    },
  }));
}
