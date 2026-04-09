// app/routes/app.analytics.attribution.tsx
// Multi-touch attribution — first-touch, last-touch, linear, time-decay.
// Uses PurchaseTouchpoint records (real journey data) where available,
// falls back to single-touch Purchase data for orders without a tracked journey.

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { Page, Card, BlockStack, InlineStack, Text, Select, Grid, Badge } from "@shopify/polaris";
import { useState } from "react";

type Model = "last_touch" | "first_touch" | "linear" | "time_decay";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 86400_000);
  const anyDb = db as any;

  // ── Query PurchaseTouchpoints (multi-touch) ──────────────────────────────────
  const pts: any[] = await anyDb.purchaseTouchpoint?.findMany?.({
    where: { shop, createdAt: { gte: since } },
    select: {
      orderId: true, channel: true, revenue: true, currency: true,
      totalSteps: true, position: true, touchedAt: true,
      creditFirstTouch: true, creditLastTouch: true,
      creditLinear: true, creditTimeDecay: true,
      utmSource: true, utmCampaign: true,
    },
  }).catch(() => []) ?? [];

  // ── Aggregate revenue per channel per model ──────────────────────────────────
  type ChannelAgg = {
    channel: string;
    revenueFirstTouch: number; revenueLastTouch: number;
    revenueLinear: number;     revenueTimeDecay: number;
    orders: Set<string>;
  };

  const channelMap: Record<string, ChannelAgg> = {};

  for (const pt of pts) {
    const ch = pt.channel || "Direct / Unknown";
    if (!channelMap[ch]) {
      channelMap[ch] = {
        channel: ch,
        revenueFirstTouch: 0, revenueLastTouch: 0,
        revenueLinear: 0,     revenueTimeDecay: 0,
        orders: new Set(),
      };
    }
    const r = pt.revenue ?? 0;
    channelMap[ch].revenueFirstTouch += r * (pt.creditFirstTouch ?? 0);
    channelMap[ch].revenueLastTouch  += r * (pt.creditLastTouch  ?? 0);
    channelMap[ch].revenueLinear     += r * (pt.creditLinear     ?? 0);
    channelMap[ch].revenueTimeDecay  += r * (pt.creditTimeDecay  ?? 0);
    channelMap[ch].orders.add(pt.orderId);
  }

  const channelRows = Object.values(channelMap).map(c => ({
    channel:           c.channel,
    revenueFirstTouch: c.revenueFirstTouch,
    revenueLastTouch:  c.revenueLastTouch,
    revenueLinear:     c.revenueLinear,
    revenueTimeDecay:  c.revenueTimeDecay,
    orders:            c.orders.size,
  })).sort((a, b) => b.revenueLastTouch - a.revenueLastTouch);

  // ── Journey depth stats ──────────────────────────────────────────────────────
  const orderJourneys: Record<string, number> = {};
  for (const pt of pts) {
    orderJourneys[pt.orderId] = Math.max(orderJourneys[pt.orderId] ?? 0, pt.totalSteps ?? 1);
  }
  const journeyLengths = Object.values(orderJourneys);
  const avgJourneyLength = journeyLengths.length > 0
    ? journeyLengths.reduce((a, b) => a + b, 0) / journeyLengths.length
    : 0;
  const multiTouchOrders = journeyLengths.filter(n => n > 1).length;
  const totalTrackedOrders = journeyLengths.length;

  // ── Sample journeys (up to 5 multi-touch orders) ────────────────────────────
  const multiTouchOrderIds = Object.entries(orderJourneys)
    .filter(([, n]) => n > 1)
    .slice(0, 5)
    .map(([id]) => id);

  const sampleJourneys = multiTouchOrderIds.map(orderId => {
    const steps = pts
      .filter(pt => pt.orderId === orderId)
      .sort((a, b) => new Date(a.touchedAt).getTime() - new Date(b.touchedAt).getTime());
    return {
      orderId,
      revenue: steps[0]?.revenue ?? 0,
      currency: steps[0]?.currency ?? "USD",
      steps: steps.map(s => ({
        position: s.position,
        channel: s.channel,
        utmCampaign: s.utmCampaign,
        touchedAt: s.touchedAt ? new Date(s.touchedAt).toISOString().slice(0, 10) : null,
        creditLinear: s.creditLinear,
        creditTimeDecay: s.creditTimeDecay,
      })),
    };
  });

  const currency = pts[0]?.currency ?? "USD";

  // Totals (per model)
  const totalRevenue = {
    first_touch: channelRows.reduce((s, r) => s + r.revenueFirstTouch, 0),
    last_touch:  channelRows.reduce((s, r) => s + r.revenueLastTouch,  0),
    linear:      channelRows.reduce((s, r) => s + r.revenueLinear,     0),
    time_decay:  channelRows.reduce((s, r) => s + r.revenueTimeDecay,  0),
  };

  const hasJourneyData = pts.length > 0;

  return json({
    channelRows,
    sampleJourneys,
    totalRevenue,
    totalTrackedOrders,
    multiTouchOrders,
    avgJourneyLength,
    currency,
    days,
    hasJourneyData,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

const CHANNEL_COLORS: Record<string, string> = {
  "Meta Ads":        "#1877f2",
  "Google Ads":      "#ea4335",
  "TikTok Ads":      "#010101",
  "Microsoft Ads":   "#00a4ef",
  "Email":           "#f59e0b",
  "Organic Search":  "#10b981",
  "Organic Social":  "#8b5cf6",
  "Direct / Unknown": "#9ca3af",
};

function revenueForModel(row: any, model: Model): number {
  if (model === "first_touch") return row.revenueFirstTouch;
  if (model === "last_touch")  return row.revenueLastTouch;
  if (model === "linear")      return row.revenueLinear;
  return row.revenueTimeDecay;
}

function totalForModel(totals: Record<string, number>, model: Model): number {
  if (model === "first_touch") return totals.first_touch;
  if (model === "last_touch")  return totals.last_touch;
  if (model === "linear")      return totals.linear;
  return totals.time_decay;
}

// ─── Journey step pill ────────────────────────────────────────────────────────

function StepPill({ channel, credit, isLast }: { channel: string; credit: number; isLast: boolean }) {
  const color = CHANNEL_COLORS[channel] ?? "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        background: `${color}18`, border: `1.5px solid ${color}`,
        borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, color,
        whiteSpace: "nowrap",
      }}>
        {channel}
        {credit > 0 && credit < 1 && (
          <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 400, color: "#6b7280" }}>
            {(credit * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {!isLast && <span style={{ color: "#d1d5db", fontSize: 14 }}>→</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttributionPage() {
  const {
    channelRows, sampleJourneys, totalRevenue,
    totalTrackedOrders, multiTouchOrders, avgJourneyLength,
    currency, days, hasJourneyData,
  } = useLoaderData<typeof loader>();

  const [model, setModel] = useState<Model>("last_touch");
  const [windowDays, setWindowDays] = useState(String(days));

  const handleWindowChange = (val: string) => {
    setWindowDays(val);
    const u = new URL(window.location.href);
    u.searchParams.set("days", val);
    window.location.href = u.toString();
  };

  const modelNote: Record<Model, string> = {
    last_touch:  "100% credit goes to the last channel the customer touched before buying.",
    first_touch: "100% credit goes to the channel that first brought the customer in.",
    linear:      "Credit is split equally across every touchpoint in the journey.",
    time_decay:  "More credit is given to touchpoints closer to the purchase (half-life: 7 days).",
  };

  const totalRev = totalForModel(totalRevenue, model);

  // Sort by selected model
  const sorted = [...channelRows].sort((a, b) => revenueForModel(b, model) - revenueForModel(a, model));

  return (
    <Page
      title="Attribution"
      subtitle="Real multi-touch journey data from your pixel"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      primaryAction={{ content: "Export CSV", onAction: () => {} }}
    >
      <BlockStack gap="500">

        {/* Model + window */}
        <Card>
          <InlineStack gap="400" wrap blockAlign="end">
            <div style={{ minWidth: 220 }}>
              <Select
                label="Attribution model"
                options={[
                  { label: "Last touch", value: "last_touch" },
                  { label: "First touch", value: "first_touch" },
                  { label: "Linear (equal)", value: "linear" },
                  { label: "Time decay (7-day half-life)", value: "time_decay" },
                ]}
                value={model}
                onChange={v => setModel(v as Model)}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <Select
                label="Time window"
                options={[
                  { label: "7 days",  value: "7"  },
                  { label: "30 days", value: "30" },
                  { label: "90 days", value: "90" },
                ]}
                value={windowDays}
                onChange={handleWindowChange}
              />
            </div>
            <div style={{ flex: 1, paddingTop: 24 }}>
              <Text as="p" variant="bodySm" tone="subdued">{modelNote[model]}</Text>
            </div>
          </InlineStack>
        </Card>

        {/* No journey data yet */}
        {!hasJourneyData && (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">No journey data yet</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                The pixel is recording touchpoints as visitors browse your store. Journey data appears here once customers who were tracked by the pixel complete a purchase. This typically takes 1–3 days after installing the pixel.
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* Journey quality KPIs */}
        {hasJourneyData && (
          <Grid>
            {[
              { label: "Tracked orders",      value: String(totalTrackedOrders) },
              { label: "Multi-touch orders",  value: String(multiTouchOrders),
                sub: totalTrackedOrders > 0 ? `${Math.round((multiTouchOrders / totalTrackedOrders) * 100)}% of orders` : undefined },
              { label: "Avg touchpoints",     value: avgJourneyLength.toFixed(1) },
              { label: `Revenue (${model.replace("_", " ")})`, value: fmt(totalRev, currency) },
            ].map(kpi => (
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
        )}

        {/* Channel breakdown — changes meaningfully per model */}
        {hasJourneyData && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Revenue by channel</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Model: {model.replace("_", " ")}
                </Text>
              </InlineStack>

              {sorted.length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">No attributed orders in this period.</Text>
              ) : (
                <BlockStack gap="300">
                  {sorted.map(row => {
                    const rev = revenueForModel(row, model);
                    const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0;
                    const color = CHANNEL_COLORS[row.channel] ?? "#6b7280";

                    // Show how much this channel's share changes vs last-touch
                    const lastTouchRev = row.revenueLastTouch;
                    const diff = rev - lastTouchRev;
                    const diffPct = lastTouchRev > 0 ? (diff / lastTouchRev) * 100 : 0;
                    const showDiff = model !== "last_touch" && Math.abs(diffPct) >= 1;

                    return (
                      <div key={row.channel}>
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                            <Text as="p" variant="bodySm" fontWeight="semibold">{row.channel}</Text>
                            {showDiff && (
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 99,
                                background: diff > 0 ? "#ecfdf5" : "#fef2f2",
                                color: diff > 0 ? "#10b981" : "#ef4444",
                              }}>
                                {diff > 0 ? "+" : ""}{diffPct.toFixed(0)}% vs last-touch
                              </span>
                            )}
                          </InlineStack>
                          <InlineStack gap="400">
                            <Text as="p" variant="bodySm" tone="subdued">{row.orders} orders</Text>
                            <Text as="p" variant="bodySm" fontWeight="semibold">{fmt(rev, currency)}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{pct.toFixed(1)}%</Text>
                          </InlineStack>
                        </InlineStack>
                        <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, marginTop: 4 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Model comparison table — shows all 4 models side by side */}
        {hasJourneyData && channelRows.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Model comparison</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                See how each channel's attributed revenue changes across all four models. Large differences highlight channels that assist conversions (linear/decay) vs. those that close them (last-touch).
              </Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600 }}>Channel</th>
                      {(["Last touch", "First touch", "Linear", "Time decay"] as const).map(h => (
                        <th key={h} style={{ textAlign: "right", padding: "8px 12px", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((row, i) => {
                      const vals = [row.revenueLastTouch, row.revenueFirstTouch, row.revenueLinear, row.revenueTimeDecay];
                      const maxVal = Math.max(...vals);
                      return (
                        <tr key={row.channel} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <InlineStack gap="200" blockAlign="center">
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: CHANNEL_COLORS[row.channel] ?? "#6b7280", display: "inline-block" }} />
                              <Text as="span" variant="bodySm" fontWeight="semibold">{row.channel}</Text>
                            </InlineStack>
                          </td>
                          {vals.map((v, vi) => (
                            <td key={vi} style={{
                              padding: "10px 12px", textAlign: "right",
                              fontWeight: v === maxVal ? 700 : 400,
                              color: v === maxVal ? "#111827" : "#374151",
                            }}>
                              {fmt(v, currency)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f9fafb" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>Total</td>
                      {(["last_touch", "first_touch", "linear", "time_decay"] as const).map(m => (
                        <td key={m} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>
                          {fmt(totalForModel(totalRevenue, m), currency)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        )}

        {/* Sample customer journeys */}
        {sampleJourneys.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Sample customer journeys</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                These are real multi-touch journeys from your tracked customers — the channels they touched before purchasing.
              </Text>
              <BlockStack gap="300">
                {sampleJourneys.map((journey, ji) => (
                  <div key={journey.orderId} style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">Order #{ji + 1} · {fmt(journey.revenue, journey.currency)}</Text>
                      <Badge>{journey.steps.length} touchpoints</Badge>
                    </InlineStack>
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {journey.steps.map((step, si) => (
                        <StepPill
                          key={si}
                          channel={step.channel}
                          credit={model === "linear" ? step.creditLinear : step.creditTimeDecay}
                          isLast={si === journey.steps.length - 1}
                        />
                      ))}
                      <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 4 }}>→ 🛒 Purchase</span>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {journey.steps.map((step, si) => (
                        step.touchedAt && (
                          <span key={si} style={{ fontSize: 11, color: "#9ca3af" }}>
                            {step.position}. {step.channel}{step.utmCampaign ? ` (${step.utmCampaign})` : ""} · {step.touchedAt}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
