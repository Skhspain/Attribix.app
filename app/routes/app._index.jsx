// app/routes/app._index.jsx
import { json } from "@remix-run/node";
import { channelFromCampaign, orderSource, bucketRank } from "~/utils/orderSource";
import { useLoaderData, useNavigate, useFetcher, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Badge, Banner, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Select, Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { SourceDefinitions } from "~/components/SourceDefinitions";
import db from "~/db.server";
import { periodStart, previousPeriod } from "~/utils/reportPeriod";
import { useReportPeriod } from "~/utils/useReportPeriod";
import { getReportingCurrency } from "~/services/reportingCurrency.server";
import { adAccountRates } from "~/services/adCurrency.server";
import { formatRoas } from "~/utils/roas";
import { buildOverviewActions } from "~/utils/overviewActions";
import { ActionCards } from "~/components/overview/ActionCards";
import { ToolsCard } from "~/components/overview/ToolsCard";
import { InfoPopover } from "~/components/overview/InfoPopover";
import { OverviewTour } from "~/components/overview/OverviewTour";
import { useStored } from "~/components/overview/storage";

const PERIODS = ["7", "14", "30", "90"];

// ─── LOADER ──────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db;
  const reqUrl = new URL(request.url);

  // Every figure on this page covers the same period (see utils/reportPeriod).
  const asked = reqUrl.searchParams.get("days");
  const PERIOD_DAYS = PERIODS.includes(asked) ? Number(asked) : 30;
  const since = periodStart(PERIOD_DAYS);
  const { start: prevStart } = previousPeriod(PERIOD_DAYS);
  // "Steady for 3 weeks" needs 21 days of campaign data whatever the period.
  const since21 = periodStart(21);
  const campaignSince = since21 < since ? since21 : since;

  // Sales channel for older orders, so offline orders (draft orders/invoices,
  // POS) aren't counted as unseen visits. Only missing ones are fetched.
  const { fillSalesChannels } = await import("~/services/salesChannel.server");
  await Promise.race([
    fillSalesChannels(shop, admin, since),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => null);

  const [settings, metaConn, googleConn, purchases, adSpendRows, metaCampaignRows, purchasePrevAgg] = await Promise.all([
    db.trackingSettings.findUnique({ where: { shop } }).catch(() => null),
    db.metaConnection.findUnique({ where: { shop } }).catch(() => null),
    db.googleConnection.findUnique({ where: { shop } }).catch(() => null),
    db.purchase.findMany({
      where: { shop, createdAt: { gte: since } },
      select: {
        totalValue: true, utmSource: true, utmMedium: true, utmCampaign: true,
        fbclid: true, gclid: true, ttclid: true, msclkid: true,
        createdAt: true, visitorId: true, sessionId: true, landingPage: true, referrer: true, salesChannel: true,
      },
    }).catch(() => []),
    db.adSpendDaily.findMany({
      where: { shop, date: { gte: prevStart } },
      select: { platform: true, spend: true, date: true },
    }).catch(() => []),
    anyDb.metaCampaignDailyInsight?.findMany?.({
      where: { shop, date: { gte: campaignSince } },
      select: { campaignId: true, campaignName: true, date: true, spend: true, clicks: true, purchases: true, purchaseValue: true },
    }).catch(() => []) ?? [],
    db.purchase.aggregate({
      where: { shop, createdAt: { gte: prevStart, lt: since } },
      _sum: { totalValue: true },
      _count: true,
    }).catch(() => ({ _sum: { totalValue: null }, _count: 0 })),
  ]);

  const revenue = purchases.reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const orders = purchases.length;
  const revenuePrev = Number(purchasePrevAgg._sum?.totalValue || 0);
  const ordersPrev = Number(purchasePrevAgg._count || 0);
  const pctDelta = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null);

  // Daily totals for the sparklines.
  const dayIndex = (d) => Math.floor((new Date(d).getTime() - since.getTime()) / 864e5);
  const dailyRevenue = Array(PERIOD_DAYS).fill(0);
  const dailyOrders = Array(PERIOD_DAYS).fill(0);
  for (const p of purchases) {
    const i = dayIndex(p.createdAt);
    if (i >= 0 && i < PERIOD_DAYS) { dailyRevenue[i] += Number(p.totalValue || 0); dailyOrders[i]++; }
  }

  // Shopify's own order count for the same period, so a missed webhook shows
  // up as "35 of 41 Shopify orders" instead of silently lower numbers.
  const shopifyOrders = await Promise.race([
    admin.graphql(`#graphql
      query OrdersCount($q: String!) { ordersCount(query: $q) { count precision } }`,
      { variables: { q: `created_at:>='${since.toISOString()}'` } })
      .then((r) => r.json())
      .then((j) => (typeof j?.data?.ordersCount?.count === "number" ? j.data.ordersCount.count : null)),
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]).catch(() => null);

  const { getSetupStatus } = await import("~/services/setupStatus.server");
  const setup = await getSetupStatus(shop);

  const storeCurrency = await getReportingCurrency(shop, admin);
  const rates = await adAccountRates(shop, storeCurrency);

  const isMeta = (r) => String(r.platform).toLowerCase().includes("meta") || String(r.platform).toLowerCase().includes("facebook");
  const isGoogle = (r) => String(r.platform).toLowerCase().includes("google");
  const inPeriod = (r) => new Date(r.date) >= since;
  const inPrevPeriod = (r) => new Date(r.date) >= prevStart && new Date(r.date) < since;
  // Spend is stored in each ad account's currency; convert to the store currency.
  const converted = (r) => Number(r.spend || 0) * (isGoogle(r) ? rates.google.rate : isMeta(r) ? rates.meta.rate : 1);
  const sum = (rows) => rows.reduce((s, r) => s + converted(r), 0);
  const metaSpend = sum(adSpendRows.filter((r) => isMeta(r) && inPeriod(r)));
  const googleSpend = sum(adSpendRows.filter((r) => isGoogle(r) && inPeriod(r)));
  const totalSpend = sum(adSpendRows.filter(inPeriod));
  const totalSpendPrev = sum(adSpendRows.filter(inPrevPeriod));

  // Meta campaign days in store currency, for the "What to do next" rules.
  const campaignDays = metaCampaignRows.map((r) => ({
    campaignId: String(r.campaignId), campaignName: r.campaignName ?? null, date: r.date,
    spend: Number(r.spend || 0) * rates.meta.rate, clicks: Number(r.clicks || 0),
    purchases: Number(r.purchases || 0), value: Number(r.purchaseValue || 0) * rates.meta.rate,
  }));

  // Overview, Orders and the other reports classify orders the same way.
  const sourceMap = new Map();
  for (const p of purchases) {
    const src = orderSource(p);
    const cur = sourceMap.get(src) || { orders: 0, revenue: 0 };
    cur.orders++;
    cur.revenue += Number(p.totalValue || 0);
    sourceMap.set(src, cur);
  }
  // Attributed channels first (by revenue), then direct/referral, with
  // untracked last so it can't read as the top "source".
  const sources = Array.from(sourceMap.entries())
    .sort((a, b) => bucketRank(a[0]) - bucketRank(b[0]) || b[1].revenue - a[1].revenue)
    .map(([source, r]) => ({ source, orders: r.orders, revenue: r.revenue }));

  const pixelLastSeen = settings?.pixelLastSeenAt ? new Date(settings.pixelLastSeenAt) : null;
  const hoursSincePixel = pixelLastSeen ? (Date.now() - pixelLastSeen.getTime()) / 3600000 : null;
  const pixelStatus = hoursSincePixel === null ? "never" : hoursSincePixel < 24 ? "healthy" : hoursSincePixel < 168 ? "warning" : "error";

  const metaConnected = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && metaConn.adAccountId);
  // OAuth done but ad account not yet selected — show a warning rather than "not connected"
  const metaPartialConnect = !!(metaConn?.accessToken && metaConn.accessToken !== "__PENDING__" && !metaConn.adAccountId);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);
  const googlePartialConnect = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && !googleConn.adCustomerId);

  if (reqUrl.searchParams.get("skip") === "1") {
    await db.trackingSettings.upsert({
      where: { shop },
      create: { shop, onboardingCompletedAt: new Date() },
      update: { onboardingCompletedAt: new Date() },
    }).catch(() => null);
  }
  const onboardingCompleted = !!(settings?.onboardingCompletedAt) || reqUrl.searchParams.get("skip") === "1";
  const isNewInstall = !onboardingCompleted && !metaConnected && !googleConnected && orders === 0 && pixelStatus === "never";

  const notAttributed = ["direct", "untracked", "offline"];
  const offlineOrders = purchases.filter((p) => orderSource(p) === "offline").length;
  const onlineOrders = orders - offlineOrders;
  const onlineAttributed = purchases.filter((p) => !notAttributed.includes(orderSource(p))).length;
  const tracking = {
    onlineOrders, onlineAttributed, offlineOrders,
    notTrackedOrders: purchases.filter((p) => orderSource(p) === "untracked").length,
    directOrders: purchases.filter((p) => orderSource(p) === "direct").length,
    attributionRate: onlineOrders > 0 ? Math.round((onlineAttributed / onlineOrders) * 100) : 0,
  };

  const [subscriberCount, totalReviews, leadCount, campaignsSent] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }).catch(() => 0),
    db.review.count({ where: { shop, status: "approved" } }).catch(() => 0),
    db.lead.count({ where: { shop } }).catch(() => 0),
    db.newsletterCampaign.count({ where: { shop, status: "sent" } }).catch(() => 0),
  ]);

  const actions = buildOverviewActions({
    periodDays: PERIOD_DAYS,
    currency: storeCurrency,
    orders, revenue, pixelStatus, metaConnected, googleConnected,
    googleSyncError: googleConnected ? googleConn?.lastSyncError ?? null : null,
    tracking,
    metaCampaignDays: campaignDays.filter((r) => new Date(r.date) >= since),
    metaCampaignDays21: campaignDays.filter((r) => new Date(r.date) >= since21),
    sources,
    tools: { newsletterCampaignsSent: campaignsSent, totalReviews },
  });

  return json({
    periodDays: PERIOD_DAYS,
    periodStart: since.toISOString(),
    revenue, orders, shopifyOrders, setup,
    revenueDelta: pctDelta(revenue, revenuePrev),
    ordersDelta: pctDelta(orders, ordersPrev),
    aovDelta: orders > 0 && ordersPrev > 0 ? pctDelta(revenue / orders, revenuePrev / ordersPrev) : null,
    prevRoas: totalSpendPrev > 0 && revenuePrev > 0 ? revenuePrev / totalSpendPrev : null,
    dailyRevenue, dailyOrders,
    totalSpend, metaSpend, googleSpend,
    storeCurrency,
    freshness: {
      metaSyncedAt: metaConn?.lastSyncedAt ?? null,
      googleSyncedAt: googleConn?.lastSyncedAt ?? null,
      googleSyncError: googleConn?.lastSyncError ?? null,
    },
    tracking, sources, actions,
    pixelStatus,
    pixelLastSeen: pixelLastSeen?.toISOString() ?? null,
    metaConnected, metaPartialConnect,
    googleConnected, googlePartialConnect,
    isNewInstall,
    toolUsage: {
      meta: metaConnected, google: googleConnected,
      newsletter: campaignsSent > 0 || subscriberCount > 0,
      leads: leadCount > 0, reviews: totalReviews > 0,
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

const SOURCE_CFG = {
  meta:      { color: "#0866FF", label: "Meta Ads" },
  google:    { color: "#4285F4", label: "Google Ads" },
  google_organic: { color: "#34A853", label: "Google search (unpaid)" },
  meta_organic:   { color: "#6B8AF0", label: "Facebook/Instagram (unpaid)" },
  email:     { color: "#F59E0B", label: "Email" },
  tiktok:    { color: "#010101", label: "TikTok" },
  snapchat:  { color: "#E6D800", label: "Snapchat" },
  bing:      { color: "#00A4EF", label: "Bing" },
  yahoo:     { color: "#6001D2", label: "Yahoo" },
  sms:       { color: "#14B8A6", label: "SMS" },
  referral:  { color: "#8B5CF6", label: "Other websites" },
  direct:    { color: "#6B7280", label: "Direct visits" },
  offline:   { color: "#A16207", label: "Not online (draft order/POS)" },
  untracked: { color: "#D1D5DB", label: "Not tracked" },
};
const sourceCfg = (s) => SOURCE_CFG[s] || { color: "#9CA3AF", label: s.charAt(0).toUpperCase() + s.slice(1) };

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function Sparkline({ values = [], color = "#2b59c3" }) {
  if (!values || values.length < 2 || !values.some((v) => v > 0)) return <div style={{ height: 28 }} />;
  const W = 200, H = 28;
  const max = Math.max(...values, 0.001);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: H }} aria-hidden="true">
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({ delta, label }) {
  if (delta === null || delta === undefined) return <Text as="p" variant="bodySm" tone="subdued">No earlier period to compare</Text>;
  const up = delta >= 0;
  return (
    <Text as="p" variant="bodySm" tone="subdued">
      <span style={{ color: up ? "#1a7f4b" : "#b42318", fontWeight: 600 }}>{up ? "▲" : "▼"} {Math.abs(delta)}%</span> {label}
    </Text>
  );
}

function Kpi({ term, label, value, children, badge }) {
  return (
    <Card>
      <BlockStack gap="100">
        <InlineStack gap="100" blockAlign="center" wrap={false}>
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <InfoPopover term={term} />
          {badge}
        </InlineStack>
        <Text as="p" variant="heading2xl">{value}</Text>
        {children}
      </BlockStack>
    </Card>
  );
}

function Hint({ show, children }) {
  if (!show) return null;
  return (
    <div style={{ background: "#f6f7f9", borderRadius: 8, padding: "8px 10px" }}>
      <Text as="p" variant="bodySm" tone="subdued">{children}</Text>
    </div>
  );
}

function SourcesCard({ sources, revenue, currency, metaSpend, googleSpend, showHints, navigate }) {
  const rows = sources.filter((s) => s.revenue > 0);
  if (!rows.length) return null;
  const cell = { padding: "9px 6px", borderBottom: "1px solid #ebebeb", whiteSpace: "nowrap" };
  const head = { ...cell, fontSize: 12, fontWeight: 600, color: "#616161", textAlign: "left" };
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" gap="200">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">Where your sales came from</Text>
            <Text as="p" variant="bodySm" tone="subdued">{fmt(revenue, currency)} across {rows.length} channel{rows.length === 1 ? "" : "s"}</Text>
          </BlockStack>
          <Button variant="plain" onClick={() => navigate("/app/analytics")}>Open Analytics →</Button>
        </InlineStack>
        <div role="img" aria-label="Share of sales by channel" style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "#f1f2f4" }}>
          {rows.map((s) => (
            <div key={s.source} title={sourceCfg(s.source).label} style={{ width: `${(s.revenue / revenue) * 100}%`, background: sourceCfg(s.source).color }} />
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th style={head}>Channel</th>
                <th style={{ ...head, textAlign: "right" }}>Orders</th>
                <th style={{ ...head, textAlign: "right" }}>Sales</th>
                <th style={{ ...head, textAlign: "right" }}>Share</th>
                <th style={{ ...head, textAlign: "right" }}>Ad spend</th>
                <th style={{ ...head, textAlign: "right" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const spend = s.source === "meta" ? metaSpend : s.source === "google" ? googleSpend : 0;
                // Only with enough tracked orders to mean anything.
                const roas = spend > 0 && s.orders >= 5 ? s.revenue / spend : null;
                const tone = roas === null ? null : roas >= 3 ? ["#e3f4ea", "#1a7f4b"] : roas >= 1 ? ["#fdf1d8", "#8a5a00"] : ["#fde8e6", "#b42318"];
                return (
                  <tr key={s.source} onClick={() => navigate("/app/analytics")} style={{ cursor: "pointer" }}>
                    <td style={cell}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: sourceCfg(s.source).color, marginRight: 8, verticalAlign: -1 }} />
                      {sourceCfg(s.source).label}
                    </td>
                    <td style={{ ...cell, textAlign: "right" }}>{s.orders}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{fmt(s.revenue, currency)}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{Math.round((s.revenue / revenue) * 100)}%</td>
                    <td style={{ ...cell, textAlign: "right", color: spend ? undefined : "#8a8a8a" }}>{spend ? fmt(spend, currency) : "—"}</td>
                    <td style={{ ...cell, textAlign: "right" }}>
                      {roas === null ? <span style={{ color: "#8a8a8a" }}>{spend > 0 ? "Too few orders" : "—"}</span> : (
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: tone[0], color: tone[1] }}>{formatRoas(roas)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Hint show={showHints}>
          ROAS here only counts the orders Attribix could link to that ad platform, so it's usually lower than what Meta or Google report. “Not tracked” means we never saw the customer's visit (declined cookies, ad blocker or another device); those sales still count in your totals.
        </Hint>
        {showHints && <SourceDefinitions />}
      </BlockStack>
    </Card>
  );
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

// ─── ONBOARDING ──────────────────────────────────────────────────────────────

function Onboarding({ data, navigate }) {
  const steps = [
    { title: "Turn on tracking", body: "Lets Attribix see visits to your store, so orders can be linked to the ad or channel that brought the customer in.", url: "/app/setup", cta: "Check tracking", done: data.pixelStatus === "healthy" },
    { title: "Connect Meta Ads", body: "Brings in your Facebook and Instagram ad spend.", url: "/app/integrations/meta?from=onboarding", cta: "Connect Meta", done: data.metaConnected },
    { title: "Connect Google Ads", body: "Brings in your Google ad spend.", url: "/app/integrations/google?from=onboarding", cta: "Connect Google", done: data.googleConnected },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Page title="Welcome to Attribix" subtitle="See which ads and channels bring in your sales.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Get your first report in {steps.length} steps</Text>
              <Text as="p" variant="bodySm" tone="subdued">{done} of {steps.length} done. Most stores finish in about 10 minutes.</Text>
            </BlockStack>
            <div style={{ height: 6, borderRadius: 999, background: "#f1f2f4", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(done / steps.length) * 100}%`, background: "#1a7f4b" }} />
            </div>
            <BlockStack gap="200">
              {steps.map((s, i) => (
                <div key={s.title} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) auto", gap: "0 12px", alignItems: "center", border: "1px solid #e3e3e3", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, background: s.done ? "#1a7f4b" : "transparent", color: s.done ? "#fff" : "#616161", border: s.done ? "none" : "1.5px solid #d4d4d4" }}>{s.done ? "✓" : i + 1}</div>
                  <BlockStack gap="025">
                    <Text as="p" variant="headingSm">{s.title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{s.body}</Text>
                  </BlockStack>
                  {s.done ? <Text as="p" variant="bodySm" tone="subdued">Done</Text> : <Button size="slim" variant={i === next ? "primary" : undefined} onClick={() => navigate(s.url)}>{s.cta}</Button>}
                </div>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <div style={{ position: "relative" }}>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">What you'll see once orders come in</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Example numbers from a store like yours.</Text>
                </BlockStack>
                <Badge tone="magic">Example</Badge>
              </InlineStack>
              <div style={{ opacity: 0.55, pointerEvents: "none", display: "grid", gap: 12 }} aria-hidden="true">
                <Text as="p" variant="bodyLg">In the last 30 days you had <b>412 orders</b> and <b>NOK 186,400</b> in sales. Every NOK 100 spent on ads matched NOK 488 in sales.</Text>
                <InlineGrid columns={{ xs: 2, md: 4 }} gap="200">
                  {[["Sales", "NOK 186,400"], ["Orders", "412"], ["ROAS", "488%"], ["Average order", "NOK 452"]].map(([l, v]) => (
                    <div key={l} style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: 12 }}>
                      <Text as="p" variant="bodySm" tone="subdued">{l}</Text>
                      <Text as="p" variant="headingLg">{v}</Text>
                    </div>
                  ))}
                </InlineGrid>
                <div style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: 12 }}>
                  <Text as="p" variant="headingSm">“Shopping – Bestsellers” has stayed above 300% ROAS for 3 weeks</Text>
                  <Text as="p" variant="bodySm" tone="subdued">An example of the suggestions Attribix gives you.</Text>
                </div>
              </div>
            </BlockStack>
          </Card>
        </div>

        <InlineStack align="end" gap="200">
          <Button variant="plain" onClick={() => navigate("/app?skip=1")}>Skip setup</Button>
          {done > 0 && <Button variant="primary" onClick={() => navigate("/app?skip=1")}>Go to Overview</Button>}
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AppIndex() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currency = data.storeCurrency || "NOK";
  const pixelEnsureFetcher = useFetcher();
  const importFetcher = useFetcher();
  const [period, setPeriod] = useReportPeriod(PERIODS);
  const [tipsOff, setTipsOff] = useStored("attribix.overviewTipsOff", false);
  const [tourSeen, setTourSeen, tourLoaded] = useStored("attribix.overviewTourSeen", false);
  const [tourStep, setTourStep] = useState(-1);
  const [healthOpen, setHealthOpen] = useState(null);
  const showHints = !tipsOff;

  useEffect(() => {
    pixelEnsureFetcher.submit({ accountID: "1" }, { method: "post", action: "/api/web-pixel/ensure" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The period lives in the browser (shared with the other reports); load it
  // here when the URL doesn't name one.
  useEffect(() => {
    if (!searchParams.get("days") && period !== String(data.periodDays)) {
      setSearchParams((p) => { p.set("days", period); return p; }, { replace: true, preventScrollReset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  if (data.isNewInstall) return <Onboarding data={data} navigate={navigate} />;

  const days = data.periodDays;
  const t = data.tracking;
  const revenue = data.revenue;
  const aov = data.orders > 0 ? revenue / data.orders : 0;
  // All sales ÷ all ad spend, same period. A blended figure: it includes
  // sales from every channel, not only ads.
  const roas = data.totalSpend > 0 ? revenue / data.totalSpend : null;
  const missingOrders = data.shopifyOrders !== null ? Math.max(0, data.shopifyOrders - data.orders) : 0;
  const trackingOk = data.pixelStatus === "healthy";
  const googleFailing = data.googleConnected && !!data.freshness?.googleSyncError;
  const googleStale = data.googleConnected && !data.freshness?.googleSyncedAt;
  const metaStale = data.metaConnected && (!data.freshness?.metaSyncedAt || Date.now() - new Date(data.freshness.metaSyncedAt).getTime() > 48 * 3600e3);
  // Connected platforms whose spend we can't vouch for this period. Any
  // figure built on spend is then partial, and says so.
  const spendGaps = [
    (googleFailing || googleStale) && "Google spend unavailable",
    metaStale && "Meta spend may be out of date",
  ].filter(Boolean);
  const spendPartial = spendGaps.length > 0;
  const healthy = trackingOk && !spendPartial && missingOrders === 0;
  // Details start open when something needs attention.
  const showHealth = healthOpen ?? !healthy;

  const adRevenue = data.sources.filter((s) => s.source === "meta" || s.source === "google").reduce((a, s) => a + s.revenue, 0);
  const linkedRevenue = data.sources.filter((s) => !["direct", "untracked", "offline"].includes(s.source)).reduce((a, s) => a + s.revenue, 0);

  const tourSteps = [
    { target: "ov-summary", title: "Start here", text: "One sentence that sums up your period: orders, sales, and how your ad spend compares. It's written from your data every time you open this page." },
    { target: "ov-kpis", title: "Your four key numbers", text: "Each shows the change from the period before. Click the small i on any card to see what it means and how it's calculated." },
    { target: "ov-actions", title: "What to do next", text: "Attribix checks your campaigns and tracking and lists what's worth acting on. Every card says why it appeared." },
    { target: "ov-sources", title: "Where your sales came from", text: "Every channel side by side, paid and unpaid. Open Analytics to dig into any of them." },
    { target: "ov-tools", title: "Everything Attribix can do", text: "Every tool in your plan, grouped by what it helps with. Click “Show me” to see how one works before you set it up." },
    { target: "ov-health", title: "Can you trust the numbers?", text: "A green light means tracking and ad syncing are working. If something breaks, it turns yellow and tells you what to fix." },
  ];
  const endTour = () => { setTourStep(-1); setTourSeen(true); };

  const periodOptions = PERIODS.map((p) => ({ label: `Last ${p} days`, value: p }));

  return (
    <Page title="Overview" subtitle={`${formatPeriod(data.periodStart)} · amounts in ${currency} · compared with the ${days} days before`}>
      <BlockStack gap="400">
        <InlineStack align="end" gap="200" blockAlign="center">
          <div style={{ minWidth: 150 }}>
            <Select label="Report period" labelHidden options={periodOptions} value={String(days)}
              onChange={(v) => { setPeriod(v); setSearchParams((p) => { p.set("days", v); return p; }, { preventScrollReset: true }); }} />
          </div>
          <Button onClick={() => setTourStep(0)}>Tour</Button>
          <Button variant="plain" onClick={() => setTipsOff(!tipsOff)}>{tipsOff ? "Show tips" : "Hide tips"}</Button>
        </InlineStack>

        {/* Orders Shopify has that Attribix never received */}
        {missingOrders > 0 && (
          <Banner
            tone="warning"
            title={`Attribix has ${data.orders} of ${data.shopifyOrders} Shopify orders from the last ${days} days`}
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
                  : "Sales, order counts and ROAS below leave these orders out until they're imported."}
            </p>
          </Banner>
        )}

        {showHints && tourLoaded && !tourSeen && (
          <div style={{ background: "#e8eefb", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <Text as="p" variant="bodyMd"><b>New to Attribix?</b> Take a 1-minute tour of what each part of this page tells you.</Text>
            <InlineStack gap="200">
              <Button variant="plain" onClick={() => setTourSeen(true)}>No thanks</Button>
              <Button variant="primary" onClick={() => setTourStep(0)}>Take the tour</Button>
            </InlineStack>
          </div>
        )}

        {/* Summary sentence */}
        <div id="ov-summary">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="headingMd" fontWeight="regular">
                In the last {days} days you had <b>{data.orders.toLocaleString("en-US")} order{data.orders === 1 ? "" : "s"}</b> and <b>{fmt(revenue, currency)}</b> in sales
                {data.revenueDelta !== null && (
                  <>, <span style={{ color: data.revenueDelta >= 0 ? "#1a7f4b" : "#b42318", fontWeight: 600 }}>{data.revenueDelta >= 0 ? "up" : "down"} {Math.abs(data.revenueDelta)}%</span> on the {days} days before</>
                )}.
                {roas !== null ? (
                  <>
                    {" "}Orders we could link to Meta or Google ads made up <b>{revenue > 0 ? Math.round((adRevenue / revenue) * 100) : 0}%</b> of sales.
                    {" "}Every {fmt(100, currency)} spent on ads matched <b>{fmt(roas * 100, currency)}</b> in sales (ROAS {formatRoas(roas)}){spendPartial ? ", but some spend is missing, so this is likely too high" : ""}.
                  </>
                ) : (
                  <> Connect your ad accounts to see how your ad spend compares with your sales.</>
                )}
              </Text>
              <Hint show={showHints}>This sentence is written from your latest data. If you only read one thing on this page, read this.</Hint>
            </BlockStack>
          </Card>
        </div>

        {/* Key numbers */}
        <div id="ov-kpis">
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
            <Kpi term="revenue" label="Sales" value={fmt(revenue, currency)}>
              <Sparkline values={data.dailyRevenue} />
              <Delta delta={data.revenueDelta} label="vs the period before" />
            </Kpi>
            <Kpi term="orders" label="Orders" value={data.orders.toLocaleString("en-US")}>
              <Sparkline values={data.dailyOrders} />
              <Delta delta={data.ordersDelta} label="vs the period before" />
            </Kpi>
            <Kpi term="roas" label="ROAS (all sales)" value={roas !== null ? formatRoas(roas) : "—"} badge={spendPartial && roas !== null ? <Badge tone="warning">Partial</Badge> : null}>
              <Text as="p" variant="bodySm" tone="subdued">{data.totalSpend > 0 ? `on ${fmt(data.totalSpend, currency)} ad spend` : "No ad spend in this period"}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {roas !== null && data.prevRoas !== null
                  ? <><span style={{ color: roas >= data.prevRoas ? "#1a7f4b" : "#b42318", fontWeight: 600 }}>{roas >= data.prevRoas ? "▲" : "▼"}</span> from {formatRoas(data.prevRoas)} the period before</>
                  : "No earlier period to compare"}
              </Text>
            </Kpi>
            <Kpi term="aov" label="Average order" value={aov > 0 ? fmt(aov, currency) : "—"}>
              <div style={{ height: 28 }} />
              <Delta delta={data.aovDelta} label="vs the period before" />
            </Kpi>
          </InlineGrid>
        </div>

        <div id="ov-actions">
          <ActionCards actions={data.actions} showHints={showHints} />
        </div>

        <div id="ov-sources">
          <SourcesCard sources={data.sources} revenue={revenue} currency={currency} metaSpend={data.metaSpend} googleSpend={data.googleSpend} showHints={showHints} navigate={navigate} />
        </div>

        {/* What Attribix did this period */}
        {showHints && data.orders > 0 && (
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            <Card><BlockStack gap="050"><Text as="p" variant="headingLg">{data.orders.toLocaleString("en-US")}</Text><Text as="p" variant="bodySm" tone="subdued">orders tracked in the last {days} days</Text></BlockStack></Card>
            <Card><BlockStack gap="050"><Text as="p" variant="headingLg">{revenue > 0 ? Math.round((linkedRevenue / revenue) * 100) : 0}%</Text><Text as="p" variant="bodySm" tone="subdued">of sales linked to a channel: an ad, email, search or another website</Text></BlockStack></Card>
            <Card><BlockStack gap="050"><Text as="p" variant="headingLg">{data.actions.length}</Text><Text as="p" variant="bodySm" tone="subdued">thing{data.actions.length === 1 ? "" : "s"} worth acting on, found by checking your campaigns and tracking</Text></BlockStack></Card>
          </InlineGrid>
        )}

        <div id="ov-tools">
          <ToolsCard usage={data.toolUsage} showHints={showHints} />
        </div>

        {/* Tracking health, one line unless something needs attention */}
        <div id="ov-health">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" gap="200">
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: healthy ? "#1a7f4b" : "#c27c00", boxShadow: `0 0 0 3px ${healthy ? "#e3f4ea" : "#fdf1d8"}` }} />
                  <Text as="p" variant="bodyMd">
                    <b>{healthy ? "Tracking is working." : "Tracking needs a look."}</b>{" "}
                    <Text as="span" tone="subdued">
                      {data.pixelLastSeen ? `Last visit seen ${timeAgo(data.pixelLastSeen)}` : "No visits seen yet"}
                      {data.metaConnected && data.freshness?.metaSyncedAt ? ` · Meta synced ${timeAgo(data.freshness.metaSyncedAt)}` : ""}
                      {data.googleConnected && data.freshness?.googleSyncedAt && !googleFailing ? ` · Google synced ${timeAgo(data.freshness.googleSyncedAt)}` : ""}
                    </Text>
                  </Text>
                </InlineStack>
                <Button variant="plain" onClick={() => setHealthOpen(!showHealth)}>{showHealth ? "Hide details" : "Details"}</Button>
              </InlineStack>
              {showHealth && (
                <BlockStack gap="300">
                  <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                    <HealthItem label="Storefront events" tone={trackingOk ? "success" : data.pixelStatus === "never" ? "critical" : "warning"}
                      value={data.pixelLastSeen ? `Last event ${timeAgo(data.pixelLastSeen)}` : "No events received yet"} />
                    <HealthItem label="Online orders linked to a channel" tone={t.onlineOrders === 0 ? "info" : t.attributionRate >= 60 ? "success" : "warning"}
                      value={t.onlineOrders === 0 ? "No online orders yet" : `${t.onlineAttributed} of ${t.onlineOrders} (${t.attributionRate}%)`}
                      detail={[t.notTrackedOrders > 0 && `${t.notTrackedOrders} not tracked`, t.offlineOrders > 0 && `${t.offlineOrders} offline (draft order/POS)`].filter(Boolean).join(" · ") || undefined} />
                    <HealthItem label="Meta Ads" tone={!data.metaConnected ? "info" : metaStale ? "warning" : "success"}
                      value={!data.metaConnected ? (data.metaPartialConnect ? "Choose an ad account" : "Not connected") : data.freshness?.metaSyncedAt ? `Synced ${timeAgo(data.freshness.metaSyncedAt)}` : "Not synced yet"} />
                    <HealthItem label="Google Ads" tone={!data.googleConnected ? "info" : googleFailing || googleStale ? "critical" : "success"}
                      value={!data.googleConnected ? (data.googlePartialConnect ? "Choose an ad account" : "Not connected") : googleFailing ? "Sync failing" : data.freshness?.googleSyncedAt ? `Synced ${timeAgo(data.freshness.googleSyncedAt)}` : "Never synced"}
                      detail={googleFailing ? data.freshness.googleSyncError : undefined} />
                  </InlineGrid>
                  <InlineStack>
                    <Button size="slim" url="/app/setup">Open setup guide</Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </div>

        <InlineStack gap="400" wrap>
          <Button variant="plain" onClick={() => navigate("/app/orders")}>Recent orders →</Button>
          <Button variant="plain" onClick={() => navigate("/app/journey")}>Customer journeys →</Button>
          <Button variant="plain" url="mailto:support@attribix.app">Contact support</Button>
        </InlineStack>
      </BlockStack>

      {tourStep >= 0 && <OverviewTour steps={tourSteps} step={tourStep} onStep={setTourStep} onEnd={endTour} />}
    </Page>
  );
}
