// app/routes/app.orders.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useMemo } from "react";
import { OrdersChart, buildOrdersChartData } from "~/components/OrdersChart";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  EmptyState,
  Filters,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const { getShopPlan, getHistoryCutoff } = await import("~/services/plan.server");
  const plan = await getShopPlan(shop, admin);
  const historyCutoff = getHistoryCutoff(plan);

  const purchases = await db.purchase.findMany({
    where: { shop, createdAt: { gte: historyCutoff } },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      orderId: true,
      totalValue: true,
      currency: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      fbclid: true,
      gclid: true,
      landingPage: true,
      referrer: true,
      createdAt: true,
      customerName: true,
    },
  }).catch(() => []);

  const totalRevenue = await db.purchase.aggregate({
    where: { shop, createdAt: { gte: historyCutoff } },
    _sum: { totalValue: true },
  }).catch(() => ({ _sum: { totalValue: 0 } }));

  const attributedCount = await db.purchase.count({
    where: { shop, createdAt: { gte: historyCutoff }, utmSource: { not: null } },
  }).catch(() => 0);

  const totalCount = await db.purchase.count({ where: { shop, createdAt: { gte: historyCutoff } } }).catch(() => 0);

  return json({
    purchases,
    totalRevenue: totalRevenue._sum.totalValue ?? 0,
    attributedCount,
    totalCount,
  });
}

function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function normalizeSource(purchase) {
  const s = (purchase?.utmSource || "").toLowerCase();
  if (s) {
    if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta";
    if (s.includes("google") || s.includes("adwords")) return "google";
    if (s.includes("tiktok")) return "tiktok";
    if (s.includes("email") || s.includes("klaviyo") || s.includes("mailchimp")) return "email";
    if (s.includes("sms")) return "sms";
    return s;
  }
  if (purchase?.fbclid) return "meta";
  if (purchase?.gclid) return "google";
  return null;
}

function sourceBadgeTone(source) {
  if (!source) return "new";
  const s = source.toLowerCase();
  if (s === "meta") return "info";
  if (s === "google") return "success";
  if (s === "tiktok") return "attention";
  if (s === "email" || s === "sms") return "warning";
  return "new";
}

function truncateUrl(url, maxLen = 45) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    const short = u.pathname + (u.search ? u.search.slice(0, 20) + (u.search.length > 20 ? "…" : "") : "");
    return short.length > maxLen ? short.slice(0, maxLen) + "…" : short;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "…" : url;
  }
}

export default function AppOrders() {
  const { purchases, totalRevenue, attributedCount, totalCount } = useLoaderData();
  const navigate = useNavigate();
  const backfillFetcher = useFetcher();

  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  const backfillLoading = backfillFetcher.state !== "idle";
  const backfillResult = backfillFetcher.data;
  const backfillDone = backfillResult?.ok === true;

  const [chartDays, setChartDays] = useState(30);
  const chartData = useMemo(() => buildOrdersChartData(purchases, chartDays), [purchases, chartDays]);

  const sourceOptions = useMemo(() => {
    const sources = new Set();
    for (const p of purchases) {
      const s = normalizeSource(p);
      if (s) sources.add(s);
    }
    return [
      { label: "All sources", value: "all" },
      { label: "Direct / unknown", value: "direct" },
      ...Array.from(sources).map((s) => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: s })),
    ];
  }, [purchases]);

  const filtered = useMemo(() => {
    return purchases.filter((p) => {
      const source = normalizeSource(p);

      if (sourceFilter === "direct" && source !== null) return false;
      if (sourceFilter !== "all" && sourceFilter !== "direct" && source !== sourceFilter) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchOrder = (p.orderId || "").toLowerCase().includes(q);
        const matchCampaign = (p.utmCampaign || "").toLowerCase().includes(q);
        const matchSource = (source || "").toLowerCase().includes(q);
        if (!matchOrder && !matchCampaign && !matchSource) return false;
      }

      return true;
    });
  }, [purchases, sourceFilter, search]);

  const attributionRate = totalCount > 0 ? Math.round((attributedCount / totalCount) * 100) : 0;

  // Source breakdown for overview cards
  const sourceBreakdown = useMemo(() => {
    const map = new Map();
    for (const p of purchases) {
      const src = normalizeSource(p) || "direct";
      const cur = map.get(src) || { orders: 0, revenue: 0 };
      cur.orders++;
      cur.revenue += Number(p.totalValue || 0);
      map.set(src, cur);
    }
    const totalRev = Array.from(map.values()).reduce((s, r) => s + r.revenue, 0);
    return Array.from(map.entries())
      .sort((a, b) => b[1].orders - a[1].orders)
      .map(([src, r]) => ({
        source: src,
        orders: r.orders,
        revenue: r.revenue,
        share: totalRev > 0 ? Math.round((r.revenue / totalRev) * 100) : 0,
      }));
  }, [purchases]);

  const rows = filtered.map((p) => {
    const source = normalizeSource(p);
    return [
      <Text as="span" variant="bodySm" fontWeight="semibold">{p.orderId || p.id?.slice(0, 8) || "—"}</Text>,
      <Text as="span" variant="bodySm" tone="subdued">{p.customerName || "—"}</Text>,
      <Text as="span" variant="bodySm">{formatMoney(p.totalValue, p.currency)}</Text>,
      source
        ? <Badge tone={sourceBadgeTone(source)}>{source}</Badge>
        : <Text as="span" variant="bodySm" tone="subdued">direct</Text>,
      <Text as="span" variant="bodySm" tone="subdued">{p.utmCampaign || "—"}</Text>,
      <Text as="span" variant="bodySm" tone="subdued" title={p.landingPage || ""}>{truncateUrl(p.landingPage)}</Text>,
      <Text as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
    ];
  });

  return (
    <Page
      title="Orders"
      subtitle={`${totalCount} total · ${attributedCount} attributed (${attributionRate}%)`}
      secondaryActions={[
        {
          content: "View attribution",
          onAction: () => navigate("/app/analytics"),
        },
        {
          content: backfillLoading ? "Importing…" : backfillDone ? "Import again" : "Import older orders",
          onAction: () => backfillFetcher.submit({}, { method: "post", action: "/api/backfill/orders" }),
          loading: backfillLoading,
        },
      ]}
    >
      <BlockStack gap="400">

        {backfillResult && (
          <Banner tone={backfillResult.ok ? "success" : "critical"} title={backfillResult.ok ? "Shopify import complete" : "Import failed"} onDismiss={() => {}}>
            {backfillResult.ok
              ? <Text as="p">{backfillResult.created} new orders added, {backfillResult.updated ?? 0} patched with source data, {backfillResult.skipped} unchanged. Reload to see updated totals.</Text>
              : <Text as="p">{backfillResult.error}</Text>}
          </Banner>
        )}

        {/* Summary cards */}
        <InlineStack gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total revenue</Text>
              <Text as="p" variant="headingLg">{formatMoney(totalRevenue)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total orders</Text>
              <Text as="p" variant="headingLg">{totalCount}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Attributed</Text>
              <Text as="p" variant="headingLg">{attributedCount} <Text as="span" variant="bodySm" tone="subdued">({attributionRate}%)</Text></Text>
            </BlockStack>
          </Card>
        </InlineStack>

        {/* Revenue chart */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Revenue over time</Text>
              <InlineStack gap="100">
                {[14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setChartDays(d)}
                    style={{
                      background: chartDays === d ? "#111827" : "transparent",
                      color: chartDays === d ? "#fff" : "#6b7280",
                      border: `1px solid ${chartDays === d ? "#111827" : "#e5e7eb"}`,
                      borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                      fontSize: 12, fontWeight: 500,
                    }}
                  >{d}d</button>
                ))}
              </InlineStack>
            </InlineStack>
            <OrdersChart
              data={chartData}
              currency={purchases[0]?.currency || "USD"}
            />
          </BlockStack>
        </Card>

        {/* Source overview */}
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">TOP SOURCES</Text>
          <InlineStack gap="300" wrap>
            {sourceBreakdown.map(({ source, orders, revenue, share }) => (
              <div
                key={source}
                onClick={() => setSourceFilter(source === "direct" ? "direct" : source)}
                style={{
                  cursor: "pointer",
                  border: `2px solid ${sourceFilter === source || (sourceFilter === "direct" && source === "direct") ? "#303030" : "#e1e3e5"}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  minWidth: 140,
                  background: sourceFilter === source || (sourceFilter === "direct" && source === "direct") ? "#f6f6f7" : "#fff",
                  transition: "border-color 0.15s",
                }}
              >
                <BlockStack gap="050">
                  <Text as="p" variant="headingXl" fontWeight="bold">{share}%</Text>
                  <Badge tone={sourceBadgeTone(source)}>{source}</Badge>
                  <Text as="p" variant="bodySm" tone="subdued">{orders} orders · {formatMoney(revenue)}</Text>
                </BlockStack>
              </div>
            ))}
            {sourceFilter !== "all" && (
              <div
                onClick={() => setSourceFilter("all")}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", padding: "0 8px" }}
              >
                <Text as="p" variant="bodySm" tone="subdued">Clear ×</Text>
              </div>
            )}
          </InlineStack>
        </BlockStack>

        <Card padding="0">
          <Box padding="400" paddingBlockEnd="0">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ flex: 1 }}>
                <Filters
                  queryValue={search}
                  queryPlaceholder="Search by order, campaign, or source…"
                  onQueryChange={setSearch}
                  onQueryClear={() => setSearch("")}
                  filters={[]}
                  onClearAll={() => { setSearch(""); setSourceFilter("all"); }}
                />
              </div>
              <Select
                label=""
                labelHidden
                options={sourceOptions}
                value={sourceFilter}
                onChange={setSourceFilter}
              />
            </InlineStack>
          </Box>

          {rows.length > 0 ? (
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text", "text", "text", "text"]}
              headings={["Order ID", "Customer", "Value", "Source", "Campaign", "Landing page", "Date"]}
              rows={rows}
              increasedTableDensity
              truncate
            />
          ) : (
            <Box padding="400">
              <EmptyState
                heading="No orders found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" tone="subdued">
                  {purchases.length === 0
                    ? "No attributed orders yet. Orders appear here after a customer completes checkout."
                    : "No orders match your current filters."}
                </Text>
              </EmptyState>
            </Box>
          )}
        </Card>

      </BlockStack>
    </Page>
  );
}
