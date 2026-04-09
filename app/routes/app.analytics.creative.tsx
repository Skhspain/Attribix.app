// app/routes/app.analytics.creative.tsx
// Creative analytics — ad-level performance from Meta + Google ad data.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Select, Grid, Button, Icon,
} from "@shopify/polaris";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 86400_000);
  const anyDb = db as any;

  const [metaAds, metaCampaigns, adSpend, metaConn, googleConn] = await Promise.all([
    anyDb.metaAdDailyInsight?.findMany?.({
      where: { shop, date: { gte: since } },
      select: {
        adId: true, adName: true, adSetName: true, campaignName: true,
        spend: true, impressions: true, clicks: true, ctr: true, cpc: true,
        purchases: true, purchaseValue: true, date: true,
      },
      orderBy: { date: "desc" },
    }).catch(() => []) ?? [],

    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: since } },
      select: {
        campaignId: true, campaignName: true,
        spend: true, impressions: true, clicks: true,
        purchases: true, purchaseValue: true, date: true,
      },
      orderBy: { date: "desc" },
    }).catch(() => []) ?? [],

    anyDb.adSpendDaily?.findMany?.({
      where: { shop, date: { gte: since } },
      select: { platform: true, spend: true, date: true, campaign: true, ad: true },
    }).catch(() => []) ?? [],

    db.metaConnection.findUnique({ where: { shop }, select: { adAccountId: true, lastSyncedAt: true } }).catch(() => null),
    anyDb.googleConnection?.findUnique?.({ where: { shop }, select: { adCustomerId: true } }).catch(() => null),
  ]);

  // ── Aggregate meta ads by adId ──
  type AdRow = {
    adId: string; adName: string; adSetName: string; campaignName: string;
    spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number;
    platform: "meta";
  };

  const adMap: Record<string, AdRow> = {};
  for (const r of metaAds as any[]) {
    if (!adMap[r.adId]) {
      adMap[r.adId] = {
        adId: r.adId, adName: r.adName || r.adId, adSetName: r.adSetName || "",
        campaignName: r.campaignName || "", spend: 0, impressions: 0, clicks: 0,
        purchases: 0, purchaseValue: 0, platform: "meta",
      };
    }
    adMap[r.adId].spend += r.spend ?? 0;
    adMap[r.adId].impressions += r.impressions ?? 0;
    adMap[r.adId].clicks += r.clicks ?? 0;
    adMap[r.adId].purchases += r.purchases ?? 0;
    adMap[r.adId].purchaseValue += r.purchaseValue ?? 0;
  }

  const adRows = Object.values(adMap).sort((a, b) => b.spend - a.spend);

  // ── Aggregate campaigns ──
  type CampaignRow = {
    campaignId: string; campaignName: string; platform: string;
    spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number;
    ctr: number; roas: number; cpc: number; cpa: number;
  };

  const campMap: Record<string, CampaignRow> = {};
  for (const r of metaCampaigns as any[]) {
    const key = `meta_${r.campaignId}`;
    if (!campMap[key]) {
      campMap[key] = {
        campaignId: r.campaignId, campaignName: r.campaignName || r.campaignId,
        platform: "Meta Ads", spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0,
        ctr: 0, roas: 0, cpc: 0, cpa: 0,
      };
    }
    campMap[key].spend += r.spend ?? 0;
    campMap[key].impressions += r.impressions ?? 0;
    campMap[key].clicks += r.clicks ?? 0;
    campMap[key].purchases += r.purchases ?? 0;
    campMap[key].purchaseValue += r.purchaseValue ?? 0;
  }

  // Add Google spend as campaign rows (using adSpend platform=google)
  const googleSpend = (adSpend as any[]).filter(s => s.platform?.toLowerCase().includes("google"));
  const googleCampMap: Record<string, any> = {};
  for (const r of googleSpend) {
    const key = r.campaign || "Google Ads";
    if (!googleCampMap[key]) googleCampMap[key] = { name: key, spend: 0 };
    googleCampMap[key].spend += r.spend ?? 0;
  }
  for (const [key, val] of Object.entries(googleCampMap)) {
    campMap[`google_${key}`] = {
      campaignId: key, campaignName: val.name, platform: "Google Ads",
      spend: val.spend, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0,
      ctr: 0, roas: 0, cpc: 0, cpa: 0,
    };
  }

  // Compute derived metrics for campaigns
  for (const c of Object.values(campMap)) {
    c.ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
    c.roas = c.spend > 0 ? c.purchaseValue / c.spend : 0;
    c.cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
    c.cpa = c.purchases > 0 ? c.spend / c.purchases : 0;
  }

  const campaignRows = Object.values(campMap).sort((a, b) => b.spend - a.spend);

  // ── Top-level KPIs ──
  const totalSpend = adRows.reduce((s, r) => s + r.spend, 0) || (adSpend as any[]).reduce((s: number, r: any) => s + (r.spend ?? 0), 0);
  const totalRevFromAds = adRows.reduce((s, r) => s + r.purchaseValue, 0);
  const totalImpressions = adRows.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = adRows.reduce((s, r) => s + r.clicks, 0);
  const totalPurchases = adRows.reduce((s, r) => s + r.purchases, 0);

  // ── Daily spend trend (meta + google combined) ──
  const dailyMap: Record<string, { meta: number; google: number }> = {};
  for (const r of metaCampaigns as any[]) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    if (!dailyMap[d]) dailyMap[d] = { meta: 0, google: 0 };
    dailyMap[d].meta += r.spend ?? 0;
  }
  for (const r of googleSpend) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    if (!dailyMap[d]) dailyMap[d] = { meta: 0, google: 0 };
    dailyMap[d].google += r.spend ?? 0;
  }
  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, meta: v.meta, google: v.google, total: v.meta + v.google }));

  const metaConnected = !!(metaConn?.adAccountId);
  const googleConnected = !!(googleConn?.adCustomerId);
  const lastSync = metaConn?.lastSyncedAt ?? null;

  return json({
    adRows: adRows.slice(0, 50),
    campaignRows: campaignRows.slice(0, 30),
    dailyTrend,
    totalSpend, totalRevFromAds, totalImpressions, totalClicks, totalPurchases,
    metaConnected, googleConnected, lastSync, days,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function pct(n: number) { return n.toFixed(2) + "%"; }
function roasFmt(r: number) { return Math.round(r * 100) + "%"; }
function roasColor(r: number) {
  if (r >= 4) return "#10b981";
  if (r >= 2) return "#f59e0b";
  if (r >= 1) return "#fb923c";
  return "#ef4444";
}
function roasBg(r: number) {
  if (r >= 4) return "#ecfdf5";
  if (r >= 2) return "#fffbeb";
  if (r >= 1) return "#fff7ed";
  return "#fef2f2";
}

const PLATFORM_COLORS: Record<string, string> = {
  "Meta Ads": "#1877f2",
  "Google Ads": "#ea4335",
};

// ─── Sparkline bar ────────────────────────────────────────────────────────────

function SpendBar({ value, max, color = "#6366f1" }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: "#f3f4f6", borderRadius: 99, marginTop: 4 }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 0.3s ease" }} />
    </div>
  );
}

// ─── Platform badge ───────────────────────────────────────────────────────────

function PlatformDot({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] ?? "#9ca3af";
  const label = platform === "Meta Ads" ? "Meta" : platform === "Google Ads" ? "Google" : platform;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

// ─── Daily spend trend chart ──────────────────────────────────────────────────

function SpendTrend({ data }: { data: Array<{ date: string; meta: number; google: number; total: number }> }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.total), 1);
  const W = 600, H = 80;
  const n = data.length;
  if (n < 2) return null;

  const pts = data.map((d, i) => {
    const x = (i / (n - 1)) * W;
    const y = H - (d.total / max) * H * 0.85;
    return { x, y, ...d };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spendGrad)" />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{data[0]?.date}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreativeAnalyticsPage() {
  const {
    adRows, campaignRows, dailyTrend,
    totalSpend, totalRevFromAds, totalImpressions, totalClicks, totalPurchases,
    metaConnected, googleConnected, lastSync, days,
  } = useLoaderData<typeof loader>();

  const [windowDays, setWindowDays] = useState(String(days));
  const [tab, setTab] = useState<"campaigns" | "ads">("campaigns");

  const overallRoas = totalSpend > 0 ? totalRevFromAds / totalSpend : 0;
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const overallCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const currency = "USD";

  const maxCampSpend = Math.max(...campaignRows.map(c => c.spend), 1);
  const maxAdSpend = Math.max(...adRows.map(a => a.spend), 1);

  const handleWindowChange = (val: string) => {
    setWindowDays(val);
    const u = new URL(window.location.href);
    u.searchParams.set("days", val);
    window.location.href = u.toString();
  };

  return (
    <Page
      title="Creative Analytics"
      subtitle="Ad and campaign performance across platforms"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      primaryAction={{ content: "Export CSV", onAction: () => {} }}
    >
      <BlockStack gap="500">

        {/* Connection status */}
        {(!metaConnected && !googleConnected) && (
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="caution">
                No ad platforms connected. Connect Meta Ads or Google Ads in the Analytics settings to see creative performance data.
              </Text>
              <InlineStack gap="200">
                <Button url="/app/analytics/meta-connect" variant="primary">Connect Meta Ads</Button>
                <Button url="/app/analytics/google-connect">Connect Google Ads</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Time window + sync info */}
        <Card>
          <InlineStack gap="400" align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
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
              <InlineStack gap="200" blockAlign="center">
                {metaConnected && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#1877f2", fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1877f2", display: "inline-block" }} />
                    Meta connected
                  </span>
                )}
                {googleConnected && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#ea4335", fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ea4335", display: "inline-block" }} />
                    Google connected
                  </span>
                )}
              </InlineStack>
            </InlineStack>
            {lastSync && (
              <Text as="p" variant="bodySm" tone="subdued">
                Last sync: {new Date(lastSync).toLocaleString()}
              </Text>
            )}
          </InlineStack>
        </Card>

        {/* KPI cards */}
        <Grid>
          {[
            { label: "Total ad spend", value: fmt(totalSpend, currency) },
            { label: "Revenue from ads", value: fmt(totalRevFromAds, currency) },
            {
              label: "Overall ROAS",
              value: overallRoas > 0 ? roasFmt(overallRoas) : "—",
              color: overallRoas > 0 ? roasColor(overallRoas) : undefined,
              bg: overallRoas > 0 ? roasBg(overallRoas) : undefined,
            },
            { label: "Overall CTR", value: overallCtr > 0 ? pct(overallCtr) : "—" },
            { label: "Impressions", value: fmtK(totalImpressions) },
            { label: "Purchases", value: totalPurchases > 0 ? String(totalPurchases) : "—" },
            { label: "Cost per purchase", value: overallCpa > 0 ? fmt(overallCpa, currency) : "—" },
            { label: "Clicks", value: fmtK(totalClicks) },
          ].map(kpi => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <div style={{ background: kpi.bg, borderRadius: 8, padding: kpi.bg ? "8px 0" : 0 }}>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                    <Text as="p" variant="heading2xl" tone={undefined}>
                      <span style={kpi.color ? { color: kpi.color } : {}}>{kpi.value}</span>
                    </Text>
                  </BlockStack>
                </div>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Spend trend */}
        {dailyTrend.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Daily ad spend</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Total: {fmt(totalSpend, currency)}
                </Text>
              </InlineStack>
              <SpendTrend data={dailyTrend} />
            </BlockStack>
          </Card>
        )}

        {/* Campaign / Ad tabs */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="0">
              {(["campaigns", "ads"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "8px 20px",
                    border: "none",
                    borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
                    background: "none",
                    cursor: "pointer",
                    fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? "#6366f1" : "#6b7280",
                    fontSize: 14,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {t === "campaigns" ? `Campaigns (${campaignRows.length})` : `Ads (${adRows.length})`}
                </button>
              ))}
            </InlineStack>

            {/* Campaign table */}
            {tab === "campaigns" && (
              campaignRows.length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  No campaign data for this period. Make sure your Meta or Google Ads account is connected and synced.
                </Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                        {["Campaign", "Platform", "Spend", "Rev", "ROAS", "Impressions", "Clicks", "CTR", "CPA"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRows.map((row, i) => (
                        <tr key={row.campaignId} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "10px 12px", maxWidth: 200 }}>
                            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.campaignName}</div>
                            <SpendBar value={row.spend} max={maxCampSpend} color={PLATFORM_COLORS[row.platform] ?? "#6366f1"} />
                          </td>
                          <td style={{ padding: "10px 12px" }}><PlatformDot platform={row.platform} /></td>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{fmt(row.spend, currency)}</td>
                          <td style={{ padding: "10px 12px" }}>{row.purchaseValue > 0 ? fmt(row.purchaseValue, currency) : "—"}</td>
                          <td style={{ padding: "10px 12px" }}>
                            {row.roas > 0 ? (
                              <span style={{ background: roasBg(row.roas), color: roasColor(row.roas), fontWeight: 700, padding: "2px 8px", borderRadius: 99, fontSize: 12 }}>
                                {roasFmt(row.roas)}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{row.impressions > 0 ? fmtK(row.impressions) : "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{row.clicks > 0 ? fmtK(row.clicks) : "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{row.ctr > 0 ? pct(row.ctr) : "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{row.cpa > 0 ? fmt(row.cpa, currency) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Ad-level table */}
            {tab === "ads" && (
              adRows.length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  No ad-level data yet. Ad-level syncing requires Meta Ads to be connected at the ad level.
                </Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                        {["Ad", "Ad set", "Campaign", "Spend", "Rev", "ROAS", "Impressions", "CTR", "CPC"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adRows.map((row, i) => {
                        const roas = row.spend > 0 ? row.purchaseValue / row.spend : 0;
                        const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                        const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
                        return (
                          <tr key={row.adId} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "10px 12px", maxWidth: 180 }}>
                              {/* Creative thumbnail placeholder */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{
                                  width: 36, height: 36, borderRadius: 6, background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                }}>
                                  <span style={{ fontSize: 14 }}>📸</span>
                                </div>
                                <div style={{ overflow: "hidden" }}>
                                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }} title={row.adName}>
                                    {row.adName}
                                  </div>
                                  <SpendBar value={row.spend} max={maxAdSpend} color="#1877f2" />
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.adSetName}</td>
                            <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.campaignName}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{fmt(row.spend, currency)}</td>
                            <td style={{ padding: "10px 12px" }}>{row.purchaseValue > 0 ? fmt(row.purchaseValue, currency) : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              {roas > 0 ? (
                                <span style={{ background: roasBg(roas), color: roasColor(roas), fontWeight: 700, padding: "2px 8px", borderRadius: 99, fontSize: 12 }}>
                                  {roasFmt(roas)}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>{row.impressions > 0 ? fmtK(row.impressions) : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>{ctr > 0 ? pct(ctr) : "—"}</td>
                            <td style={{ padding: "10px 12px" }}>{cpc > 0 ? fmt(cpc, currency) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </BlockStack>
        </Card>

        {/* ROAS legend */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">ROAS guide</Text>
            <InlineStack gap="400" wrap>
              {[
                { label: "Excellent (400%+)", color: "#10b981", bg: "#ecfdf5" },
                { label: "Good (200–400%)", color: "#f59e0b", bg: "#fffbeb" },
                { label: "Breakeven (100–200%)", color: "#fb923c", bg: "#fff7ed" },
                { label: "Loss (<100%)", color: "#ef4444", bg: "#fef2f2" },
              ].map(r => (
                <span key={r.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ background: r.bg, color: r.color, fontWeight: 700, padding: "2px 10px", borderRadius: 99 }}>{r.label}</span>
                </span>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
