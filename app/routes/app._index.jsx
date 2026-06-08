// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useMemo, useEffect } from "react";
import {
  Badge, BlockStack, Button, Card, DataTable,
  Grid, InlineStack, Layout, Page, Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

// ─── LOADER ──────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const since60 = new Date();
  since60.setDate(since60.getDate() - 60);
  since60.setHours(0, 0, 0, 0);

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
    purchasePrevAgg,
    journeyRows,
  ] = await Promise.all([
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),

    db.purchase.findMany({
      where: { shop, createdAt: { gte: since30 } },
      select: {
        id: true, orderId: true, totalValue: true, currency: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        fbclid: true, gclid: true, ttclid: true, msclkid: true,
        createdAt: true,
      },
    }).catch(() => []),

    db.adSpendDaily.findMany({
      where: { shop, date: { gte: since14 } },
      select: { platform: true, spend: true, date: true },
    }).catch(() => []),

    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: since30 } },
      select: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true, date: true },
    }).catch(() => []) ?? [],

    anyDb.metaAdDailyInsight?.findMany?.({
      where: { shop, date: { gte: since30 } },
      select: { adId: true, adName: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
    }).catch(() => []) ?? [],

    anyDb.trackedEvent?.findMany?.({
      where: { shop, createdAt: { gte: since30 } },
      select: { visitorId: true, utmSource: true, fbclid: true, gclid: true, ttclid: true, msclkid: true },
    }).catch(() => []) ?? [],

    db.purchase.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { orderId: true, totalValue: true, currency: true, utmSource: true, utmCampaign: true, createdAt: true },
    }).catch(() => []),

    // Previous 30d aggregate for delta comparison
    db.purchase.aggregate({
      where: { shop, createdAt: { gte: since60, lt: since30 } },
      _sum: { totalValue: true },
      _count: true,
    }).catch(() => ({ _sum: { totalValue: null }, _count: 0 })),

    // Journey touchpoints for the dashboard preview
    anyDb.purchaseTouchpoint?.findMany?.({
      where: { shop, createdAt: { gte: since30 } },
      orderBy: [{ orderId: "asc" }, { position: "asc" }],
      take: 200,
      select: {
        orderId: true, position: true, totalSteps: true,
        channel: true, utmSource: true, utmCampaign: true,
        revenue: true, currency: true,
      },
    }).catch(() => []) ?? [],
  ]);

  const rev30 = purchases30.reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders30 = purchases30.length;
  const rev7 = purchases30.filter(p => new Date(p.createdAt) >= since7).reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders7 = purchases30.filter(p => new Date(p.createdAt) >= since7).length;
  const aov = orders30 > 0 ? rev30 / orders30 : 0;

  // Prev-period deltas
  const revPrev30 = Number(purchasePrevAgg._sum?.totalValue || 0);
  const ordersPrev30 = Number(purchasePrevAgg._count || 0);
  const rev30Delta = revPrev30 > 0 ? Math.round(((rev30 - revPrev30) / revPrev30) * 100) : null;
  const orders30Delta = ordersPrev30 > 0 ? Math.round(((orders30 - ordersPrev30) / ordersPrev30) * 100) : null;

  // Daily arrays for sparklines (from purchases30 — no extra query needed)
  const now = new Date();
  const dailyRevArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return purchases30
      .filter(p => { const t = new Date(p.createdAt); return t >= d && t < next; })
      .reduce((s, p) => s + Number(p.totalValue || 0), 0);
  });
  const dailyOrdersArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return purchases30.filter(p => { const t = new Date(p.createdAt); return t >= d && t < next; }).length;
  });

  let storeCurrency = "NOK";
  try {
    const { admin } = await authenticate.admin(request);
    const shopRes = await admin.graphql(`{ shop { currencyCode } }`);
    const shopData = await shopRes.json();
    storeCurrency = shopData?.data?.shop?.currencyCode || "NOK";
  } catch {}

  let googleCurrencyRate = 1;
  try {
    const { convertCurrency } = await import("~/services/currency.server");
    googleCurrencyRate = await convertCurrency(1, "USD", storeCurrency);
  } catch {}

  const isMeta = (r) => String(r.platform).toLowerCase().includes("meta") || String(r.platform).toLowerCase().includes("facebook");
  const isGoogle = (r) => String(r.platform).toLowerCase().includes("google");
  const isCurrent7 = (r) => new Date(r.date) >= since7;
  const isPrev7 = (r) => new Date(r.date) >= since14 && new Date(r.date) < since7;
  const applyRate = (r) => isGoogle(r) ? Number(r.spend || 0) * googleCurrencyRate : Number(r.spend || 0);

  const totalSpend = adSpend30.filter(isCurrent7).reduce((s, r) => s + applyRate(r), 0);
  const metaSpend = adSpend30.filter(r => isMeta(r) && isCurrent7(r)).reduce((s, r) => s + Number(r.spend || 0), 0);
  const metaSpendPrev = adSpend30.filter(r => isMeta(r) && isPrev7(r)).reduce((s, r) => s + Number(r.spend || 0), 0);
  const googleSpend = adSpend30.filter(r => isGoogle(r) && isCurrent7(r)).reduce((s, r) => s + applyRate(r), 0);
  const googleSpendPrev = adSpend30.filter(r => isGoogle(r) && isPrev7(r)).reduce((s, r) => s + applyRate(r), 0);

  const pctDelta = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
  const metaSpendDelta = pctDelta(metaSpend, metaSpendPrev);
  const googleSpendDelta = pctDelta(googleSpend, googleSpendPrev);

  const metaRev7 = metaCampaigns30
    .filter(r => r.date && new Date(r.date) >= since7)
    .reduce((s, r) => s + Number(r.purchaseValue || 0), 0);

  const isGooglePurchase = (p) => !!p.gclid || (p.utmSource && String(p.utmSource).toLowerCase().includes("google"));
  const googleRev7 = purchases30
    .filter(p => isGooglePurchase(p) && new Date(p.createdAt) >= since7)
    .reduce((s, p) => s + Number(p.totalValue || 0), 0);

  let googleConvValue7 = 0;
  if (googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId) {
    try {
      const { getValidGoogleToken } = await import("~/services/tokenRefresh.server");
      const tokenResult = await getValidGoogleToken(shop);
      if (tokenResult.ok) {
        const { googleAdsSearchStream } = await import("~/services/googleAds.server");
        const fmtD = (d) => d.toISOString().slice(0, 10);
        const q = `SELECT metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${fmtD(since7)}' AND '${fmtD(new Date())}' AND campaign.status != 'REMOVED'`;
        const res = await googleAdsSearchStream({ accessToken: tokenResult.accessToken, customerId: googleConn.adCustomerId, query: q });
        const rows = res.flatMap((c) => c?.results ?? []);
        googleConvValue7 = rows.reduce((s, r) => s + Number(r?.metrics?.conversionsValue || 0), 0) * googleCurrencyRate;
      }
    } catch {}
  }
  const googleSales7 = Math.max(googleRev7, googleConvValue7);

  const metaKpis = metaCampaigns30.reduce((acc, r) => ({
    spend: acc.spend + Number(r.spend || 0),
    impressions: acc.impressions + Number(r.impressions || 0),
    clicks: acc.clicks + Number(r.clicks || 0),
    purchases: acc.purchases + Number(r.purchases || 0),
    value: acc.value + Number(r.purchaseValue || 0),
  }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });

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

  function normalizeSource(p) {
    const s = String(p.utmSource || "").toLowerCase();
    if (s === "ig" || s === "instagram") return "instagram";
    if (s.includes("meta") || s.includes("facebook")) return "meta";
    if (s.includes("google") || s.includes("adwords")) return "google";
    if (s.includes("tiktok")) return "tiktok";
    if (s.includes("snapchat")) return "snapchat";
    if (s.includes("email") || s.includes("klaviyo") || s.includes("mailchimp")) return "email";
    if (s.includes("bing") || s.includes("microsoft")) return "bing";
    if (s.includes("yahoo")) return "yahoo";
    if (s) return s;
    if (p.fbclid) return "meta";
    if (p.gclid) return "google";
    if (p.ttclid) return "tiktok";
    if (p.msclkid) return "bing";
    return "direct";
  }

  const sourceMap = new Map();
  for (const p of purchases30) {
    const src = normalizeSource(p);
    const cur = sourceMap.get(src) || { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += Number(p.totalValue || 0);
    sourceMap.set(src, cur);
  }

  const pixelLastSeen = settings?.pixelLastSeenAt ? new Date(settings.pixelLastSeenAt) : null;
  const hoursSincePixel = pixelLastSeen ? (Date.now() - pixelLastSeen.getTime()) / 3600000 : null;
  const pixelStatus = hoursSincePixel === null ? "never" : hoursSincePixel < 24 ? "healthy" : hoursSincePixel < 168 ? "warning" : "error";

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && metaConn.adAccountId);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);

  const reqUrl = new URL(request.url);
  if (reqUrl.searchParams.get("skip") === "1") {
    await db.trackingSettings.upsert({
      where: { shop },
      create: { shop, onboardingCompletedAt: new Date() },
      update: { onboardingCompletedAt: new Date() },
    }).catch(() => null);
  }

  const onboardingCompleted = !!(settings?.onboardingCompletedAt);
  const isNewInstall = !onboardingCompleted && !metaConnected && !googleConnected && orders30 === 0 && pixelStatus === "never";

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

  const attributedOrders = purchases30.filter(p => p.utmSource || p.fbclid || p.gclid || p.ttclid || p.msclkid).length;
  const attributionRate = orders30 > 0 ? Math.round((attributedOrders / orders30) * 100) : 0;
  const uniqueVisitors = new Set(trackedEvents30.filter(e => e.visitorId).map(e => String(e.visitorId))).size;
  const metaReportedPurchases = metaKpis.purchases;
  const platformTotal = metaReportedPurchases;
  const attribixTrackedMore = attributedOrders > platformTotal;

  // Build compact journey data for dashboard preview
  const journeyOrderMap = new Map();
  for (const r of journeyRows) {
    if (!journeyOrderMap.has(r.orderId)) journeyOrderMap.set(r.orderId, []);
    journeyOrderMap.get(r.orderId).push(r);
  }
  const journeyPreview = Array.from(journeyOrderMap.entries())
    .map(([orderId, steps]) => ({
      orderId: String(orderId).split("/").pop() || orderId,
      steps: steps.sort((a, b) => a.position - b.position).map(s => ({
        channel: s.channel || null,
        utmSource: s.utmSource || null,
        utmCampaign: s.utmCampaign || null,
      })),
      revenue: steps[steps.length - 1]?.revenue ?? 0,
      currency: steps[0]?.currency ?? "NOK",
      totalSteps: steps[0]?.totalSteps ?? 1,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const reviewsSeenAt = settings?.reviewsSeenAt ?? new Date(0);
  const leadsSeenAt = settings?.leadsSeenAt ?? new Date(0);
  const newsletterSeenAt = settings?.newsletterSeenAt ?? new Date(0);

  const [
    subscriberCount, pendingReviews, avgReviewRating, leadCount, campaignCount,
    newReviewsUnseen, newLeadsUnseen, newSubscribersUnseen, subscribersThisWeek, convertedLeadCount,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }).catch(() => 0),
    db.review.count({ where: { shop, status: "pending" } }).catch(() => 0),
    db.review.aggregate({ where: { shop, status: "approved" }, _avg: { rating: true }, _count: true }).catch(() => ({ _avg: { rating: null }, _count: 0 })),
    db.lead.count({ where: { shop } }).catch(() => 0),
    db.newsletterCampaign.count({ where: { shop, status: "sent" } }).catch(() => 0),
    db.review.count({ where: { shop, status: "pending", createdAt: { gt: reviewsSeenAt } } }).catch(() => 0),
    db.lead.count({ where: { shop, createdAt: { gt: leadsSeenAt } } }).catch(() => 0),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gt: newsletterSeenAt } } }).catch(() => 0),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: since7 } } }).catch(() => 0),
    db.lead.count({ where: { shop, status: "converted" } }).catch(() => 0),
  ]);

  return json({
    shop,
    rev30, rev7, orders30, orders7, aov,
    rev30Delta, orders30Delta,
    dailyRevArr, dailyOrdersArr,
    totalSpend, metaSpend, googleSpend,
    metaSpendPrev, googleSpendPrev,
    metaSpendDelta, googleSpendDelta,
    metaRev7, googleRev7: googleSales7,
    storeCurrency,
    tracking: { attributedOrders, attributionRate, uniqueVisitors, pixelStatus, metaReportedPurchases, platformTotal, attribixTrackedMore },
    metaKpis, bestAd, sourceSummary,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected, googleConnected,
    isNewInstall,
    recentPurchases,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: settings?.attributionWindowDays ?? 7,
    journeyPreview,
    featureHub: {
      subscriberCount, pendingReviews,
      avgRating: avgReviewRating?._avg?.rating ? Number(avgReviewRating._avg.rating).toFixed(1) : null,
      totalReviews: avgReviewRating?._count ?? 0,
      leadCount, campaignCount,
      newReviewsUnseen, newLeadsUnseen, newSubscribersUnseen,
      subscribersThisWeek, convertedLeadCount,
    },
  });
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

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
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function Sparkline({ values = [], color = "#008060", width = 72, height = 28 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 0.001);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * height * 0.85 + 2}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return null;
  const up = delta >= 0;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, lineHeight: 1,
      color: up ? "#16a34a" : "#dc2626",
      background: up ? "#f0fdf4" : "#fef2f2",
      border: `1px solid ${up ? "#bbf7d0" : "#fecaca"}`,
      borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
    }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

const SOURCE_CFG = {
  direct:    { color: "#6B7280", label: "Direct",    icon: "↗" },
  google:    { color: "#4285F4", label: "Google",    icon: "G" },
  meta:      { color: "#0866FF", label: "Meta",      icon: "M" },
  instagram: { color: "#C13584", label: "Instagram", icon: "IG" },
  email:     { color: "#F59E0B", label: "Email",     icon: "✉" },
  tiktok:    { color: "#010101", label: "TikTok",    icon: "T" },
  snapchat:  { color: "#FFFC00", label: "Snapchat",  icon: "S",  textColor: "#000" },
  bing:      { color: "#00A4EF", label: "Bing",      icon: "B" },
  yahoo:     { color: "#6001D2", label: "Yahoo",     icon: "Y" },
  microsoft: { color: "#00A4EF", label: "Bing",      icon: "B" },
};

function SourceBreakdown({ sources, currency, metaSpend, googleSpend }) {
  const nonZero = sources.filter(s => s.revenue > 0);
  if (!nonZero.length) return null;
  const total = nonZero.reduce((s, x) => s + x.revenue, 0);

  return (
    <BlockStack gap="400">
      {/* Stacked colour bar */}
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 1 }}>
        {nonZero.map(s => {
          const cfg = SOURCE_CFG[s.source] || { color: "#9CA3AF" };
          return (
            <div key={s.source} style={{ flex: s.revenue / total, background: cfg.color, minWidth: 2 }} />
          );
        })}
      </div>

      {/* Source columns */}
      <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
        {nonZero.map((s, idx) => {
          const cfg = SOURCE_CFG[s.source] || { color: "#9CA3AF", label: s.source, icon: "?" };
          const spend = s.source === "meta" ? metaSpend : s.source === "google" ? googleSpend : 0;
          const srcRoas = spend > 0 ? (s.revenue / spend).toFixed(1) : null;
          const isLast = idx === nonZero.length - 1;

          return (
            <div key={s.source} style={{
              flex: "1 1 0", minWidth: 80, padding: "0 14px",
              borderRight: isLast ? "none" : "1px solid #f0f0f0",
            }}>
              <BlockStack gap="150">
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: cfg.color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ color: cfg.textColor || "white", fontSize: 13, fontWeight: 700 }}>{cfg.icon}</span>
                </div>
                <Text as="p" variant="bodySm" tone="subdued">{cfg.label}</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">{s.share}%</Text>
                <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${Math.min(s.share, 100)}%`, background: cfg.color, borderRadius: 2 }} />
                </div>
                <Text as="p" variant="bodySm" tone="subdued">{fmt(s.revenue, currency)}</Text>
                {srcRoas && <Text as="p" variant="bodySm" tone="subdued">{srcRoas}× ROAS</Text>}
              </BlockStack>
            </div>
          );
        })}
      </div>
    </BlockStack>
  );
}

function ToolkitGrid({ data, navigate }) {
  const { featureHub, pixelStatus, tracking, orders30 } = data;

  const tools = [
    {
      icon: "✉", bg: "#F59E0B",
      name: "Newsletter", desc: "Grow your list and drive repeat purchases with email",
      metric: `${(featureHub.subscriberCount || 0).toLocaleString()} subscribers`,
      status: featureHub.subscriberCount > 0 ? "Active" : "Get started",
      tone: featureHub.subscriberCount > 0 ? "success" : "new",
      url: "/app/newsletter",
    },
    {
      icon: "🎯", bg: "#8B5CF6",
      name: "Lead Center", desc: "Capture, nurture and convert high-intent leads",
      metric: featureHub.leadCount > 0 ? `${featureHub.leadCount} leads` : "0 new leads",
      status: featureHub.newLeadsUnseen > 0 ? `${featureHub.newLeadsUnseen} new` : featureHub.leadCount > 0 ? "View" : "Get started",
      tone: featureHub.newLeadsUnseen > 0 ? "attention" : "new",
      url: "/app/leads",
    },
    {
      icon: "⭐", bg: "#F59E0B",
      name: "Reviews", desc: "Collect and showcase reviews that build trust",
      metric: featureHub.totalReviews > 0 ? `${featureHub.totalReviews} reviews` : "No reviews yet",
      status: featureHub.pendingReviews > 0 ? `${featureHub.pendingReviews} pending` : featureHub.totalReviews > 0 ? "Active" : "Get started",
      tone: featureHub.pendingReviews > 0 ? "attention" : featureHub.totalReviews > 0 ? "success" : "new",
      url: "/app/reviews",
    },
    {
      icon: "🔍", bg: "#10B981",
      name: "SEO Audit", desc: "Improve rankings and drive more organic traffic",
      metric: "Score your products",
      status: "Run audit",
      tone: "new",
      url: "/app/seo",
    },
    {
      icon: "🔄", bg: "#6B7280",
      name: "Product Feeds", desc: "Keep your product data fresh and accurate",
      metric: "Google & Meta",
      status: "Set up",
      tone: "new",
      url: "/app/feeds",
    },
    {
      icon: "⚡", bg: "#3B82F6",
      name: "Buy Now Button", desc: "Add fast checkout anywhere customers shop",
      metric: "Add to any page",
      status: "Set up",
      tone: "new",
      url: "/app/buy-now",
    },
    {
      icon: "🗺️", bg: "#6366F1",
      name: "Customer Journeys", desc: "See every touchpoint customers visit before buying",
      metric: "Multi-touch attribution",
      status: pixelStatus === "healthy" ? "Active" : "Set up tracking",
      tone: pixelStatus === "healthy" ? "success" : "new",
      url: "/app/journey",
    },
    {
      icon: "📊", bg: "#008060",
      name: "Ads & Attribution", desc: "Track performance and attribute revenue with confidence",
      metric: orders30 > 0 ? `${tracking.attributionRate}% attributed · ${orders30} orders` : "Tracking active",
      status: pixelStatus === "healthy" ? "Tracking active" : "Set up tracking",
      tone: pixelStatus === "healthy" ? "success" : "critical",
      url: "/app/analytics",
    },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      borderTop: "1px solid #f0f0f0",
    }}>
      {tools.map((t, i) => (
        <div
          key={t.name}
          onClick={() => navigate(t.url)}
          style={{
            padding: "16px", cursor: "pointer",
            borderRight: (i + 1) % 4 === 0 ? "none" : "1px solid #f0f0f0",
            borderBottom: i < tools.length - (tools.length % 4 || 4) ? "1px solid #f0f0f0" : "none",
            background: "#fff", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
          onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
        >
          <BlockStack gap="150">
            <InlineStack align="space-between" blockAlign="start">
              <div style={{
                width: 34, height: 34, borderRadius: 8, background: t.bg,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>
                {t.icon}
              </div>
              <span style={{ color: "#9CA3AF", fontSize: 14 }}>→</span>
            </InlineStack>
            <Text as="p" variant="headingSm" fontWeight="semibold">{t.name}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{t.desc}</Text>
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <Text as="p" variant="bodySm" tone="subdued">{t.metric}</Text>
              <Badge tone={t.tone}>{t.status}</Badge>
            </InlineStack>
          </BlockStack>
        </div>
      ))}
    </div>
  );
}

function normalizeJourneyChannel(channel, utmSource) {
  const raw = (utmSource || channel || "").toLowerCase().trim();
  if (!raw || raw.includes("direct") || raw.includes("unknown")) return "direct";
  if (raw === "ig" || raw.includes("instagram")) return "instagram";
  if (raw.includes("meta") || raw.includes("facebook")) return "meta";
  if (raw.includes("google") || raw.includes("adwords")) return "google";
  if (raw.includes("tiktok")) return "tiktok";
  if (raw.includes("snapchat")) return "snapchat";
  if (raw.includes("email") || raw.includes("klaviyo") || raw.includes("mailchimp")) return "email";
  if (raw.includes("bing") || raw.includes("microsoft")) return "bing";
  if (raw.includes("yahoo")) return "yahoo";
  return raw;
}

function ChannelDot({ channel }) {
  const cfg = SOURCE_CFG[channel] || { color: "#9CA3AF", label: channel, icon: "?" };
  return (
    <div title={cfg.label} style={{
      width: 26, height: 26, borderRadius: 6, background: cfg.color, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: cfg.textColor || "white", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
        {cfg.icon}
      </span>
    </div>
  );
}

function JourneyCard({ journeys, navigate, currency }) {
  if (!journeys || journeys.length === 0) return null;

  const fmt = (v) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
    catch { return String(v); }
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="025">
            <Text as="h2" variant="headingMd">Customer journeys</Text>
            <Text as="p" variant="bodySm" tone="subdued">Touchpoints captured before each purchase</Text>
          </BlockStack>
          <Button size="slim" variant="plain" onClick={() => navigate("/app/journey")}>
            View all →
          </Button>
        </InlineStack>

        <BlockStack gap="0">
          {journeys.map((j, i) => (
            <div key={j.orderId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0", gap: 12,
              borderBottom: i < journeys.length - 1 ? "1px solid #f5f5f5" : "none",
            }}>
              {/* Journey flow */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
                {j.steps.map((step, si) => {
                  const ch = normalizeJourneyChannel(step.channel, step.utmSource);
                  return (
                    <div key={si} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ChannelDot channel={ch} />
                      {si < j.steps.length - 1 && (
                        <span style={{ color: "#d1d5db", fontSize: 14 }}>→</span>
                      )}
                    </div>
                  );
                })}
                <span style={{ color: "#d1d5db", fontSize: 14 }}>→</span>
                <div style={{
                  width: 26, height: 26, borderRadius: 6, background: "#008060",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                }}>🛒</div>
              </div>

              {/* Meta */}
              <InlineStack gap="300" blockAlign="center">
                {j.totalSteps > 1 && (
                  <Badge tone="info">{j.totalSteps} steps</Badge>
                )}
                <Text as="p" variant="bodySm" fontWeight="semibold">{fmt(j.revenue)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">#{j.orderId}</Text>
              </InlineStack>
            </div>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
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

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AppIndex() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const currency = data.storeCurrency || "NOK";
  const pixelEnsureFetcher = useFetcher();

  useEffect(() => {
    pixelEnsureFetcher.submit(
      { accountID: "1" },
      { method: "post", action: "/api/web-pixel/ensure" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  if (data.isNewInstall) {
    const steps = [
      { icon: "📘", title: "Connect Meta Ads", body: "Sync ad spend, enable server-side Conversions API, and see ROAS.", url: "/app/integrations/meta?from=onboarding", cta: "Connect Meta", done: data.metaConnected },
      { icon: "📈", title: "Connect Google Ads", body: "Sync Google campaign spend and upload offline conversions.", url: "/app/integrations/google?from=onboarding", cta: "Connect Google", done: data.googleConnected },
      { icon: "🔌", title: "Install Tracking Pixel", body: "Captures UTM parameters and click IDs so every order is attributed.", url: "/app/settings/tracking", cta: "View pixel settings", done: data.pixelStatus === "healthy" },
    ];
    const completedCount = steps.filter(s => s.done).length;

    return (
      <Page title="Welcome to Attribix" subtitle="Connect your tools to start tracking sales and ad performance.">
        <BlockStack gap="500">
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="150">
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">{completedCount} of {steps.length} steps completed</Text>
                  {completedCount > 0 && <Text as="p" variant="bodySm" tone="subdued">{Math.round((completedCount / steps.length) * 100)}%</Text>}
                </InlineStack>
                <div style={{ background: "#e1e3e5", borderRadius: 999, height: 6 }}>
                  <div style={{ background: "#008060", borderRadius: 999, height: 6, width: `${Math.round((completedCount / steps.length) * 100)}%`, transition: "width 0.4s ease" }} />
                </div>
              </BlockStack>
              <BlockStack gap="300">
                {steps.map((step) => (
                  <div key={step.title} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: "0 16px", alignItems: "center", padding: "16px", background: "#f9fafb", borderRadius: 8, border: step.done ? "1px solid #bbf7d0" : "1px solid #e1e3e5" }}>
                    <div style={{ fontSize: 24, lineHeight: 1 }}>{step.done ? "✅" : step.icon}</div>
                    <BlockStack gap="050">
                      <Text as="p" variant="headingSm" fontWeight="semibold" tone={step.done ? "success" : undefined}>{step.title}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{step.body}</Text>
                    </BlockStack>
                    {!step.done && <Button size="slim" onClick={() => navigate(step.url)}>{step.cta}</Button>}
                  </div>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
          <InlineStack align="end" gap="200">
            <Button variant="plain" tone="subdued" onClick={() => navigate("/app?skip=1")}>Skip setup</Button>
            {completedCount > 0 && <Button variant="primary" onClick={() => navigate("/app?skip=1")}>Go to dashboard →</Button>}
          </InlineStack>
        </BlockStack>
      </Page>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const roas = data.totalSpend > 0 ? data.rev30 / data.totalSpend : null;
  const metaRoas = data.metaKpis.spend > 0 ? data.metaKpis.value / data.metaKpis.spend : null;
  const metaRoas7 = data.metaSpend > 0 ? data.metaRev7 / data.metaSpend : null;
  const googleRoas7 = data.googleSpend > 0 ? data.googleRev7 / data.googleSpend : null;
  const aov = data.aov || 0;

  const trackingOk = data.pixelStatus === "healthy";
  const allSetUp = trackingOk && data.metaConnected && data.googleConnected;

  // Contextual "recommended next step" banner
  const nextStep = !trackingOk
    ? { icon: "🔌", title: "Set up your tracking pixel", desc: "Capture UTM parameters and click IDs so every order gets attributed.", url: "/app/settings", cta: "View settings" }
    : !data.metaConnected
      ? { icon: "📘", title: "Connect Meta Ads to see ROAS", desc: "Sync ad spend, enable server-side Conversions API, and see true ROAS in one place.", url: "/app/integrations/meta", cta: "Connect Meta" }
      : !data.googleConnected
        ? { icon: "📈", title: "Connect Google Ads to unlock full ROAS", desc: "See ad spend, campaign performance, and true ROAS across all channels.", url: "/app/integrations/google", cta: "Connect Google Ads" }
        : null;

  const insights = useMemo(() => {
    const list = [];
    const { rev30, orders30, metaKpis, bestAd, sourceSummary } = data;

    const attributed = sourceSummary.filter(s => s.source !== "direct").reduce((n, s) => n + s.orders, 0);
    const attrRate = orders30 > 0 ? Math.round((attributed / orders30) * 100) : 0;
    if (attrRate < 50 && orders30 > 0) {
      list.push({ tone: "warning", icon: "⚠️", title: `${100 - attrRate}% of orders have no tracked source`, body: `${orders30 - attributed} of ${orders30} orders show as direct/unknown. Add UTM parameters to your ad URLs to get full attribution.` });
    } else if (attrRate >= 80 && orders30 > 0) {
      list.push({ tone: "success", icon: "✅", title: `${attrRate}% attribution rate — excellent`, body: `Attribix is tracking ${attributed} of ${orders30} orders to a paid source. Your UTM setup is solid.` });
    }

    if (metaKpis.spend > 0) {
      if (metaRoas !== null && metaRoas < 1) {
        list.push({ tone: "critical", icon: "🔴", title: `Meta ROAS ${(metaRoas).toFixed(1)}× — spending more than you earn`, body: `${fmtDec(metaKpis.spend, currency)} spent, ${fmtDec(metaKpis.value, currency)} in reported Meta purchase value. Review your targeting.` });
      } else if (metaRoas !== null && metaRoas >= 3) {
        list.push({ tone: "success", icon: "🚀", title: `Meta ROAS ${(metaRoas).toFixed(1)}× — strong performance`, body: `Solid returns. Consider scaling budget on your best campaigns to maximise this window.` });
      }
    }

    if (metaKpis.impressions > 0 && metaKpis.clicks > 0 && metaKpis.purchases > 0) {
      const ctr = (metaKpis.clicks / metaKpis.impressions) * 100;
      const cvr = (metaKpis.purchases / metaKpis.clicks) * 100;
      const cpl = metaKpis.clicks > 0 ? metaKpis.spend / metaKpis.clicks : 0;
      const rpc = metaKpis.clicks > 0 ? metaKpis.value / metaKpis.clicks : 0;
      if (cvr < 1 && ctr > 1) {
        list.push({ tone: "warning", icon: "📉", title: `Good CTR (${ctr.toFixed(2)}%) but low conversion rate (${cvr.toFixed(2)}%)`, body: `Ads are getting clicks but visitors aren't buying. Landing page or offer may need work. CPC: ${fmtDec(cpl, currency)} · Revenue/click: ${fmtDec(rpc, currency)}.` });
      }
    }

    if (bestAd && bestAd.spend > 0) {
      const adRoas = (bestAd.value / bestAd.spend).toFixed(1);
      list.push({ tone: "success", icon: "🏆", title: `Best ad: "${bestAd.name}" at ${adRoas}× ROAS`, body: `Spend: ${fmtDec(bestAd.spend, currency)} · Value: ${fmtDec(bestAd.value, currency)} · ${bestAd.purchases} purchases. Consider duplicating this creative.` });
    }

    return list;
  }, [data, metaRoas, currency]);

  const purchaseRows = (data.recentPurchases || []).map((p) => [
    <Text key={p.orderId} as="span" variant="bodySm">{p.orderId || "—"}</Text>,
    <Text as="span" variant="bodySm">{fmt(p.totalValue, p.currency)}</Text>,
    p.utmSource
      ? <Badge tone={sourceTone(p.utmSource)}>{p.utmSource}</Badge>
      : <Text as="span" variant="bodySm" tone="subdued">direct</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{p.utmCampaign || "—"}</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
  ]);

  const setupSteps = [
    { label: "Install Attribix", done: true },
    { label: "Connect Meta", done: data.metaConnected, url: "/app/integrations/meta" },
    { label: "Connect Google Ads", done: data.googleConnected, url: "/app/integrations/google" },
    { label: "Pixel active", done: trackingOk, url: "/app/settings" },
    { label: "Enhanced tracking active", done: trackingOk, url: "/app/settings" },
  ];
  const setupDone = setupSteps.filter(s => s.done).length;

  return (
    <Page title="Overview" subtitle={data.shop}>
      <BlockStack gap="400">

        {/* ── Tracking status banner ─────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12, padding: "12px 16px", borderRadius: 12,
          background: trackingOk ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${trackingOk ? "#bbf7d0" : "#fecaca"}`,
        }}>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: trackingOk ? "#16a34a" : "#dc2626",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 18, fontWeight: 800, flexShrink: 0,
            }}>
              {trackingOk ? "✓" : "!"}
            </div>
            <BlockStack gap="025">
              <Text as="p" variant="headingSm" fontWeight="semibold">
                {trackingOk ? "Tracking is active" : "Tracking needs attention"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {trackingOk ? "Attribix is tracking your store and attributing revenue." : "Set up tracking to start attributing revenue."}
              </Text>
            </BlockStack>
            <InlineStack gap="150" wrap={false}>
              <Badge tone={trackingOk ? "success" : "critical"}>{trackingOk ? "Tracking active" : "Pixel not seen"}</Badge>
              <Badge tone={data.metaConnected ? "success" : "new"}>Meta {data.metaConnected ? "connected" : "not connected"}</Badge>
              <Badge tone={data.googleConnected ? "success" : "new"}>Google {data.googleConnected ? "connected" : "not connected"}</Badge>
            </InlineStack>
          </InlineStack>
          {!allSetUp && (
            <Button variant="primary" size="slim" onClick={() => navigate("/app/ads")}>Finish setup</Button>
          )}
        </div>

        {/* ── KPI cards ─────────────────────────────────────────── */}
        <Grid>
          {/* Revenue */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Revenue tracked</Text>
                <InlineStack align="space-between" blockAlign="end" wrap={false}>
                  <Text as="p" variant="heading2xl">{fmt(data.rev30, currency)}</Text>
                  {data.dailyRevArr?.some(v => v > 0) && (
                    <Sparkline values={data.dailyRevArr} color="#008060" />
                  )}
                </InlineStack>
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <DeltaBadge delta={data.rev30Delta} />
                  <Text as="p" variant="bodySm" tone="subdued">vs prev 30d</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* Orders */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Orders tracked</Text>
                <InlineStack align="space-between" blockAlign="end" wrap={false}>
                  <Text as="p" variant="heading2xl">{data.orders30}</Text>
                  {data.dailyOrdersArr?.some(v => v > 0) && (
                    <Sparkline values={data.dailyOrdersArr} color="#3B82F6" />
                  )}
                </InlineStack>
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <DeltaBadge delta={data.orders30Delta} />
                  <Text as="p" variant="bodySm" tone="subdued">vs prev 30d</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* ROAS */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Blended ROAS</Text>
                <Text as="p" variant="heading2xl" tone={roas !== null && roas >= 2 ? "success" : undefined}>
                  {roas !== null ? roas.toFixed(1) + "×" : "—"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {roas !== null ? `${fmt(data.totalSpend, currency)} total spend (7d)` : "Connect an ad account"}
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* Ad Spend */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Ad Spend (7d)</Text>
                <Text as="p" variant="heading2xl">
                  {data.totalSpend > 0 ? fmt(data.totalSpend, currency) : "—"}
                </Text>
                {data.totalSpend > 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">Meta + Google</Text>
                ) : (
                  <Button size="slim" onClick={() => navigate("/app/integrations/meta")}>Connect Google Ads</Button>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* ── Recommended next step ─────────────────────────────── */}
        {nextStep && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 16, padding: "14px 20px", borderRadius: 12,
            background: "#f8f9ff", border: "1px solid #e1e3e5",
          }}>
            <InlineStack gap="300" blockAlign="center">
              <div style={{ fontSize: 28, lineHeight: 1 }}>{nextStep.icon}</div>
              <BlockStack gap="025">
                <Text as="p" variant="headingSm" fontWeight="semibold">{nextStep.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{nextStep.desc}</Text>
              </BlockStack>
            </InlineStack>
            <Button variant="primary" size="slim" onClick={() => navigate(nextStep.url)}>
              {nextStep.cta}
            </Button>
          </div>
        )}

        {/* ── Two-column body ───────────────────────────────────── */}
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">

              {/* Revenue by source */}
              {data.sourceSummary.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="025">
                        <Text as="h2" variant="headingMd">Revenue by source</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Share of attributed revenue · last 30 days</Text>
                      </BlockStack>
                    </InlineStack>
                    <SourceBreakdown
                      sources={data.sourceSummary}
                      currency={currency}
                      metaSpend={data.metaSpend}
                      googleSpend={data.googleSpend}
                    />
                  </BlockStack>
                </Card>
              )}

              {/* Toolkit — custom container so grid cells fill edge-to-edge and stay clickable */}
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E1E3E5", overflow: "hidden" }}>
                <div style={{ padding: "16px 16px 12px" }}>
                  <BlockStack gap="025">
                    <Text as="h2" variant="headingMd">Your Attribix toolkit</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Everything you need to grow with confidence.</Text>
                  </BlockStack>
                </div>
                <ToolkitGrid data={data} navigate={navigate} />
              </div>

              {/* Recent attributed orders */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Recent attributed orders</Text>
                    <Button size="slim" onClick={() => navigate("/app/orders")}>View all</Button>
                  </InlineStack>
                  {purchaseRows.length > 0 ? (
                    <DataTable
                      columnContentTypes={["text", "numeric", "text", "text", "text"]}
                      headings={["Order", "Value", "Source", "Campaign", "Date"]}
                      rows={purchaseRows}
                      increasedTableDensity
                    />
                  ) : (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No attributed orders yet. Make sure the pixel is active and tracking is enabled.
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Insights */}
              {insights.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">NEEDS ATTENTION</Text>
                    <BlockStack gap="200">
                      {insights.map((ins, i) => <InsightRow key={i} {...ins} />)}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

            </BlockStack>
          </Layout.Section>

          {/* ── Sidebar ──────────────────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="300">

              {/* Store summary */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Store summary</Text>
                  {[
                    { label: "Tracked orders", value: String(data.orders30) },
                    { label: "Tracked revenue", value: fmt(data.rev30, currency) },
                    { label: "AOV", value: fmt(aov, currency) },
                    { label: "Meta ROAS (7d)", value: metaRoas7 !== null ? metaRoas7.toFixed(1) + "×" : "—" },
                  ].map(row => (
                    <InlineStack key={row.label} align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">{row.label}</Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{row.value}</Text>
                    </InlineStack>
                  ))}
                  <Button size="slim" variant="plain" onClick={() => navigate("/app/analytics")}>
                    View full analytics →
                  </Button>
                </BlockStack>
              </Card>

              {/* Setup checklist */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Setup checklist</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{setupDone}/{setupSteps.length}</Text>
                  </InlineStack>
                  {/* Progress bar */}
                  <div style={{ background: "#e1e3e5", borderRadius: 999, height: 4 }}>
                    <div style={{ background: "#008060", borderRadius: 999, height: 4, width: `${Math.round((setupDone / setupSteps.length) * 100)}%`, transition: "width 0.4s ease" }} />
                  </div>
                  <BlockStack gap="150">
                    {setupSteps.map(item => (
                      <div
                        key={item.label}
                        style={{ display: "flex", alignItems: "center", gap: 10, cursor: item.done ? "default" : "pointer" }}
                        onClick={item.done || !item.url ? undefined : () => navigate(item.url)}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: item.done ? "#16a34a" : "#e1e3e5",
                          color: item.done ? "white" : "#9ca3af",
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {item.done ? "✓" : ""}
                        </div>
                        <Text as="p" variant="bodySm" tone={item.done ? undefined : "subdued"}>
                          {item.label}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                  {setupDone < setupSteps.length && (
                    <Button size="slim" onClick={() => navigate("/app/ads")}>Go to setup →</Button>
                  )}
                </BlockStack>
              </Card>

              {/* Need help? */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Need help?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Our team is here to help you get the most out of Attribix.
                  </Text>
                  <Button size="slim" url="mailto:support@attribix.app">Contact support</Button>
                </BlockStack>
              </Card>

            </BlockStack>
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
