// api/standalone/products — Product analytics for standalone dashboard
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "~/db.server";
import { authenticateStandalone, standaloneCors, standaloneOptions } from "~/utils/standalone-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const preflight = standaloneOptions(request);
  if (preflight) return preflight;

  const auth = await authenticateStandalone(request);
  if (auth.shops.length === 0) return standaloneCors(request, json({ ok: true, products: [] }));

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const shopFilter = { shop: { in: auth.shops } };

  // Get purchases with product data
  const purchases = await db.purchase.findMany({
    where: { ...shopFilter, createdAt: { gte: since } },
    select: {
      totalValue: true,
      currency: true,
      createdAt: true,
      lineItems: true, // JSON string of line items
    },
  }).catch(() => []);

  // Aggregate by product
  const productMap = new Map<string, {
    productId: string;
    title: string;
    revenue: number;
    units: number;
    orders: number;
    currency: string;
  }>();

  for (const purchase of purchases) {
    let items: any[] = [];
    try {
      items = typeof purchase.lineItems === "string" ? JSON.parse(purchase.lineItems) : (purchase.lineItems as any) || [];
    } catch { continue; }

    for (const item of items) {
      const pid = String(item.productId || item.id || "unknown");
      const existing = productMap.get(pid) || {
        productId: pid,
        title: item.title || item.name || pid,
        revenue: 0,
        units: 0,
        orders: 0,
        currency: purchase.currency || "USD",
      };

      const price = typeof item.price === "object" ? (item.price?.amount || 0) : (item.price || 0);
      const qty = item.quantity || 1;

      existing.revenue += price * qty;
      existing.units += qty;
      existing.orders += 1;
      if (item.title) existing.title = item.title;
      productMap.set(pid, existing);
    }
  }

  const products = Array.from(productMap.values())
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      aov: p.orders > 0 ? Math.round((p.revenue / p.orders) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 100);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalUnits = products.reduce((s, p) => s + p.units, 0);
  const totalOrders = purchases.length;

  return standaloneCors(request, json({
    ok: true,
    products,
    totals: { revenue: Math.round(totalRevenue * 100) / 100, units: totalUnits, orders: totalOrders },
    days,
  }));
}
