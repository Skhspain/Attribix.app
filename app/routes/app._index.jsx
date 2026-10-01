// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { channelFromCampaign, orderSource, hasCampaign, bucketRank } from "~/utils/orderSource";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useMemo, useEffect } from "react";
import {
  Badge, Banner, BlockStack, Button, Card, DataTable,
  Grid, InlineGrid, InlineStack, Layout, Page, Text, Tooltip,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { periodStart, previousPeriod } from "~/utils/reportPeriod";
import { getReportingCurrency } from "~/services/reportingCurrency.server";
import { adAccountRates } from "~/services/adCurrency.server";

// ─── LOADER ──────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;

  // Every KPI on this page covers the same period (see utils/reportPeriod).
  // Before, "7d" spend actually covered 8 days and blended ROAS divided
  // 30-day revenue by 7-day spend.
  const PERIOD_DAYS = 30;
  const since30 = periodStart(PERIOD_DAYS);
  const { start: since60 } = previousPeriod(PERIOD_DAYS);
  const since7 = periodStart(7);

  // Sales channel for older orders, so offline orders (draft orders/invoices,
  // POS) aren't counted as unseen visits. Only missing ones are fetched.
  const { fillSalesChannels } = await import("~/services/salesChannel.server");
  await Promise.race([
    fillSalesChannels(shop, admin, since30),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => null);

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
        createdAt: true, visitorId: true, sessionId: true, landingPage: true, referrer: true, salesChannel: true,
      },
    }).catch(() => []),

    db.adSpendDaily.findMany({
      where: { shop, date: { gte: since60 } },
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
      select: { orderId: true, totalValue: true, currency: true, utmSource: true, utmCampaign: true, createdAt: true, visitorId: true, sessionId: true, landingPage: true, referrer: true, fbclid: true, gclid: true },
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

  const { labelOrders } = await import("~/services/campaignNames.server");
  const recentPurchasesLabelled = await labelOrders(shop, recentPurchases);

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

  // Shopify's own order count for the same period, so a missed webhook shows
  // up as "35 of 41 Shopify orders" instead of silently lower numbers.
  const shopifyOrders30 = await Promise.race([
    admin.graphql(`#graphql
      query OrdersCount($q: String!) { ordersCount(query: $q) { count precision } }`,
      { variables: { q: `created_at:>='${since30.toISOString()}'` } })
      .then((r) => r.json())
      .then((j) => (typeof j?.data?.ordersCount?.count === "number" ? j.data.ordersCount.count : null)),
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]).catch(() => null);

  const storeCurrency = await getReportingCurrency(shop, admin);
  const rates = await adAccountRates(shop, storeCurrency);

  const isMeta = (r) => String(r.platform).toLowerCase().includes("meta") || String(r.platform).toLowerCase().includes("facebook");
  const isGoogle = (r) => String(r.platform).toLowerCase().includes("google");
  const inPeriod = (r) => new Date(r.date) >= since30;
  const inPrevPeriod = (r) => new Date(r.date) >= since60 && new Date(r.date) < since30;
  // Spend is stored in each ad account's currency; convert to the store currency.
  const converted = (r) => Number(r.spend || 0) * (isGoogle(r) ? rates.google.rate : isMeta(r) ? rates.meta.rate : 1);
  const sum = (rows) => rows.reduce((s, r) => s + converted(r), 0);

  const metaSpend = sum(adSpend30.filter((r) => isMeta(r) && inPeriod(r)));
  const metaSpendPrev = sum(adSpend30.filter((r) => isMeta(r) && inPrevPeriod(r)));
  const googleSpend = sum(adSpend30.filter((r) => isGoogle(r) && inPeriod(r)));
  const googleSpendPrev = sum(adSpend30.filter((r) => isGoogle(r) && inPrevPeriod(r)));
  const totalSpend = sum(adSpend30.filter(inPeriod));
  const totalSpendPrev = sum(adSpend30.filter(inPrevPeriod));

  const pctDelta = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null);
  const metaSpendDelta = pctDelta(metaSpend, metaSpendPrev);
  const googleSpendDelta = pctDelta(googleSpend, googleSpendPrev);
  const totalSpendDelta = pctDelta(totalSpend, totalSpendPrev);

  // Attribix-tracked Google revenue (gclid / Google UTM), same period.
  const isGooglePurchase = (p) => !!p.gclid || (p.utmSource && /google|adwords/i.test(String(p.utmSource)));
  const googleRev30 = purchases30.filter(isGooglePurchase).reduce((s, p) => s + Number(p.totalValue || 0), 0);

  // Meta-reported results (Meta's own attribution), same period, store currency.
  const metaKpis = metaCampaigns30.reduce((acc, r) => ({
    spend: acc.spend + Number(r.spend || 0) * rates.meta.rate,
    impressions: acc.impressions + Number(r.impressions || 0),
    clicks: acc.clicks + Number(r.clicks || 0),
    purchases: acc.purchases + Number(r.purchases || 0),
    value: acc.value + Number(r.purchaseValue || 0) * rates.meta.rate,
  }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });

  const adMap = new Map();
  for (const r of metaAds30) {
    const id = String(r.adId);
    const cur = adMap.get(id) || { name: r.adName || id, spend: 0, value: 0, clicks: 0, impressions: 0, purchases: 0 };
    cur.spend += Number(r.spend || 0) * rates.meta.rate;
    cur.value += Number(r.purchaseValue || 0) * rates.meta.rate;
    cur.clicks += Number(r.clicks || 0);
    cur.impressions += Number(r.impressions || 0);
    cur.purchases += Number(r.purchases || 0);
    adMap.set(id, cur);
  }
  const adList = Array.from(adMap.values()).filter(a => a.spend > 0);
  const bestAd = adList.length ? adList.sort((a, b) => (b.value / b.spend) - (a.value / a.spend))[0] : null;

  // Overview, Orders and the other reports classify orders the same way.
  const normalizeSource = (p) => channelFromCampaign(p) ?? "direct";

  const sourceMap = new Map();
  for (const p of purchases30) {
    const src = orderSource(p);
    const cur = sourceMap.get(src) || { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += Number(p.totalValue || 0);
    sourceMap.set(src, cur);
  }

  const pixelLastSeen = settings?.pixelLastSeenAt ? new Date(settings.pixelLastSeenAt) : null;
  const hoursSincePixel = pixelLastSeen ? (Date.now() - pixelLastSeen.getTime()) / 3600000 : null;
  const pixelStatus = hoursSincePixel === null ? "never" : hoursSincePixel < 24 ? "healthy" : hoursSincePixel < 168 ? "warning" : "error";

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && metaConn.adAccountId);
  // OAuth done but ad account not yet selected — show a warning badge rather than "not connected"
  const metaPartialConnect = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && !metaConn.adAccountId);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);
  const googlePartialConnect = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && !googleConn.adCustomerId);

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

  // Attributed channels first (by revenue), then direct/referral, with
  // untracked last so it can't read as the top "source".
  const sourceSummary = Array.from(sourceMap.entries())
    .sort((a, b) => bucketRank(a[0]) - bucketRank(b[0]) || b[1].revenue - a[1].revenue)
    .map(([src, r]) => ({
      source: src,
      orders: r.orders,
      revenue: r.revenue,
      share: rev30 > 0 ? Math.round((r.revenue / rev30) * 100) : 0,
      visitors: visitorMap.get(src)?.size ?? 0,
    }));

  const attributedOrders = purchases30.filter(hasCampaign).length;
  // Orders where we never saw the buyer's visit at all vs. visits we saw that
  // simply had no campaign or referrer (observed direct traffic).
  const notTrackedOrders = purchases30.filter(p => orderSource(p) === "untracked").length;
  const directOrders = purchases30.filter(p => orderSource(p) === "direct").length;
  // Draft orders/invoices and POS had no website visit to track, so tracking
  // coverage is measured against online orders only.
  const offlineOrders = purchases30.filter(p => orderSource(p) === "offline").length;
  const onlineOrders = orders30 - offlineOrders;

  // Storefront widgets (reviews/newsletter) need the theme app embed. Cached
  // check of the live storefront; don't hold the page up if it's slow.
  const { isWidgetsEmbedLive } = await import("~/services/themeEditor.server");
  const widgetsEmbedLive = await Promise.race([
    isWidgetsEmbedLive(shop),
    new Promise((r) => setTimeout(() => r(null), 2500)),
  ]).catch(() => null);
  const onlineAttributed = purchases30.filter(p => hasCampaign(p) && orderSource(p) !== "offline").length;
  const attributionRate = onlineOrders > 0 ? Math.round((onlineAttributed / onlineOrders) * 100) : 0;
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
    rev30, rev7, orders30, orders7, aov, shopifyOrders30,
    rev30Delta, orders30Delta,
    dailyRevArr, dailyOrdersArr,
    periodDays: PERIOD_DAYS,
    periodStart: since30.toISOString(),
    totalSpend, totalSpendDelta, metaSpend, googleSpend,
    metaSpendPrev, googleSpendPrev,
    metaSpendDelta, googleSpendDelta,
    googleRev30,
    storeCurrency,
    freshness: {
      metaSyncedAt: metaConn?.lastSyncedAt ?? null,
      googleSyncedAt: googleConn?.lastSyncedAt ?? null,
      googleSyncError: googleConn?.lastSyncError ?? null,
    },
    tracking: { attributedOrders, onlineAttributed, notTrackedOrders, directOrders, offlineOrders, onlineOrders, attributionRate, uniqueVisitors, pixelStatus, metaReportedPurchases, platformTotal, attribixTrackedMore, widgetsEmbedLive },
    metaKpis, bestAd, sourceSummary,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected, metaPartialConnect,
    googleConnected, googlePartialConnect,
    isNewInstall,
    recentPurchases: recentPurchasesLabelled,
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

// `invert`: for costs, where "up" isn't good news — shown neutral instead of green/red.
function DeltaBadge({ delta, invert = false }) {
  if (delta === null || delta === undefined) return null;
  const up = delta >= 0;
  const neutral = invert;
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, lineHeight: 1,
      color: neutral ? "#4a4a4a" : up ? "#16a34a" : "#dc2626",
      background: neutral ? "#f3f3f3" : up ? "#f0fdf4" : "#fef2f2",
      border: `1px solid ${neutral ? "#e3e3e3" : up ? "#bbf7d0" : "#fecaca"}`,
      borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
    }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

const SOURCE_CFG = {
  direct:    { color: "#6B7280", label: "Direct (no referrer)", icon: "↗" },
  referral:  { color: "#8B5CF6", label: "Referral",  icon: "↪" },
  offline:   { color: "#A16207", label: "Not online (draft order/POS)", icon: "✎" },
  untracked: { color: "#D1D5DB", label: "Not tracked (visit unseen)", icon: "?", textColor: "#374151" },
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
          // Only with enough tracked orders to mean anything, and labelled as
          // tracked-only (platforms report more through their own attribution).
          const srcRoas = spend > 0 && s.orders >= 5 ? (s.revenue / spend).toFixed(1) : null;
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
                {srcRoas && <Text as="p" variant="bodySm" tone="subdued">{srcRoas}× on tracked orders</Text>}
              </BlockStack>
            </div>
          );
        })}
      </div>

      {/* Make the three kinds of revenue explicit so a gap in tracking never
          reads as direct traffic. */}
      <Text as="p" variant="bodySm" tone="subdued">
        {(() => {
          const pct = (pred) => Math.round((nonZero.filter(pred).reduce((a, x) => a + x.revenue, 0) / total) * 100);
          const untracked = pct(s => s.source === "untracked");
          const direct = pct(s => s.source === "direct" || s.source === "referral");
          const offline = pct(s => s.source === "offline");
          const attributed = 100 - untracked - direct - offline;
          return `${attributed}% attributed to a channel · ${direct}% seen visits with no campaign · ${untracked}% not tracked — Attribix never saw the visit, so its source is unknown (not direct)${offline > 0 ? ` · ${offline}% not placed online` : ""}.`;
        })()}
      </Text>
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
      name: "Customer journeys", desc: "See the touchpoints Attribix captured before each order",
      metric: "Multi-touch attribution",
      status: pixelStatus === "healthy" ? "Recording" : "No recent events",
      tone: pixelStatus === "healthy" ? "success" : "attention",
      url: "/app/journey",
    },
    {
      icon: "📊", bg: "#008060",
      name: "Ads & Attribution", desc: "Track performance and attribute revenue with confidence",
      metric: tracking.onlineOrders > 0 ? `${tracking.attributionRate}% of ${tracking.onlineOrders} online orders attributed` : "No online orders yet",
      status: pixelStatus !== "healthy" ? "No recent events" : orders30 > 0 && tracking.attributionRate < 60 ? "Partial coverage" : "Events arriving",
      tone: pixelStatus !== "healthy" ? "critical" : orders30 > 0 && tracking.attributionRate < 60 ? "attention" : "success",
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
  if (!raw || raw.includes("unknown") || raw.includes("not tracked")) return "untracked";
  if (raw === "direct") return "direct";
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
  const importFetcher = useFetcher();

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
      { icon: "📈", title: "Connect Google Ads", body: "Sync Google campaign spend and results.", url: "/app/integrations/google?from=onboarding", cta: "Connect Google", done: data.googleConnected },
      { icon: "🔌", title: "Install Tracking Pixel", body: "Captures UTM parameters and click IDs so orders can be matched to their source.", url: "/app/settings/tracking", cta: "View pixel settings", done: data.pixelStatus === "healthy" },
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
  const days = data.periodDays ?? 30;
  const periodText = `Last ${days} days`;
  // Tracked revenue ÷ all ad spend, same period (a blended figure: it includes
  // revenue from every channel, not only ads).
  const blendedRoas = data.totalSpend > 0 ? data.rev30 / data.totalSpend : null;
  const metaRoas = data.metaKpis.spend > 0 ? data.metaKpis.value / data.metaKpis.spend : null;
  const aov = data.aov || 0;
  const t = data.tracking;
  const missingOrders = data.shopifyOrders30 !== null ? Math.max(0, data.shopifyOrders30 - data.orders30) : 0;

  const trackingOk = data.pixelStatus === "healthy";
  const googleFailing = data.googleConnected && !!data.freshness?.googleSyncError;
  const googleStale = data.googleConnected && !data.freshness?.googleSyncedAt;
  const metaStale = data.metaConnected && (!data.freshness?.metaSyncedAt || Date.now() - new Date(data.freshness.metaSyncedAt).getTime() > 48 * 3600e3);
  // Connected platforms whose spend we can't vouch for this period. Any
  // headline figure built on spend is then partial, and says so.
  const spendGaps = [
    (googleFailing || googleStale) && "Google spend unavailable",
    metaStale && "Meta spend may be out of date",
  ].filter(Boolean);
  const spendPartial = spendGaps.length > 0;

  // Contextual "recommended next step" banner
  const nextStep = !trackingOk
    ? { title: "Check your tracking pixel", desc: "Attribix hasn't received storefront events in the last 24 hours.", url: "/app/settings/tracking", cta: "Open tracking settings" }
    : !data.metaConnected
      ? { title: "Connect Meta Ads", desc: "Bring in Meta spend so you can compare it with tracked revenue.", url: "/app/integrations/meta", cta: "Connect Meta" }
      : !data.googleConnected
        ? { title: "Connect Google Ads", desc: "Bring in Google spend so ad costs are complete.", url: "/app/integrations/google", cta: "Connect Google Ads" }
        : googleFailing
          ? { title: "Google Ads data isn't syncing", desc: data.freshness.googleSyncError, url: "/app/integrations/google", cta: "View Google connection" }
          : null;

  const insights = useMemo(() => {
    const list = [];
    const { orders30, metaKpis, bestAd } = data;

    // Coverage: say what's actually missing, without inventing a cause.
    const online = t.onlineOrders;
    const offlineNote = t.offlineOrders > 0
      ? ` ${t.offlineOrders} more ${t.offlineOrders === 1 ? "was a draft order, invoice or POS sale" : "were draft orders, invoices or POS sales"} with no website visit, so they aren't counted here.`
      : "";
    if (online >= 5) {
      const noSource = online - t.onlineAttributed;
      const pct = Math.round((noSource / online) * 100);
      if (pct >= 30) {
        list.push({
          tone: "warning",
          title: `${pct}% of online orders have no tracked source (${periodText.toLowerCase()})`,
          body: (t.notTrackedOrders > 0
            ? `${t.notTrackedOrders} of ${online} online orders came from visits Attribix couldn't see, so their source is unknown. Possible reasons include declined cookies, ad blockers, or buying on a different device. ${t.directOrders > 0 ? `${t.directOrders} more were visits with no campaign or referrer. ` : ""}Channel and ROAS figures based on tracked orders will understate these sales.`
            : `${noSource} of ${online} online orders came from visits with no campaign or referrer. Check that your ad links carry UTM parameters.`) + offlineNote,
        });
      }
    } else if (t.offlineOrders > 0 && orders30 > 0) {
      list.push({ tone: "info", title: `${t.offlineOrders} of ${orders30} orders weren't placed online`, body: offlineNote.trim() });
    }

    // Meta: report the number with its source; no profit claims or "scale" advice.
    if (metaKpis.spend > 0 && metaRoas !== null) {
      list.push({
        tone: "info",
        title: `Meta reports ${fmtRoas(metaRoas)} ROAS (${periodText.toLowerCase()})`,
        body: `${metaKpis.purchases} purchases worth ${fmtDec(metaKpis.value, currency)} on ${fmtDec(metaKpis.spend, currency)} spend, using Meta's own attribution. This is revenue, not profit — product costs, shipping and fees aren't included.`,
      });
    }

    // Only point to a "best ad" when it has enough purchases to mean something.
    if (bestAd && bestAd.spend > 0 && bestAd.purchases >= 3) {
      list.push({
        tone: "info",
        title: `Highest Meta-reported ROAS: "${bestAd.name}" (${fmtRoas(bestAd.value / bestAd.spend)})`,
        body: `${bestAd.purchases} Meta-reported purchases · ${fmtDec(bestAd.value, currency)} on ${fmtDec(bestAd.spend, currency)} spend.`,
      });
    }
    return list;
  }, [data, metaRoas, currency, t, periodText]);

  const purchaseRows = (data.recentPurchases || []).map((p) => [
    <Button key={p.orderId} variant="plain" url={`shopify://admin/orders/${p.orderId}`} target="_top" accessibilityLabel={`Open order ${p.orderId} in Shopify`}>{p.orderId || "—"}</Button>,
    <Text as="span" variant="bodySm">{fmt(p.totalValue, p.currency)}</Text>,
    p.utmSource
      ? <Badge tone={sourceTone(p.utmSource)}>{sourceName(p.utmSource)}</Badge>
      : <NotTrackedOrDirect tracked={p.tracked} />,
    <Text as="span" variant="bodySm" tone="subdued">{p.campaignLabel || "—"}</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
  ]);

  // Each item is checked against real data, not just "a connection exists".
  const setupSteps = [
    { label: "Storefront events received (last 24 h)", done: trackingOk, url: "/app/settings/tracking" },
    { label: data.metaConnected ? "Meta Ads syncing" : "Connect Meta Ads", done: data.metaConnected && !metaStale, url: "/app/integrations/meta" },
    { label: data.googleConnected ? "Google Ads syncing" : "Connect Google Ads", done: data.googleConnected && !googleFailing && !googleStale, url: "/app/integrations/google" },
    ...(t.widgetsEmbedLive === null ? [] : [{ label: "Storefront widgets embed on", done: !!t.widgetsEmbedLive, url: "/app/setup" }]),
  ];
  const setupDone = setupSteps.filter(s => s.done).length;

  return (
    <Page title="Overview" subtitle={`${periodText} (${formatPeriod(data.periodStart)}) · amounts in ${currency}`}>
      <BlockStack gap="400">

        {/* ── Tracking health: each part checked separately ───────── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">Tracking health</Text>
              <Button size="slim" variant={setupDone < setupSteps.length ? "primary" : "plain"} url="/app/setup">{setupDone < setupSteps.length ? `Review setup (${setupDone} of ${setupSteps.length} done)` : "Setup guide"}</Button>
            </InlineStack>
            <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
              <HealthItem
                label="Storefront events"
                tone={trackingOk ? "success" : data.pixelStatus === "never" ? "critical" : "warning"}
                value={data.pixelLastSeen ? `Last event ${timeAgo(data.pixelLastSeen)}` : "No events received yet"}
              />
              <HealthItem
                label="Online orders with a tracked source"
                tone={t.onlineOrders === 0 ? "info" : t.attributionRate >= 60 ? "success" : "warning"}
                value={t.onlineOrders === 0 ? "No online orders yet" : `${t.onlineAttributed} of ${t.onlineOrders} (${t.attributionRate}%)`}
                detail={[
                  t.notTrackedOrders > 0 && `${t.notTrackedOrders} not tracked (visit not seen)`,
                  t.offlineOrders > 0 && `${t.offlineOrders} offline (draft order/POS)`,
                ].filter(Boolean).join(" · ") || undefined}
              />
              <HealthItem
                label="Meta Ads"
                tone={!data.metaConnected ? "info" : metaStale ? "warning" : "success"}
                value={!data.metaConnected ? (data.metaPartialConnect ? "Choose an ad account" : "Not connected") : data.freshness?.metaSyncedAt ? `Synced ${timeAgo(data.freshness.metaSyncedAt)}` : "Not synced yet"}
              />
              <HealthItem
                label="Google Ads"
                tone={!data.googleConnected ? "info" : googleFailing || googleStale ? "critical" : "success"}
                value={!data.googleConnected ? (data.googlePartialConnect ? "Choose an ad account" : "Not connected") : googleFailing ? "Sync failing" : data.freshness?.googleSyncedAt ? `Synced ${timeAgo(data.freshness.googleSyncedAt)}` : "Never synced"}
                detail={googleFailing ? data.freshness.googleSyncError : undefined}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* ── Orders Shopify has that Attribix never received ────────── */}
        {missingOrders > 0 && (
          <Banner
            tone="warning"
            title={`Attribix has ${data.orders30} of ${data.shopifyOrders30} Shopify orders from the ${periodText.toLowerCase()}`}
            action={{
              content: importFetcher.state !== "idle" ? "Importing…" : `Import ${missingOrders} missing order${missingOrders === 1 ? "" : "s"}`,
              loading: importFetcher.state !== "idle",
              onAction: () => importFetcher.submit({ onlyMissing: "1", maxPages: "8" }, { method: "post", action: "/api/backfill/orders" }),
            }}
          >
            <p>
              {importFetcher.data?.ok
                ? `Imported ${importFetcher.data.created} order${importFetcher.data.created === 1 ? "" : "s"}. Reload the page to see updated figures.`
                : importFetcher.data && !importFetcher.data.ok
                  ? `Import failed: ${importFetcher.data.error || "unknown error"}`
                  : "Revenue, order counts and ROAS below leave these orders out until they're imported. Imported orders get their source from Shopify's own visit data where it has any."}
            </p>
          </Banner>
        )}

        {/* ── KPI cards (all the same period) ─────────────────────── */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Revenue · {days} days</Text>
                <InlineStack align="space-between" blockAlign="end" wrap={false}>
                  <Text as="p" variant="heading2xl">{fmt(data.rev30, currency)}</Text>
                  {data.dailyRevArr?.some(v => v > 0) && <Sparkline values={data.dailyRevArr} color="#008060" />}
                </InlineStack>
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <DeltaBadge delta={data.rev30Delta} />
                  <Text as="p" variant="bodySm" tone="subdued">vs previous {days} days</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Orders · {days} days</Text>
                <InlineStack align="space-between" blockAlign="end" wrap={false}>
                  <Text as="p" variant="heading2xl">{data.orders30}</Text>
                  {data.dailyOrdersArr?.some(v => v > 0) && <Sparkline values={data.dailyOrdersArr} color="#3B82F6" />}
                </InlineStack>
                {data.shopifyOrders30 !== null && (
                  <Text as="p" variant="bodySm" tone={missingOrders > 0 ? "caution" : "subdued"}>
                    {missingOrders > 0 ? `${data.orders30} of ${data.shopifyOrders30} Shopify orders received` : "Matches Shopify's order count"}
                  </Text>
                )}
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <DeltaBadge delta={data.orders30Delta} />
                  <Text as="p" variant="bodySm" tone="subdued">vs previous {days} days</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Ad spend · {days} days</Text>
                  {spendPartial && <Badge tone="warning">Partial</Badge>}
                </InlineStack>
                <Text as="p" variant="heading2xl">{data.totalSpend > 0 ? fmt(data.totalSpend, currency) : "—"}</Text>
                {data.totalSpend > 0 ? (
                  <InlineStack gap="150" blockAlign="center" wrap={false}>
                    <DeltaBadge delta={data.totalSpendDelta} invert />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {[data.metaConnected && "Meta", data.googleConnected && !googleFailing && "Google"].filter(Boolean).join(" + ") || "—"}
                      {spendPartial ? ` · ${spendGaps.join(", ")}` : ""}
                    </Text>
                  </InlineStack>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {spendPartial ? `Partial — ${spendGaps.join(", ")}` : data.metaConnected || data.googleConnected ? "No spend recorded in this period" : "No ad account connected"}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 3, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Blended ROAS · {days} days</Text>
                  {spendPartial && blendedRoas !== null && <Badge tone="warning">Partial</Badge>}
                </InlineStack>
                <Text as="p" variant="heading2xl">{blendedRoas !== null ? fmtRoas(blendedRoas) : "—"}</Text>
                <Text as="p" variant="bodySm" tone={spendPartial && blendedRoas !== null ? "caution" : "subdued"}>
                  {blendedRoas === null
                    ? "Needs ad spend to calculate"
                    : spendPartial
                      ? `Partial — ${spendGaps.join(", ")}, so this is likely overstated`
                      : "All tracked revenue ÷ ad spend"}
                </Text>
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
                        <Text as="p" variant="bodySm" tone="subdued">Attribix-tracked orders · {periodText.toLowerCase()} · ROAS uses spend from the same days</Text>
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
                    <Text as="h2" variant="headingMd">Recent orders</Text>
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
                    <Text as="h2" variant="headingMd">Insights</Text>
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
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingSm">Store summary</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{periodText}</Text>
                  </BlockStack>
                  {[
                    { label: "Tracked orders", value: String(data.orders30) },
                    { label: "Tracked revenue", value: fmt(data.rev30, currency) },
                    { label: "Average order value", value: fmt(aov, currency) },
                    { label: "Meta-reported ROAS", value: metaRoas !== null ? fmtRoas(metaRoas) : "—" },
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
                        role={item.done || !item.url ? undefined : "link"}
                        tabIndex={item.done || !item.url ? undefined : 0}
                        onKeyDown={item.done || !item.url ? undefined : (e) => { if (e.key === "Enter") navigate(item.url); }}
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
                    <Button size="slim" onClick={() => navigate("/app/setup")}>Open setup guide</Button>
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

// No source + no visit seen at all usually means the buyer declined cookies,
// so nothing could be tracked in the browser. That isn't "direct" traffic.
function NotTrackedOrDirect({ tracked }) {
  return tracked
    ? <Text as="span" variant="bodySm" tone="subdued">direct</Text>
    : <Tooltip content="We didn't see this buyer's visit, so the source is unknown. Possible reasons include declined cookies, ad blockers or a different device. Ad platforms may still count it through server-side matching."><Text as="span" variant="bodySm" tone="subdued">not tracked</Text></Tooltip>;
}

function HealthItem({ label, value, detail, tone }) {
  const toneLabel = { success: "OK", warning: "Check", critical: "Problem", info: "Info" }[tone] ?? "Info";
  return (
    <BlockStack gap="100">
      <InlineStack gap="150" blockAlign="center" wrap={false}>
        <Badge tone={tone === "info" ? undefined : tone}>{toneLabel}</Badge>
        <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
      </InlineStack>
      <Text as="p" variant="bodySm">{value}</Text>
      {detail && <Text as="p" variant="bodySm" tone="subdued">{detail}</Text>}
    </BlockStack>
  );
}

function fmtRoas(v) {
  return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}×`;
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function formatPeriod(startIso) {
  const f = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(startIso)} – ${f(Date.now())}`;
}

const SOURCE_NAMES = { adwords: "Google Ads", google: "Google", facebook: "Facebook", fb: "Facebook", ig: "Instagram", instagram: "Instagram", meta: "Meta", tiktok: "TikTok", bing: "Microsoft Ads", email: "Email", attribix: "Attribix email" };
function sourceName(src) {
  const s = String(src || "").toLowerCase();
  return SOURCE_NAMES[s] ?? src;
}
