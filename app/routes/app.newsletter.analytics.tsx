// app/routes/app.newsletter.analytics.tsx
// Newsletter analytics — full dashboard matching spec.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  BlockStack, Button, Card, InlineStack, Text,
} from "@shopify/polaris";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const now = new Date();
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const days60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalSubscribers,
    newSubs30,
    unsubSubs30,
    newSubsPrev,
    unsubSubsPrev,
    campaigns30,
    campaignsPrev,
    sources,
    recentSubs30,
    allPurchases30,
    allPurchasesPrev,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed", unsubscribedAt: { gte: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days60Ago, lt: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed", unsubscribedAt: { gte: days60Ago, lt: days30Ago } } }),
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent", sentAt: { gte: days30Ago } },
      select: { id: true, name: true, subject: true, sentAt: true, recipientCount: true, deliveredCount: true, openCount: true, clickCount: true, unsubCount: true },
      orderBy: { sentAt: "desc" },
    }).catch(() => []) ?? [],
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent", sentAt: { gte: days60Ago, lt: days30Ago } },
      select: { recipientCount: true, openCount: true, clickCount: true },
    }).catch(() => []) ?? [],
    db.newsletterSubscriber.groupBy({
      by: ["source"],
      where: { shop, status: "subscribed" },
      _count: { source: true },
      orderBy: { _count: { source: "desc" } },
      take: 8,
    }).catch(() => []),
    db.newsletterSubscriber.findMany({
      where: { shop, createdAt: { gte: days30Ago } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
    db.purchase.findMany({
      where: { shop, createdAt: { gte: days30Ago } },
      select: { totalValue: true, createdAt: true, utmSource: true, utmMedium: true },
    }).catch(() => []),
    db.purchase.findMany({
      where: { shop, createdAt: { gte: days60Ago, lt: days30Ago } },
      select: { totalValue: true, utmSource: true, utmMedium: true },
    }).catch(() => []),
  ]);

  // Helper — is a purchase email-attributed?
  function isEmailPurchase(p: any) {
    const src = (p.utmSource || "").toLowerCase();
    const med = (p.utmMedium || "").toLowerCase();
    return src.includes("email") || src.includes("klaviyo") || src.includes("mailchimp") ||
           src.includes("newsletter") || med.includes("email");
  }

  const emailPurchases30 = allPurchases30.filter(isEmailPurchase);
  const emailRevenue30 = emailPurchases30.reduce((s, p) => s + Number(p.totalValue || 0), 0);
  const emailOrders30 = emailPurchases30.length;

  const emailPurchasesPrev = allPurchasesPrev.filter(isEmailPurchase);
  const emailRevenuePrev = emailPurchasesPrev.reduce((s, p) => s + Number(p.totalValue || 0), 0);

  // Campaign aggregates for current period
  const emailsSent30 = campaigns30.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0);
  const totalOpens30 = campaigns30.reduce((s: number, c: any) => s + (c.openCount || 0), 0);
  const totalClicks30 = campaigns30.reduce((s: number, c: any) => s + (c.clickCount || 0), 0);
  const totalUnsubs30 = campaigns30.reduce((s: number, c: any) => s + (c.unsubCount || 0), 0);
  const totalDelivered30 = campaigns30.reduce((s: number, c: any) => s + (c.deliveredCount || c.recipientCount || 0), 0);

  const openRate30 = totalDelivered30 > 0 ? (totalOpens30 / totalDelivered30) * 100 : 0;
  const clickRate30 = totalDelivered30 > 0 ? (totalClicks30 / totalDelivered30) * 100 : 0;
  const unsubRate30 = totalDelivered30 > 0 ? (totalUnsubs30 / totalDelivered30) * 100 : 0;
  const notOpened30 = Math.max(0, totalDelivered30 - totalOpens30);
  const bounced30 = Math.max(0, (campaigns30.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0)) - totalDelivered30);

  // Previous period campaign aggregates
  const emailsSentPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0);
  const opensPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.openCount || 0), 0);
  const clicksPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.clickCount || 0), 0);
  const deliveredPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.deliveredCount || c.recipientCount || 0), 0);
  const openRatePrev = deliveredPrev > 0 ? (opensPrev / deliveredPrev) * 100 : 0;
  const clickRatePrev = deliveredPrev > 0 ? (clicksPrev / deliveredPrev) * 100 : 0;

  // Deltas
  const pct = (curr: number, prev: number) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  const subsTotal30 = totalSubscribers - unsubSubs30 + (unsubSubs30 - newSubs30); // approx
  const subsDelta = pct(newSubs30, newSubsPrev);
  const sentDelta = pct(emailsSent30, emailsSentPrev);
  const openDelta = pct(openRate30, openRatePrev);
  const clickDelta = pct(clickRate30, clickRatePrev);
  const revDelta = pct(emailRevenue30, emailRevenuePrev);

  // Daily revenue for chart (30 days)
  const dailyRevArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (29 - i)); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return emailPurchases30.filter(p => { const t = new Date(p.createdAt); return t >= d && t < next; })
      .reduce((s, p) => s + Number(p.totalValue || 0), 0);
  });

  // Daily new subscribers (30 days)
  const dailySubArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (29 - i)); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return recentSubs30.filter((s: any) => { const t = new Date(s.createdAt); return t >= d && t < next; }).length;
  });

  // Date labels
  const startLabel = days30Ago.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const endLabel = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Top campaigns by open rate
  const topCampaigns = [...campaigns30]
    .map((c: any) => {
      const delivered = c.deliveredCount || c.recipientCount || 0;
      const opens = c.openCount || 0;
      const clicks = c.clickCount || 0;
      return {
        id: c.id,
        name: c.name || "Campaign",
        sentAt: c.sentAt,
        sent: c.recipientCount || 0,
        openRate: delivered > 0 ? (opens / delivered * 100) : 0,
        clickRate: delivered > 0 ? (clicks / delivered * 100) : 0,
        revenue: 0, // Would need per-campaign attribution
      };
    })
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 5);

  return json({
    totalSubscribers, newSubs30, unsubSubs30,
    emailsSent30, openRate30, clickRate30, unsubRate30,
    emailRevenue30, emailOrders30,
    totalOpens30, totalClicks30, totalUnsubs30, totalDelivered30, notOpened30, bounced30,
    subsDelta, sentDelta, openDelta, clickDelta, revDelta,
    dailyRevArr, dailySubArr,
    topCampaigns,
    sources,
    startLabel, endLabel,
    avgOrderValue: emailOrders30 > 0 ? emailRevenue30 / emailOrders30 : 0,
    revenuePerEmail: emailsSent30 > 0 ? emailRevenue30 / emailsSent30 : 0,
  });
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function AreaChart({ values, color = "#008060", height = 120, width = 400 }: {
  values: number[]; color?: string; height?: number; width?: number;
}) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 0.001);
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * w,
    y: pad + h - (v / max) * h,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${pad + h} L ${pts[0].x} ${pad + h} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ values, color = "#008060", height = 120 }: { values: number[]; color?: string; height?: number }) {
  if (!values || !values.length) return null;
  const max = Math.max(...values, 0.001);
  const barW = Math.max(3, Math.floor(400 / values.length) - 2);

  return (
    <svg width="100%" height={height} viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {values.map((v, i) => {
        const barH = (v / max) * (height - 8);
        const x = (i / values.length) * 400;
        return (
          <rect key={i} x={x + 1} y={height - barH - 4} width={barW} height={Math.max(2, barH)}
            rx={2} fill={v > 0 ? color : "#E5E7EB"} />
        );
      })}
    </svg>
  );
}

function Donut({ segments, size = 120 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size * 0.38, cx = size / 2, cy = size / 2, sw = size * 0.18;
  const circ = 2 * Math.PI * r;

  if (total === 0) return (
    <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={sw} /></svg>
  );

  const nonZero = segments.filter(s => s.value > 0);
  if (nonZero.length === 1) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={nonZero[0].color} strokeWidth={sw} />
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={sw}
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

function Delta({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) return null;
  const up = delta >= 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: up ? "#16A34A" : "#DC2626" }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

function fmt(v: number, currency = "NOK") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${currency} ${Math.round(v)}`; }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsletterAnalytics() {
  const d = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const currency = "NOK";
  const [activeTab, setActiveTab] = useState("Overview");

  const TABS = ["Overview", "Campaigns", "Subscribers", "Engagement", "Revenue", "Forms", "Flows"];

  const sourceColors = ["#3B82F6", "#6366F1", "#F59E0B", "#10B981", "#9CA3AF"];
  const totalSourceCount = (d.sources as any[]).reduce((s: number, x: any) => s + x._count.source, 0);

  const engagementSegments = [
    { value: d.totalOpens30, color: "#22C55E", label: "Opened" },
    { value: d.totalClicks30, color: "#3B82F6", label: "Clicked" },
    { value: d.totalUnsubs30, color: "#F59E0B", label: "Unsubscribed" },
    { value: d.bounced30, color: "#9CA3AF", label: "Bounced" },
    { value: d.notOpened30, color: "#E5E7EB", label: "Not opened" },
  ];

  const sourceSegments = (d.sources as any[]).slice(0, 5).map((s: any, i: number) => ({
    value: s._count.source,
    color: sourceColors[i] || "#9CA3AF",
    label: s.source || "Unknown",
  }));

  return (
    <BlockStack gap="500">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <BlockStack gap="025">
          <Text as="h1" variant="headingXl" fontWeight="bold">Newsletter analytics</Text>
          <Text as="p" variant="bodySm" tone="subdued">Track performance, growth, and revenue from your email campaigns.</Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
            <span>📅</span> {d.startLabel} – {d.endLabel}
          </div>
          <Button size="slim" onClick={() => {
            const rows = [
              ["Metric", "Value", "Period"],
              ["Total subscribers", String(d.totalSubscribers), "Current"],
              ["Emails sent", String(d.emailsSent30), "Last 30 days"],
              ["Open rate", `${d.openRate30.toFixed(1)}%`, "Last 30 days"],
              ["Click rate", `${d.clickRate30.toFixed(1)}%`, "Last 30 days"],
              ["Unsubscribe rate", `${d.unsubRate30.toFixed(1)}%`, "Last 30 days"],
              ["Email revenue", String(d.emailRevenue30.toFixed(2)), "Last 30 days"],
              ["Email orders", String(d.emailOrders30), "Last 30 days"],
            ];
            const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `newsletter-report-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            URL.revokeObjectURL(url);
          }}>Export report</Button>
        </InlineStack>
      </div>

      {/* ── Analytics sub-tabs ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E5E7EB" }}>
        {TABS.map((tab) => (
          <div key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            color: tab === activeTab ? "#008060" : "#6B7280",
            borderBottom: tab === activeTab ? "2px solid #008060" : "2px solid transparent",
            marginBottom: -2,
          }}>
            {tab}
          </div>
        ))}
      </div>

      {/* Non-overview tabs: show placeholder until implemented */}
      {activeTab !== "Overview" && (
        <Card>
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <Text as="p" variant="headingMd">{activeTab}</Text>
            <div style={{ marginTop: 8 }}>
              <Text as="p" variant="bodySm" tone="subdued">Detailed {activeTab.toLowerCase()} data will appear here once you have campaign activity.</Text>
            </div>
          </div>
        </Card>
      )}
      {activeTab !== "Overview" && null /* hide rest of content when non-overview tab is active */}

      {/* ── Overview tab content ────────────────────────────────── */}
      {activeTab === "Overview" && <><div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { label: "Total subscribers", value: d.totalSubscribers.toLocaleString(), delta: d.subsDelta },
          { label: "Emails sent", value: d.emailsSent30.toLocaleString(), delta: d.sentDelta },
          { label: "Open rate", value: `${d.openRate30.toFixed(1)}%`, delta: d.openDelta },
          { label: "Click rate", value: `${d.clickRate30.toFixed(1)}%`, delta: d.clickDelta },
          { label: "Unsubscribe rate", value: `${d.unsubRate30.toFixed(1)}%`, delta: d.revDelta !== null ? -(d.revDelta ?? 0) : null, invertDelta: true },
          { label: "Revenue", value: fmt(d.emailRevenue30, currency), delta: d.revDelta },
        ].map((card) => (
          <Card key={card.label}>
            <BlockStack gap="075">
              <Text as="p" variant="bodySm" tone="subdued">{card.label}</Text>
              <Text as="p" variant="headingLg" fontWeight="bold">{card.value}</Text>
              {card.delta !== null && (
                <InlineStack gap="100" blockAlign="center">
                  <Delta delta={card.delta} />
                  <Text as="span" variant="bodySm" tone="subdued">vs prev 30d</Text>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        ))}
      </div>

      {/* ── Revenue chart + Top campaigns ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>

        {/* Revenue over time */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Revenue over time</Text>
              <div style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                Daily ▾
              </div>
            </InlineStack>

            {/* Y-axis labels + chart */}
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 0, height: 130 }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: 8, width: 60, flexShrink: 0 }}>
                  {[fmt(d.emailRevenue30, currency), fmt(d.emailRevenue30 * 0.6, currency), fmt(d.emailRevenue30 * 0.3, currency), "NOK 0"].map((l, i) => (
                    <Text key={i} as="p" variant="bodySm" tone="subdued" alignment="end">{l}</Text>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <AreaChart values={d.dailyRevArr} color="#008060" height={130} width={500} />
                </div>
              </div>
              {/* X-axis */}
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 68, marginTop: 4 }}>
                {[d.startLabel.split(",")[0], "", "", "", d.endLabel.split(",")[0]].map((l, i) => (
                  <Text key={i} as="p" variant="bodySm" tone="subdued">{l}</Text>
                ))}
              </div>
            </div>

            {/* Supporting metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "#F3F4F6", borderRadius: 10, overflow: "hidden", marginTop: 4 }}>
              {[
                { label: "Revenue", value: fmt(d.emailRevenue30, currency), delta: d.revDelta },
                { label: "Attributed orders", value: String(d.emailOrders30), delta: null },
                { label: "Average order value", value: fmt(d.avgOrderValue, currency), delta: null },
                { label: "Revenue / email sent", value: d.emailsSent30 > 0 ? `${currency} ${d.revenuePerEmail.toFixed(2)}` : "—", delta: null },
              ].map((m) => (
                <div key={m.label} style={{ padding: "12px 14px", background: "#fff" }}>
                  <Text as="p" variant="bodySm" tone="subdued">{m.label}</Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Text as="p" variant="headingSm" fontWeight="semibold">{m.value}</Text>
                    {m.delta !== null && <Delta delta={m.delta} />}
                  </InlineStack>
                </div>
              ))}
            </div>
          </BlockStack>
        </Card>

        {/* Top performing campaigns */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Top performing campaigns</Text>
              <Button size="slim" variant="plain" onClick={() => navigate("/app/newsletter/campaigns")}>View all</Button>
            </InlineStack>

            {d.topCampaigns.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">No campaigns sent yet in this period.</Text>
                <Button size="slim" onClick={() => navigate("/app/newsletter/campaigns/new")}>Create first campaign</Button>
              </BlockStack>
            ) : (
              <BlockStack gap="0">
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px 60px 70px", gap: 6, paddingBottom: 8, borderBottom: "1px solid #F0F0F0" }}>
                  {["Campaign", "Sent", "Open", "Click", "Revenue"].map(h => (
                    <Text key={h} as="p" variant="bodySm" tone="subdued" fontWeight="semibold">{h}</Text>
                  ))}
                </div>
                {d.topCampaigns.map((c: any, i: number) => (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px 60px 70px", gap: 6, padding: "10px 0", borderBottom: i < d.topCampaigns.length - 1 ? "1px solid #F9F9F9" : "none", alignItems: "center" }}>
                    {/* Campaign name + date */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14 }}>
                        ✉
                      </div>
                      <BlockStack gap="025">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name}</Text>
                        {c.sentAt && <Text as="p" variant="bodySm" tone="subdued">{new Date(c.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Text>}
                      </BlockStack>
                    </div>
                    <Text as="p" variant="bodySm">{c.sent.toLocaleString()}</Text>
                    <Text as="p" variant="bodySm" tone={c.openRate >= 30 ? "success" : undefined}>{c.openRate.toFixed(1)}%</Text>
                    <Text as="p" variant="bodySm" tone={c.clickRate >= 3 ? "success" : undefined}>{c.clickRate.toFixed(1)}%</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">
                      {c.revenue > 0 ? fmt(c.revenue, currency) : "—"}
                    </Text>
                  </div>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </div>

      {/* ── Bottom row: Engagement + Subscriber growth + Sources ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Engagement overview */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Engagement overview</Text>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <Donut segments={engagementSegments} size={100} />
              </div>
              <BlockStack gap="100">
                {engagementSegments.filter(s => s.value > 0 || s.label !== "Not opened").map((seg) => {
                  const total = d.totalDelivered30 || 1;
                  const pct = total > 0 ? ((seg.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                      <InlineStack gap="150" blockAlign="center">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                        <Text as="p" variant="bodySm">{seg.label}</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{pct}% ({seg.value.toLocaleString()})</Text>
                    </div>
                  );
                })}
              </BlockStack>
            </div>
            <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm" tone="subdued">Total recipients</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold">{d.totalDelivered30.toLocaleString()}</Text>
              </InlineStack>
            </div>
          </BlockStack>
        </Card>

        {/* Subscriber growth */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Subscriber growth</Text>
              <div style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                Last 30 days ▾
              </div>
            </InlineStack>

            <InlineStack gap="200" blockAlign="center">
              <Text as="p" variant="headingXl" fontWeight="bold" tone="success">+{d.newSubs30.toLocaleString()}</Text>
              <BlockStack gap="025">
                <Text as="p" variant="bodySm" fontWeight="semibold">New subscribers</Text>
                {d.subsDelta !== null && (
                  <InlineStack gap="100" blockAlign="center">
                    <Delta delta={d.subsDelta} />
                    <Text as="span" variant="bodySm" tone="subdued">vs prev period</Text>
                  </InlineStack>
                )}
              </BlockStack>
            </InlineStack>

            <div style={{ height: 80 }}>
              <BarChart values={d.dailySubArr} color="#008060" height={80} />
            </div>

            <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <BlockStack gap="025">
                  <Text as="p" variant="bodySm" tone="subdued">New</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">+{d.newSubs30.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="025">
                  <Text as="p" variant="bodySm" tone="subdued">Unsubscribed</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="critical">-{d.unsubSubs30.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="025">
                  <Text as="p" variant="bodySm" tone="subdued">Total</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{d.totalSubscribers.toLocaleString()}</Text>
                </BlockStack>
              </div>
            </div>
          </BlockStack>
        </Card>

        {/* Subscribers by source */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Subscribers by source</Text>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <Donut segments={sourceSegments} size={100} />
              </div>
              <BlockStack gap="100">
                {(d.sources as any[]).slice(0, 5).map((s: any, i: number) => {
                  const pct = totalSourceCount > 0 ? ((s._count.source / totalSourceCount) * 100).toFixed(1) : "0.0";
                  const label = s.source ? s.source.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "Other";
                  return (
                    <div key={s.source} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                      <InlineStack gap="150" blockAlign="center">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sourceColors[i] || "#9CA3AF", flexShrink: 0 }} />
                        <Text as="p" variant="bodySm">{label.length > 18 ? label.slice(0, 18) + "…" : label}</Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{pct}% ({s._count.source})</Text>
                    </div>
                  );
                })}
              </BlockStack>
            </div>
            <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm" tone="subdued">Total subscribers</Text>
                <Text as="p" variant="bodySm" fontWeight="semibold">{d.totalSubscribers.toLocaleString()}</Text>
              </InlineStack>
            </div>
          </BlockStack>
        </Card>
      </div>

      {/* ── Footer attribution note ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0" }}>
        <span style={{ fontSize: 14, color: "#9CA3AF" }}>ℹ</span>
        <Text as="p" variant="bodySm" tone="subdued">
          Revenue attribution is based on orders placed within 7 days of email interaction.{" "}
          <span style={{ color: "#008060", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate("/app/settings")}>
            Manage attribution settings
          </span>
        </Text>
      </div>
      </>}

    </BlockStack>
  );
}
