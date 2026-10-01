// app/routes/app.journey.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { Badge, Banner, BlockStack, Button, Card, InlineStack, Page, Text } from "@shopify/polaris";
import { periodStart } from "~/utils/reportPeriod";
import { offlineChannelLabel, orderSource } from "~/utils/orderSource";
import { formatDate } from "~/utils/formatDate";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const since30 = periodStart(30);

  // Fill in each order's sales channel from Shopify if it's missing, so
  // offline orders (draft orders/invoices, POS) aren't counted as unseen visits.
  const { fillSalesChannels } = await import("~/services/salesChannel.server");
  await Promise.race([
    fillSalesChannels(shop, admin, since30),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => null);

  // Same order list as Overview, so the two pages always agree.
  const purchases = await db.purchase.findMany({
    where: { shop, createdAt: { gte: since30 } },
    select: {
      orderId: true, totalValue: true, createdAt: true, salesChannel: true,
      visitorId: true, sessionId: true, landingPage: true, referrer: true,
      utmSource: true, fbclid: true, gclid: true, ttclid: true, msclkid: true,
    },
    take: 1000,
  }).catch(() => [] as any[]);

  const rows = await (db as any).purchaseTouchpoint.findMany({
    where: { shop, orderId: { in: purchases.map((p: any) => p.orderId) } },
    orderBy: [{ orderId: "asc" }, { position: "asc" }],
    select: {
      orderId: true, position: true, channel: true, utmSource: true,
      touchedAt: true, touchpointId: true,
    },
  }).catch(() => [] as any[]);
  const stepsByOrder = new Map<string, any[]>();
  for (const r of rows) {
    if (!stepsByOrder.has(r.orderId)) stepsByOrder.set(r.orderId, []);
    stepsByOrder.get(r.orderId)!.push(r);
  }

  // Normalize channel key
  function normCh(ch: string | null, src: string | null): string {
    const raw = (src || ch || "").toLowerCase().trim();
    // No visit data at all is "unknown", not a verified direct visit. Older
    // rows were stored as "Direct / Unknown", which is just as ambiguous.
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

  // Each order is exactly one of:
  //   full     — Attribix has visit history before the purchase (real path)
  //   source   — the source is known (campaign data, or the visit was seen at
  //              checkout) but there's no visit history to show a path
  //   offline  — draft order / invoice / POS: there was no website visit
  //   unknown  — an online order whose visit Attribix never saw
  // Paths, lengths and timing use full journeys only.
  type Kind = "full" | "source" | "offline" | "unknown";
  const journeys = purchases.map((p: any) => {
    const steps = (stepsByOrder.get(p.orderId) ?? []).sort((a: any, b: any) => a.position - b.position);
    const stepChannels = steps.map((st: any) => normCh(st.channel, st.utmSource));
    const hasHistory = steps.some((st: any) => st.touchpointId);
    const stepsKnown = stepChannels.some((c: string) => c !== "untracked");
    const bucket = orderSource(p);
    let kind: Kind;
    let channels: string[];
    if (hasHistory && stepsKnown) { kind = "full"; channels = stepChannels; }
    else if (bucket === "offline") { kind = "offline"; channels = []; }
    else if (stepsKnown) { kind = "source"; channels = [stepChannels.find((c: string) => c !== "untracked")!]; }
    else if (bucket !== "untracked") { kind = "source"; channels = [bucket]; }
    else { kind = "unknown"; channels = []; }

    let timeToPurchase = "Unknown";
    const firstTouched = kind === "full" && steps[0]?.touchpointId && steps[0]?.touchedAt ? new Date(steps[0].touchedAt) : null;
    if (firstTouched) {
      const diffHours = Math.max(0, new Date(p.createdAt).getTime() - firstTouched.getTime()) / 3600000;
      timeToPurchase = diffHours < 1 ? "< 1 hour"
        : diffHours < 24 ? `${Math.round(diffHours)}h`
        : `${Math.round(diffHours / 24)}d`;
    }
    return {
      orderId: String(p.orderId).split("/").pop() || p.orderId,
      kind, channels,
      offlineLabel: kind === "offline" ? offlineChannelLabel(p) : null,
      touchpoints: kind === "full" ? steps.length : null,
      revenue: Number(p.totalValue || 0),
      createdAt: p.createdAt,
      timeToPurchase,
    };
  });

  const ofKind = (k: Kind) => journeys.filter((j: any) => j.kind === k);
  const sumRev = (js: any[]) => js.reduce((s, j) => s + j.revenue, 0);
  const full = ofKind("full");
  const totalOrders = journeys.length;
  const capturedCount = full.length;
  const sourceOnlyCount = ofKind("source").length;
  const offlineCount = ofKind("offline").length;
  const unknownCount = ofKind("unknown").length;
  const knownRevenue = sumRev(full) + sumRev(ofKind("source"));
  const unknownRevenue = sumRev(ofKind("unknown"));
  const offlineRevenue = sumRev(ofKind("offline"));
  const multiTouchCount = full.filter((j: any) => j.touchpoints > 1).length;

  const { getReportingCurrency } = await import("~/services/reportingCurrency.server");
  const currency = await getReportingCurrency(shop, admin);

  const googleConn = await db.googleConnection.findUnique({ where: { shop } }).catch(() => null);
  const googleConnected = !!(googleConn?.accessToken && googleConn.accessToken !== "__PENDING__" && googleConn.adCustomerId);

  // Aggregate paths (full journeys only)
  const pathMap = new Map<string, { count: number; revenue: number; channels: string[] }>();
  for (const j of full) {
    const key = j.channels.join(" → ");
    const ex = pathMap.get(key) || { count: 0, revenue: 0, channels: j.channels };
    ex.count++;
    ex.revenue += j.revenue;
    pathMap.set(key, ex);
  }
  const topPaths = Array.from(pathMap.entries())
    .map(([path, v]) => ({ path, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topPath = topPaths[0] ?? null;

  // Journey length distribution (full journeys only)
  const len1 = full.filter((j: any) => j.touchpoints === 1).length;
  const len2 = full.filter((j: any) => j.touchpoints === 2).length;
  const len3plus = full.filter((j: any) => j.touchpoints >= 3).length;

  // Most informative first: full journeys, then known sources, then the rest.
  const kindRank: Record<Kind, number> = { full: 0, source: 1, offline: 2, unknown: 3 };
  // Every order in the period (the page shows 8 until "Show all"). Shopify
  // looks up at most 250 order names per request.
  const listed = [...journeys]
    .sort((a: any, b: any) => kindRank[a.kind as Kind] - kindRank[b.kind as Kind] || b.revenue - a.revenue)
    .slice(0, 250);

  // Merchants know orders by name ("#1042"), not by Shopify's internal id.
  const names = new Map<string, string>();
  const numericIds = listed.map((j: any) => String(j.orderId)).filter((id: string) => /^\d+$/.test(id));
  if (numericIds.length) {
    try {
      const res = await admin.graphql(`#graphql
        query OrderNames($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { legacyResourceId name } } }`,
        { variables: { ids: numericIds.map((id: string) => `gid://shopify/Order/${id}`) } });
      for (const n of ((await res.json())?.data?.nodes ?? []).filter(Boolean)) names.set(String(n.legacyResourceId), n.name);
    } catch {
      // Fall back to the id.
    }
  }
  const recentJourneys = listed.map((j: any) => ({
    ...j,
    name: names.get(String(j.orderId)) ?? null,
    date: j.createdAt ? formatDate(j.createdAt) : null,
  }));

  // Date range label
  const dateLabel = `${since30.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

  return json({
    totalOrders, capturedCount, sourceOnlyCount, offlineCount, unknownCount,
    knownRevenue, unknownRevenue, offlineRevenue,
    multiTouchCount, currency, googleConnected,
    topPath, topPaths, len1, len2, len3plus,
    recentJourneys, dateLabel,
  });
}

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_CFG: Record<string, { color: string; label: string; icon: string; textColor?: string }> = {
  direct:    { color: "#6B7280", label: "Direct (no referrer)", icon: "↗" },
  referral:  { color: "#8B5CF6", label: "Referral",  icon: "↪" },
  google_organic: { color: "#34A853", label: "Google (organic)", icon: "G" },
  meta_organic:   { color: "#6B8AF0", label: "Facebook/Instagram (organic)", icon: "f" },
  offline:   { color: "#A16207", label: "Not online", icon: "✎" },
  untracked: { color: "#D1D5DB", label: "Not tracked (visit unseen)", icon: "?", textColor: "#374151" },
  google:    { color: "#4285F4", label: "Google Ads",   icon: "G" },
  meta:      { color: "#0866FF", label: "Meta Ads",     icon: "M" },
  instagram: { color: "#C13584", label: "Instagram",    icon: "IG" },
  email:     { color: "#F59E0B", label: "Email",        icon: "✉" },
  tiktok:    { color: "#010101", label: "TikTok",       icon: "T" },
  snapchat:  { color: "#FFFC00", label: "Snapchat",     icon: "S", textColor: "#000" },
  bing:      { color: "#00A4EF", label: "Bing",         icon: "B" },
  yahoo:     { color: "#6001D2", label: "Yahoo",        icon: "Y" },
};

// One readable line about what's known for an order's journey.
function journeyDetail(j: any): string {
  const names = j.channels.map((ch: string) => SOURCE_CFG[ch]?.label || ch);
  if (j.kind === "full") {
    const visits = `${j.touchpoints} visit${j.touchpoints === 1 ? "" : "s"}`;
    const timing = j.timeToPurchase !== "Unknown" ? ` · first visit ${j.timeToPurchase === "< 1 hour" ? "under an hour" : j.timeToPurchase} before buying` : "";
    return `${names.join(" → ")} · ${visits}${timing}`;
  }
  if (j.kind === "source") return `${names[0]} · source only, no visit history`;
  if (j.kind === "offline") return j.offlineLabel ?? "Not an online order";
  return "Visit not seen · source unknown";
}

function fmt(v: number, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${currency} ${v}`; }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChannelBox({ channel, size = 48 }: { channel: string; size?: number }) {
  const cfg = SOURCE_CFG[channel] || { color: "#9CA3AF", label: channel, icon: "?" };
  const fontSize = size <= 28 ? 10 : size <= 36 ? 12 : 16;
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <span style={{ color: cfg.textColor || "white", fontSize, fontWeight: 700, lineHeight: 1 }}>
        {cfg.icon}
      </span>
    </div>
  );
}

function PurchaseBox({ size = 48 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.22),
      background: "#008060", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <span style={{ fontSize: size <= 28 ? 12 : 20 }}>🛒</span>
    </div>
  );
}

function Arrow({ size = 24 }: { size?: number }) {
  return <span style={{ color: "#D1D5DB", fontSize: size, fontWeight: 300, lineHeight: 1 }}>→</span>;
}

function DonutChart({ len1, len2, len3plus, total }: { len1: number; len2: number; len3plus: number; total: number }) {
  const labels = ["1 touchpoint", "2 touchpoints", "3+ touchpoints"];
  const r = 60;
  const circ = 2 * Math.PI * r;
  const cx = 80, cy = 80;

  // Segments: [value, color]
  const segments = [
    { value: len1, color: "#3B82F6", label: labels[0] },
    { value: len2, color: "#22C55E", label: labels[1] },
    { value: len3plus, color: "#F59E0B", label: labels[2] },
  ].filter(s => total > 0);

  // If all zero show grey placeholder
  if (total === 0) {
    return (
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={20} />
      </svg>
    );
  }

  // If only one non-zero segment → full circle
  const nonZero = segments.filter(s => s.value > 0);
  if (nonZero.length === 1) {
    const pct = Math.round((nonZero[0].value / total) * 100);
    return (
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={nonZero[0].color} strokeWidth={20} />
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#111">{pct}%</text>
        <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6B7280">{nonZero[0].label}</text>
      </svg>
    );
  }

  // Multi-segment
  let offset = 0;
  return (
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ transform: "rotate(-90deg)" }}>
      {segments.map((seg, i) => {
        const frac = seg.value / total;
        const dash = frac * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={20}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JourneyPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const {
    totalOrders, capturedCount, sourceOnlyCount, offlineCount, unknownCount,
    knownRevenue, unknownRevenue, offlineRevenue,
    multiTouchCount, currency, googleConnected,
    topPath, len1, len2, len3plus, recentJourneys, dateLabel,
  } = data;
  // Below this, patterns in full journeys are anecdotes, not behaviour.
  const onlineOrders = totalOrders - offlineCount;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const MIN_JOURNEYS_FOR_PATTERNS = 10;
  const enoughForPatterns = capturedCount >= MIN_JOURNEYS_FOR_PATTERNS;

  const topPathLabel = topPath
    ? topPath.channels.map((ch: string) => SOURCE_CFG[ch]?.label || ch).join(" → ") + " → Purchase"
    : "—";

  const topPathShare = topPath && capturedCount > 0
    ? Math.round((topPath.count / capturedCount) * 100)
    : 0;

  return (
    <Page>
      <BlockStack gap="500">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">Customer journeys</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              See the ads, channels and touchpoints that influenced each order before purchase.
            </Text>
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 14px",
              border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff",
              cursor: "default", fontSize: 13, color: "#374151",
            }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span>{dateLabel}</span>
            </div>
          </InlineStack>
        </div>

        {/* ── What the journeys include (instead of an always-green "Active") ── */}
        {totalOrders > 0 && (unknownCount > 0 || sourceOnlyCount > 0 || offlineCount > 0) && (
          <Banner
            tone={unknownCount > onlineOrders / 2 ? "warning" : "info"}
            title={capturedCount < onlineOrders / 2
              ? `Only ${capturedCount} of ${plural(onlineOrders, "online order")} ${capturedCount === 1 ? "has" : "have"} a full journey`
              : `Full journeys for ${capturedCount} of ${plural(onlineOrders, "online order")}`}
          >
            <BlockStack gap="100">
              {sourceOnlyCount > 0 && (
                <p>{`${plural(sourceOnlyCount, "order")}: source known, but no earlier visits recorded, so there's no path to show.`}</p>
              )}
              {unknownCount > 0 && (
                <p>{`${plural(unknownCount, "order")}: Attribix never saw the visit, so the source is unknown. Possible reasons include declined cookies, ad blockers or a different device.`}</p>
              )}
              {offlineCount > 0 && (
                <p>{`${plural(offlineCount, "order")} weren't placed online (draft orders, invoices or POS), so there was no visit to track. They're excluded from the figures above.`.replace("1 order weren't", "1 order wasn't")}</p>
              )}
              <p>Paths, journey lengths and timing below use full journeys only.</p>
            </BlockStack>
          </Banner>
        )}

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {/* Tracked journeys */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Orders (last 30 days)</Text>
                <span style={{ fontSize: 22 }}>👥</span>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">{totalOrders}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {[
                  `${capturedCount} full journey${capturedCount === 1 ? "" : "s"}`,
                  sourceOnlyCount > 0 && `${sourceOnlyCount} source only`,
                  unknownCount > 0 && `${unknownCount} unknown`,
                  offlineCount > 0 && `${offlineCount} offline`,
                ].filter(Boolean).join(" · ")}
              </Text>
            </BlockStack>
          </Card>

          {/* Revenue mapped */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Revenue from attributed or direct orders</Text>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">{fmt(knownRevenue, currency)}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {[
                  unknownRevenue > 0 && `${fmt(unknownRevenue, currency)} unknown`,
                  offlineRevenue > 0 && `${fmt(offlineRevenue, currency)} offline`,
                ].filter(Boolean).join(" · ").replace("unknown", "not tracked") || "all online orders in the period"}
              </Text>
            </BlockStack>
          </Card>

          {/* Top path */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Top path</Text>
                <span style={{ fontSize: 22 }}>🔀</span>
              </InlineStack>
              <Text as="p" variant="headingMd" fontWeight="bold">{topPathLabel}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {capturedCount > 0 ? `most common of ${capturedCount} full journey${capturedCount === 1 ? "" : "s"}` : "no full journeys yet"}
              </Text>
            </BlockStack>
          </Card>

          {/* Multi-touch */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Multi-touch journeys</Text>
                <span style={{ fontSize: 22 }}>👤</span>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">{multiTouchCount}</Text>
              <Text as="p" variant="bodySm" tone="subdued">of {capturedCount} full journey{capturedCount === 1 ? "" : "s"}</Text>
            </BlockStack>
          </Card>
        </div>

        {/* ── Two-column middle section ─────────────────────────────── */}
        {/* Sidebar drops below the main column on narrow screens */}
        <style>{`.journey-cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}@media (max-width:900px){.journey-cols{grid-template-columns:minmax(0,1fr)}}`}</style>
        <div className="journey-cols">

          {/* LEFT */}
          <BlockStack gap="400">

            {/* Most common path */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="025">
                  <Text as="h2" variant="headingMd">Most common path</Text>
                  <Text as="p" variant="bodySm" tone="subdued">The most common path among orders with full journeys (visit history before purchase).</Text>
                </BlockStack>

                {topPath ? (
                  <>
                    {/* Visual flow */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 12, padding: "20px 0", flexWrap: "wrap",
                    }}>
                      {topPath.channels.map((ch: string, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                            <ChannelBox channel={ch} size={52} />
                            <Text as="p" variant="bodySm">{SOURCE_CFG[ch]?.label || ch}</Text>
                          </div>
                          <Arrow size={24} />
                        </div>
                      ))}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <PurchaseBox size={52} />
                        <Text as="p" variant="bodySm">Purchase</Text>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 1, background: "#F3F4F6", borderRadius: 10, overflow: "hidden",
                    }}>
                      {[
                        { label: "orders", value: String(topPath.count) },
                        { label: "revenue", value: fmt(topPath.revenue, currency) },
                        { label: "of full journeys", value: `${topPathShare}%` },
                      ].map((s, i) => (
                        <div key={i} style={{ padding: "14px 16px", background: "#fff", textAlign: "center" }}>
                          <Text as="p" variant="headingMd" fontWeight="semibold">{s.value}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
                        </div>
                      ))}
                    </div>

                    {/* Explanatory note */}
                    <div style={{
                      padding: "12px 14px", borderRadius: 8,
                      background: "#EFF6FF", border: "1px solid #BFDBFE",
                      display: "flex", gap: 10, alignItems: "flex-start",
                    }}>
                      <span style={{ fontSize: 16, marginTop: 1 }}>ℹ️</span>
                      <BlockStack gap="025">
                        {!enoughForPatterns ? (
                          <>
                            <Text as="p" variant="bodySm" fontWeight="semibold">Too few full journeys to show a pattern yet.</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {capturedCount} of {totalOrders} orders have a full journey (visit history before purchase). Treat this path as an example, not typical behaviour.
                            </Text>
                          </>
                        ) : len1 / capturedCount > 0.5 ? (
                          <>
                            <Text as="p" variant="bodySm" fontWeight="semibold">Most full journeys have a single touchpoint.</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Earlier visits Attribix didn't see may be missing, so some of these buyers may have visited before.
                            </Text>
                          </>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Based on {capturedCount} orders with full journeys; {unknownCount} orders with unknown journeys are excluded.
                          </Text>
                        )}
                      </BlockStack>
                    </div>
                  </>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">No journey data yet.</Text>
                )}
              </BlockStack>
            </Card>

            {/* Recent journeys table */}
            {recentJourneys.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="025">
                      <Text as="h2" variant="headingMd">Order journeys</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Full journeys first, then orders where only the source is known.</Text>
                    </BlockStack>
                  </InlineStack>

                  {/* One line per order: path, order + plain-English detail, revenue.
                      Fits the narrow column without sideways scrolling. */}
                  <div>
                    {(showAll ? recentJourneys : recentJourneys.slice(0, 8)).map((j: any, i: number) => (
                      <div key={j.orderId} style={{
                        display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto",
                        gap: 12, alignItems: "center", padding: "10px 0",
                        borderTop: i === 0 ? "none" : "1px solid #F1F2F4",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {j.kind === "full" || j.kind === "source"
                            ? j.channels.map((ch: string, ci: number) => (
                                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <ChannelBox channel={ch} size={28} />
                                  <Arrow size={12} />
                                </div>
                              ))
                            : <><ChannelBox channel={j.kind === "offline" ? "offline" : "untracked"} size={28} /><Arrow size={12} /></>}
                          <PurchaseBox size={28} />
                        </div>
                        <BlockStack gap="025">
                          <Text as="p" variant="bodyMd" fontWeight="semibold" truncate>
                            {j.name ?? `Order ${j.orderId}`}
                            {j.date ? <Text as="span" variant="bodySm" tone="subdued">{` · ${j.date}`}</Text> : null}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued" truncate>{journeyDetail(j)}</Text>
                        </BlockStack>
                        <Text as="p" variant="bodyMd" fontWeight="semibold" alignment="end">{fmt(j.revenue, currency)}</Text>
                      </div>
                    ))}
                  </div>

                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Showing {showAll ? recentJourneys.length : Math.min(8, recentJourneys.length)} of {totalOrders} orders
                    </Text>
                    {recentJourneys.length > 8 && (
                      <Button variant="plain" onClick={() => setShowAll((v) => !v)}>
                        {showAll ? "Show fewer" : `Show all ${recentJourneys.length} orders`}
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

          </BlockStack>

          {/* RIGHT sidebar */}
          <BlockStack gap="400">

            {/* Journey overview donut */}
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="025">
                  <Text as="h2" variant="headingMd">Journey overview</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Touchpoints per order, across {capturedCount} full journey{capturedCount === 1 ? "" : "s"}{unknownCount > 0 ? ` (${unknownCount} unknown excluded)` : ""}
                  </Text>
                </BlockStack>

                {!enoughForPatterns ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {capturedCount === 0
                      ? "No full journeys yet."
                      : `Only ${plural(capturedCount, "full journey")} so far: ${len1} with 1 visit, ${len2} with 2, ${len3plus} with 3 or more. A chart needs at least ${MIN_JOURNEYS_FOR_PATTERNS}.`}
                  </Text>
                ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart len1={len1} len2={len2} len3plus={len3plus} total={capturedCount} />
                  </div>
                  <BlockStack gap="150">
                    {[
                      { label: "1 touchpoint", value: len1, color: "#3B82F6" },
                      { label: "2 touchpoints", value: len2, color: "#22C55E" },
                      { label: "3+ touchpoints", value: len3plus, color: "#F59E0B" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <InlineStack gap="150" blockAlign="center">
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                          <Text as="p" variant="bodySm">{item.label}</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{item.value}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            ({capturedCount > 0 ? Math.round((item.value / capturedCount) * 100) : 0}%)
                          </Text>
                        </InlineStack>
                      </div>
                    ))}
                  </BlockStack>
                </div>
                )}

                {multiTouchCount === 0 && enoughForPatterns && (
                  <div style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "#FFFBEB", border: "1px solid #FDE68A",
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}>
                    <span style={{ fontSize: 14, marginTop: 1 }}>💡</span>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Multi-touch journeys show how different channels work together. Keep your ads and tracking active to unlock richer insights.
                    </Text>
                  </div>
                )}
              </BlockStack>
            </Card>

            {/* No multi-touch empty state */}
            {multiTouchCount === 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">No multi-touch paths yet</Text>

                  {/* Placeholder network illustration */}
                  <div style={{
                    padding: "20px", background: "#F9FAFB", borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <ChannelBox channel="meta" size={36} />
                    <Arrow size={16} />
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#9CA3AF", fontSize: 12 }}>...</span>
                    </div>
                    <Arrow size={16} />
                    <ChannelBox channel="email" size={36} />
                    <Arrow size={16} />
                    <PurchaseBox size={36} />
                  </div>

                  <Text as="p" variant="bodySm" tone="subdued">
                    Attribix has not seen customers return through multiple channels before purchasing yet.
                    {unknownCount > capturedCount
                      ? "Most orders have no captured touchpoints, so returning visits may be going unseen. Check that tracking is set up on every page."
                      : "Keep tracking active and connect more channels to unlock deeper insights."}
                  </Text>

                  {googleConnected
                    ? <Button onClick={() => navigate("/app/setup")}>Check tracking setup</Button>
                    : <Button onClick={() => navigate("/app/integrations/google")}>Connect Google Ads</Button>}
                </BlockStack>
              </Card>
            )}

          </BlockStack>
        </div>

      </BlockStack>
    </Page>
  );
}
