// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  Grid,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);
  since7.setHours(0, 0, 0, 0);

  const since14 = new Date();
  since14.setDate(since14.getDate() - 14);
  since14.setHours(0, 0, 0, 0);

  const [
    settings,
    metaConn,
    googleConn,
    purchases30,
    adSpend30,
    metaCampaigns30,
    metaAds30,
    trackedEvents30,
    recentPurchases,
    purchases14,
    adSpendPrev7,
  ] = await Promise.all([
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),

    // All purchases last 30d with full attribution info
    db.purchase.findMany({
      where: { shop, createdAt: { gte: since30 } },
      select: {
        id: true, orderId: true, totalValue: true, currency: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        fbclid: true, gclid: true, ttclid: true, msclkid: true,
        createdAt: true,
      },
    }).catch(() => []),

    // Ad spend per platform
    db.adSpendDaily.findMany({
      where: { shop, date: { gte: since30 } },
      select: { platform: true, spend: true, date: true },
    }).catch(() => []),

    // Meta campaign insights
    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: since30 } },
      select: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
    }).catch(() => []) ?? [],

    // Meta ad-level insights
    anyDb.metaAdDailyInsight?.findMany?.({
      where: { shop, date: { gte: since30 } },
      select: { adId: true, adName: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
    }).catch(() => []) ?? [],

    // Tracked events for CVR
    anyDb.trackedEvent?.findMany?.({
      where: { shop, createdAt: { gte: since30 } },
      select: { visitorId: true, utmSource: true, fbclid: true, gclid: true, ttclid: true, msclkid: true },
    }).catch(() => []) ?? [],

    // Recent orders for table
    db.purchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { orderId: true, totalValue: true, currency: true, utmSource: true, utmCampaign: true, createdAt: true },
    }).catch(() => []),

    // Purchases from 14→7 days ago (previous week, for WoW comparison)
    db.purchase.findMany({
      where: { shop, createdAt: { gte: since14, lt: since7 } },
      select: { id: true, totalValue: true, utmSource: true, fbclid: true, gclid: true, ttclid: true, msclkid: true },
    }).catch(() => []),

    // Ad spend previous week (14→7 days ago)
    db.adSpendDaily.findMany({
      where: { shop, date: { gte: since14, lt: since7 } },
      select: { platform: true, spend: true, date: true },
    }).catch(() => []),
  ]);

  // Aggregate
  const rev30 = purchases30.reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders30 = purchases30.length;
  const rev7 = purchases30.filter(p => new Date(p.createdAt) >= since7).reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders7 = purchases30.filter(p => new Date(p.createdAt) >= since7).length;

  const totalSpend = adSpend30.reduce((s, r) => s + Number(r.spend || 0), 0);
  const metaSpend = adSpend30.filter(r => String(r.platform).toLowerCase().includes("meta")).reduce((s, r) => s + Number(r.spend || 0), 0);
  const googleSpend = adSpend30.filter(r => String(r.platform).toLowerCase().includes("google")).reduce((s, r) => s + Number(r.spend || 0), 0);

  const metaKpis = metaCampaigns30.reduce((acc, r) => ({
    spend: acc.spend + Number(r.spend || 0),
    impressions: acc.impressions + Number(r.impressions || 0),
    clicks: acc.clicks + Number(r.clicks || 0),
    purchases: acc.purchases + Number(r.purchases || 0),
    value: acc.value + Number(r.purchaseValue || 0),
  }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });

  // Best ad by ROAS
  const adMap = new Map();
  for (const r of metaAds30) {
    const id = String(r.adId);
    const cur = adMap.get(id) || { name: r.adName || id, spend: 0, value: 0, clicks: 0, impressions: 0, purchases: 0 };
    cur.spend += Number(r.spend || 0);
    cur.value += Number(r.purchaseValue || 0);
    cur.clicks += Number(r.clicks || 0);
    cur.impressions += Number(r.impressions || 0);
    cur.purchases += Number(r.purchases || 0);
    adMap.set(id, cur);
  }
  const adList = Array.from(adMap.values()).filter(a => a.spend > 0);
  const bestAd = adList.length ? adList.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0] : null;

  // Source breakdown
  function normalizeSource(p) {
    const s = String(p.utmSource || "").toLowerCase();
    if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "meta";
    if (s.includes("google") || s.includes("adwords")) return "google";
    if (s.includes("tiktok")) return "tiktok";
    if (s.includes("email") || s.includes("klaviyo") || s.includes("mailchimp")) return "email";
    if (s) return s;
    if (p.fbclid) return "meta";
    if (p.gclid) return "google";
    if (p.ttclid) return "tiktok";
    if (p.msclkid) return "microsoft";
    return "unknown";
  }

  const sourceMap = new Map();
  for (const p of purchases30) {
    const src = normalizeSource(p);
    const cur = sourceMap.get(src) || { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += Number(p.totalValue || 0);
    sourceMap.set(src, cur);
  }

  // Pixel health
  const pixelLastSeen = settings?.pixelLastSeenAt ? new Date(settings.pixelLastSeenAt) : null;
  const hoursSincePixel = pixelLastSeen ? (Date.now() - pixelLastSeen.getTime()) / 3600000 : null;
  const pixelStatus = hoursSincePixel === null ? "never" : hoursSincePixel < 24 ? "healthy" : hoursSincePixel < 168 ? "warning" : "error";

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && metaConn.adAccountId);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);

  // Unique visitors per source for CVR
  const visitorMap = new Map();
  for (const e of trackedEvents30) {
    const src = normalizeSource(e);
    if (!visitorMap.has(src)) visitorMap.set(src, new Set());
    if (e.visitorId) visitorMap.get(src).add(String(e.visitorId));
  }

  const sourceSummary = Array.from(sourceMap.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([src, r]) => ({
      source: src,
      orders: r.orders,
      revenue: r.revenue,
      share: rev30 > 0 ? Math.round((r.revenue / rev30) * 100) : 0,
      visitors: visitorMap.get(src)?.size ?? 0,
    }));

  const adSpend7Total = adSpend30
    .filter(r => r.date && new Date(r.date) >= since7)
    .reduce((s, r) => s + Number(r.spend || 0), 0);
  const metaBudget = metaConn?.monthlyBudget ?? 0;
  const googleBudget = googleConn?.monthlyBudget ?? 0;

  // Current week ad-attributed orders
  const adOrders7Current = purchases30.filter(p => {
    if (new Date(p.createdAt) < since7) return false;
    const s = String(p.utmSource || "").toLowerCase();
    return s.includes("meta") || s.includes("facebook") || s.includes("google") || s.includes("tiktok") || p.fbclid || p.gclid || p.ttclid;
  }).length;

  // Previous week aggregates
  const ordersP7 = purchases14.length;
  const adOrdersP7 = purchases14.filter(p => {
    const s = String(p.utmSource || "").toLowerCase();
    return s.includes("meta") || s.includes("facebook") || s.includes("google") || s.includes("tiktok") || p.fbclid || p.gclid || p.ttclid;
  }).length;
  const adSpendP7 = adSpendPrev7.reduce((s, r) => s + Number(r.spend || 0), 0);

  function wowPct(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  const wowOrders = wowPct(orders7, ordersP7);
  const wowAdOrders = wowPct(adOrders7Current, adOrdersP7);
  const wowAdSpend = wowPct(adSpend7Total, adSpendP7);

  // 7-day source summary
  const sourceMap7 = new Map();
  for (const p of purchases30.filter(p => new Date(p.createdAt) >= since7)) {
    const src = normalizeSource(p);
    const cur = sourceMap7.get(src) || { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += Number(p.totalValue || 0);
    sourceMap7.set(src, cur);
  }
  const rev7Total = purchases30.filter(p => new Date(p.createdAt) >= since7).reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const sourceSummary7 = Array.from(sourceMap7.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([src, r]) => ({
      source: src,
      orders: r.orders,
      revenue: r.revenue,
      share: rev7Total > 0 ? Math.round((r.revenue / rev7Total) * 100) : 0,
    }));

  return json({
    shop,
    rev30, rev7, orders30, orders7,
    totalSpend, metaSpend, googleSpend,
    metaKpis,
    bestAd,
    sourceSummary,
    sourceSummary7,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected,
    googleConnected,
    recentPurchases,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: settings?.attributionWindowDays ?? 7,
    adSpend7Total,
    metaBudget: metaBudget || 0,
    googleBudget: googleBudget || 0,
    adOrders7: adOrders7Current,
    wowOrders, wowAdOrders, wowAdSpend,
    ordersP7, adOrdersP7, adSpendP7,
  });
}

function fmt(value, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "NOK", maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(0)}`;
  }
}

function fmtDec(value, currency = "NOK") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "NOK", maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
  } catch { return "—"; }
}

function sourceTone(s) {
  const src = (s || "").toLowerCase();
  if (src === "meta" || src === "facebook") return "info";
  if (src === "google") return "success";
  if (src === "tiktok") return "attention";
  if (src === "email") return "warning";
  return "new";
}

function InsightRow({ tone, icon, title, body }) {
  const colors = {
    success: { bg: "#f0fdf4", border: "#22c55e" },
    critical: { bg: "#fff1f2", border: "#ef4444" },
    warning:  { bg: "#fffbeb", border: "#f59e0b" },
    info:     { bg: "#f0f9ff", border: "#38bdf8" },
  };
  const { bg, border } = colors[tone] || colors.info;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 12px", alignItems: "start",
      background: bg, borderLeft: `3px solid ${border}`, borderRadius: "0 8px 8px 0", padding: "12px 14px",
    }}>
      <div style={{ fontSize: 18, lineHeight: 1.5 }}>{icon}</div>
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{title}</Text>
        <Text as="p" variant="bodySm" tone="subdued">{body}</Text>
      </BlockStack>
    </div>
  );
}

export default function AppIndex() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const currency = "NOK";
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);



  // ── MAIN DASHBOARD ──────────────────────────────────────────────────────────
  const roas = data.totalSpend > 0 ? data.rev30 / data.totalSpend : null;
  const metaRoas = data.metaKpis.spend > 0 ? data.metaKpis.value / data.metaKpis.spend : null;
  const aov = data.orders30 > 0 ? data.rev30 / data.orders30 : 0;
  const orders7 = data.orders7;
  const { wowOrders, wowAdOrders, wowAdSpend, adOrders7 } = data;
  const totalBudget = (data.metaBudget || 0) + (data.googleBudget || 0);

  return (
    <Page
      title="Attribix Dashboard"
      subtitle={data.shop}
      primaryAction={{ content: "View full analytics", onAction: () => navigate("/app/analytics") }}
    >
      <BlockStack gap="500">

        {/* ── PARTIAL SETUP BANNER ── */}
        {(!data.metaConnected || !data.googleConnected) && (
          <div style={{
            background: "#fffbeb", border: "1px solid #f59e0b",
            borderRadius: 10, padding: "12px 18px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <InlineStack gap="200" blockAlign="center">
              <span style={{ fontSize: 18 }}>⚡</span>
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {!data.metaConnected && !data.googleConnected
                  ? "Connect Meta and Google Ads to unlock full attribution"
                  : !data.metaConnected
                  ? "Connect Meta Ads for full channel coverage"
                  : "Connect Google Ads for full channel coverage"}
              </Text>
            </InlineStack>
            <Button size="slim" onClick={() => navigate("/app/ads")}>Connect now →</Button>
          </div>
        )}

        {/* ── SECTION HEADER ── */}
        <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 12 }}>
          <Text as="h2" variant="headingMd">Weekly performance</Text>
          <Text as="p" variant="bodySm" tone="subdued">Last 7 days</Text>
        </div>

        {/* ── WEEKLY KPI CARDS ── */}
        <Grid>
          {[
            {
              label: "Orders",
              value: String(orders7),
              sub: `${data.orders30} last 30 days`,
              icon: "🛒",
              wow: data.wowOrders,
            },
            {
              label: "Orders from ads",
              value: String(adOrders7),
              sub: adOrders7 > 0
                ? `${Math.round((adOrders7 / Math.max(orders7, 1)) * 100)}% of total`
                : "No ad-attributed orders",
              icon: "📢",
              wow: data.wowAdOrders,
            },
            {
              label: "Ad spend (7d)",
              value: data.adSpend7Total > 0 ? fmt(data.adSpend7Total, currency) : "—",
              sub: data.totalSpend > 0 ? `${fmt(data.totalSpend, currency)} last 30d` : "No spend tracked",
              icon: "💸",
              wow: data.wowAdSpend,
            },
            {
              label: "Total budget",
              value: totalBudget > 0 ? fmt(totalBudget, currency) : "—",
              sub: totalBudget > 0
                ? `Meta ${fmt(data.metaBudget || 0, currency)} · Google ${fmt(data.googleBudget || 0, currency)}`
                : "Set budgets in Integrations",
              icon: "🎯",
              wow: null,
            },
          ].map(kpi => (
            <Grid.Cell key={kpi.label} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <InlineStack gap="150" blockAlign="center">
                    <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                    <Text as="p" variant="bodySm" tone="subdued">{kpi.label}</Text>
                  </InlineStack>
                  <Text as="p" variant="heading2xl">{kpi.value}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{kpi.sub}</Text>
                  {kpi.wow !== null && kpi.wow !== undefined && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: kpi.wow > 0 ? "#15803d" : kpi.wow < 0 ? "#dc2626" : "#6b7280",
                        background: kpi.wow > 0 ? "#f0fdf4" : kpi.wow < 0 ? "#fff1f2" : "#f3f4f6",
                        borderRadius: 6, padding: "2px 8px",
                      }}>
                        {kpi.wow > 0 ? "↑" : kpi.wow < 0 ? "↓" : "→"} {Math.abs(kpi.wow)}% vs last week
                      </span>
                    </div>
                  )}
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* ── REVENUE MIX SECTION HEADER ── */}
        <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginTop: 8 }}>
          <Text as="h2" variant="headingMd">Revenue mix</Text>
          <Text as="p" variant="bodySm" tone="subdued">Where your sales come from — last 7 days</Text>
        </div>

        {/* ── CHANNEL MIX HEALTH ── */}
        <Card>
          <BlockStack gap="400">
            {(() => {
              // Bucket into Ads / Newsletter / Organic, excluding unknown
              let adsRev = 0, emailRev = 0, organicRev = 0, unknownRev = 0;
              for (const s of data.sourceSummary7) {
                if (s.source === "unknown") { unknownRev += s.revenue; continue; }
                if (["meta","google","tiktok","microsoft","snapchat"].includes(s.source)) adsRev += s.revenue;
                else if (["email","newsletter"].includes(s.source) || s.source?.includes("email")) emailRev += s.revenue;
                else organicRev += s.revenue;
              }
              // Base percentages on KNOWN revenue only
              const knownTotal = adsRev + emailRev + organicRev || 1;
              const totalWithUnknown = knownTotal + unknownRev;
              const adsPct = Math.round((adsRev / knownTotal) * 100);
              const emailPct = Math.round((emailRev / knownTotal) * 100);
              const organicPct = Math.round((organicRev / knownTotal) * 100);
              // Unknown % of total (for display warning)
              const unknownPct = Math.round((unknownRev / totalWithUnknown) * 100);

              // Detect stage
              let stageEmoji, stageLabel, stageBg, stageBorder, stageText, stageAdvice;
              if (unknownPct >= 50) {
                stageEmoji = "⚠️"; stageLabel = "High untracked traffic";
                stageBg = "#fffbeb"; stageBorder = "#d97706"; stageText = "#b45309";
                stageAdvice = `${unknownPct}% of revenue has no tracked source. Add UTM parameters to all your ad links to get accurate channel data.`;
              } else if (adsPct >= 70) {
                stageEmoji = "🟢"; stageLabel = "Early stage";
                stageBg = "#f0fdf4"; stageBorder = "#16a34a"; stageText = "#15803d";
                stageAdvice = "You're buying most of your revenue. Focus on building email and organic channels.";
              } else if (adsPct >= 50) {
                stageEmoji = "🟡"; stageLabel = "Growth stage";
                stageBg = "#fffbeb"; stageBorder = "#d97706"; stageText = "#b45309";
                stageAdvice = "Good balance forming. Keep growing email and organic to reduce ad dependency.";
              } else {
                stageEmoji = "🔵"; stageLabel = "Mature brand";
                stageBg = "#eff6ff"; stageBorder = "#2563eb"; stageText = "#1d4ed8";
                stageAdvice = "Excellent channel diversity. This is where real profit comes from.";
              }

              const channels = [
                {
                  key: "ads",
                  label: "Sales from Ads",
                  icon: "📢",
                  pct: adsPct,
                  value: adsRev,
                  // good zone: 50–80%
                  min: 50, max: 80,
                  barColor: "#6366f1",
                  targetLabel: "Target: 50–80%",
                },
                {
                  key: "newsletter",
                  label: "Newsletter",
                  icon: "📧",
                  pct: emailPct,
                  value: emailRev,
                  // good zone: 15–30%
                  min: 15, max: 30,
                  barColor: "#f59e0b",
                  targetLabel: "Target: 15–30%",
                },
                {
                  key: "organic",
                  label: "Organic / Direct",
                  icon: "🌱",
                  pct: organicPct,
                  value: organicRev,
                  // good zone: 10%+
                  min: 10, max: 100,
                  barColor: "#10b981",
                  targetLabel: "Target: min 10%",
                },
                ...(unknownPct > 10 ? [{
                  key: "unknown",
                  label: "Untracked",
                  icon: "❓",
                  pct: unknownPct,
                  value: unknownRev,
                  min: 0, max: 20,
                  barColor: "#9ca3af",
                  targetLabel: "Add UTM tags to reduce this",
                  isUntracked: true,
                }] : []),
              ];

              return (
                <BlockStack gap="400">
                  {/* Stage badge */}
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Website status</Text>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      background: stageBg, color: stageText,
                      border: `1.5px solid ${stageBorder}`,
                      borderRadius: 20, padding: "4px 14px",
                    }}>
                      {stageEmoji} {stageLabel}
                    </span>
                  </InlineStack>

                  {/* Section subtitle */}
                  <Text as="p" variant="bodySm" tone="subdued">Where your sales come from — last 7 days</Text>

                  {/* Source mini-cards row */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {data.sourceSummary7.slice(0, 6).map(({ source, orders, revenue, share }) => {
                      const spend = source === "meta" ? data.metaSpend : source === "google" ? data.googleSpend : 0;
                      const srcRoas = spend > 0 ? (revenue / spend).toFixed(2) + "×" : null;
                      return (
                        <div key={source} style={{
                          border: "1px solid #e1e3e5", borderRadius: 12,
                          padding: "14px 18px", minWidth: 140,
                          background: "#fff", flex: "1 1 140px",
                        }}>
                          <BlockStack gap="100">
                            <Text as="p" variant="heading2xl" fontWeight="bold">{share}%</Text>
                            <Badge tone={sourceTone(source)}>{source}</Badge>
                            <Text as="p" variant="bodySm" tone="subdued">{orders} orders · {fmt(revenue, currency)}</Text>
                            {srcRoas && <Text as="p" variant="bodySm" tone="subdued">ROAS {srcRoas}</Text>}
                          </BlockStack>
                        </div>
                      );
                    })}
                  </div>

                  {/* Health bars */}
                  <BlockStack gap="200">
                    {channels.map(ch => {
                      let statusEmoji, statusColor, statusLabel;
                      if (ch.isUntracked) {
                        if (ch.pct > 30) { statusEmoji = "⚠️"; statusColor = "#d97706"; statusLabel = "Too high"; }
                        else if (ch.pct > 10) { statusEmoji = "🟡"; statusColor = "#b45309"; statusLabel = "Moderate"; }
                        else { statusEmoji = "✓"; statusColor = "#15803d"; statusLabel = "Good"; }
                      } else {
                        const inZone = ch.pct >= ch.min && ch.pct <= ch.max;
                        const tooLow = ch.pct < ch.min;
                        statusEmoji = inZone ? "✅" : tooLow ? "📈" : "⚠️";
                        statusColor = inZone ? "#15803d" : tooLow ? "#d97706" : "#dc2626";
                        statusLabel = inZone ? "On target" : tooLow ? "Too low" : "Too high";
                      }
                      return (
                        <div key={ch.key} style={{
                          display: "grid",
                          gridTemplateColumns: "160px 1fr 90px",
                          gap: "0 16px", alignItems: "center",
                        }}>
                          <InlineStack gap="150" blockAlign="center">
                            <span style={{ fontSize: 16 }}>{ch.icon}</span>
                            <BlockStack gap="0">
                              <Text as="p" variant="bodySm" fontWeight="semibold">{ch.label}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">{ch.targetLabel}</Text>
                            </BlockStack>
                          </InlineStack>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text as="span" variant="headingMd">{ch.pct}%</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{fmt(ch.value, currency)}</Text>
                            </div>
                            <div style={{ width: "100%", height: 10, background: "#f1f2f3", borderRadius: 99 }}>
                              <div style={{
                                width: `${Math.min(ch.pct, 100)}%`, height: "100%",
                                background: ch.barColor, borderRadius: 99, transition: "width 0.4s",
                              }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                              {statusEmoji} {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </BlockStack>

                  {/* Stage callout */}
                  <div style={{
                    background: stageBg, border: `1px solid ${stageBorder}`,
                    borderRadius: 10, padding: "12px 16px",
                  }}>
                    <InlineStack gap="300" blockAlign="start">
                      <span style={{ fontSize: 20 }}>{stageEmoji}</span>
                      <BlockStack gap="050">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{stageLabel}</Text>
                        <Text as="p" variant="bodySm">{stageAdvice}</Text>
                      </BlockStack>
                    </InlineStack>
                  </div>
                </BlockStack>
              );
            })()}
          </BlockStack>
        </Card>

        {/* ── INTEGRATION STATUS ROW ── */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Pixel</Text>
                  <Badge tone={data.pixelStatus === "healthy" ? "success" : data.pixelStatus === "warning" ? "warning" : "critical"}>
                    {data.pixelStatus === "healthy" ? "Active" : data.pixelStatus === "warning" ? "Inactive >24h" : "Not seen"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.pixelLastSeen ? `Last: ${formatDate(data.pixelLastSeen)}` : "No events recorded"}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/settings")}>Settings</Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Meta Ads</Text>
                  <Badge tone={data.metaConnected ? "success" : "new"}>{data.metaConnected ? "Connected" : "Not connected"}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.metaConnected ? `Spend ${fmt(data.metaSpend, currency)} · ROAS ${metaRoas !== null ? metaRoas.toFixed(2) + "×" : "—"}` : "Connect to sync ad spend and CAPI."}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/ads")}>{data.metaConnected ? "Manage" : "Connect"}</Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Google Ads</Text>
                  <Badge tone={data.googleConnected ? "success" : "new"}>{data.googleConnected ? "Connected" : "Not connected"}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {data.googleConnected ? `Spend ${fmt(data.googleSpend, currency)} syncing.` : "Connect to sync spend and upload conversions."}
                </Text>
                <Button size="slim" onClick={() => navigate("/app/ads")}>{data.googleConnected ? "Manage" : "Connect"}</Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* ── RECENT ORDERS ── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Recent attributed orders</Text>
              <Button size="slim" onClick={() => navigate("/app/orders")}>View all</Button>
            </InlineStack>
            {isClient && (data.recentPurchases || []).length > 0 ? (
              <DataTable
                columnContentTypes={["text","numeric","text","text","text"]}
                headings={["Order","Value","Source","Campaign","Date"]}
                rows={(data.recentPurchases || []).map((p, i) => [
                  <Text key={`id-${i}`} as="span" variant="bodySm">{p.orderId || "—"}</Text>,
                  <Text key={`val-${i}`} as="span" variant="bodySm">{fmt(p.totalValue, p.currency)}</Text>,
                  p.utmSource
                    ? <Badge key={`src-${i}`} tone={sourceTone(p.utmSource)}>{p.utmSource}</Badge>
                    : <Text key={`src-${i}`} as="span" variant="bodySm" tone="subdued">direct</Text>,
                  <Text key={`cmp-${i}`} as="span" variant="bodySm" tone="subdued">{p.utmCampaign || "—"}</Text>,
                  <Text key={`dt-${i}`} as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
                ])}
                increasedTableDensity
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No attributed orders yet. Make sure the pixel is installed and tracking is enabled.
              </Text>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
