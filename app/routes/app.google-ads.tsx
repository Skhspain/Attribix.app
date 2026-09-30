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
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import db from "../db.server";
import { RevenueSpendChart } from "~/components/RevenueSpendChart";

export async function loader({ request }: LoaderFunctionArgs) {
  const { authenticate } = await import("../shopify.server");
  const { session, admin } = await authenticate.admin(request);
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
      select: { lastSyncedAt: true, adCustomerId: true, lastSyncAttemptAt: true, lastSyncError: true, currencyCode: true },
    }).catch(() => null),
  ]);

  const hasConnection = !!googleConn?.adCustomerId;

  const { getReportingCurrency } = await import("~/services/reportingCurrency.server");
  const storeCurrency = await getReportingCurrency(shop, admin);

  // Also pull live metrics from Google Ads API if connected
  let liveMetrics: any[] = [];
  let liveError: string | null = null;
  let conversionActionRows: any[] = [];
  let conversionActionsLoaded = false;
  // Unknown account currency → assume the store currency rather than guessing USD.
  let adAccountCurrency: string = googleConn?.currencyCode || storeCurrency;
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
        const query = `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, segments.date FROM campaign WHERE segments.date BETWEEN '${fmtD(since)}' AND '${fmtD(today)}' AND campaign.status != 'REMOVED' ORDER BY segments.date DESC`;
        const streamResults = await googleAdsSearchStream({
          accessToken: tokenResult.accessToken,
          customerId: googleConn.adCustomerId!,
          query,
        });
        liveMetrics = streamResults.flatMap((chunk: any) => chunk?.results ?? []);

        // Which conversion actions each campaign's conversions came from, so a
        // lead or sign-up campaign isn't judged on purchase ROAS. Non-fatal:
        // without it the page says the goal is unknown instead of guessing.
        try {
          const actionQuery = `SELECT campaign.id, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, segments.date FROM campaign WHERE segments.date BETWEEN '${fmtD(since)}' AND '${fmtD(today)}' AND campaign.status != 'REMOVED'`;
          const actionResults = await googleAdsSearchStream({
            accessToken: tokenResult.accessToken,
            customerId: googleConn.adCustomerId!,
            query: actionQuery,
          });
          conversionActionRows = actionResults.flatMap((chunk: any) => chunk?.results ?? []);
          conversionActionsLoaded = true;
        } catch (e) {
          console.warn("[google-ads] conversion action breakdown failed:", e);
        }
      } else {
        liveError = "The Google connection needs to be renewed. Reconnect Google Ads.";
      }
    } catch (e: any) {
      console.error("[google-ads] live metrics fetch failed:", e);
      const msg = String(e?.message ?? e);
      liveError = /only approved for use with test accounts/i.test(msg)
        ? "Google hasn't yet approved Attribix to read live ad accounts. You don't need to do anything — data will appear once it's approved."
        : msg.split("\n")[0].slice(0, 300);
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
    channelType: row.campaign?.advertisingChannelType || null,
    biddingStrategy: row.campaign?.biddingStrategyType || null,
    spend: (Number(row.metrics?.costMicros || 0) / 1_000_000) * rate,
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    conversions: Number(row.metrics?.conversions || 0),
    conversionValue: Number(row.metrics?.conversionsValue || 0) * rate,
    date: row.segments?.date ? new Date(row.segments.date + "T00:00:00Z").toISOString() : new Date().toISOString(),
  }));

  const conversionActions = conversionActionRows.map((row: any) => ({
    campaignId: row.campaign?.id || "unknown",
    action: row.segments?.conversionActionName || "Unnamed conversion action",
    category: row.segments?.conversionActionCategory || "UNKNOWN",
    conversions: Number(row.metrics?.conversions || 0),
    value: Number(row.metrics?.conversionsValue || 0) * rate,
    date: row.segments?.date ? new Date(row.segments.date + "T00:00:00Z").toISOString() : new Date().toISOString(),
  }));

  // Load Google-attributed purchases (gclid or google UTM) within 90-day history
  const googleAttributedPurchases = await db.purchase.findMany({
    where: {
      shop,
      createdAt: { gte: since90 },
      OR: [
        { gclid: { not: null } },
        { utmSource: { contains: "google" } },
        { utmSource: { contains: "adwords" } },
      ],
    },
    select: { totalValue: true, createdAt: true },
  }).catch(() => []);

  return json({
    shop,
    nowMs: Date.now(),
    campaigns: transformedCampaigns,
    conversionActions,
    conversionActionsLoaded,
    lastSyncedAt: googleConn?.lastSyncedAt ?? null,
    lastSyncAttemptAt: googleConn?.lastSyncAttemptAt ?? null,
    lastSyncError: googleConn?.lastSyncError ?? null,
    liveError,
    adCustomerId: googleConn?.adCustomerId ?? null,
    hasConnection,
    storeCurrency,
    adAccountCurrency,
    attributedPurchases: googleAttributedPurchases as Array<{ totalValue: number | null; createdAt: string }>,
    exchangeRate: rate,
  });
}

function safeNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtRoas(roas: number | null) {
  if (roas === null) return "—";
  return roas.toFixed(1) + "×";
}

function fmtDecimal(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

type CampaignGoal = "purchases" | "mixed" | "other" | "unknown";
type CampaignSummary = {
  id: string; name: string; channelType: string | null; biddingStrategy: string | null;
  spend: number; impressions: number; clicks: number; conversions: number; value: number;
  actions: Map<string, { category: string; conversions: number; value: number }>;
  goal: CampaignGoal;
};

// "PERFORMANCE_MAX" → "Performance max"
function humanEnum(v: string | null) {
  if (!v || v === "UNSPECIFIED" || v === "UNKNOWN") return null;
  const s = v.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// What a campaign's conversions and value are based on, in one line.
function campaignBasis(c: CampaignSummary) {
  const type = [humanEnum(c.channelType), humanEnum(c.biddingStrategy)].filter(Boolean).join(" · ");
  const acts = Array.from(c.actions.entries()).filter(([, a]) => a.conversions > 0).map(([name]) => name);
  const actText = acts.length ? `Conversions: ${acts.slice(0, 3).join(", ")}${acts.length > 3 ? ` +${acts.length - 3}` : ""}` : null;
  const valueText =
    c.goal === "purchases" ? "value = purchase value"
    : c.goal === "mixed" ? "value mixes purchases and other actions"
    : c.goal === "other" ? "value = values assigned to non-purchase actions"
    : "conversion actions unavailable";
  return [type, actText, valueText].filter(Boolean).join(" · ");
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
    d.setUTCDate(d.getUTCDate() - (windowDays - 1));
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

  const currency = data.storeCurrency;
  // Data can't be trusted as "zero" if we couldn't read the account.
  const dataUnavailable = data.hasConnection && !!(data.liveError || data.lastSyncError);
  const MIN_TRACKED_ORDERS = 5;

  // Attribix-attributed revenue: orders tracked via gclid/google UTM within the window
  const { attributedRevenue, attributedOrders } = useMemo(() => {
    const ps = (data.attributedPurchases as any[]).filter(
      (p) => new Date(p.createdAt) >= windowCutoff
    );
    return {
      attributedRevenue: ps.reduce((s: number, p: any) => s + safeNum(p.totalValue), 0),
      attributedOrders: ps.length,
    };
  }, [data.attributedPurchases, windowCutoff]);

  const attributedRoas = kpis.spend > 0 && attributedRevenue > 0 ? attributedRevenue / kpis.spend : null;

  // Chart data — daily spend vs attributed revenue
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
      if (cur) cur.spend += safeNum(r.spend);
    }
    for (const p of data.attributedPurchases as any[]) {
      const k = dayKey(p.createdAt);
      const cur = map.get(k);
      if (cur) cur.revenue += safeNum(p.totalValue);
    }
    return Array.from(map.values());
  }, [campaigns, data.attributedPurchases, windowDays]);

  // One summary per campaign, including what its conversions actually are.
  // ROAS only means "return on ad spend" for purchase conversions; a lead or
  // sign-up campaign's value is whatever was assigned to those actions.
  const campaignSummaries = useMemo(() => {
    const map = new Map<string, CampaignSummary>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || {
        id, name: r.campaignName || id, channelType: r.channelType, biddingStrategy: r.biddingStrategy,
        spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0,
        actions: new Map<string, { category: string; conversions: number; value: number }>(),
        goal: "unknown" as CampaignGoal,
      };
      cur.spend += safeNum(r.spend);
      cur.impressions += safeNum(r.impressions);
      cur.clicks += safeNum(r.clicks);
      cur.conversions += safeNum(r.conversions);
      cur.value += safeNum(r.conversionValue);
      map.set(id, cur);
    }
    for (const a of data.conversionActions as any[]) {
      if (new Date(a.date) < windowCutoff) continue;
      const c = map.get(String(a.campaignId));
      if (!c) continue;
      const cur = c.actions.get(a.action) || { category: a.category, conversions: 0, value: 0 };
      cur.conversions += safeNum(a.conversions);
      cur.value += safeNum(a.value);
      c.actions.set(a.action, cur);
    }
    for (const c of map.values()) {
      const acts = Array.from(c.actions.values()).filter((a) => a.conversions > 0);
      if (!data.conversionActionsLoaded || acts.length === 0) c.goal = "unknown";
      else if (acts.every((a) => a.category === "PURCHASE")) c.goal = "purchases";
      else if (acts.some((a) => a.category === "PURCHASE")) c.goal = "mixed";
      else c.goal = "other";
    }
    return Array.from(map.values());
  }, [campaigns, data.conversionActions, data.conversionActionsLoaded, windowCutoff]);

  // Winning campaign — best ROAS among campaigns whose conversions are purchases
  const topCampaign = useMemo(() => {
    const rows = campaignSummaries.filter((c) => c.spend > 0 && c.goal === "purchases");
    if (!rows.length) return null;
    return [...rows].sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [campaignSummaries]);

  // Below break-even — only judged for purchase campaigns; others are listed
  // in the table with their goal instead of a red label.
  const worstCampaign = useMemo(() => {
    const rows = campaignSummaries.filter((c) => c.spend > 0 && c.goal === "purchases" && c.conversions > 0 && c.value / c.spend < 1);
    if (!rows.length) return null;
    return [...rows].sort((a, b) => (a.value / a.spend) - (b.value / b.spend))[0];
  }, [campaignSummaries]);
  const unjudgedCampaigns = campaignSummaries.filter((c) => c.spend > 0 && c.goal !== "purchases").length;

  // Campaign table rows
  const campaignTableRows = useMemo(() => {
    return [...campaignSummaries]
      .sort((a, b) => b.spend - a.spend)
      .map((c) => [
        <BlockStack key={c.id} gap="050">
          <Text as="span" variant="bodySm" fontWeight="semibold">{c.name}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{campaignBasis(c)}</Text>
        </BlockStack>,
        fmtDecimal(c.spend, currency),
        String(c.impressions.toLocaleString()),
        String(c.clicks.toLocaleString()),
        c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) + "%" : "—",
        String(Math.round(c.conversions).toLocaleString()),
        fmtDecimal(c.value, currency),
        c.spend > 0 ? `${fmtRoas(c.value / c.spend)}${c.goal === "purchases" ? "" : " *"}` : "—",
        c.conversions > 0 && c.spend > 0 ? fmtDecimal(c.spend / c.conversions, currency) : "—",
      ]);
  }, [campaignSummaries, currency]);

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
          disabled: syncing || !data.hasConnection,
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
            <p>Connect Google Ads under <strong>Integrations</strong> to see your data.</p>
          </Banner>
        )}

        {/* Connection status: account, last successful sync, and why data is missing */}
        {data.hasConnection && (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">Google Ads connection</Text>
                <Badge tone={dataUnavailable ? "critical" : data.lastSyncedAt ? "success" : "attention"}>
                  {dataUnavailable ? "Data unavailable" : data.lastSyncedAt ? "Syncing" : "Not synced yet"}
                </Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                {`Ad account ${formatCustomerId(data.adCustomerId)} · last successful sync: ${data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString() : "never"}`}
                {data.lastSyncAttemptAt ? ` · last attempt: ${new Date(data.lastSyncAttemptAt).toLocaleString()}` : ""}
              </Text>
              {dataUnavailable && (
                <Banner tone="critical" title="Google Ads data couldn't be loaded, so the figures below are not real zeros">
                  <p>{data.liveError || data.lastSyncError}</p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}

        {campaigns.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">{`Results · last ${windowDays} days`}</Text>
                <Text as="p" tone="subdued">
                  Google counts conversions with its own attribution; Attribix counts orders where it saw the Google click on your store. Neither includes product costs.
                </Text>
              </BlockStack>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Google reports</Text>
                    <Text as="p">{`${fmtRoas(kpis.roas)} ROAS · ${Math.round(kpis.conversions).toLocaleString()} conversions · ${fmtDecimal(kpis.value, currency)} value`}</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">Attribix tracked</Text>
                    <Text as="p">{`${fmtRoas(attributedRoas)} ROAS · ${attributedOrders} orders · ${fmtDecimal(attributedRevenue, currency)} revenue`}</Text>
                  </BlockStack>
                </Box>
              </InlineGrid>
              {attributedOrders < MIN_TRACKED_ORDERS && (
                <Text as="p" tone="subdued">
                  {`Only ${attributedOrders} Attribix-tracked Google order${attributedOrders === 1 ? "" : "s"} in this period — too few to judge performance on.`}
                </Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* KPIs */}
        <Grid>
          {[
            { label: "Total spend", value: dataUnavailable && !campaigns.length ? "Unavailable" : fmtDecimal(kpis.spend, currency) },
            { label: "Impressions", value: kpis.impressions.toLocaleString() },
            {
              label: "Clicks",
              value: kpis.clicks.toLocaleString(),
              sub: kpis.ctr ? `CTR ${kpis.ctr.toFixed(2)}%` : undefined,
            },
            {
              label: "ROAS (Google-reported)",
              value: kpis.roas !== null ? fmtRoas(kpis.roas) : "—",
              sub: `${Math.round(kpis.conversions).toLocaleString()} conversions · ${fmtDecimal(kpis.value, currency)} value`,
            },
            { label: "Conversions", value: Math.round(kpis.conversions).toLocaleString() },
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
              <Text as="h2" variant="headingMd">Daily spend vs Attribix-tracked revenue</Text>
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#6366f1" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Attributed revenue</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#38bdf8" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            {chartData.length > 0 ? (
              <RevenueSpendChart data={chartData} currency={currency} showRoasLabels={windowDays <= 14} revenueLabel="Attributed revenue" />
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
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Highest ROAS · purchase campaigns (Google-reported)</p>
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#14532d", marginTop: 4, lineHeight: 1.3 }}>{topCampaign.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#166534", marginTop: 4 }}>{campaignBasis(topCampaign)}</p>
                      </div>
                      {topCampaign.conversions < 3 && <Badge>Few conversions</Badge>}
                    </InlineStack>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", fontWeight: 600 }}>ROAS</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#15803d" }}>
                          {topCampaign.spend > 0 ? fmtRoas(topCampaign.value / topCampaign.spend) : "—"}
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
                        Open in Google Ads ↗
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
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>Lowest ROAS · purchase campaigns (Google-reported)</p>
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#7f1d1d", marginTop: 4, lineHeight: 1.3 }}>{worstCampaign.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#991b1b", marginTop: 4 }}>{campaignBasis(worstCampaign)}</p>
                      </div>
                      <Badge tone="critical">Below 1×</Badge>
                    </InlineStack>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", fontWeight: 600 }}>ROAS</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#dc2626" }}>
                          {worstCampaign.spend > 0 ? fmtRoas(worstCampaign.value / worstCampaign.spend) : "—"}
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
                        Review in Google Ads ↗
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
                Open Google Ads ↗
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
            ) : null}
            {campaignTableRows.length > 0 && unjudgedCampaigns > 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                * {data.conversionActionsLoaded
                  ? "Conversions for this campaign aren't only purchases (for example leads or sign-ups), so its value is whatever was assigned to those actions in Google Ads. ROAS isn't a fair measure of it and it isn't rated above."
                  : "Google didn't return which conversion actions these campaigns count, so they aren't rated above. Check each campaign's goal and conversion values in Google Ads."}
              </Text>
            ) : null}
            {campaignTableRows.length > 0 ? null : (
              <Text as="p" tone="subdued">
                {data.hasConnection
                  ? "No campaign data for this window. Sync runs automatically every 24h."
                  : "Connect Google Ads in Settings → Integrations to start syncing data."}
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Attribix attributed vs Google reported comparison */}
        <SalesComparison
          shopifyRevenue={attributedRevenue}
          shopifyOrders={attributedOrders}
          platformName="Google"
          platformRevenue={kpis.value}
          currency={data.storeCurrency}
          period={`${window}d`}
        />

        <InlineStack align="center" blockAlign="center" gap="300">
          <Button
            onClick={handleSync}
            loading={syncing}
            disabled={syncing}
            size="slim"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
          {data.lastSyncedAt && (
            <Text as="p" variant="bodySm" tone="subdued">
              Last synced: {new Date(data.lastSyncedAt).toLocaleString()}
            </Text>
          )}
        </InlineStack>

      </BlockStack>
    </Page>
  );
}

function formatCustomerId(id: string | null) {
  const d = String(id ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id ?? "—";
}
