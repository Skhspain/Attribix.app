// app/routes/app.analytics.products.tsx
// Product analytics — top products by revenue, AOV, repeat purchase rate.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Select, Grid, Button,
} from "@shopify/polaris";
import { useState } from "react";

// ─── Shopify order line-item fetch via Admin REST ─────────────────────────────

async function fetchShopifyOrders(shop: string, accessToken: string, since: Date, limit = 250) {
  const sinceStr = since.toISOString();
  const url = `https://${shop}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceStr}&limit=${limit}&fields=id,created_at,total_price,currency,line_items,customer`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { orders?: any[] };
    return data.orders ?? [];
  } catch {
    return [];
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const accessToken = session.accessToken!;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 86400_000);
  const anyDb = db as any;

  // Fetch Shopify orders with line items
  const orders = await fetchShopifyOrders(shop, accessToken, since);

  // ── Product aggregation ──
  type ProductRow = {
    id: string;
    title: string;
    vendor: string;
    image: string | null;
    revenue: number;
    units: number;
    orders: number;
    currency: string;
    customers: Set<string>;
  };

  const productMap: Record<string, ProductRow> = {};
  const customerOrderMap: Record<string, Set<string>> = {}; // email → Set<productId>

  for (const order of orders) {
    const email = order.customer?.email || order.email || null;
    const lineItems: any[] = order.line_items ?? [];

    for (const item of lineItems) {
      const pid = String(item.product_id || item.variant_id || item.title);
      if (!productMap[pid]) {
        productMap[pid] = {
          id: pid,
          title: item.title || "Unknown",
          vendor: item.vendor || "",
          image: null,
          revenue: 0,
          units: 0,
          orders: 0,
          currency: order.currency || "USD",
          customers: new Set(),
        };
      }
      productMap[pid].revenue += parseFloat(item.price || "0") * (item.quantity || 1);
      productMap[pid].units += item.quantity || 1;
      productMap[pid].orders += 1;
      if (email) productMap[pid].customers.add(email);

      if (email) {
        if (!customerOrderMap[email]) customerOrderMap[email] = new Set();
        customerOrderMap[email].add(pid);
      }
    }
  }

  // ── Repeat purchase rate per product ──
  // A customer is a "repeat buyer" of a product if they appear in >1 order buying it
  // We approximate via email uniqueness within this period (orders contain only one order per email here)
  // Real repeat = needs historical context, but we can show % of customers who bought this product
  // vs total unique customers in period
  const totalUniqueCustomers = new Set(
    orders.map((o: any) => o.customer?.email || o.email).filter(Boolean)
  ).size;

  const productRows = Object.values(productMap)
    .map(p => ({
      ...p,
      aov: p.orders > 0 ? p.revenue / p.orders : 0,
      uniqueCustomers: p.customers.size,
      customerPct: totalUniqueCustomers > 0 ? (p.customers.size / totalUniqueCustomers) * 100 : 0,
      customers: undefined, // don't serialize the Set
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 50);

  // ── Revenue by day ──
  const dailyMap: Record<string, number> = {};
  for (const order of orders) {
    const d = new Date(order.created_at).toISOString().slice(0, 10);
    if (!dailyMap[d]) dailyMap[d] = 0;
    dailyMap[d] += parseFloat(order.total_price || "0");
  }
  const dailyRevenue = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  // ── KPIs ──
  const totalRevenue = orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0);
  const totalOrders = orders.length;
  const uniqueCustomers = totalUniqueCustomers;
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const currency = orders[0]?.currency ?? "USD";

  // ── Top vendors ──
  const vendorMap: Record<string, { revenue: number; units: number }> = {};
  for (const p of productRows) {
    if (!p.vendor) continue;
    if (!vendorMap[p.vendor]) vendorMap[p.vendor] = { revenue: 0, units: 0 };
    vendorMap[p.vendor].revenue += p.revenue;
    vendorMap[p.vendor].units += p.units;
  }
  const vendorRows = Object.entries(vendorMap)
    .map(([vendor, v]) => ({ vendor, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return json({
    productRows,
    vendorRows,
    dailyRevenue,
    totalRevenue,
    totalOrders,
    uniqueCustomers,
    aov,
    currency,
    days,
    hasData: orders.length > 0,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}
function fmtDec(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function RevenueBar({ value, max, color = "#10b981" }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: "#f3f4f6", borderRadius: 99, marginTop: 4 }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 0.3s ease" }} />
    </div>
  );
}

function DailyChart({ data }: { data: Array<{ date: string; revenue: number }> }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const W = 600, H = 80;
  const n = data.length;

  const pts = data.map((d, i) => ({
    x: (i / (n - 1)) * W,
    y: H - (d.revenue / max) * H * 0.85,
    ...d,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revGrad)" />
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{data[0]?.date}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductAnalyticsPage() {
  const {
    productRows, vendorRows, dailyRevenue,
    totalRevenue, totalOrders, uniqueCustomers, aov, currency, days, hasData,
  } = useLoaderData<typeof loader>();

  const [windowDays, setWindowDays] = useState(String(days));
  const [sortBy, setSortBy] = useState<"revenue" | "units" | "orders" | "aov">("revenue");

  const handleWindowChange = (val: string) => {
    setWindowDays(val);
    const u = new URL(window.location.href);
    u.searchParams.set("days", val);
    window.location.href = u.toString();
  };

  const sorted = [...productRows].sort((a, b) => {
    if (sortBy === "revenue") return b.revenue - a.revenue;
    if (sortBy === "units") return b.units - a.units;
    if (sortBy === "orders") return b.orders - a.orders;
    if (sortBy === "aov") return b.aov - a.aov;
    return 0;
  });

  const maxRevenue = Math.max(...sorted.map(r => r.revenue), 1);
  const maxVendorRevenue = Math.max(...vendorRows.map(r => r.revenue), 1);

  return (
    <Page
      title="Product Analytics"
      subtitle="Top products, revenue, and customer behavior"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      primaryAction={{ content: "Export CSV", onAction: () => {} }}
    >
      <BlockStack gap="500">

        {/* Controls */}
        <Card>
          <InlineStack gap="400" blockAlign="center">
            <div style={{ minWidth: 160 }}>
              <Select
                label="Time window"
                options={[
                  { label: "7 days", value: "7" },
                  { label: "30 days", value: "30" },
                  { label: "90 days", value: "90" },
                ]}
                value={windowDays}
                onChange={handleWindowChange}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <Select
                label="Sort products by"
                options={[
                  { label: "Revenue", value: "revenue" },
                  { label: "Units sold", value: "units" },
                  { label: "Orders", value: "orders" },
                  { label: "AOV", value: "aov" },
                ]}
                value={sortBy}
                onChange={v => setSortBy(v as typeof sortBy)}
              />
            </div>
          </InlineStack>
        </Card>

        {/* KPI cards */}
        <Grid>
          {[
            { label: "Total revenue", value: fmt(totalRevenue, currency) },
            { label: "Total orders", value: String(totalOrders) },
            { label: "Avg order value", value: fmtDec(aov, currency) },
            { label: "Unique customers", value: String(uniqueCustomers) },
            { label: "Products sold", value: String(productRows.length) },
            { label: "Revenue per customer", value: uniqueCustomers > 0 ? fmt(totalRevenue / uniqueCustomers, currency) : "—" },
          ].map(kpi => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                  <Text as="p" variant="heading2xl">{kpi.value}</Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Revenue trend */}
        {dailyRevenue.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Daily revenue</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {fmt(totalRevenue, currency)} total
                </Text>
              </InlineStack>
              <DailyChart data={dailyRevenue} />
            </BlockStack>
          </Card>
        )}

        {/* Top products table */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Top products</Text>
              {!hasData && (
                <Badge tone="attention">No orders in this period</Badge>
              )}
            </InlineStack>

            {sorted.length === 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                No product data available. Orders will appear here once customers start purchasing.
              </Text>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Product</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Vendor</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Revenue</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Units</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Orders</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>AOV</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Customers</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>% of buyers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {/* Product rank badge */}
                            <span style={{
                              minWidth: 22, height: 22, borderRadius: 6,
                              background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#f3f4f6",
                              color: i < 3 ? "#fff" : "#6b7280",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                            }}>
                              {i + 1}
                            </span>
                            <div style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }} title={row.title}>
                                {row.title}
                              </div>
                              <RevenueBar value={row.revenue} max={maxRevenue} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{row.vendor || "—"}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#111827" }}>
                          {fmt(row.revenue, row.currency)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>{row.units}</td>
                        <td style={{ padding: "10px 12px" }}>{row.orders}</td>
                        <td style={{ padding: "10px 12px" }}>{fmtDec(row.aov, row.currency)}</td>
                        <td style={{ padding: "10px 12px" }}>{row.uniqueCustomers}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            background: row.customerPct >= 20 ? "#ecfdf5" : "#f9fafb",
                            color: row.customerPct >= 20 ? "#10b981" : "#6b7280",
                            fontWeight: row.customerPct >= 20 ? 700 : 400,
                            padding: "2px 8px", borderRadius: 99, fontSize: 12,
                          }}>
                            {row.customerPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BlockStack>
        </Card>

        {/* Top vendors */}
        {vendorRows.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Revenue by vendor / brand</Text>
              <BlockStack gap="200">
                {vendorRows.map(row => {
                  const pct = maxVendorRevenue > 0 ? (row.revenue / maxVendorRevenue) * 100 : 0;
                  return (
                    <div key={row.vendor}>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{row.vendor}</Text>
                        <InlineStack gap="400">
                          <Text as="p" variant="bodySm" tone="subdued">{row.units} units</Text>
                          <Text as="p" variant="bodySm" fontWeight="semibold">{fmt(row.revenue, currency)}</Text>
                        </InlineStack>
                      </InlineStack>
                      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, marginTop: 4 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#10b981", borderRadius: 99, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* Revenue distribution */}
        {sorted.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Revenue concentration</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                How revenue is distributed across your product catalog
              </Text>
              <Grid>
                {(() => {
                  const top1 = sorted[0]?.revenue ?? 0;
                  const top3 = sorted.slice(0, 3).reduce((s, r) => s + r.revenue, 0);
                  const top10 = sorted.slice(0, 10).reduce((s, r) => s + r.revenue, 0);
                  return [
                    { label: "#1 product share", value: totalRevenue > 0 ? ((top1 / totalRevenue) * 100).toFixed(1) + "%" : "—" },
                    { label: "Top 3 product share", value: totalRevenue > 0 ? ((top3 / totalRevenue) * 100).toFixed(1) + "%" : "—" },
                    { label: "Top 10 product share", value: totalRevenue > 0 ? ((top10 / totalRevenue) * 100).toFixed(1) + "%" : "—" },
                  ].map(stat => (
                    <Grid.Cell key={stat.label} columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <div style={{ textAlign: "center", padding: "12px 0" }}>
                        <Text as="p" variant="heading2xl">{stat.value}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{stat.label}</Text>
                      </div>
                    </Grid.Cell>
                  ));
                })()}
              </Grid>
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
