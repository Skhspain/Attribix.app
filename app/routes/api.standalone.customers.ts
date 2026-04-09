// app/routes/api.standalone.customers.ts
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
    return standaloneCors(request, json({ ok: true, customers: [] }));
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "90", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get purchases with attribution
  const purchases = await db.purchase.findMany({
    where: { shop: { in: auth.shops }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, orderId: true, totalValue: true, currency: true, createdAt: true,
      utmSource: true, utmMedium: true, utmCampaign: true,
      fbclid: true, gclid: true, country: true, city: true,
      visitorId: true, referrer: true,
    },
  });

  // Get touchpoints for these orders to build paths
  const orderIds = purchases.map((p) => p.orderId).filter(Boolean) as string[];
  const touchpoints = orderIds.length > 0
    ? await db.purchaseTouchpoint.findMany({
        where: { orderId: { in: orderIds }, shop: { in: auth.shops } },
        select: { orderId: true, channel: true, position: true, utmSource: true },
        orderBy: { position: "asc" },
      })
    : [];

  const pathMap = new Map<string, string[]>();
  for (const tp of touchpoints) {
    const arr = pathMap.get(tp.orderId) || [];
    arr.push(tp.channel || tp.utmSource || "direct");
    pathMap.set(tp.orderId, arr);
  }

  const customers = purchases.map((p, i) => {
    const path = p.orderId ? pathMap.get(p.orderId) || [] : [];
    const source = p.utmSource || (p.fbclid ? "meta" : p.gclid ? "google" : "direct");

    return {
      id: p.id,
      name: `Customer ${i + 1}`,
      email: null,
      phone: null,
      country: p.country || null,
      orderId: p.orderId || p.id,
      value: p.totalValue,
      currency: p.currency,
      attributed: `${source} $${p.totalValue.toFixed(2)}`,
      path: path.length > 0 ? path.join(" → ") : source,
      utmSource: p.utmSource,
      utmCampaign: p.utmCampaign,
      createdAt: p.createdAt.toISOString(),
    };
  });

  return standaloneCors(request, json({ ok: true, customers }));
}
