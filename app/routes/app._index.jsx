// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useMemo } from "react";
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

  // Previous 7-day window (days 8–14 ago) for week-over-week delta
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

    // Ad spend per platform (30d AND includes date for week-over-week)
    db.adSpendDaily.findMany({
      where: { shop, date: { gte: since14 } },
      select: { platform: true, spend: true, date: true },
    }).catch(() => []),

    // Meta campaign insights (include date for week-over-week)
    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: since30 } },
      select: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true, date: true },
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
  ]);

  // Aggregate
  const rev30 = purchases30.reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders30 = purchases30.length;
  const rev7 = purchases30.filter(p => new Date(p.createdAt) >= since7).reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders7 = purchases30.filter(p => new Date(p.createdAt) >= since7).length;

  // Detect store currency + Google Ads account currency for conversion
  let storeCurrency = "NOK";
  try {
    const shopRes = await admin.graphql(`{ shop { currencyCode } }`);
    const shopData = await shopRes.json();
    storeCurrency = shopData?.data?.shop?.currencyCode || "NOK";
  } catch {}

  // Get Google Ads account currency (from GoogleConnection or fallback to USD)
  const googleAdCurrency = googleConn?.scope?.includes?.("USD") ? "USD" : "USD"; // Most Google Ads accounts use USD
  // Actually detect from the customer data if available
  let googleCurrencyRate = 1;
  try {
    const { convertCurrency } = await import("~/services/currency.server");
    googleCurrencyRate = await convertCurrency(1, "USD", storeCurrency);
  } catch {}

  // Meta spend is typically already in the store's currency (Meta reports in ad account currency which you set to NOK)
  // Google spend needs conversion from USD to store currency

  // adSpend30 is actually the last 14 days now (since14). Split into current and previous 7d windows.
  const isMeta = (r) => String(r.platform).toLowerCase().includes("meta") || String(r.platform).toLowerCase().includes("facebook");
  const isGoogle = (r) => String(r.platform).toLowerCase().includes("google");
  const isCurrent7 = (r) => new Date(r.date) >= since7;
  const isPrev7 = (r) => new Date(r.date) >= since14 && new Date(r.date) < since7;

  // Apply currency conversion to Google spend (USD → store currency)
  const applyRate = (r) => isGoogle(r) ? Number(r.spend || 0) * googleCurrencyRate : Number(r.spend || 0);

  const totalSpend = adSpend30.filter(isCurrent7).reduce((s, r) => s + applyRate(r), 0);
  const metaSpend = adSpend30.filter(r => isMeta(r) && isCurrent7(r)).reduce((s, r) => s + Number(r.spend || 0), 0);
  const metaSpendPrev = adSpend30.filter(r => isMeta(r) && isPrev7(r)).reduce((s, r) => s + Number(r.spend || 0), 0);
  const googleSpend = adSpend30.filter(r => isGoogle(r) && isCurrent7(r)).reduce((s, r) => s + applyRate(r), 0);
  const googleSpendPrev = adSpend30.filter(r => isGoogle(r) && isPrev7(r)).reduce((s, r) => s + applyRate(r), 0);

  // Week-over-week delta (%)
  const pctDelta = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };
  const metaSpendDelta = pctDelta(metaSpend, metaSpendPrev);
  const googleSpendDelta = pctDelta(googleSpend, googleSpendPrev);

  // Revenue attributed to Meta (7-day window) — from campaign insights if available
  const metaRev7 = metaCampaigns30
    .filter(r => r.date && new Date(r.date) >= since7)
    .reduce((s, r) => s + Number(r.purchaseValue || 0), 0);

  // Revenue attributed to Google (7-day window) — from purchases with gclid or google source
  // Also apply currency conversion to Google ad spend revenue
  const isGooglePurchase = (p) => !!p.gclid || (p.utmSource && String(p.utmSource).toLowerCase().includes("google"));
  const googleRev7 = purchases30
    .filter(p => isGooglePurchase(p) && new Date(p.createdAt) >= since7)
    .reduce((s, p) => s + Number(p.totalValue || 0), 0);

  // Also get Google conversion value from the live API (not just purchase attribution)
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
  // Use the higher of purchase-attributed or Google-reported conversion value
  const googleSales7 = Math.max(googleRev7, googleConvValue7);

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

  const reqUrl = new URL(request.url);

  // Mark onboarding complete when user explicitly clicks "Go to dashboard" or "Skip"
  if (reqUrl.searchParams.get("skip") === "1") {
    await db.trackingSettings.upsert({
      where: { shop },
      create: { shop, onboardingCompletedAt: new Date() },
      update: { onboardingCompletedAt: new Date() },
    }).catch(() => null);
  }

  const onboardingCompleted = !!(settings?.onboardingCompletedAt);
  // Show onboarding when: nothing connected, no orders, pixel never fired, and not dismissed
  const isNewInstall = !onboardingCompleted && !metaConnected && !googleConnected && orders30 === 0 && pixelStatus === "never";

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

  // Attribution Intelligence — show why Attribix tracking is superior
  const attributedOrders = purchases30.filter(p => p.utmSource || p.fbclid || p.gclid || p.ttclid || p.msclkid).length;
  const attributionRate = orders30 > 0 ? Math.round((attributedOrders / orders30) * 100) : 0;
  const uniqueVisitors = new Set(trackedEvents30.filter(e => e.visitorId).map(e => String(e.visitorId))).size;
  const metaReportedPurchases = metaKpis.purchases;
  const googleReportedPurchases = 0; // TODO: populate if available
  const platformTotal = metaReportedPurchases + googleReportedPurchases;
  const attribixTrackedMore = attributedOrders > platformTotal;

  // Feature hub stats + notification counts (items needing attention)
  // "New since last visit" — each tool has a seen-at timestamp, only count items newer than that
  const reviewsSeenAt = settings?.reviewsSeenAt ?? new Date(0);
  const leadsSeenAt = settings?.leadsSeenAt ?? new Date(0);
  const newsletterSeenAt = settings?.newsletterSeenAt ?? new Date(0);

  const [
    subscriberCount,
    pendingReviews,
    avgReviewRating,
    leadCount,
    campaignCount,
    newReviewsUnseen,
    newLeadsUnseen,
    newSubscribersUnseen,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }).catch(() => 0),
    db.review.count({ where: { shop, status: "pending" } }).catch(() => 0),
    db.review.aggregate({ where: { shop, status: "approved" }, _avg: { rating: true }, _count: true }).catch(() => ({ _avg: { rating: null }, _count: 0 })),
    db.lead.count({ where: { shop } }).catch(() => 0),
    db.newsletterCampaign.count({ where: { shop, status: "sent" } }).catch(() => 0),
    // Pending reviews created since last visit
    db.review.count({ where: { shop, status: "pending", createdAt: { gt: reviewsSeenAt } } }).catch(() => 0),
    // New leads since last visit
    db.lead.count({ where: { shop, createdAt: { gt: leadsSeenAt } } }).catch(() => 0),
    // New subscribers since last visit
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gt: newsletterSeenAt } } }).catch(() => 0),
  ]);

  return json({
    shop,
    rev30, rev7, orders30, orders7,
    totalSpend, metaSpend, googleSpend,
    metaSpendPrev, googleSpendPrev,
    metaSpendDelta, googleSpendDelta,
    metaRev7, googleRev7: googleSales7,
    storeCurrency,
    // Attribution Intelligence
    tracking: {
      attributedOrders,
      attributionRate,
      uniqueVisitors,
      pixelStatus,
      metaReportedPurchases,
      platformTotal,
      attribixTrackedMore,
    },
    metaKpis,
    bestAd,
    sourceSummary,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected,
    googleConnected,
    isNewInstall,
    recentPurchases,
    attributionModel: settings?.attributionModel ?? "last_touch",
    attributionWindowDays: settings?.attributionWindowDays ?? 7,
    featureHub: {
      subscriberCount,
      pendingReviews,
      avgRating: avgReviewRating?._avg?.rating ? Number(avgReviewRating._avg.rating).toFixed(1) : null,
      totalReviews: avgReviewRating?._count ?? 0,
      leadCount,
      campaignCount,
      // Notification badge counts (items created after last visit)
      newReviewsUnseen,
      newLeadsUnseen,
      newSubscribersUnseen,
    },
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
  const currency = data.storeCurrency || "NOK";

  if (data.isNewInstall) {
    const steps = [
      {
        icon: "📘",
        title: "Connect Meta Ads",
        body: "Sync ad spend, enable server-side Conversions API, and see ROAS.",
        url: "/app/integrations/meta?from=onboarding",
        cta: "Connect Meta",
        done: data.metaConnected,
      },
      {
        icon: "📈",
        title: "Connect Google Ads",
        body: "Sync Google campaign spend and upload offline conversions.",
        url: "/app/integrations/google?from=onboarding",
        cta: "Connect Google",
        done: data.googleConnected,
      },
      {
        icon: "🔌",
        title: "Install Tracking Pixel",
        body: "Captures UTM parameters and click IDs so every order is attributed.",
        url: "/app/settings/tracking",
        cta: "View pixel settings",
        done: data.pixelStatus === "healthy",
      },
    ];
    const completedCount = steps.filter(s => s.done).length;

    return (
      <Page title="Welcome to Attribix" subtitle="Connect your tools to start tracking sales and ad performance.">
        <BlockStack gap="500">
          <Card>
            <BlockStack gap="500">
              {/* Progress bar */}
              <BlockStack gap="150">
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">{completedCount} of {steps.length} steps completed</Text>
                  {completedCount > 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">{Math.round((completedCount / steps.length) * 100)}%</Text>
                  )}
                </InlineStack>
                <div style={{ background: "#e1e3e5", borderRadius: 999, height: 6 }}>
                  <div style={{ background: "#008060", borderRadius: 999, height: 6, width: `${Math.round((completedCount / steps.length) * 100)}%`, transition: "width 0.4s ease" }} />
                </div>
              </BlockStack>

              {/* Steps */}
              <BlockStack gap="300">
                {steps.map((step) => (
                  <div key={step.title} style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 18px",
                    border: `1px solid ${step.done ? "#bbf7d0" : "#e1e3e5"}`,
                    borderRadius: 10,
                    background: step.done ? "#f0fdf4" : "#fff",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: step.done ? "#008060" : "#f1f3f5",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: step.done ? 20 : 22, flexShrink: 0,
                    }}>
                      {step.done ? "✓" : step.icon}
                    </div>
                    <BlockStack gap="050">
                      <Text as="p" variant="headingSm">{step.title}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{step.body}</Text>
                    </BlockStack>
                    {step.done
                      ? <Badge tone="success">Connected</Badge>
                      : <Button size="slim" onClick={() => navigate(step.url)}>{step.cta}</Button>
                    }
                  </div>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>

          {/* CTA row */}
          <InlineStack align="space-between" blockAlign="center">
            <Button variant="plain" tone="subdued" onClick={() => navigate("/app?skip=1")}>
              Skip setup
            </Button>
            {completedCount > 0 && (
              <Button variant="primary" onClick={() => navigate("/app?skip=1")}>
                Go to dashboard →
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      </Page>
    );
  }

  const roas = data.totalSpend > 0 ? data.rev30 / data.totalSpend : null;
  const metaRoas = data.metaKpis.spend > 0 ? data.metaKpis.value / data.metaKpis.spend : null;
  const metaRoas7 = data.metaSpend > 0 ? data.metaRev7 / data.metaSpend : null;
  const googleRoas7 = data.googleSpend > 0 ? data.googleRev7 / data.googleSpend : null;
  const aov = data.orders30 > 0 ? data.rev30 / data.orders30 : 0;

  // Smart insights including lead quality
  const insights = useMemo(() => {
    const list = [];
    const { rev30, orders30, totalSpend, metaSpend, googleSpend, metaKpis, bestAd, sourceSummary } = data;

    // Attribution rate
    const attributed = sourceSummary.filter(s => s.source !== "unknown").reduce((n, s) => n + s.orders, 0);
    const attrRate = orders30 > 0 ? Math.round((attributed / orders30) * 100) : 0;
    if (attrRate < 50 && orders30 > 0) {
      list.push({ tone: "warning", icon: "⚠️", title: `${100 - attrRate}% of orders have no tracked source`, body: `${orders30 - attributed} of ${orders30} orders show as unknown. Add UTM parameters to your ad URLs so Attribix can attribute every sale correctly.` });
    } else if (attrRate >= 80 && orders30 > 0) {
      list.push({ tone: "success", icon: "✅", title: `${attrRate}% attribution rate — excellent`, body: `Attribix is tracking ${attributed} of ${orders30} orders to a source. Your UTM setup is working well.` });
    }

    // Meta ROAS vs break-even
    if (metaKpis.spend > 0) {
      if (metaRoas !== null && metaRoas < 1) {
        list.push({ tone: "critical", icon: "🔴", title: `Meta ROAS ${Math.round(metaRoas * 100)}% — spending more than you earn`, body: `${fmtDec(metaKpis.spend, currency)} spent, only ${fmtDec(metaKpis.value, currency)} in reported Meta purchase value. Pause underperforming ads and review your targeting.` });
      } else if (metaRoas !== null && metaRoas >= 1 && metaRoas < 2) {
        list.push({ tone: "warning", icon: "⚠️", title: `Meta ROAS ${Math.round(metaRoas * 100)}% — below target`, body: `You're breaking even but margins are thin. Review your best-performing ad and shift budget toward it.` });
      } else if (metaRoas !== null && metaRoas >= 3) {
        list.push({ tone: "success", icon: "🚀", title: `Meta ROAS ${Math.round(metaRoas * 100)}% — strong performance`, body: `Solid returns. Consider scaling budget on your best campaigns to maximise this window.` });
      }
    }

    // Lead quality: CTR → CVR → ROAS chain
    if (metaKpis.impressions > 0 && metaKpis.clicks > 0 && metaKpis.purchases > 0) {
      const ctr = (metaKpis.clicks / metaKpis.impressions) * 100;
      const cvr = (metaKpis.purchases / metaKpis.clicks) * 100;
      const cpl = metaKpis.clicks > 0 ? metaKpis.spend / metaKpis.clicks : 0; // cost per click (lead)
      const revenuePerClick = metaKpis.clicks > 0 ? metaKpis.value / metaKpis.clicks : 0;

      if (cvr < 1 && ctr > 1) {
        list.push({ tone: "warning", icon: "📉", title: `Good CTR (${ctr.toFixed(2)}%) but low conversion rate (${cvr.toFixed(2)}%)`, body: `Ads are getting clicks but visitors aren't buying. Your landing page or offer may need work. Cost per click: ${fmtDec(cpl, currency)} · Revenue per click: ${fmtDec(revenuePerClick, currency)}.` });
      } else if (cvr >= 2 && metaRoas !== null && metaRoas < 2) {
        list.push({ tone: "info", icon: "💡", title: `Good CVR (${cvr.toFixed(2)}%) but ROAS is low — CPC is the issue`, body: `People who click are converting well, but you're paying too much per click (${fmtDec(cpl, currency)}). Try narrowing your audience or testing lower-cost placements.` });
      } else if (cvr >= 2 && metaRoas !== null && metaRoas >= 2) {
        list.push({ tone: "success", icon: "🎯", title: `Strong funnel: ${ctr.toFixed(2)}% CTR → ${cvr.toFixed(2)}% CVR → ${Math.round(metaRoas * 100)}% ROAS`, body: `Your ads, landing page, and offer are working together. Revenue per click: ${fmtDec(revenuePerClick, currency)}.` });
      }
    }

    // Best ad
    if (bestAd && bestAd.spend > 0) {
      const adRoas = (bestAd.value / bestAd.spend).toFixed(2);
      const adCtr = bestAd.impressions > 0 ? ((bestAd.clicks / bestAd.impressions) * 100).toFixed(2) : null;
      list.push({ tone: "success", icon: "🏆", title: `Best ad: "${bestAd.name}" at ${adRoas}× ROAS`, body: `CTR: ${adCtr ? adCtr + "%" : "—"} · Spend: ${fmtDec(bestAd.spend, currency)} · Value: ${fmtDec(bestAd.value, currency)} · ${bestAd.purchases} purchases. Consider duplicating this creative.` });
    }

    // Unknown revenue dominance
    const unknownEntry = sourceSummary.find(s => s.source === "unknown");
    const unknownShare = unknownEntry ? Math.round((unknownEntry.revenue / rev30) * 100) : 0;
    if (unknownShare > 60 && rev30 > 0) {
      list.push({ tone: "info", icon: "💡", title: `${unknownShare}% of revenue has no tracked source`, body: `${fmtDec(unknownEntry.revenue, currency)} is coming from direct/unknown traffic — likely returning customers, email, or organic. Add UTM tags to all paid links to get full visibility.` });
    }

    // Google spend, no attributed orders
    if (googleSpend > 0) {
      const googleOrders = (sourceSummary.find(s => s.source === "google")?.orders) ?? 0;
      if (googleOrders === 0) {
        list.push({ tone: "warning", icon: "⚠️", title: "Google Ads spend but no attributed orders", body: `${fmtDec(googleSpend, currency)} spent on Google with 0 tracked conversions. Check that your Google Ads landing URLs include utm_source=google.` });
      }
    }

    return list;
  }, [data, metaRoas, aov, currency]);

  const pixelBadge = {
    healthy: { tone: "success", label: "Pixel active" },
    warning:  { tone: "warning",  label: "Pixel inactive >24h" },
    error:    { tone: "critical", label: "Pixel not seen" },
    never:    { tone: "critical", label: "Pixel never seen" },
  }[data.pixelStatus];

  const purchaseRows = (data.recentPurchases || []).map((p) => [
    <Text key={p.orderId} as="span" variant="bodySm">{p.orderId || "—"}</Text>,
    <Text as="span" variant="bodySm">{fmt(p.totalValue, p.currency)}</Text>,
    p.utmSource
      ? <Badge tone={sourceTone(p.utmSource)}>{p.utmSource}</Badge>
      : <Text as="span" variant="bodySm" tone="subdued">direct</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{p.utmCampaign || "—"}</Text>,
    <Text as="span" variant="bodySm" tone="subdued">{formatDate(p.createdAt)}</Text>,
  ]);

  return (
    <Page
      title="Overview"
      subtitle={data.shop}
    >
      <BlockStack gap="500">

        {/* Status bar */}
        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <InlineStack gap="300" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">STATUS</Text>
              <Badge tone={pixelBadge.tone}>{pixelBadge.label}</Badge>
              <Badge tone={data.metaConnected ? "success" : "new"}>Meta {data.metaConnected ? "connected" : "not connected"}</Badge>
              <Badge tone={data.googleConnected ? "success" : "new"}>Google {data.googleConnected ? "connected" : "not connected"}</Badge>
            </InlineStack>
            {(data.pixelStatus !== "healthy" || !data.metaConnected || !data.googleConnected) && (
              <Button size="slim" variant="plain" onClick={() => navigate("/app/ads")}>Set up →</Button>
            )}
          </InlineStack>
        </Card>

        {/* KPI row */}
        <Grid>
          {[
            { title: "Revenue (30d)", value: fmt(data.rev30, currency), sub: `${fmt(data.rev7, currency)} last 7 days` },
            { title: "Orders (30d)", value: String(data.orders30), sub: `${data.orders7} last 7 days` },
            { title: "Blended ROAS", value: roas !== null ? Math.round(roas * 100) + "%" : "—", sub: roas !== null ? `${fmtDec(data.totalSpend, currency)} total spend` : "Connect an ad account", tone: roas !== null && roas >= 2 ? "success" : undefined },
            { title: "Ad Spend (7d)", value: data.totalSpend > 0 ? fmt(data.totalSpend, currency) : "—", sub: data.totalSpend > 0 ? "Meta + Google" : "Connect an ad account" },
          ].map((kpi) => (
            <Grid.Cell key={kpi.title} columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{kpi.title}</Text>
                  <Text as="p" variant="heading2xl" tone={kpi.tone}>{kpi.value}</Text>
                  {kpi.sub && <Text as="p" variant="bodySm" tone="subdued">{kpi.sub}</Text>}
                </BlockStack>
              </Card>
            </Grid.Cell>
          ))}
        </Grid>

        {/* Ads platforms */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">Meta Ads</Text>
                    <Badge tone={data.metaConnected ? "success" : "new"}>{data.metaConnected ? "Connected" : "Not connected"}</Badge>
                  </InlineStack>
                  <Button size="slim" variant="plain" onClick={() => navigate("/app/meta-ads")}>Details →</Button>
                </InlineStack>
                {data.metaConnected && (data.metaSpend > 0 || data.metaRev7 > 0) ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Spend (7d)</Text>
                      <Text as="p" variant="headingMd">{fmt(data.metaSpend, currency)}</Text>
                      {typeof data.metaSpendDelta === "number" && (data.metaSpendPrev || 0) > 0 && (
                        <Text as="p" variant="bodySm" tone={data.metaSpendDelta >= 0 ? "success" : "critical"}>
                          {data.metaSpendDelta >= 0 ? "▲" : "▼"} {Math.abs(data.metaSpendDelta)}% vs last week
                        </Text>
                      )}
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Sales (7d)</Text>
                      <Text as="p" variant="headingMd">{fmt(data.metaRev7, currency)}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">ROAS</Text>
                      <Text as="p" variant="headingMd" tone={metaRoas7 !== null && metaRoas7 >= 2 ? "success" : undefined}>
                        {metaRoas7 !== null ? metaRoas7.toFixed(2) + "×" : "—"}
                      </Text>
                    </BlockStack>
                  </div>
                ) : (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {data.metaConnected ? "No spend data yet — sync may still be running." : "Connect Meta Ads to track spend and ROAS."}
                    </Text>
                    {!data.metaConnected && <Button size="slim" onClick={() => navigate("/app/integrations/meta")}>Connect Meta</Button>}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">Google Ads</Text>
                    <Badge tone={data.googleConnected ? "success" : "new"}>{data.googleConnected ? "Connected" : "Not connected"}</Badge>
                  </InlineStack>
                  <Button size="slim" variant="plain" onClick={() => navigate("/app/google-ads")}>Details →</Button>
                </InlineStack>
                {data.googleConnected && (data.googleSpend > 0 || data.googleRev7 > 0) ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Spend (7d)</Text>
                      <Text as="p" variant="headingMd">{fmt(data.googleSpend, currency)}</Text>
                      {typeof data.googleSpendDelta === "number" && (data.googleSpendPrev || 0) > 0 && (
                        <Text as="p" variant="bodySm" tone={data.googleSpendDelta >= 0 ? "success" : "critical"}>
                          {data.googleSpendDelta >= 0 ? "▲" : "▼"} {Math.abs(data.googleSpendDelta)}% vs last week
                        </Text>
                      )}
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Sales (7d)</Text>
                      <Text as="p" variant="headingMd">{fmt(data.googleRev7, currency)}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">ROAS</Text>
                      <Text as="p" variant="headingMd" tone={googleRoas7 !== null && googleRoas7 >= 2 ? "success" : undefined}>
                        {googleRoas7 !== null ? googleRoas7.toFixed(2) + "×" : "—"}
                      </Text>
                    </BlockStack>
                  </div>
                ) : (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {data.googleConnected ? "No spend data yet — sync may still be running." : "Connect Google Ads to track spend and ROAS."}
                    </Text>
                    {!data.googleConnected && <Button size="slim" onClick={() => navigate("/app/integrations/google")}>Connect Google</Button>}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Tools summary */}
        <Card>
          <BlockStack gap="400">
            <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">YOUR TOOLS</Text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
              <BlockStack gap="150">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">MARKETING</Text>
                {[
                  { title: "Newsletter", stat: `${data.featureHub?.subscriberCount || 0} subscribers`, badge: data.featureHub?.newSubscribersUnseen || 0, url: "/app/newsletter" },
                  { title: "Lead Center", stat: `${data.featureHub?.leadCount || 0} leads`, badge: data.featureHub?.newLeadsUnseen || 0, url: "/app/leads" },
                  { title: "Reviews", stat: data.featureHub?.avgRating ? `${data.featureHub.avgRating}★ · ${data.featureHub.totalReviews}` : `${data.featureHub?.totalReviews || 0} reviews`, badge: data.featureHub?.newReviewsUnseen || 0, url: "/app/reviews" },
                ].map(item => (
                  <div key={item.title} onClick={() => navigate(item.url)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: "#fafafa" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f1f3f5")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fafafa")}
                  >
                    <Text as="p" variant="bodySm">{item.title}</Text>
                    <InlineStack gap="150" blockAlign="center">
                      {item.badge > 0 && (
                        <div style={{ background: "#dc2626", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>+{item.badge}</div>
                      )}
                      <Text as="p" variant="bodySm" tone="subdued">{item.stat}</Text>
                    </InlineStack>
                  </div>
                ))}
              </BlockStack>

              <BlockStack gap="150">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">STORE</Text>
                {[
                  { title: "Orders", stat: `${data.orders30} orders (30d)`, url: "/app/orders" },
                  { title: "SEO Audit", stat: "Score your products", url: "/app/seo" },
                  { title: "Product Feeds", stat: "Google & Meta", url: "/app/feeds" },
                ].map(item => (
                  <div key={item.title} onClick={() => navigate(item.url)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: "#fafafa" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f1f3f5")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fafafa")}
                  >
                    <Text as="p" variant="bodySm">{item.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{item.stat}</Text>
                  </div>
                ))}
              </BlockStack>

              <BlockStack gap="150">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">SETTINGS</Text>
                {[
                  { title: "Integrations", stat: `${[data.metaConnected, data.googleConnected].filter(Boolean).length} of 2 connected`, url: "/app/ads" },
                  { title: "Tracking & Pixel", stat: data.pixelStatus === "healthy" ? "Active" : "Inactive", url: "/app/settings" },
                  { title: "Buy Now Button", stat: data.pixelStatus === "healthy" ? "Active" : "Set up", url: "/app/buy-now" },
                ].map(item => (
                  <div key={item.title} onClick={() => navigate(item.url)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: "#fafafa" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f1f3f5")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fafafa")}
                  >
                    <Text as="p" variant="bodySm">{item.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{item.stat}</Text>
                  </div>
                ))}
              </BlockStack>
            </div>
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

        {/* Source breakdown */}
        {data.sourceSummary.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">REVENUE BY SOURCE — LAST 30 DAYS</Text>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {data.sourceSummary.map(({ source, orders, revenue, share, visitors }) => {
                  const cvr = visitors > 0 ? ((orders / visitors) * 100).toFixed(1) + "%" : null;
                  const spend = source === "meta" ? data.metaSpend : source === "google" ? data.googleSpend : 0;
                  const srcRoas = spend > 0 ? Math.round((revenue / spend) * 100) + "%" : null;
                  return (
                    <div key={source} style={{ border: "1px solid #e1e3e5", borderRadius: 12, padding: "16px 20px", minWidth: 150, background: "#fff" }}>
                      <BlockStack gap="100">
                        <Text as="p" variant="heading2xl" fontWeight="bold">{share}%</Text>
                        <Badge tone={sourceTone(source)}>{source}</Badge>
                        <Text as="p" variant="bodySm" tone="subdued">{orders} orders · {fmt(revenue, currency)}</Text>
                        {cvr && <Text as="p" variant="bodySm" tone="subdued">CVR {cvr}</Text>}
                        {srcRoas && <Text as="p" variant="bodySm" tone="subdued">ROAS {srcRoas}</Text>}
                      </BlockStack>
                    </div>
                  );
                })}
              </div>
            </BlockStack>
          </Card>
        )}

        {/* Recent orders */}
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
                No attributed orders yet. Make sure the pixel is installed and tracking is enabled.
              </Text>
            )}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
