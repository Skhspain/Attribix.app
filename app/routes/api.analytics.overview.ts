// app/routes/api.analytics.overview.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { AdPlatform, type TrackedEvent, type AdDailyStat } from "@prisma/client";

const EXPECTED_KEY =
  process.env.REPORTS_API_KEY ?? "attribix-super-secret-KEY-987asf987asf";

const DEFAULT_SHOP_ID =
  process.env.DEFAULT_SHOP_ID ?? "attribix-com.myshopify.com";

// same guard as other internal endpoints
function checkApiKey(request: Request) {
  const provided = request.headers.get("x-attribix-key");
  if (!provided || provided !== EXPECTED_KEY) {
    throw json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    checkApiKey(request);
  } catch (err) {
    throw err;
  }

  const now = new Date();
  const since = new Date();
  since.setDate(now.getDate() - 30); // last 30 days

  // 1) Pull events
  const events: TrackedEvent[] = await prisma.trackedEvent.findMany({
    where: {
      timestamp: {
        gte: since,
      },
    },
  });

  const totalVisits = events.length;

  const conversionNames = [
    "purchase",
    "track_purchase",
    "conversion",
    "debug_purchase",
  ];

  const conversions = events.filter((e: TrackedEvent) =>
    conversionNames.includes(e.eventName)
  ).length;

  const revenue = events.reduce<number>(
    (sum: number, e: TrackedEvent) => sum + (e.value ?? 0),
    0
  );

  // Sessions by source
  const sessionsBySourceMap = new Map<string, number>();
  for (const e of events) {
    const source =
      e.utmSource ||
      (e.url?.startsWith("https://www.facebook.com") ? "Facebook" : null) ||
      "Direct";

    sessionsBySourceMap.set(source, (sessionsBySourceMap.get(source) ?? 0) + 1);
  }

  const sessionsBySource = Array.from(sessionsBySourceMap.entries()).map(
    ([source, sessions]) => ({ source, sessions })
  );

  // overview series – visits per day
  const daysMap = new Map<string, number>(); // YYYY-MM-DD -> visits

  for (const e of events) {
    const d = e.timestamp.toISOString().slice(0, 10);
    daysMap.set(d, (daysMap.get(d) ?? 0) + 1);
  }

  const overviewSeries = Array.from(daysMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, visits]) => ({
      date,
      visits,
    }));

  // 2) Pull ad stats from AdDailyStat (Meta) for same period
  const adStats: AdDailyStat[] = await prisma.adDailyStat.findMany({
    where: {
      shopId: DEFAULT_SHOP_ID,
      platform: AdPlatform.META,
      date: {
        gte: since,
      },
    },
  });

  const adSpend = adStats.reduce<number>(
    (sum: number, row: AdDailyStat) => sum + row.spend,
    0
  );
  const adsConversions = adStats.reduce<number>(
    (sum: number, row: AdDailyStat) => sum + row.conversions,
    0
  );
  const adsRevenue = adStats.reduce<number>(
    (sum: number, row: AdDailyStat) => sum + (row.revenue ?? 0),
    0
  );

  const roas = adSpend > 0 ? adsRevenue / adSpend : 0;

  return json({
    ok: true,
    range: {
      since: since.toISOString(),
      until: now.toISOString(),
    },
    metrics: {
      totalVisits,
      conversions,
      revenue,
      adSpend,
      confirmedRevenueAds: adsRevenue,
      roas,
      adsConversions,
    },
    overviewSeries,
    sessionsBySource,
  });
}
