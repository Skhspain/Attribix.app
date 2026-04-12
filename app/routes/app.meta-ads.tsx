// app/routes/app.meta-ads.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useMemo, useState } from "react";
import { useAuthenticatedFetch } from "~/utils/useAuthenticatedFetch";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Divider,
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
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const { getShopPlan, getHistoryCutoff } = await import("~/services/plan.server");
  const plan = await getShopPlan(shop, admin);
  const historyCutoff = getHistoryCutoff(plan);

  const [campaigns, ads, metaConn] = await Promise.all([
    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: historyCutoff } },
      select: { campaignId: true, campaignName: true, objective: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true, date: true },
      orderBy: { date: "desc" },
    }).catch(() => []),
    anyDb.metaAdDailyInsight?.findMany?.({
      where: { shop, date: { gte: historyCutoff } },
      select: { adId: true, adName: true, adSetName: true, campaignName: true, spend: true, impressions: true, clicks: true, ctr: true, cpc: true, purchases: true, purchaseValue: true, date: true },
      orderBy: { date: "desc" },
    }).catch(() => []),
    db.metaConnection.findUnique({ where: { shop }, select: { lastSyncedAt: true, accessToken: true, adAccountId: true } }).catch(() => null),
  ]);

  const hasConnection = !!(metaConn && metaConn.accessToken && metaConn.accessToken !== "__PENDING__");

  return json({
    shop,
    nowMs: Date.now(),
    campaigns: campaigns ?? [],
    ads: ads ?? [],
    lastSyncedAt: metaConn?.lastSyncedAt ?? null,
    hasConnection,
    adAccountId: metaConn?.adAccountId ?? null,
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
  try { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(iso)); }
  catch { return iso; }
}


export default function MetaAdsDetail() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const authFetch = useAuthenticatedFetch();
  const [window, setWindow] = useState<"7" | "14" | "30" | "90">("7");
  const [view, setView] = useState<"ads" | "campaigns">("ads");
  const [showTargets, setShowTargets] = useState(false);
  const [targetRoas, setTargetRoas] = useState<string>("3");
  const [targetCpa, setTargetCpa] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const windowDays = Number(window);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await authFetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: windowDays }),
      });
      const result = await res.json();
      if (result.ok) {
        setSyncMessage(`✓ Synced ${result.campaigns || 0} campaigns, ${result.ads || 0} ads`);
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
  const ads = useMemo(
    () => (data.ads as any[]).filter((r) => new Date(r.date) >= windowCutoff),
    [data.ads, windowCutoff]
  );

  // KPIs
  const kpis = useMemo(() => {
    let spend = 0, impressions = 0, clicks = 0, purchases = 0, value = 0;
    for (const r of campaigns) {
      spend += safeNum(r.spend);
      impressions += safeNum(r.impressions);
      clicks += safeNum(r.clicks);
      purchases += safeNum(r.purchases);
      value += safeNum(r.purchaseValue);
    }
    return { spend, impressions, clicks, purchases, value, roas: spend > 0 ? value / spend : null, ctr: impressions > 0 ? (clicks / impressions) * 100 : null, cpc: clicks > 0 ? spend / clicks : null };
  }, [campaigns]);

  // Detect currency
  const currency = "NOK";

  // Chart data — daily spend vs purchase value
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
        cur.revenue += safeNum(r.purchaseValue);
      }
    }
    return Array.from(map.values());
  }, [campaigns, windowDays]);

  // Top performers
  const topCampaign = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; value: number; purchases: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, spend: 0, value: 0, purchases: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.purchaseValue);
      cur.purchases += safeNum(r.purchases);
      map.set(id, cur);
    }
    const rows = Array.from(map.values()).filter((c) => c.spend > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [campaigns]);

  // Sales-oriented objectives — ROAS is a meaningful metric for these
  const SALES_OBJECTIVES = new Set([
    "OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES", "STORE_TRAFFIC",
  ]);

  const worstCampaign = useMemo(() => {
    const map = new Map<string, { name: string; objective: string | null; spend: number; value: number; purchases: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, objective: (r as any).objective ?? null, spend: 0, value: 0, purchases: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.purchaseValue);
      cur.purchases += safeNum(r.purchases);
      map.set(id, cur);
    }
    // Only flag conversion/sales campaigns that lost money.
    // If objective is unknown, fall back to: had real revenue but ROAS < 1.
    const rows = Array.from(map.values()).filter((c) => {
      if (c.spend <= 0) return false;
      const isSalesCampaign = c.objective ? SALES_OBJECTIVES.has(c.objective) : c.value > 0;
      return isSalesCampaign && c.value / c.spend < 1;
    });
    if (rows.length < 1) return null;
    return rows.sort((a, b) => (a.value / a.spend) - (b.value / b.spend))[0];
  }, [campaigns]);

  const topAd = useMemo(() => {
    const map = new Map<string, { name: string; adSet: string; campaign: string; spend: number; value: number; clicks: number; impressions: number; purchases: number }>();
    for (const r of ads) {
      const id = String(r.adId);
      const cur = map.get(id) || { name: r.adName || id, adSet: r.adSetName || "—", campaign: r.campaignName || "—", spend: 0, value: 0, clicks: 0, impressions: 0, purchases: 0 };
      cur.spend += safeNum(r.spend);
      cur.value += safeNum(r.purchaseValue);
      cur.clicks += safeNum(r.clicks);
      cur.impressions += safeNum(r.impressions);
      cur.purchases += safeNum(r.purchases);
      map.set(id, cur);
    }
    const rows = Array.from(map.values()).filter((a) => a.spend > 0);
    if (!rows.length) return null;
    return rows.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0];
  }, [ads]);

  // Campaign table
  const campaignTableRows = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; impressions: number; clicks: number; purchases: number; value: number }>();
    for (const r of campaigns) {
      const id = String(r.campaignId);
      const cur = map.get(id) || { name: r.campaignName || id, spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 };
      cur.spend += safeNum(r.spend);
      cur.impressions += safeNum(r.impressions);
      cur.clicks += safeNum(r.clicks);
      cur.purchases += safeNum(r.purchases);
      cur.value += safeNum(r.purchaseValue);
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
        String(c.purchases),
        fmtDecimal(c.value, currency),
        c.spend > 0 ? Math.round((c.value / c.spend) * 100) + "%" : "—",
        c.purchases > 0 && c.spend > 0 ? fmtDecimal(c.spend / c.purchases, currency) : "—",
      ]);
  }, [campaigns, currency]);

  // Ad table — all ads, sorted best to worst, plain language
  const adTableData = useMemo(() => {
    const map = new Map<string, { name: string; adSet: string; campaign: string; spend: number; impressions: number; clicks: number; purchases: number; value: number }>();
    for (const r of ads) {
      const id = String(r.adId);
      const cur = map.get(id) || { name: r.adName || id, adSet: r.adSetName || "—", campaign: r.campaignName || "—", spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 };
      cur.spend += safeNum(r.spend);
      cur.impressions += safeNum(r.impressions);
      cur.clicks += safeNum(r.clicks);
      cur.purchases += safeNum(r.purchases);
      cur.value += safeNum(r.purchaseValue);
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => {
        // Sort: ads with purchases first, then by revenue made per $ spent
        const scoreA = a.spend > 0 ? a.value / a.spend : -1;
        const scoreB = b.spend > 0 ? b.value / b.spend : -1;
        return scoreB - scoreA;
      })
      .map((a, i) => {
        const roas = a.spend > 0 ? a.value / a.spend : null;
        const ctr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
        const profit = a.value - a.spend;

        // Infer ad type from engagement pattern
        const isAwareness = a.purchases === 0 && a.impressions >= 1000 && (ctr ?? 0) < 0.5;
        const isTrafficOrLead = a.purchases === 0 && !isAwareness && a.clicks >= 5 && (ctr ?? 0) >= 0.5;
        const isNegligible = a.purchases === 0 && a.spend < 0.5;

        // Performance label
        let perfLabel = "No sales tracked yet";
        let perfColor = "#9ca3af";
        if (roas !== null && roas >= 3) { perfLabel = "🟢 Winning"; perfColor = "#16a34a"; }
        else if (roas !== null && roas >= 1) { perfLabel = "🟡 Breaking even"; perfColor = "#d97706"; }
        else if (roas !== null && roas < 1) { perfLabel = "🔴 Losing money"; perfColor = "#dc2626"; }
        else if (isAwareness) { perfLabel = "👁️ Awareness — not measured by sales"; perfColor = "#6b7280"; }
        else if (isTrafficOrLead) { perfLabel = "🎯 Traffic/Lead — sales not tracked"; perfColor = "#6b7280"; }
        else if (isNegligible) { perfLabel = "—"; perfColor = "#d1d5db"; }

        return {
          rank: i + 1,
          name: a.name,
          campaign: a.campaign,
          spend: a.spend,
          value: a.value,
          profit,
          purchases: a.purchases,
          impressions: a.impressions,
          clicks: a.clicks,
          ctr,
          roas,
          perfLabel,
          perfColor,
          adType: isAwareness ? "awareness" : isTrafficOrLead ? "traffic" : isNegligible ? "negligible" : "conversion",
        };
      });
  }, [ads, currency]);

  return (
    <Page
      fullWidth
      title="Meta Ads — Detailed Performance"
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

        {/* Disconnected state */}
        {!data.hasConnection && (
          <div style={{
            padding: 32,
            borderRadius: 12,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📘</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#1e3a8a" }}>
              Connect Meta Ads
            </h2>
            <p style={{ color: "#475569", fontSize: 14, margin: "0 0 20px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              Connect your Meta Business account to see Facebook & Instagram ad performance, ROAS, and campaign insights right here.
            </p>
            <a
              href="/app/integrations/meta"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "#1877f2",
                color: "#fff",
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Go to Meta Integration →
            </a>
          </div>
        )}

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
                  ? "Your ads are profitable"
                  : kpis.roas !== null && kpis.roas >= 1
                  ? "Your ads are breaking even"
                  : kpis.roas !== null
                  ? "Your ads are losing money"
                  : "No purchase data yet"}
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
                  <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em" }}>Revenue</p>
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
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Scroll down to see which campaigns and ads are burning budget.</p>
              </div>
            )}
          </div>
        )}

        {/* KPIs */}
        <Grid>
          {[
            { label: "Total spend", value: fmtDecimal(kpis.spend, currency) },
            { label: "Impressions", value: kpis.impressions.toLocaleString() },
            { label: "Clicks", value: kpis.clicks.toLocaleString(), sub: kpis.ctr ? `CTR ${kpis.ctr.toFixed(2)}%` : undefined },
            { label: "ROAS (Meta reported)", value: kpis.roas ? Math.round(kpis.roas * 100) + "%" : "—", sub: `${kpis.purchases} purchases · ${fmtDecimal(kpis.value, currency)} value` },
          ].map((kpi) => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
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
              <Text as="h2" variant="headingMd">Daily spend vs purchase value</Text>
              <InlineStack gap="300" blockAlign="center">
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#6366f1" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Purchase value</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: "#38bdf8" }} />
                  <Text as="span" variant="bodySm" tone="subdued">Spend</Text>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            {chartData.length > 0 ? <RevenueSpendChart data={chartData} currency="NOK" showRoasLabels={windowDays <= 14} revenueLabel="Purchase value" /> : <Text as="p" tone="subdued">No data for this window.</Text>}
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
                        <p style={{ margin: 0, fontSize: 11, color: "#166534", fontWeight: 600 }}>Revenue</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#14532d" }}>{fmtDecimal(topCampaign.value, currency)}</p>
                      </div>
                    </div>
                    <div>
                      <a
                        href={`https://www.facebook.com/adsmanager/manage/campaigns?act=`}
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
                        <p style={{ margin: 0, fontSize: 11, color: "#991b1b", fontWeight: 600 }}>Revenue</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#7f1d1d" }}>{fmtDecimal(worstCampaign.value, currency)}</p>
                      </div>
                    </div>
                    <div>
                      <a
                        href={`https://www.facebook.com/adsmanager/manage/campaigns`}
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
            <Text as="h2" variant="headingMd">Campaign breakdown</Text>
            {campaignTableRows.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                headings={["Campaign", "Spend", "Impressions", "Clicks", "CTR", "Purchases", "Value", "ROAS", "CPA"]}
                rows={campaignTableRows}
                increasedTableDensity
              />
            ) : (
              <Text as="p" tone="subdued">No campaign data for this window.</Text>
            )}
          </BlockStack>
        </Card>

        {/* Ads/Campaigns toggle + table */}
        <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", border: "1px solid #e1e3e5" }}>

          {/* Target banner */}
          {!showTargets ? (
            <div style={{
              background: "#fff8f0",
              borderBottom: "1px solid #f0e0c8",
              padding: "16px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ No ROAS target set</p>
                <p style={{ margin: 0, fontSize: 14, color: "#78350f", marginTop: 3 }}>Set your target to see which ads are actually profitable.</p>
              </div>
              <button onClick={() => setShowTargets(true)} style={{
                background: "#f59e0b", color: "#fff", border: "none",
                borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              }}>
                👉 Set your ROAS target
              </button>
            </div>
          ) : (
            <div style={{
              background: "#f0fdf4",
              borderBottom: "1px solid #bbf7d0",
              padding: "16px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#166534", fontWeight: 600, whiteSpace: "nowrap" }}>Target ROAS:</p>
                  <input
                    type="number" min="0" step="0.1" value={targetRoas}
                    onChange={(e) => setTargetRoas(e.target.value)}
                    style={{ width: 56, padding: "5px 8px", borderRadius: 6, border: "1px solid #86efac", fontSize: 14, fontWeight: 700, textAlign: "center", background: "#fff" }}
                  />
                  <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>×</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#166534", fontWeight: 600, whiteSpace: "nowrap" }}>Max cost/sale:</p>
                  <input
                    type="number" min="0" step="1" value={targetCpa}
                    onChange={(e) => setTargetCpa(e.target.value)}
                    placeholder="—"
                    style={{ width: 72, padding: "5px 8px", borderRadius: 6, border: "1px solid #86efac", fontSize: 14, fontWeight: 700, textAlign: "center", background: "#fff" }}
                  />
                </div>
              </div>
              <button onClick={() => setShowTargets(false)} style={{
                background: "transparent", color: "#166534", border: "1px solid #86efac",
                borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}>
                Done ✓
              </button>
            </div>
          )}

          {/* White body — toggle + table */}
          <div style={{ background: "#fff", padding: "20px 28px" }}>
            <BlockStack gap="400">

            {/* Toggle Ads / Campaigns */}
            <InlineStack align="start" blockAlign="center">
              <InlineStack gap="0">
                {(["ads", "campaigns"] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} style={{
                    padding: "8px 20px",
                    background: view === v ? "#303030" : "#f1f2f3",
                    color: view === v ? "#fff" : "#6b7280",
                    border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
                    borderRadius: v === "ads" ? "8px 0 0 8px" : "0 8px 8px 0",
                    transition: "all 0.15s",
                  }}>
                    {v === "ads" ? "Ads" : "Campaigns"}
                  </button>
                ))}
              </InlineStack>
            </InlineStack>

            {/* Target setter (old inline — removed, now in hero) */}
            {false && (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: 16 }}>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Your targets</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Set what "good" looks like for your ads. We'll show you how close each ad is to hitting it.</Text>
                  </BlockStack>
                  <InlineStack gap="400" blockAlign="end">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="semibold">Target ROAS — for every NOK spent, earn at least:</Text>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number" min="0" step="0.1"
                          value={targetRoas}
                          onChange={(e) => setTargetRoas(e.target.value)}
                          style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
                        />
                        <Text as="p" variant="bodySm" tone="subdued">× back (e.g. 3 = earn 3× what you spend)</Text>
                      </div>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="semibold">Target cost per sale — pay no more than:</Text>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number" min="0" step="1"
                          value={targetCpa}
                          onChange={(e) => setTargetCpa(e.target.value)}
                          placeholder="e.g. 150"
                          style={{ width: 100, padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
                        />
                        <Text as="p" variant="bodySm" tone="subdued">NOK per sale</Text>
                      </div>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </div>
            )}

            {/* Summary bar */}
            {view === "ads" && adTableData.length > 0 && (() => {
              const roasTarget = parseFloat(targetRoas) || null;
              const hitting = roasTarget ? adTableData.filter(a => a.roas !== null && a.roas >= roasTarget).length : adTableData.filter(a => a.roas !== null && a.roas >= 3).length;
              const losing = adTableData.filter(a => a.roas !== null && a.roas < 1 && a.spend > 0).length;
              const noSales = adTableData.filter(a => a.adType === "conversion" && a.purchases === 0 && a.spend > 0.5).length;
              const profitableSpend = adTableData.filter(a => roasTarget ? (a.roas !== null && a.roas >= roasTarget) : (a.roas !== null && a.roas >= 3)).reduce((s, a) => s + a.spend, 0);
              const totalSpend = adTableData.reduce((s, a) => s + a.spend, 0);
              const profitPct = totalSpend > 0 ? Math.round((profitableSpend / totalSpend) * 100) : 0;
              return (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "#f9fafb", borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{hitting}</strong> of {adTableData.length} ads hitting target</p>
                  </div>
                  <span style={{ color: "#d1d5db", fontSize: 13 }}>·</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                    <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{profitPct}%</strong> of spend is profitable</p>
                  </div>
                  {losing > 0 && <>
                    <span style={{ color: "#d1d5db", fontSize: 13 }}>·</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                      <p style={{ margin: 0, fontSize: 13, color: "#111827" }}><strong>{losing}</strong> ads losing money</p>
                    </div>
                  </>}
                  {noSales > 0 && <>
                    <span style={{ color: "#d1d5db", fontSize: 13 }}>·</span>
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}><strong>{noSales}</strong> ads spending with no sales</p>
                  </>}
                </div>
              );
            })()}

            {/* Ads table — grouped */}
            {view === "ads" && (() => {
              if (adTableData.length === 0) return <Text as="p" tone="subdued">Ad-level data will appear after the next sync from Integrations → Meta.</Text>;

              const conversionAds = adTableData.filter(a => a.adType === "conversion" || a.purchases > 0);
              const awarenessAds = adTableData.filter(a => a.adType === "awareness");
              const trafficAds = adTableData.filter(a => a.adType === "traffic");
              const otherAds = adTableData.filter(a => a.adType === "negligible");

              const roasTarget = parseFloat(targetRoas) || null;
              const cpaTarget = parseFloat(targetCpa) || null;

              const renderAdRow = (a: typeof adTableData[0]) => {
                const cpa = a.purchases > 0 ? a.spend / a.purchases : null;
                const roasPct = roasTarget && a.roas !== null ? Math.min(Math.round((a.roas / roasTarget) * 100), 100) : null;
                const hitRoas = roasTarget && a.roas !== null && a.roas >= roasTarget;
                const hitCpa = cpaTarget && cpa !== null && cpa <= cpaTarget;
                let targetNote = "";
                if (roasTarget && a.roas !== null) {
                  targetNote = hitRoas ? `✅ ROAS target hit! (${Math.round(a.roas * 100)}% / ${Math.round(roasTarget * 100)}%)` : `${Math.round(a.roas * 100)}% of ${Math.round(roasTarget * 100)}% target`;
                }
                if (cpaTarget && cpa !== null) {
                  const cpaStr = `${fmtDecimal(cpa, currency)} per sale (target: ${fmtDecimal(cpaTarget, currency)})`;
                  targetNote += (targetNote ? " · " : "") + (hitCpa ? `✅ Cost/sale OK · ${cpaStr}` : `⚠️ ${cpaStr}`);
                }
                if (!roasTarget && !cpaTarget) targetNote = a.perfLabel;
                return (
                  <div key={a.name + a.campaign} style={{
                    display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr",
                    gap: "0 12px", alignItems: "center", padding: "13px 4px",
                    borderBottom: "1px solid #f1f2f3",
                    background: (hitRoas || (a.roas !== null && a.roas >= 3 && !roasTarget)) ? "#f0fdf4" : (a.roas !== null && a.roas < 1 && a.purchases > 0) ? "#fff8f8" : "#fff",
                  }}>
                    <Text as="p" variant="bodySm" tone="subdued">{a.rank}</Text>
                    <BlockStack gap="0">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{a.name}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{a.campaign}</Text>
                    </BlockStack>
                    <Text as="p" variant="bodySm">{fmtDecimal(a.spend, currency)}</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">{fmtDecimal(a.value, currency)}</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone={a.profit >= 0 ? "success" : "critical"}>
                      {a.profit >= 0 ? "+" : ""}{fmtDecimal(a.profit, currency)}
                    </Text>
                    <Text as="p" variant="bodySm">{a.purchases}</Text>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{targetNote}</Text>
                      {roasTarget && a.roas !== null && (
                        <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 99 }}>
                          <div style={{ width: `${roasPct}%`, height: "100%", background: hitRoas ? "#22c55e" : "#f59e0b", borderRadius: 99 }} />
                        </div>
                      )}
                    </BlockStack>
                  </div>
                );
              };

              const columnHeaders = (cols: string[]) => (
                <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr", gap: "0 12px", padding: "6px 4px 10px", borderBottom: "1px solid #e1e3e5" }}>
                  {cols.map(h => <p key={h} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{h}</p>)}
                </div>
              );

              const sectionHeader = (label: string, count: number, sublabel: string, bg = "#f9fafb", first = false) => (
                <div style={{ background: bg, padding: "10px 14px", borderRadius: 8, marginTop: first ? 8 : 36, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: first ? "none" : "2px solid #e5e7eb" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>{label} <span style={{ fontWeight: 400, color: "#6b7280" }}>({count})</span></p>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{sublabel}</p>
                </div>
              );

              return (
                <BlockStack gap="0">
                  {conversionAds.length > 0 && <>
                    {sectionHeader("💰 Purchase ads", conversionAds.length, "Measured by sales & ROAS", "#f9fafb", true)}
                    {columnHeaders(["#", "Ad name", "You spent", "You made", "Profit/loss", "Sales", "Performance vs target"])}
                    {conversionAds.map(renderAdRow)}
                  </>}
                  {awarenessAds.length > 0 && <>
                    {sectionHeader("👁️ Awareness ads", awarenessAds.length, "Measured by reach & impressions, not sales", "#fafafa")}
                    {columnHeaders(["#", "Ad name", "You spent", "Impressions", "Clicks", "CTR", "Note"])}
                    {awarenessAds.map(a => (
                      <div key={a.name + a.campaign} style={{ display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr", gap: "0 12px", alignItems: "center", padding: "13px 4px", borderBottom: "1px solid #f1f2f3" }}>
                        <Text as="p" variant="bodySm" tone="subdued">{a.rank}</Text>
                        <BlockStack gap="0">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{a.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{a.campaign}</Text>
                        </BlockStack>
                        <Text as="p" variant="bodySm">{fmtDecimal(a.spend, currency)}</Text>
                        <Text as="p" variant="bodySm">{a.impressions.toLocaleString()}</Text>
                        <Text as="p" variant="bodySm">{a.clicks.toLocaleString()}</Text>
                        <Text as="p" variant="bodySm">{a.ctr !== null ? `${a.ctr.toFixed(2)}%` : "—"}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Not tracked for sales</Text>
                      </div>
                    ))}
                  </>}
                  {trafficAds.length > 0 && <>
                    {sectionHeader("🎯 Traffic / Lead ads", trafficAds.length, "Driving clicks — purchases not tracked here", "#fafafa")}
                    {columnHeaders(["#", "Ad name", "You spent", "Impressions", "Clicks", "CTR", "Note"])}
                    {trafficAds.map(a => (
                      <div key={a.name + a.campaign} style={{ display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr", gap: "0 12px", alignItems: "center", padding: "13px 4px", borderBottom: "1px solid #f1f2f3" }}>
                        <Text as="p" variant="bodySm" tone="subdued">{a.rank}</Text>
                        <BlockStack gap="0">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{a.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{a.campaign}</Text>
                        </BlockStack>
                        <Text as="p" variant="bodySm">{fmtDecimal(a.spend, currency)}</Text>
                        <Text as="p" variant="bodySm">{a.impressions.toLocaleString()}</Text>
                        <Text as="p" variant="bodySm">{a.clicks.toLocaleString()}</Text>
                        <Text as="p" variant="bodySm">{a.ctr !== null ? `${a.ctr.toFixed(2)}%` : "—"}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Check lead form for results</Text>
                      </div>
                    ))}
                  </>}
                </BlockStack>
              );
            })()}

            {/* Campaigns table */}
            {view === "campaigns" && (
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {campaignTableRows.length} campaigns · sorted best to worst
                </Text>
                {campaignTableRows.length > 0 ? (
                  <BlockStack gap="0">
                    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr", gap: "0 12px", padding: "6px 4px 10px", borderBottom: "1px solid #e1e3e5" }}>
                      {["#", "Campaign name", "You spent", "You made", "Profit/loss", "Sales", "Performance vs target"].map((h) => (
                        <p key={h} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{h}</p>
                      ))}
                    </div>
                    {(() => {
                      const map = new Map<string, { name: string; spend: number; value: number; purchases: number }>();
                      for (const r of campaigns) {
                        const id = String((r as any).campaignId);
                        const cur = map.get(id) || { name: (r as any).campaignName || id, spend: 0, value: 0, purchases: 0 };
                        cur.spend += safeNum((r as any).spend);
                        cur.value += safeNum((r as any).purchaseValue);
                        cur.purchases += safeNum((r as any).purchases);
                        map.set(id, cur);
                      }
                      return Array.from(map.values())
                        .sort((a, b) => {
                          const scoreA = a.spend > 0 ? a.value / a.spend : -1;
                          const scoreB = b.spend > 0 ? b.value / b.spend : -1;
                          return scoreB - scoreA;
                        })
                        .map((c, i) => {
                          const roas = c.spend > 0 ? c.value / c.spend : null;
                          const cpa = c.purchases > 0 ? c.spend / c.purchases : null;
                          const profit = c.value - c.spend;
                          const roasTarget = parseFloat(targetRoas) || null;
                          const cpaTarget = parseFloat(targetCpa) || null;
                          const roasPct = roasTarget && roas !== null ? Math.min(Math.round((roas / roasTarget) * 100), 100) : null;
                          const hitRoas = roasTarget && roas !== null && roas >= roasTarget;
                          const hitCpa = cpaTarget && cpa !== null && cpa <= cpaTarget;

                          let perfLabel = "No sales yet"; let perfColor = "#9ca3af";
                          if (roas !== null && roas >= 3) { perfLabel = "🟢 Winning"; perfColor = "#16a34a"; }
                          else if (roas !== null && roas >= 1) { perfLabel = "🟡 Breaking even"; perfColor = "#d97706"; }
                          else if (roas !== null && roas < 1 && c.spend > 0) { perfLabel = "🔴 Losing money"; perfColor = "#dc2626"; }

                          let targetNote = "";
                          if (roasTarget && roas !== null) targetNote = hitRoas ? `✅ ROAS target hit! (${Math.round(roas * 100)}%)` : `${Math.round(roas * 100)}% of ${Math.round(roasTarget * 100)}% target`;
                          if (!roasTarget && !cpaTarget) targetNote = perfLabel;

                          return (
                            <div key={c.name} style={{
                              display: "grid", gridTemplateColumns: "28px 1fr 110px 110px 110px 70px 1fr",
                              gap: "0 12px", alignItems: "center", padding: "10px 4px",
                              borderBottom: "1px solid #f1f2f3",
                              background: hitRoas || (roas !== null && roas >= 3 && !roasTarget) ? "#f0fdf4" : roas !== null && roas < 1 && c.spend > 0 ? "#fff8f8" : "#fff",
                              borderRadius: 6,
                            }}>
                              <Text as="p" variant="bodySm" tone="subdued">{i + 1}</Text>
                              <Text as="p" variant="bodySm" fontWeight="semibold">{c.name}</Text>
                              <Text as="p" variant="bodySm">{fmtDecimal(c.spend, currency)}</Text>
                              <Text as="p" variant="bodySm" fontWeight="semibold">{fmtDecimal(c.value, currency)}</Text>
                              <Text as="p" variant="bodySm" fontWeight="semibold" tone={profit >= 0 ? "success" : "critical"}>
                                {profit >= 0 ? "+" : ""}{fmtDecimal(profit, currency)}
                              </Text>
                              <Text as="p" variant="bodySm">{c.purchases}</Text>
                              <BlockStack gap="050">
                                <Text as="p" variant="bodySm" fontWeight="semibold">{targetNote}</Text>
                                {roasTarget && roas !== null && (
                                  <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 99 }}>
                                    <div style={{ width: `${roasPct}%`, height: "100%", background: hitRoas ? "#22c55e" : "#f59e0b", borderRadius: 99 }} />
                                  </div>
                                )}
                              </BlockStack>
                            </div>
                          );
                        });
                    })()}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">No campaign data for this window.</Text>
                )}
              </BlockStack>
            )}

            {/* What to do callout */}
            {view === "ads" && adTableData.length > 0 && (() => {
              const roasTarget = parseFloat(targetRoas) || null;
              const scale = adTableData.filter(a => roasTarget ? (a.roas !== null && a.roas >= roasTarget) : (a.roas !== null && a.roas >= 3));
              const watch = adTableData.filter(a => {
                const tgt = roasTarget || 3;
                return a.roas !== null && a.roas >= 1 && a.roas < tgt;
              });
              // Only flag true conversion ads with no sales — exclude awareness/lead/negligible
              const pause = adTableData.filter(a => a.adType === "conversion" && a.purchases === 0 && a.spend > 0.5);
              const notTracked = adTableData.filter(a => a.adType === "awareness" || a.adType === "traffic");
              if (scale.length === 0 && watch.length === 0 && pause.length === 0 && notTracked.length === 0) return null;
              return (
                <div style={{ marginTop: 8, borderTop: "1px solid #f1f2f3", paddingTop: 20 }}>
                  <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>What to do next</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {scale.length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>📈</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#166534" }}>Scale these ads — they're profitable</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#15803d" }}>{scale.map(a => a.name).join(" · ")}</p>
                        </div>
                      </div>
                    )}
                    {watch.length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", background: "#fffbeb", borderRadius: 10, border: "1px solid #fde68a" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>👀</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#92400e" }}>Watch these — almost breaking even</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#b45309" }}>{watch.map(a => a.name).join(" · ")}</p>
                        </div>
                      </div>
                    )}
                    {pause.length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", background: "#fff1f2", borderRadius: 10, border: "1px solid #fecdd3" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>⏸️</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#9f1239" }}>Consider pausing — spending money, zero sales</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#be123c" }}>{pause.map(a => a.name).join(" · ")}</p>
                        </div>
                      </div>
                    )}
                    {notTracked.length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>Awareness/lead ads — not tracked for sales</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>These ads are building reach or collecting leads, not driving purchases. Judge them by reach and CTR instead. {notTracked.map(a => a.name).join(" · ")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            </BlockStack>
          </div>
        </div>

        {data.lastSyncedAt && (
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            Last synced: {new Date(data.lastSyncedAt).toLocaleString()}
          </Text>
        )}
      </BlockStack>
    </Page>
  );
}
