// app/routes/api.standalone.attribution.ts
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
    return standaloneCors(request, json({ ok: true, channelRows: [], sampleJourneys: [], hasData: false }));
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const touchpoints = await db.purchaseTouchpoint.findMany({
    where: { shop: { in: auth.shops }, createdAt: { gte: since } },
    select: {
      orderId: true, channel: true, revenue: true, currency: true,
      totalSteps: true, position: true, touchedAt: true,
      creditFirstTouch: true, creditLastTouch: true, creditLinear: true, creditTimeDecay: true,
      utmSource: true, utmCampaign: true,
    },
    orderBy: { touchedAt: "asc" },
  });

  if (touchpoints.length === 0) {
    return standaloneCors(request, json({ ok: true, channelRows: [], sampleJourneys: [], hasData: false }));
  }

  // Aggregate by channel
  const channelMap = new Map<string, {
    first: number; last: number; linear: number; timeDecay: number; orders: Set<string>;
  }>();

  for (const tp of touchpoints) {
    const ch = tp.channel || "Unknown";
    const existing = channelMap.get(ch) || { first: 0, last: 0, linear: 0, timeDecay: 0, orders: new Set() };
    existing.first += (tp.creditFirstTouch || 0) * (tp.revenue || 0);
    existing.last += (tp.creditLastTouch || 0) * (tp.revenue || 0);
    existing.linear += (tp.creditLinear || 0) * (tp.revenue || 0);
    existing.timeDecay += (tp.creditTimeDecay || 0) * (tp.revenue || 0);
    existing.orders.add(tp.orderId);
    channelMap.set(ch, existing);
  }

  const channelRows = Array.from(channelMap.entries())
    .map(([channel, d]) => ({
      channel,
      revenueFirstTouch: Math.round(d.first * 100) / 100,
      revenueLastTouch: Math.round(d.last * 100) / 100,
      revenueLinear: Math.round(d.linear * 100) / 100,
      revenueTimeDecay: Math.round(d.timeDecay * 100) / 100,
      orders: d.orders.size,
    }))
    .sort((a, b) => b.revenueLastTouch - a.revenueLastTouch);

  // Sample journeys (up to 5 multi-touch orders)
  const orderMap = new Map<string, typeof touchpoints>();
  for (const tp of touchpoints) {
    const arr = orderMap.get(tp.orderId) || [];
    arr.push(tp);
    orderMap.set(tp.orderId, arr);
  }

  const multiTouch = Array.from(orderMap.entries())
    .filter(([, steps]) => steps.length > 1)
    .slice(0, 5);

  const sampleJourneys = multiTouch.map(([orderId, steps]) => ({
    orderId,
    revenue: steps[0]?.revenue || 0,
    currency: steps[0]?.currency || "USD",
    steps: steps.map((s) => ({
      position: s.position,
      channel: s.channel,
      utmCampaign: s.utmCampaign,
      touchedAt: s.touchedAt?.toISOString(),
      creditLinear: s.creditLinear,
      creditTimeDecay: s.creditTimeDecay,
    })),
  }));

  const allOrders = new Set(touchpoints.map((t) => t.orderId));
  const multiTouchOrders = Array.from(orderMap.values()).filter((s) => s.length > 1).length;
  const totalSteps = touchpoints.length;

  return standaloneCors(request, json({
    ok: true,
    hasData: true,
    channelRows,
    sampleJourneys,
    totalTrackedOrders: allOrders.size,
    multiTouchOrders,
    avgJourneyLength: allOrders.size > 0 ? Math.round((totalSteps / allOrders.size) * 10) / 10 : 0,
    currency: touchpoints[0]?.currency || "USD",
    days,
  }));
}
