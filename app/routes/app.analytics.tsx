// app/routes/app.analytics.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Grid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const anyDb = db as any;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const shopFilter = { shop };

  const [
    events,
    orders,
    revenue,
    spend,
    latest,
    allPurchases,
    spendRows,
    recentTrackedEvents,
    recentPurchases,
    metaCampaigns,
  ] = await Promise.all([
    anyDb.trackedEvent?.count?.({ where: shopFilter }).catch(() => 0),
    anyDb.purchase?.count?.({ where: shopFilter }).catch(() => 0),
    anyDb.purchase
      ?.aggregate?.({ where: shopFilter, _sum: { totalValue: true } })
      .catch(() => ({ _sum: { totalValue: 0 } })),
    anyDb.adSpendDaily
      ?.aggregate?.({ where: shopFilter, _sum: { spend: true } })
      .catch(() => ({ _sum: { spend: 0 } })),
    anyDb.purchase
      ?.findMany?.({
        where: shopFilter,
        orderBy: { createdAt: "desc" },
        take: 10,
      })
      .catch(() => []),
    anyDb.purchase
      ?.findMany?.({
        where: shopFilter,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderId: true,
          shop: true,
          visitorId: true,
          sessionId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          totalValue: true,
          currency: true,
          fbclid: true,
          gclid: true,
          ttclid: true,
          msclkid: true,
          createdAt: true,
        },
      })
      .catch(() => []),
    anyDb.adSpendDaily
      ?.findMany?.({
        where: shopFilter,
        orderBy: { date: "desc" },
        select: {
          platform: true,
          campaign: true,
          spend: true,
          date: true,
        },
      })
      .catch(() => []),
    anyDb.trackedEvent
      ?.findMany?.({
        where: {
          shop,
          createdAt: { gte: since30 },
        },
        select: {
          eventName: true,
          visitorId: true,
          utmSource: true,
          fbclid: true,
          gclid: true,
          ttclid: true,
          msclkid: true,
          createdAt: true,
        },
      })
      .catch(() => []),
    anyDb.purchase
      ?.findMany?.({
        where: {
          shop,
          createdAt: { gte: since30 },
        },
        select: {
          id: true,
          orderId: true,
          visitorId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          totalValue: true,
          currency: true,
          fbclid: true,
          gclid: true,
          ttclid: true,
          msclkid: true,
          createdAt: true,
        },
      })
      .catch(() => []),
    // Meta campaign-level data from Ads Manager sync
    anyDb.metaCampaignDailyInsight
      ?.findMany?.({
        where: { shop, date: { gte: since30 } },
        select: {
          campaignId: true,
          campaignName: true,
          spend: true,
          purchases: true,
          purchaseValue: true,
          date: true,
        },
        orderBy: { date: "desc" },
      })
      .catch(() => []),
  ]);

  return json({
    shop,
    events: events ?? 0,
    orders: orders ?? 0,
    revenue: revenue?._sum?.totalValue ?? 0,
    spend: spend?._sum?.spend ?? 0,
    latest: latest ?? [],
    allPurchases: allPurchases ?? [],
    spendRows: spendRows ?? [],
    recentTrackedEvents: recentTrackedEvents ?? [],
    recentPurchases: recentPurchases ?? [],
    metaCampaigns: metaCampaigns ?? [],
  });
}

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSource(item: any) {
  const rawSource = String(item?.utmSource || "").toLowerCase().trim();

  if (rawSource) {
    if (
      rawSource.includes("google") ||
      rawSource.includes("adwords") ||
      rawSource.includes("google_ads") ||
      rawSource.includes("googleads")
    ) {
      return "google";
    }

    if (
      rawSource.includes("meta") ||
      rawSource.includes("facebook") ||
      rawSource.includes("instagram")
    ) {
      return "meta";
    }

    if (rawSource.includes("tiktok")) {
      return "tiktok";
    }

    if (rawSource.includes("snap")) {
      return "snapchat";
    }

    if (rawSource.includes("bing") || rawSource.includes("microsoft")) {
      return "microsoft";
    }

    return rawSource;
  }

  if (item?.gclid) return "google";
  if (item?.fbclid) return "meta";
  if (item?.ttclid) return "tiktok";
  if (item?.msclkid) return "microsoft";

  return "unknown";
}

function normalizePlatform(platform: string | null | undefined) {
  const p = String(platform || "").toLowerCase().trim();

  if (!p) return "unknown";
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) {
    return "meta";
  }
  if (p.includes("google") || p.includes("adwords")) {
    return "google";
  }
  if (p.includes("tiktok")) {
    return "tiktok";
  }
  if (p.includes("snap")) {
    return "snapchat";
  }
  if (p.includes("bing") || p.includes("microsoft")) {
    return "microsoft";
  }

  return p;
}

function toneForSource(source: string) {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) {
    return "info";
  }
  if (s.includes("google")) {
    return "success";
  }
  if (s.includes("tiktok")) {
    return "attention";
  }
  if (s.includes("snap")) {
    return "warning";
  }
  if (s.includes("microsoft") || s.includes("bing")) {
    return "magic";
  }
  return "new";
}

function dayKey(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function displayDayLabel(isoDate: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm" tone="subdued">
          {title}
        </Text>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        {subtitle ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {subtitle}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function MiniBarChart({
  data,
}: {
  data: Array<{ label: string; revenue: number; spend: number }>;
}) {
  const maxValue = Math.max(
    1,
    ...data.flatMap((d) => [safeNumber(d.revenue), safeNumber(d.spend)]),
  );

  return (
    <div>
      <InlineStack gap="400" blockAlign="center">
        <InlineStack gap="150" blockAlign="center">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#111827",
            }}
          />
          <Text as="span" variant="bodySm" tone="subdued">
            Revenue
          </Text>
        </InlineStack>
        <InlineStack gap="150" blockAlign="center">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#9ca3af",
            }}
          />
          <Text as="span" variant="bodySm" tone="subdued">
            Spend
          </Text>
        </InlineStack>
      </InlineStack>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          gap: 8,
          alignItems: "end",
          minHeight: 220,
        }}
      >
        {data.map((row) => {
          const revenueHeight = `${(safeNumber(row.revenue) / maxValue) * 100}%`;
          const spendHeight = `${(safeNumber(row.spend) / maxValue) * 100}%`;

          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "end",
                alignItems: "center",
                minWidth: 0,
              }}
            >
              <div
                title={`${row.label} • Revenue ${row.revenue} • Spend ${row.spend}`}
                style={{
                  width: "100%",
                  height: 180,
                  display: "flex",
                  alignItems: "end",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: "38%",
                    minHeight: 2,
                    height: revenueHeight,
                    borderRadius: 4,
                    background: "#111827",
                  }}
                />
                <div
                  style={{
                    width: "38%",
                    minHeight: 2,
                    height: spendHeight,
                    borderRadius: 4,
                    background: "#9ca3af",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#6b7280",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AppAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [showDebug, setShowDebug] = useState(false);

  const revenueValue = safeNumber(data.revenue);
  const spendValue = safeNumber(data.spend);
  const ordersValue = safeNumber(data.orders);
  const eventsValue = safeNumber(data.events);
  const roas = spendValue > 0 ? revenueValue / spendValue : 0;
  const aov = ordersValue > 0 ? revenueValue / ordersValue : 0;

  const latestRows =
    data.latest?.map((purchase: any) => [
      purchase.orderId || purchase.id || "—",
      purchase.shop || "—",
      purchase.visitorId || "—",
      normalizeSource(purchase),
      formatMoney(safeNumber(purchase.totalValue), purchase.currency || "USD"),
      purchase.currency || "USD",
      formatDate(purchase.createdAt),
    ]) ?? [];

  const sourceSummary = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; revenue: number; currency: string }
    >();

    for (const purchase of data.allPurchases ?? []) {
      const source = normalizeSource(purchase);
      const current = map.get(source) || {
        orders: 0,
        revenue: 0,
        currency: purchase?.currency || "USD",
      };

      current.orders += 1;
      current.revenue += safeNumber(purchase?.totalValue);

      if (!current.currency && purchase?.currency) {
        current.currency = purchase.currency;
      }

      map.set(source, current);
    }

    return Array.from(map.entries())
      .map(([source, stats]) => ({
        source,
        orders: stats.orders,
        revenue: stats.revenue,
        currency: stats.currency || "USD",
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data.allPurchases]);

  const campaignSummary = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; revenue: number; currency: string; source: string }
    >();

    for (const purchase of data.allPurchases ?? []) {
      const campaign = String(purchase?.utmCampaign || "").trim() || "unknown";
      const source = normalizeSource(purchase);

      const current = map.get(campaign) || {
        orders: 0,
        revenue: 0,
        currency: purchase?.currency || "USD",
        source,
      };

      current.orders += 1;
      current.revenue += safeNumber(purchase?.totalValue);

      if (!current.currency && purchase?.currency) {
        current.currency = purchase.currency;
      }

      if (!current.source || current.source === "unknown") {
        current.source = source;
      }

      map.set(campaign, current);
    }

    return Array.from(map.entries())
      .map(([campaign, stats]) => ({
        campaign,
        source: stats.source,
        orders: stats.orders,
        revenue: stats.revenue,
        currency: stats.currency || "USD",
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [data.allPurchases]);

  const mediumSummary = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; revenue: number; currency: string }
    >();

    for (const purchase of data.allPurchases ?? []) {
      const medium = String(purchase?.utmMedium || "").trim() || "unknown";

      const current = map.get(medium) || {
        orders: 0,
        revenue: 0,
        currency: purchase?.currency || "USD",
      };

      current.orders += 1;
      current.revenue += safeNumber(purchase?.totalValue);

      if (!current.currency && purchase?.currency) {
        current.currency = purchase.currency;
      }

      map.set(medium, current);
    }

    return Array.from(map.entries())
      .map(([medium, stats]) => ({
        medium,
        orders: stats.orders,
        revenue: stats.revenue,
        currency: stats.currency || "USD",
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [data.allPurchases]);

  const platformRoasRows = useMemo(() => {
    const revenueMap = new Map<string, number>();
    const spendMap = new Map<string, number>();

    for (const item of sourceSummary) {
      revenueMap.set(item.source, safeNumber(item.revenue));
    }

    for (const spendRow of data.spendRows ?? []) {
      const platform = normalizePlatform(spendRow?.platform);
      spendMap.set(platform, (spendMap.get(platform) || 0) + safeNumber(spendRow?.spend));
    }

    const allPlatforms = Array.from(
      new Set([...revenueMap.keys(), ...spendMap.keys()]),
    ).sort();

    return allPlatforms.map((platform) => {
      const revenue = revenueMap.get(platform) || 0;
      const spend = spendMap.get(platform) || 0;
      const platformRoas = spend > 0 ? revenue / spend : null;

      return [
        platform,
        formatMoney(revenue, "USD"),
        formatMoney(spend, "USD"),
        platformRoas !== null ? platformRoas.toFixed(2) : "—",
      ];
    });
  }, [sourceSummary, data.spendRows]);

  const campaignRoasRows = useMemo(() => {
    const revenueMap = new Map<
      string,
      { source: string; orders: number; revenue: number; currency: string }
    >();

    const spendMap = new Map<string, number>();

    for (const item of campaignSummary) {
      revenueMap.set(item.campaign, {
        source: item.source,
        orders: item.orders,
        revenue: item.revenue,
        currency: item.currency,
      });
    }

    for (const spendRow of data.spendRows ?? []) {
      const campaign = String(spendRow?.campaign || "").trim() || "unknown";
      spendMap.set(campaign, (spendMap.get(campaign) || 0) + safeNumber(spendRow?.spend));
    }

    const allCampaigns = Array.from(
      new Set([...revenueMap.keys(), ...spendMap.keys()]),
    );

    return allCampaigns
      .map((campaign) => {
        const revenueEntry = revenueMap.get(campaign);
        const spend = spendMap.get(campaign) || 0;
        const revenueAmount = revenueEntry?.revenue || 0;
        const campaignRoas = spend > 0 ? revenueAmount / spend : null;

        return [
          campaign,
          revenueEntry?.source || "unknown",
          formatMoney(revenueAmount, revenueEntry?.currency || "USD"),
          formatMoney(spend, "USD"),
          campaignRoas !== null ? campaignRoas.toFixed(2) : "—",
        ];
      })
      .sort((a, b) => {
        const aRevenue = Number(String(a[2]).replace(/[^0-9.-]+/g, "")) || 0;
        const bRevenue = Number(String(b[2]).replace(/[^0-9.-]+/g, "")) || 0;
        return bRevenue - aRevenue;
      })
      .slice(0, 8);
  }, [campaignSummary, data.spendRows]);

  const campaignRows = useMemo(() => {
    return campaignSummary.map((item) => [
      item.campaign,
      item.source,
      String(item.orders),
      formatMoney(item.revenue, item.currency),
    ]);
  }, [campaignSummary]);

  // Meta Ads Manager: aggregate campaign rows by campaignId (last 30 days)
  const metaCampaignTableRows = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; purchases: number; value: number }>();
    for (const row of (data as any).metaCampaigns ?? []) {
      const id = String(row.campaignId);
      const cur = map.get(id) || { name: row.campaignName || id, spend: 0, purchases: 0, value: 0 };
      cur.spend += safeNumber(row.spend);
      cur.purchases += safeNumber(row.purchases);
      cur.value += safeNumber(row.purchaseValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .map((c) => {
        const roas = c.spend > 0 ? (c.value / c.spend).toFixed(2) : "—";
        return [c.name, formatMoney(c.spend), String(c.purchases), formatMoney(c.value), roas];
      });
  }, [(data as any).metaCampaigns]);

  const mediumRows = useMemo(() => {
    return mediumSummary.map((item) => [
      item.medium,
      String(item.orders),
      formatMoney(item.revenue, item.currency),
    ]);
  }, [mediumSummary]);

  const trafficRows = useMemo(() => {
    const map = new Map<
      string,
      {
        visitors: Set<string>;
        purchases: number;
      }
    >();

    for (const event of data.recentTrackedEvents ?? []) {
      const source = normalizeSource(event);
      const current = map.get(source) || {
        visitors: new Set<string>(),
        purchases: 0,
      };

      const visitorId =
        String(event?.visitorId || "").trim() ||
        `anon_${source}_${dayKey(event?.createdAt)}`;

      current.visitors.add(visitorId);
      map.set(source, current);
    }

    for (const purchase of data.recentPurchases ?? []) {
      const source = normalizeSource(purchase);
      const current = map.get(source) || {
        visitors: new Set<string>(),
        purchases: 0,
      };

      current.purchases += 1;

      const visitorId = String(purchase?.visitorId || "").trim();
      if (visitorId) {
        current.visitors.add(visitorId);
      }

      map.set(source, current);
    }

    return Array.from(map.entries())
      .map(([source, stats]) => {
        const visitors = stats.visitors.size;
        const purchases = stats.purchases;
        const cvr = visitors > 0 ? (purchases / visitors) * 100 : 0;

        return [
          source,
          String(visitors),
          String(purchases),
          `${cvr.toFixed(2)}%`,
        ];
      })
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 8);
  }, [data.recentTrackedEvents, data.recentPurchases]);

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; label: string; revenue: number; spend: number }>();

    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      map.set(key, {
        date: key,
        label: displayDayLabel(key),
        revenue: 0,
        spend: 0,
      });
    }

    for (const purchase of data.recentPurchases ?? []) {
      const key = dayKey(purchase?.createdAt);
      const current = map.get(key);
      if (current) {
        current.revenue += safeNumber(purchase?.totalValue);
      }
    }

    for (const spendRow of data.spendRows ?? []) {
      const key = dayKey(spendRow?.date);
      const current = map.get(key);
      if (current) {
        current.spend += safeNumber(spendRow?.spend);
      }
    }

    return Array.from(map.values()).map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
      spend: Number(row.spend.toFixed(2)),
    }));
  }, [data.recentPurchases, data.spendRows]);

  return (
    <Page
      fullWidth
      title="Analytics"
      subtitle="Live overview of tracked events, attributed purchases, and revenue."
    >
      <BlockStack gap="500">
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="Revenue"
              value={formatMoney(revenueValue, "USD")}
              subtitle="Sum of attributed purchases"
            />
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="Orders"
              value={String(ordersValue)}
              subtitle="Saved purchases"
            />
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="Events"
              value={String(eventsValue)}
              subtitle="Tracked events received"
            />
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="Ad Spend"
              value={formatMoney(spendValue, "USD")}
              subtitle="Current synced spend"
            />
          </Grid.Cell>
        </Grid>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="ROAS"
              value={spendValue > 0 ? roas.toFixed(2) : "—"}
              subtitle={spendValue > 0 ? "Revenue ÷ spend" : "No spend data yet"}
            />
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard
              title="Average Order Value"
              value={ordersValue > 0 ? formatMoney(aov, "USD") : "—"}
              subtitle={ordersValue > 0 ? "Revenue ÷ orders" : "No orders yet"}
            />
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Quick summary
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  This view is reading directly from your tracked events,
                  purchases, and synced spend data. Purchases currently drive
                  revenue, while spend comes from ad platform syncs.
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Revenue & spend trend
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Last 30 days
              </Text>
            </InlineStack>

            <MiniBarChart data={chartData} />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Revenue by source
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Based on all attributed purchases in the database
              </Text>
            </InlineStack>

            {sourceSummary.length > 0 ? (
              <Grid>
                {sourceSummary.map((item) => (
                  <Grid.Cell
                    key={item.source}
                    columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}
                  >
                    <Card>
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            {item.source}
                          </Text>
                          <Badge tone={toneForSource(item.source) as any}>
                            {`${item.orders} order${item.orders === 1 ? "" : "s"}`}
                          </Badge>
                        </InlineStack>

                        <Text as="p" variant="headingLg">
                          {formatMoney(item.revenue, item.currency)}
                        </Text>

                        <Text as="p" variant="bodySm" tone="subdued">
                          Revenue from all currently attributed purchases
                        </Text>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                ))}
              </Grid>
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No source breakdown available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Top traffic sources
            </Text>

            {trafficRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                headings={["Source", "Visitors", "Purchases", "CVR"]}
                rows={trafficRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No traffic source data available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              UTM medium breakdown
            </Text>

            {mediumRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric"]}
                headings={["Medium", "Orders", "Revenue"]}
                rows={mediumRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No medium data available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Platform ROAS
            </Text>

            {platformRoasRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                headings={["Platform", "Revenue", "Spend", "ROAS"]}
                rows={platformRoasRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No platform ROAS data available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Campaign ROAS
            </Text>

            {campaignRoasRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                headings={["Campaign", "Source", "Revenue", "Spend", "ROAS"]}
                rows={campaignRoasRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No campaign ROAS data available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Meta Ads Manager — campaigns (last 30 days)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Spend &amp; conversions from your synced Ads Manager data
              </Text>
            </InlineStack>

            {metaCampaignTableRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Campaign", "Spend", "Purchases (Meta)", "Purchase value", "ROAS"]}
                rows={metaCampaignTableRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No Ads Manager data yet — go to Integrations → Meta → Sync ad spend.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Top campaigns
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Highest revenue campaigns across all attributed purchases
              </Text>
            </InlineStack>

            {campaignRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric"]}
                headings={["Campaign", "Source", "Orders", "Revenue"]}
                rows={campaignRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No campaign data available yet.
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Latest attributed purchases
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Showing up to 10 most recent rows
              </Text>
            </InlineStack>

            {latestRows.length > 0 ? (
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "text",
                  "text",
                ]}
                headings={[
                  "Order ID",
                  "Shop",
                  "Visitor ID",
                  "Source",
                  "Total",
                  "Currency",
                  "Created",
                ]}
                rows={latestRows}
                increasedTableDensity
              />
            ) : (
              <Box paddingBlockStart="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  No purchases found yet.
                </Text>
              </Box>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Debug snapshot
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Keep this available while building the dashboard, without
                  letting it dominate the page.
                </Text>
              </BlockStack>

              <Button onClick={() => setShowDebug((prev) => !prev)}>
                {showDebug ? "Hide debug data" : "Show debug data"}
              </Button>
            </InlineStack>

            {showDebug ? (
              <Box
                background="bg-surface-secondary"
                padding="300"
                borderRadius="200"
              >
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </Box>
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                Debug data is hidden.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}