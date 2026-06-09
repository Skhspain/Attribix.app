// app/routes/app.newsletter._index.tsx
// Newsletter overview — full command center: metrics, revenue chart, top campaigns, quick actions, list health, getting started.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Card, Text, BlockStack, InlineStack, Button, Badge } from "@shopify/polaris";
import { useState } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const anyDb = db as any;

  const now = new Date();
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const days60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalSubscribers, newSubs30, unsubSubs30, newSubsPrev, unsubscribedTotal,
    campaigns30, campaignsPrev, topCampaigns5,
    recentSubsRaw, emailPurchases30, emailPurchasesPrev,
    sourceCounts,
    totalCampaignsSent, activeFlows,
  ] = await Promise.all([
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed" } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed", unsubscribedAt: { gte: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "subscribed", createdAt: { gte: days60Ago, lt: days30Ago } } }),
    db.newsletterSubscriber.count({ where: { shop, status: "unsubscribed" } }),
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent", sentAt: { gte: days30Ago } },
      select: { id: true, name: true, sentAt: true, recipientCount: true, deliveredCount: true, openCount: true, clickCount: true, unsubCount: true },
      orderBy: { sentAt: "desc" },
    }).catch(() => []) ?? [],
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent", sentAt: { gte: days60Ago, lt: days30Ago } },
      select: { recipientCount: true, openCount: true, clickCount: true, deliveredCount: true },
    }).catch(() => []) ?? [],
    anyDb.newsletterCampaign?.findMany?.({
      where: { shop, status: "sent" },
      select: { id: true, name: true, sentAt: true, recipientCount: true, deliveredCount: true, openCount: true, clickCount: true },
      orderBy: { openCount: "desc" },
      take: 5,
    }).catch(() => []) ?? [],
    db.newsletterSubscriber.findMany({ where: { shop, createdAt: { gte: days30Ago } }, select: { createdAt: true }, orderBy: { createdAt: "asc" } }).catch(() => []),
    db.purchase.findMany({ where: { shop, createdAt: { gte: days30Ago } }, select: { totalValue: true, createdAt: true, utmSource: true, utmMedium: true } }).catch(() => []),
    db.purchase.findMany({ where: { shop, createdAt: { gte: days60Ago, lt: days30Ago } }, select: { totalValue: true, utmSource: true, utmMedium: true } }).catch(() => []),
    db.newsletterSubscriber.groupBy({ by: ["source"], where: { shop, status: "subscribed" }, _count: { source: true }, orderBy: { _count: { source: "desc" } }, take: 6 }).catch(() => []),
    anyDb.newsletterCampaign?.count?.({ where: { shop, status: "sent" } }).catch(() => 0) ?? 0,
    anyDb.automationFlow?.findMany?.({ where: { shop }, select: { id: true, name: true, enabled: true } }).catch(() => []) ?? [],
  ]);

  const isEmail = (p: any) => {
    const src = (p.utmSource || "").toLowerCase();
    const med = (p.utmMedium || "").toLowerCase();
    return src.includes("email") || src.includes("klaviyo") || src.includes("mailchimp") || src.includes("newsletter") || med.includes("email");
  };

  const emailRev30 = emailPurchases30.filter(isEmail).reduce((s: number, p: any) => s + Number(p.totalValue || 0), 0);
  const emailRevPrev = emailPurchasesPrev.filter(isEmail).reduce((s: number, p: any) => s + Number(p.totalValue || 0), 0);
  const attributedOrders30 = emailPurchases30.filter(isEmail).length;

  const emailsSent30 = campaigns30.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0);
  const emailsSentPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0);
  const delivered30 = campaigns30.reduce((s: number, c: any) => s + (c.deliveredCount || c.recipientCount || 0), 0);
  const opens30 = campaigns30.reduce((s: number, c: any) => s + (c.openCount || 0), 0);
  const clicks30 = campaigns30.reduce((s: number, c: any) => s + (c.clickCount || 0), 0);
  const unsubs30 = campaigns30.reduce((s: number, c: any) => s + (c.unsubCount || 0), 0);

  const openRate30 = delivered30 > 0 ? (opens30 / delivered30) * 100 : 0;
  const clickRate30 = delivered30 > 0 ? (clicks30 / delivered30) * 100 : 0;

  const deliveredPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.deliveredCount || c.recipientCount || 0), 0);
  const opensPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.openCount || 0), 0);
  const clicksPrev = campaignsPrev.reduce((s: number, c: any) => s + (c.clickCount || 0), 0);
  const openRatePrev = deliveredPrev > 0 ? (opensPrev / deliveredPrev) * 100 : 0;
  const clickRatePrev = deliveredPrev > 0 ? (clicksPrev / deliveredPrev) * 100 : 0;

  const pct = (c: number, p: number) => p > 0 ? Math.round(((c - p) / p) * 100) : null;

  // Daily subscriber growth array
  const dailySubArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (29 - i)); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return recentSubsRaw.filter((s: any) => { const t = new Date(s.createdAt); return t >= d && t < next; }).length;
  });

  // Daily email revenue array
  const emailRevArr = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (29 - i)); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return emailPurchases30.filter(isEmail).filter((p: any) => { const t = new Date(p.createdAt); return t >= d && t < next; })
      .reduce((s: number, p: any) => s + Number(p.totalValue || 0), 0);
  });

  const startLabel = days30Ago.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endLabel = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Top campaigns: approximate revenue = (openRate * emailRev30 / opens30) if opens > 0
  const topCampaigns = topCampaigns5.map((c: any) => {
    const delivered = c.deliveredCount || c.recipientCount || 0;
    const openRate = delivered > 0 ? (c.openCount || 0) / delivered * 100 : 0;
    const clickRate = delivered > 0 ? (c.clickCount || 0) / delivered * 100 : 0;
    const revFraction = opens30 > 0 ? (c.openCount || 0) / opens30 : 0;
    return {
      id: c.id,
      name: c.name || "Campaign",
      sentAt: c.sentAt ? new Date(c.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
      sent: (c.recipientCount || 0).toLocaleString(),
      openRate: `${openRate.toFixed(1)}%`,
      clickRate: `${clickRate.toFixed(1)}%`,
      revenue: emailRev30 * revFraction,
    };
  });

  // Source labels
  const sourceLabels: Record<string, string> = {
    popup: "Popup – Discount",
    "popup_classic": "Classic Popup",
    embedded: "Footer form",
    inline: "Product page form",
    checkout: "Checkout",
    import: "CSV Import",
    shopify: "Import – Shopify",
    manual: "Manual",
  };

  // Setup checklist
  const hasSignupForm = (sourceCounts as any[]).some((s: any) => s.source && ["popup", "embedded", "inline", "checkout"].includes(s.source));
  const hasWelcomeFlow = (activeFlows as any[]).some((f: any) => String(f.name || "").toLowerCase().includes("welcome") || f.enabled);
  const setupSteps = [
    { label: "Connect your store", done: true },
    { label: "Create your first campaign", done: totalCampaignsSent > 0 },
    { label: "Add a sign up form", done: totalSubscribers > 0 || hasSignupForm },
    { label: "Send a test email", done: totalCampaignsSent > 0 },
    { label: "Create a flow", done: hasWelcomeFlow },
  ];

  return json({
    totalSubscribers, newSubs30, unsubSubs30, unsubscribedTotal, emailsSent30, openRate30, clickRate30, emailRev30,
    attributedOrders30, delivered30, opens30, clicks30, unsubs30,
    subsDelta: pct(newSubs30, newSubsPrev),
    sentDelta: pct(emailsSent30, emailsSentPrev),
    openDelta: pct(openRate30, openRatePrev),
    clickDelta: pct(clickRate30, clickRatePrev),
    revDelta: pct(emailRev30, emailRevPrev),
    dailySubArr, emailRevArr, startLabel, endLabel,
    topCampaigns,
    sourceCounts: (sourceCounts as any[]).map((s: any) => ({ source: s.source, count: s._count.source, label: sourceLabels[s.source ?? ""] ?? s.source ?? "Other" })),
    setupSteps,
    hasWelcomeFlow,
    totalCampaignsSent,
  });
}

// ─── SVG chart helpers ────────────────────────────────────────────────────────

function AreaChart({ values, color = "#008060", height = 160 }: { values: number[]; color?: string; height?: number }) {
  if (!values?.length || values.every(v => v === 0)) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Text as="p" variant="bodySm" tone="subdued">No revenue data yet</Text>
    </div>
  );
  const max = Math.max(...values, 0.001);
  const pad = 10;
  const W = 600, H = height - pad * 2;
  const pts = values.map((v, i) => ({ x: pad + (i / (values.length - 1)) * (W - pad * 2), y: pad + H - (v / max) * H }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${H + pad} L${pts[0].x},${H + pad} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#aGrad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ values, color = "#008060", height = 100 }: { values: number[]; color?: string; height?: number }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 0.001);
  const bw = Math.max(4, Math.floor(400 / values.length) - 2);
  return (
    <svg width="100%" height={height} viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {values.map((v, i) => {
        const bh = (v / max) * (height - 6);
        return <rect key={i} x={(i / values.length) * 400 + 1} y={height - bh - 3} width={bw} height={Math.max(2, bh)} rx={2} fill={v > 0 ? color : "#E5E7EB"} />;
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 100 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <svg width={size} height={size}><circle cx={size/2} cy={size/2} r={size*0.38} fill="none" stroke="#E5E7EB" strokeWidth={size*0.18} /></svg>;
  const r = size * 0.38, cx = size / 2, cy = size / 2, sw = size * 0.18;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={sw} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function Delta({ val, sub }: { val: number | null; sub?: string }) {
  if (val === null || val === undefined) return <span style={{ fontSize: 11, color: "#9CA3AF" }}>—</span>;
  const up = val >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? "#16A34A" : "#DC2626" }}>
      {up ? "↑" : "↓"} {Math.abs(val)}% {sub ?? "vs Apr 6 – May 5"}
    </span>
  );
}

function fmt(v: number) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(v); }
  catch { return `NOK ${Math.round(v)}`; }
}

// ─── Component ────────────────────────────────────────────────────────────────

const SOURCE_COLORS = ["#16A34A", "#3B82F6", "#F97316", "#F59E0B", "#6366F1", "#9CA3AF"];

export default function NewsletterOverview() {
  const d = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("Last 30 days");

  const setupDone = d.setupSteps.filter((s: any) => s.done).length;
  const activeCount = d.totalSubscribers;
  const unsubPct = d.unsubscribedTotal > 0 && (d.totalSubscribers + d.unsubscribedTotal) > 0
    ? ((d.unsubscribedTotal / (d.totalSubscribers + d.unsubscribedTotal)) * 100).toFixed(1) : "0";
  const listScore = d.unsubscribedTotal / Math.max(1, d.totalSubscribers + d.unsubscribedTotal);
  const listHealth = listScore < 0.05 ? "Excellent" : listScore < 0.15 ? "Good" : "Needs attention";
  const listHealthColor = listScore < 0.05 ? "#16A34A" : listScore < 0.15 ? "#F59E0B" : "#DC2626";

  const totalSourceSubs = d.sourceCounts.reduce((s: number, x: any) => s + x.count, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <BlockStack gap="400">

        {/* Header */}
        <div>
          <Text as="h1" variant="headingXl" fontWeight="bold">Newsletter overview</Text>
          <Text as="p" variant="bodySm" tone="subdued">Grow your audience, engage your subscribers and drive more revenue.</Text>
          <div style={{ marginTop: 10 }}>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", border: "1px solid #E5E7EB", borderRadius: 8,
              background: "#fff", cursor: "default", fontSize: 13, color: "#374151",
            }}>
              <span>📅</span>
              <span>{d.startLabel} – {d.endLabel}</span>
              <span style={{ color: "#9CA3AF" }}>▾</span>
            </button>
          </div>
        </div>

        {/* 5 KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { icon: "👥", label: "Total subscribers", value: d.totalSubscribers.toLocaleString(), delta: d.subsDelta },
            { icon: "📧", label: "Emails sent", value: d.emailsSent30.toLocaleString(), delta: d.sentDelta },
            { icon: "📬", label: "Open rate", value: `${d.openRate30.toFixed(1)}%`, delta: d.openDelta },
            { icon: "🖱️", label: "Click rate", value: `${d.clickRate30.toFixed(1)}%`, delta: d.clickDelta },
            { icon: "💰", label: "Revenue from email", value: fmt(d.emailRev30), delta: d.revDelta },
          ].map(card => (
            <Card key={card.label}>
              <BlockStack gap="100">
                <InlineStack gap="150" blockAlign="center">
                  <span style={{ fontSize: 16 }}>{card.icon}</span>
                  <Text as="p" variant="bodySm" tone="subdued">{card.label}</Text>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{card.value}</Text>
                <Delta val={card.delta} />
              </BlockStack>
            </Card>
          ))}
        </div>

        {/* Revenue chart + top campaigns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
          {/* Revenue over time */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Revenue over time</Text>
                <button style={{ padding: "4px 10px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}>
                  Daily ▾
                </button>
              </InlineStack>

              <div style={{ height: 160 }}>
                <AreaChart values={d.emailRevArr} color="#008060" height={160} />
              </div>

              {/* X-axis labels */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text as="p" variant="bodySm" tone="subdued">{d.startLabel}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{d.endLabel}</Text>
              </div>

              {/* Revenue metrics row */}
              <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[
                  { label: "Revenue", value: fmt(d.emailRev30), delta: d.revDelta },
                  { label: "Attributed orders", value: String(d.attributedOrders30), delta: d.revDelta },
                  { label: "Average order value", value: d.attributedOrders30 > 0 ? fmt(d.emailRev30 / d.attributedOrders30) : "—", delta: null },
                  { label: "Revenue / email sent", value: d.emailsSent30 > 0 ? fmt(d.emailRev30 / d.emailsSent30) : "—", delta: null },
                ].map(m => (
                  <BlockStack key={m.label} gap="025">
                    <Text as="p" variant="bodySm" tone="subdued">{m.label}</Text>
                    <Text as="p" variant="bodyMd" fontWeight="bold">{m.value}</Text>
                    <Delta val={m.delta} sub="" />
                  </BlockStack>
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
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <Text as="p" variant="bodySm" tone="subdued">No campaigns sent yet.</Text>
                  <div style={{ marginTop: 10 }}>
                    <Button size="slim" onClick={() => navigate("/app/newsletter/campaigns/new")}>Create campaign</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px 60px 70px", gap: 4 }}>
                    {["Campaign", "Sent", "Open", "Click", "Revenue"].map(h => (
                      <Text key={h} as="p" variant="bodySm" tone="subdued" fontWeight="semibold">{h}</Text>
                    ))}
                  </div>
                  {d.topCampaigns.map((c: any) => (
                    <div key={c.id}>
                      <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px 60px 70px", gap: 4, alignItems: "center" }}>
                        <div>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#EFF6FF", display: "inline-block", marginRight: 6, verticalAlign: "middle" }}>
                            <span style={{ display: "block", textAlign: "center", lineHeight: "28px", fontSize: 14 }}>📧</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                          <div style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 34 }}>{c.sentAt}</div>
                        </div>
                        <Text as="p" variant="bodySm">{c.sent}</Text>
                        <Text as="p" variant="bodySm">{c.openRate}</Text>
                        <Text as="p" variant="bodySm">{c.clickRate}</Text>
                        <Text as="p" variant="bodySm" tone="success">{c.revenue > 0 ? fmt(c.revenue) : "—"}</Text>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </BlockStack>
          </Card>
        </div>

        {/* Bottom analytics row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Subscriber growth */}
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm" fontWeight="semibold">Subscriber growth</Text>
                <button style={{ padding: "3px 10px", border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", fontSize: 11, cursor: "default", color: "#374151" }}>
                  Last 30 days ▾
                </button>
              </InlineStack>
              <div>
                <Text as="p" variant="headingLg" fontWeight="bold" tone="success">+{d.newSubs30.toLocaleString()}</Text>
                <Text as="p" variant="bodySm" tone="subdued">New subscribers</Text>
                <Delta val={d.subsDelta} />
              </div>
              <div style={{ height: 80 }}>
                <BarChart values={d.dailySubArr} color="#008060" height={80} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text as="p" variant="bodySm" tone="subdued">{d.startLabel}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{d.endLabel}</Text>
              </div>
              <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                {[
                  { label: "New", value: `+${d.newSubs30}`, color: "#16A34A" },
                  { label: "Unsubscribed", value: `-${d.unsubSubs30}`, color: "#DC2626" },
                  { label: "Net growth", value: `+${d.newSubs30 - d.unsubSubs30}`, color: "#16A34A" },
                ].map(m => (
                  <BlockStack key={m.label} gap="025">
                    <Text as="p" variant="bodySm" tone="subdued">{m.label}</Text>
                    <span style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</span>
                  </BlockStack>
                ))}
              </div>
            </BlockStack>
          </Card>

          {/* Subscribers by source */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" fontWeight="semibold">Subscribers by source</Text>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flexShrink: 0 }}>
                  <DonutChart size={100} segments={d.sourceCounts.length > 0
                    ? d.sourceCounts.map((s: any, i: number) => ({ value: s.count, color: SOURCE_COLORS[i] ?? "#9CA3AF" }))
                    : [{ value: 1, color: "#E5E7EB" }]
                  } />
                </div>
                <BlockStack gap="100">
                  {d.sourceCounts.length > 0 ? d.sourceCounts.slice(0, 5).map((s: any, i: number) => (
                    <InlineStack key={i} gap="150" blockAlign="center">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: SOURCE_COLORS[i], flexShrink: 0 }} />
                      <Text as="p" variant="bodySm">{s.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {totalSourceSubs > 0 ? ((s.count / totalSourceSubs) * 100).toFixed(1) : 0}% ({s.count})
                      </Text>
                    </InlineStack>
                  )) : (
                    <Text as="p" variant="bodySm" tone="subdued">No subscriber data yet.</Text>
                  )}
                </BlockStack>
              </div>
              <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 8 }}>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">Total subscribers</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{d.totalSubscribers.toLocaleString()}</Text>
                </InlineStack>
              </div>
            </BlockStack>
          </Card>

          {/* Engagement overview */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" fontWeight="semibold">Engagement overview</Text>
              {d.delivered30 === 0 ? (
                <div style={{ padding: "16px 0" }}>
                  <Text as="p" variant="bodySm" tone="subdued">Send a campaign to see engagement data.</Text>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart size={100} segments={[
                      { value: d.opens30, color: "#22C55E" },
                      { value: d.clicks30, color: "#3B82F6" },
                      { value: Math.max(0, d.delivered30 - d.opens30), color: "#E5E7EB" },
                      { value: d.unsubs30, color: "#F59E0B" },
                    ]} />
                  </div>
                  <BlockStack gap="100">
                    {[
                      { label: "Opened", value: d.opens30, color: "#22C55E" },
                      { label: "Clicked", value: d.clicks30, color: "#3B82F6" },
                      { label: "Unopened", value: Math.max(0, d.delivered30 - d.opens30), color: "#D1D5DB" },
                      { label: "Unsubscribed", value: d.unsubs30, color: "#F59E0B" },
                    ].map(row => (
                      <InlineStack key={row.label} gap="150" blockAlign="center">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                        <Text as="p" variant="bodySm">{row.label}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {d.delivered30 > 0 ? ((row.value / d.delivered30) * 100).toFixed(1) : 0}% ({row.value.toLocaleString()})
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </div>
              )}
              <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 8 }}>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">Total emails sent</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{d.emailsSent30.toLocaleString()}</Text>
                </InlineStack>
              </div>
            </BlockStack>
          </Card>
        </div>

        {/* Revenue attribution note */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>ℹ</span>
          <Text as="p" variant="bodySm" tone="subdued">
            Revenue attribution is based on orders placed within 7 days of email interaction.{" "}
            <span style={{ color: "#008060", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("/app/newsletter/settings")}>
              Manage attribution settings
            </span>
          </Text>
        </div>

      </BlockStack>

      {/* ── RIGHT SIDEBAR ─────────────────────────────────────── */}
      <BlockStack gap="300">

        {/* Quick actions */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="semibold">Quick actions</Text>
            {[
              { icon: "📧", label: "Create campaign", url: "/app/newsletter/campaigns/new" },
              { icon: "⚡", label: "Create flow", url: "/app/newsletter/flows" },
              { icon: "📋", label: "Create sign up form", url: "/app/newsletter/widget" },
              { icon: "⭐", label: "Create review request", url: "/app/newsletter/review-requests" },
              { icon: "👥", label: "Add subscribers", url: "/app/newsletter/subscribers" },
            ].map(action => (
              <button key={action.label} onClick={() => navigate(action.url)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer",
                borderRadius: 6, textAlign: "left",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: 16 }}>{action.icon}</span>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{action.label}</Text>
                </InlineStack>
                <span style={{ color: "#9CA3AF", fontSize: 16 }}>›</span>
              </button>
            ))}
          </BlockStack>
        </Card>

        {/* List health */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" fontWeight="semibold">List health</Text>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutChart size={80} segments={[
                { value: activeCount, color: "#16A34A" },
                { value: d.unsubscribedTotal, color: "#F59E0B" },
                { value: 0, color: "#DC2626" },
              ]} />
              <BlockStack gap="100">
                {[
                  { label: "Active", value: activeCount, color: "#16A34A" },
                  { label: "Unsubscribed", value: d.unsubscribedTotal, color: "#F59E0B" },
                  { label: "Bounced", value: 0, color: "#DC2626" },
                ].map(row => (
                  <InlineStack key={row.label} gap="100" blockAlign="center">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                    <Text as="p" variant="bodySm">{row.label}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{row.value.toLocaleString()}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </div>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">List health</Text>
              <span style={{ fontSize: 12, fontWeight: 700, color: listHealthColor }}>● {listHealth}</span>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Boost your results */}
        {!d.hasWelcomeFlow && (
          <Card background="bg-surface-secondary">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="start">
                <span style={{ fontSize: 20 }}>🚀</span>
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Boost your results</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Create a welcome flow to turn new subscribers into customers.</Text>
                </BlockStack>
              </InlineStack>
              <Button size="slim" onClick={() => navigate("/app/newsletter/flows")}>
                Create welcome flow
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Getting started */}
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm" fontWeight="semibold">Getting started</Text>
            </InlineStack>
            <div>
              <Text as="p" variant="bodySm" fontWeight="semibold">{setupDone} of {d.setupSteps.length} tasks completed</Text>
              <div style={{ marginTop: 6, background: "#F3F4F6", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(setupDone / d.setupSteps.length) * 100}%`, background: "#16A34A", borderRadius: 4, transition: "width 0.3s" }} />
              </div>
            </div>
            <BlockStack gap="100">
              {d.setupSteps.map((step: any) => (
                <InlineStack key={step.label} gap="150" blockAlign="center">
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{step.done ? "✅" : "⭕"}</span>
                  <Text as="p" variant="bodySm" tone={step.done ? "subdued" : undefined}>
                    {step.label}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
            <Button size="slim" variant="plain" onClick={() => navigate("/app/newsletter/analytics")}>
              View all guide steps
            </Button>
          </BlockStack>
        </Card>

      </BlockStack>
    </div>
  );
}
