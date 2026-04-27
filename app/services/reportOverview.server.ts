// app/services/reportOverview.server.ts
//
// Single source of truth for the headline "overview" metrics shown on:
//   - the Shopify-embedded dashboard (app/routes/app._index.jsx)   — one shop
//   - attribix.com /analytics                                      — many shops, cross-platform
//
// Data is platform-agnostic: every row in TrackedEvent / Purchase / AdSpendDaily
// carries a `shop` identifier (Shopify domain, WooCommerce site, future Kajabi, etc.).
// Callers pass the list of shops they're allowed to see.

import { db } from "~/db.server";

export type OverviewRange = { from: Date; to: Date };

export type OverviewMetrics = {
  visits: number;
  conversions: number;
  revenue: number;
  adspend: number;
  roas: number | null;
  cpp: number | null;
  confirmedRevenue: number;
};

export type OverviewResult = {
  range: { from: string; to: string };
  metrics: OverviewMetrics;
};

export type GetOverviewArgs = {
  shops: string[];
  from: Date;
  to: Date;
};

export async function getOverview(args: GetOverviewArgs): Promise<OverviewResult> {
  const { shops, from, to } = args;

  if (shops.length === 0) {
    return emptyResult(from, to);
  }

  const [visits, conversions, revenueAgg, adspendAgg, confirmedAgg] = await Promise.all([
    db.trackedEvent.count({
      where: {
        shop: { in: shops },
        createdAt: { gte: from, lte: to },
      },
    }),
    db.purchase.count({
      where: {
        shop: { in: shops },
        createdAt: { gte: from, lte: to },
      },
    }),
    db.purchase.aggregate({
      where: {
        shop: { in: shops },
        createdAt: { gte: from, lte: to },
      },
      _sum: { totalValue: true },
    }),
    db.adSpendDaily.aggregate({
      where: {
        shop: { in: shops },
        date: { gte: from, lte: to },
      },
      _sum: { spend: true },
    }),
    // "Confirmed" = purchases we can attribute to a paid channel (has a click ID
    // or a recognisable utm_source). Used by the dashboard "Confirmed Revenue (Ads)" card.
    db.purchase.aggregate({
      where: {
        shop: { in: shops },
        createdAt: { gte: from, lte: to },
        OR: [
          { fbclid: { not: null } },
          { gclid: { not: null } },
          { ttclid: { not: null } },
          { msclkid: { not: null } },
          { utmSource: { not: null } },
        ],
      },
      _sum: { totalValue: true },
    }),
  ]);

  const revenue = Number(revenueAgg._sum.totalValue ?? 0);
  const adspend = Number(adspendAgg._sum.spend ?? 0);
  const confirmedRevenue = Number(confirmedAgg._sum.totalValue ?? 0);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    metrics: {
      visits,
      conversions,
      revenue,
      adspend,
      roas: adspend > 0 ? revenue / adspend : null,
      cpp: conversions > 0 ? adspend / conversions : null,
      confirmedRevenue,
    },
  };
}

function emptyResult(from: Date, to: Date): OverviewResult {
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    metrics: {
      visits: 0,
      conversions: 0,
      revenue: 0,
      adspend: 0,
      roas: null,
      cpp: null,
      confirmedRevenue: 0,
    },
  };
}

export function parseRange(searchParams: URLSearchParams, defaultDays = 30): OverviewRange {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);

  return { from, to };
}
