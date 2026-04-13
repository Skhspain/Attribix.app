// app/routes/app.google-ads.tsx
import { SalesComparison } from "~/components/SalesComparison";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useMemo, useState } from "react";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Grid,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import db from "../db.server";
import { RevenueSpendChart } from "~/components/RevenueSpendChart";

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  since90.setHours(0, 0, 0, 0);

  const [campaigns, googleConn] = await Promise.all([
    // Read from adSpendDaily where platform='google' (that's where syncGoogleSpendDaily writes)
    db.adSpendDaily.findMany({
      where: { shop, platform: "google", date: { gte: since90 } },
      select: {
        campaign: true,
        ad: true,
        spend: true,
        date: true,
      },
      orderBy: { date: "desc" },
    }).catch(() => []),
    anyDb.googleConnection?.findUnique?.({
      where: { shop },
      select: { lastSyncedAt: true, adCustomerId: true },
    }).catch(() => null),
  ]);

  const hasConnection = !!googleConn?.adCustomerId;

  // Detect store currency from Shopify
  let storeCurrency = "NOK";
  try {
    const shopRes = await admin.graphql(`{ shop { currencyCode } }`);
    const shopData = await shopRes.json();
    storeCurrency = shopData?.data?.shop?.currencyCode || "NOK";
  } catch {}

  // Also pull live metrics from Google Ads API if connected
  let liveMetrics: any[] = [];
  let adAccountCurrency = "USD"; // Default; we'll detect from the API response
  if (hasConnection && googleConn) {
    try {
      const { getValidGoogleToken } = await import("~/services/tokenRefresh.server");
      const tokenResult = await getValidGoogleToken(shop);
      if (tokenResult.ok) {
        const { googleAdsSearchStream } = await import("~/services/googleAds.server");

        // First detect the ad account's currency
        try {
          const { listAccessibleCustomers } = await import("~/services/googleAds.server");
          // We already have the customer list cached — just query this customer's currency
          const custQuery = `SELECT customer.currency_code FROM customer LIMIT 1`;
          const custResult = await googleAdsSearchStream({
            accessToken: tokenResult.accessToken,
            customerId: googleConn.adCustomerId!,
            query: custQuery,
          });
          const custRow = custResult?.[0]?.results?.[0]?.customer;
          if (custRow?.currencyCode) adAccountCurrency = custRow.currencyCode;
        } catch {}

        const since = new Date(); since.setDate(since.getDate() - 90);
        const fmtD = (d: Date) => d.toISOString().slice(0, 10);
        const today = new Date();
        const query = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, segments.date FROM campaign WHERE segments.date BETWEEN '${fmtD(since)}' AND '${fmtD(today)}' AND campaign.status != 'REMOVED' ORDER BY segments.date DESC`;
        const streamResults = await googleAdsSearchStream({
          accessToken: tokenResult.accessToken,
          customerId: googleConn.adCustomerId!,
          query,
        });
        liveMetrics = streamResults.flatMap((chunk: any) => chunk?.results ?? []);
      }
    } catch (e) {
      console.error("[google-ads] live metrics fetch failed:", e);
    }
  }

  // Convert ad account currency to store currency
  const { convertCurrency } = await import("~/services/currency.server");
  const rate = adAccountCurrency !== storeCurrency
    ? await convertCurrency(1, adAccountCurrency, storeCurrency)
    : 1;

  // Transform live metrics into campaign-level data with currency conversion
  const transformedCampaigns = liveMetrics.map((row: any) => ({
    campaignId: row.campaign?.id || "unknown",
    campaignName: row.campaign?.name || "Unknown campaign",
    spend: (Number(row.metrics?.costMicros || 0) / 1_000_000) * rate,
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    conversions: Number(row.metrics?.conversions || 0),
    conversionValue: Number(row.metrics?.conversionsValue || 0) * rate,
    date: row.segments?.date ? new Date(row.segments.date + "T00:00:00Z").toISOString() : new Date().toISOString(),
  }));

  // Shopify revenue for comparison
  const since7 = new Date(); since7.setDate(since7.getDate() - 7); since7.setHours(0,0,0,0);
  const shopifyPurchases7 = await db.purchase.findMany({
    where: { shop, createdAt: { gte: since7 } },
    select: { totalValue: true },
  }).catch(() => []);
  const shopifyRev7 = shopifyPurchases7.reduce((s: number, p: any) => s + Number(p.totalValue || 0), 0);
  const shopifyOrders7 = shopifyPurchases7.length;

  return json({
    shop,
    nowMs: Date.now(),
    campaigns: transformedCampaigns,
    lastSyncedAt: googleConn?.lastSyncedAt ?? null,
    hasConnection,
    storeCurrency,
    adAccountCurrency,
    shopifyRev7,
    shopifyOrders7,
    exchangeRate: rate,
  });
}

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDecimal(value: number, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function dayKey(v: unknown) {
  if (!v) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function labelShort(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return iso;
  }
}


export default function GoogleAdsDetail() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const authFetch = useAuthenticatedFetch();
  const [window, setWindow] = useState<"7" | "14" | "30" | "90">("7");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const windowDays = Number(window);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await authFetch("/api/google/sync-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: windowDays }),
      });
      const result = await res.json();
      if (result.ok) {
        setSyncMessage(`✓ Synced ${result.campaigns || 0} campaigns`);
        revalidator.revalidate();
      } else {
        setSyncMessage(`✗ ${result.error || "Sync failed"}`);
      }
    } catch (e: any) {
      setSyncMessage(`✗ ${e.message || "Sync failed"}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncMessage(null), 5000);
  }

  const windowCutoff = useMemo(() => {
    const d = new Date(data.nowMs);
    d.setUTCDate(d.getUTCDate() - windowDays);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [windowDays, data.nowMs]);

  const campaigns = useMemo(
    () => (data.campaigns as any[]).filter((r) => new Date(r.date) >= windowCutoff),
    [data.campaigns, windowCutoff]
  );

  // KPIs
  const kpis = useMemo(() => {
    let spend = 0, impressions = 0, clicks = 0, conversions = 0, value = 0;
    for (const r of campaigns) {
      spend += safeNum(r.spend);
      impressions += safeNum(r.impressions);
      clicks += safeNum(r.clicks);
      conversions += safeNum(r.conversions);
      value += safeNum(r.conversionValue);
    }
    return {
      spend,
      impressions,
      clicks,
      conversions,
      value,
      roas: spend > 0 ? value / spend : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    };
  }, [campaigns]);

  const currency = "NOK";

  // Chart data — daily spend vs conversion value
  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; spend: number }>();
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(data.nowMs);
      d.setUTCDate(d.getUTCDate() - i);
      const k = dayKey(d);
      map.set(k, { label: labelShort(k), revenue: 0, spend: 0 });
    }
    for (const r of campaigns) {
      const k = dayKey(r.date);
      const cur = map.get(k);
      if (cur) {
        cur.spend += safeNum(r.spend);
        cur.revenue += safeNum(r.conversionValue);
      }
    }
    return Array.from(map.values());
  }, [campaigns, windowDays]);

  // Winning campaign — best ROAS, any campaign with spend
  const topCampaign = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; value: number; conversions: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, spend: 0, value: 0, conversions: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.conversionValue);
      cur.conversions += safeNum(r.conversions);
      map.set(id, cur);
    }
    const rows = Array.from(map.values()).filter((c) => c.spend > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [campaigns]);

  // Wasting budget — spend > 0, conversions > 0, ROAS < 1
  const worstCampaign = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; value: number; conversions: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, spend: 0, value: 0, conversions: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.conversionValue);
      cur.conversions += safeNum(r.conversions);
      map.set(id, cur);
    }
    const rows = Array.from(map.values()).filter((c) => {
      if (c.spend <= 0) return false;
      return c.conversions > 0 && c.value / c.spend < 1;
    });
    if (!rows.length) return null;
    return rows.sort((a, b) => (a.value / a.spend) - (b.value / b.spend))[0];
  }, [campaigns]);

  // Campaign table rows
  const campaignTableRows = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number; value: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
      cur.spend += safeNum(r.spend);
      cur.impressions += safeNum(r.impressions);
      cur.clicks += safeNum(r.clicks);
      cur.conversions += safeNum(r.conversions);
      cur.value += safeNum(r.conversionValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .map((c) => [
        c.name,
        fmtDecimal(c.spend, currency),
        String(c.impressions.toLocaleString()),
        String(c.clicks.toLocaleString()),
        c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) + "%" : "—",
        c.conversions.toFixed(2),
        fmtDecimal(c.value, currency),
        c.spend > 0 ? Math.round((c.value / c.spend) * 100) + "%" : "—",
        c.conversions > 0 && c.spend > 0 ? fmtDecimal(c.spend / c.conversions, currency) : "—",
      ]);
  }, [campaigns, currency]);

  return (
    <Page
      fullWidth
      title="Google Ads — Campaign Performance"
      subtitle={`Last ${window} days · Shop: ${data.shop}`}
      backAction={{ url: "/app/analytics", content: "Analytics" }}
      secondaryActions={[
        {
          content: syncing ? "Syncing…" : "Sync now",
          onAction: handleSync,
          loading: syncing,
          disabled: syncing,
        },
      ]}
      primaryAction={
        <Select
          label=""
          labelHidden
          options={[
            { label: "Last 7 days", value: "7" },
            { label: "Last 14 days", value: "14" },
            { label: "Last 30 days", value: "30" },
            { label: "Last 90 days", value: "90" },
          ]}
          value={window}
          onChange={(v) => setWindow(v as any)}
        />
      }
    >
      <BlockStack gap="600">

        {/* Sync status */}
        {syncMessage && (
          <div style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: syncMessage.startsWith("✓") ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${syncMessage.startsWith("✓") ? "#bbf7d0" : "#fecaca"}`,
            color: syncMessage.startsWith("✓") ? "#065f46" : "#991b1b",
            fontSize: 13,
            fontWeight: 500,
          }}>
            {syncMessage}
          </div>
        )}

        {/* No connection banner */}
        {!data.hasConnection && (
          <Banner tone="info">
            <p>Connect Google Ads in <strong>Settings → Integrations</strong> to see your data.</p>
          </Banner>
        )}

        {/* Decision banner */}
        {campaigns.length > 0 && (
          <div style={{
            borderRadius: 12,
            background: kpis.roas !== null && kpis.roas >= 1
              ? "linear-gradient(135deg, #064e3b 0%, #065f46 100%)"
              : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
            padding: "24px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 20, flexWrap: "wrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
                {kpis.roas !== null && kpis.roas >= 2
                  ? "Your Google Ads are profitable"
                  : kpis.roas !== null && kpis.roas >= 1
                  ? "Your Google Ads are breaking even"
                  : kpis.roas !== null
                  ? "Your Google Ads are losing money"
                  : "No conversion data yet"}
              </p>
              <div style={{ display: "flex", gap: 28, marginTop: 10, flexWrap: "wrap" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>ROAS</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>{kpis.roas !== null ? Math.round(kpis.roas * 100) + "%" : "—"}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>Spend</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>{fmtDecimal(kpis.spend, currency)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>Conv. Value</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>{fmtDecimal(kpis.value, currency)}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>Net</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: kpis.value - kpis.spend >= 0 ? "#86efac" : "#fca5a5" }}>
                    {kpis.value - kpis.spend >= 0 ? "+" : ""}{fmtDecimal(kpis.value - kpis.spend, currency)}
                  </p>
                </div>
              </div>
            </div>
            {kpis.roas !== null && kpis.roas < 1 && (
              <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "16px 20px", minWidth: 200 }}>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>What's losing money?</p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Scroll down to see which campaigns are burning budget.</p>
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        <Grid>
          {[
            { label: "Total Spend", value: fmtDecimal(kpis.spend, currency) },
            { label: "Impressions", value: kpis.impressions.toLocaleString() },
            {
              label: "Clicks",
              value: kpis.clicks.toLocaleString(),
              sub: kpis.ctr ? `CTR ${kpis.ctr.toFixed(2)}%` : undefined,
            },
            {
              label: "ROAS",
              value: kpis.roas !== null ? Math.round(kpis.roas * 100) + "%" : "—",
              sub: `${kpis.conversions.toFixed(1)} conversions · ${fmtDecimal(kpis.value, currency)} value`,
            },
            { label: "Conversions", value: kpis.conversions.toFixed(1) },
          ].map((kpi) => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 4, md: 4, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                  <Text as="p" variant="heading2xl">{kpi.value}</Text>
                  {kpi.sub && <Text as="p" variant="bodySm" tone="subdued">{kpi.sub}</Text>}
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Daily chart */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Daily spend vs conversion value</Text>
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#6366f1" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Conversion value</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#38bdf8" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            {chartData.length > 0 ? (
              <RevenueSpendChart data={chartData} currency={currency} showRoasLabels={windowDays <= 14} revenueLabel="Conv. value" />
            ) : (
              <Text as="p" tone="subdued">No data for this window.</Text>
            )}
          </BlockStack>
        </Card>

        {/* Winning / Wasting decision cards */}
        {(topCampaign || worstCampaign) && (
          <Grid>
            {topCampaign && (
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <div style={{
                  background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                  border: "1.5px solid #86efac",
                  borderRadius: 12, padding: "20px 24px",
                  height: "100%", boxSizing: "border-box",
                }}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Winning campaign</p>
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#14532d", marginTop: 4, lineHeight: 1.3 }}>{topCampaign.name}</p>
                      </div>
                      <Badge tone="success">Best ROAS</Badge>
                    </InlineStack>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", fontWeight: 600 }}>ROAS</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#15803d" }}>
                          {topCampaign.spend > 0 ? Math.round((topCampaign.value / topCampaign.spend) * 100) + "%" : "—"}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", fontWeight: 600 }}>Spend</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#14532d" }}>{fmtDecimal(topCampaign.spend, currency)}</p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", fontWeight: 600 }}>Conv. Value</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#14532d" }}>{fmtDecimal(topCampaign.value, currency)}</p>
                      </div>
                    </div>
                    <div>
                      <a
                        href="https://ads.google.com/aw/campaigns"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          background: "#16a34a", color: "#fff",
                          borderRadius: 8, padding: "10px 20px",
                          fontWeight: 700, fontSize: 14,
                          textDecoration: "none",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                        }}
                      >
                        Scale this campaign →
                      </a>
                    </div>
                  </BlockStack>
                </div>
              </Grid.Cell>
            )}
            {worstCampaign && (
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <div style={{
                  background: "linear-gradient(135deg, #fff7f7 0%, #fee2e2 100%)",
                  border: "1.5px solid #fca5a5",
                  borderRadius: 12, padding: "20px 24px",
                  height: "100%", boxSizing: "border-box",
                }}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start">
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Wasting budget</p>
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#7f1d1d", marginTop: 4, lineHeight: 1.3 }}>{worstCampaign.name}</p>
                      </div>
                      <Badge tone="critical">Lowest ROAS</Badge>
                    </InlineStack>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", fontWeight: 600 }}>ROAS</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#dc2626" }}>
                          {worstCampaign.spend > 0 ? Math.round((worstCampaign.value / worstCampaign.spend) * 100) + "%" : "—"}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", fontWeight: 600 }}>Spend</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#7f1d1d" }}>{fmtDecimal(worstCampaign.spend, currency)}</p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", fontWeight: 600 }}>Conv. Value</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#7f1d1d" }}>{fmtDecimal(worstCampaign.value, currency)}</p>
                      </div>
                    </div>
                    <div>
                      <a
                        href="https://ads.google.com/aw/campaigns"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          background: "#dc2626", color: "#fff",
                          borderRadius: 8, padding: "10px 20px",
                          fontWeight: 700, fontSize: 14,
                          textDecoration: "none",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                        }}
                      >
                        Pause this campaign →
                      </a>
                    </div>
                  </BlockStack>
                </div>
              </Grid.Cell>
            )}
          </Grid>
        )}

        {/* Campaign table */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Campaign breakdown</Text>
              <a
                href="https://ads.google.com/aw/campaigns"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
              >
                Open Google Ads Manager →
              </a>
            </InlineStack>
            {data.lastSyncedAt && (
              <Text as="p" variant="bodySm" tone="subdued">
                Last synced: {new Date(data.lastSyncedAt).toLocaleString()}
              </Text>
            )}
            {campaignTableRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Campaign", "Spend", "Impressions", "Clicks", "CTR", "Conversions", "Value", "ROAS", "CPA"]}
                rows={campaignTableRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">
                {data.hasConnection
                  ? "No campaign data for this window. Sync runs automatically every 24h."
                  : "Connect Google Ads in Settings → Integrations to start syncing data."}
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Shopify vs Google Sales Comparison */}
        <SalesComparison
          shopifyRevenue={data.shopifyRev7 || 0}
          shopifyOrders={data.shopifyOrders7 || 0}
          platformName="Google"
          platformRevenue={kpis.value}
          currency={data.storeCurrency || "NOK"}
        />

      </BlockStack>
    </Page>
  );
}
