// app/routes/app.journey.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineStack, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);
  since90.setHours(0, 0, 0, 0);

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  since30.setHours(0, 0, 0, 0);

  const rows = await (db as any).purchaseTouchpoint.findMany({
    where: { shop, createdAt: { gte: since30 } },
    orderBy: [{ orderId: "asc" }, { position: "asc" }],
    take: 500,
    select: {
      orderId: true, position: true, totalSteps: true,
      channel: true, utmSource: true, utmMedium: true, utmCampaign: true,
      revenue: true, currency: true, touchedAt: true, createdAt: true,
    },
  });

  // Group by order
  const orderMap = new Map<string, any[]>();
  for (const r of rows) {
    if (!orderMap.has(r.orderId)) orderMap.set(r.orderId, []);
    orderMap.get(r.orderId)!.push(r);
  }

  // Normalize channel key
  function normCh(ch: string | null, src: string | null): string {
    const raw = (src || ch || "").toLowerCase().trim();
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

  const totalJourneys = orderMap.size;
  const multiTouchCount = Array.from(orderMap.values()).filter(s => s.length > 1).length;
  const totalRevenue = Array.from(orderMap.values()).reduce((s, steps) => s + Number(steps[steps.length - 1]?.revenue ?? 0), 0);
  const currency = rows[0]?.currency ?? "NOK";

  // Aggregate paths
  const pathMap = new Map<string, { count: number; revenue: number; channels: string[] }>();
  for (const [, steps] of orderMap) {
    const sorted = steps.sort((a: any, b: any) => a.position - b.position);
    const channels = sorted.map((s: any) => normCh(s.channel, s.utmSource));
    const key = channels.join(" → ");
    const ex = pathMap.get(key) || { count: 0, revenue: 0, channels };
    ex.count++;
    ex.revenue += Number(sorted[sorted.length - 1]?.revenue ?? 0);
    pathMap.set(key, ex);
  }
  const topPaths = Array.from(pathMap.entries())
    .map(([path, v]) => ({ path, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topPath = topPaths[0] ?? null;

  // Journey length distribution
  const len1 = Array.from(orderMap.values()).filter(s => s.length === 1).length;
  const len2 = Array.from(orderMap.values()).filter(s => s.length === 2).length;
  const len3plus = Array.from(orderMap.values()).filter(s => s.length >= 3).length;

  // Recent journeys table (top 5 by revenue)
  const recentJourneys = Array.from(orderMap.entries())
    .map(([orderId, steps]) => {
      const sorted = steps.sort((a: any, b: any) => a.position - b.position);
      const channels = sorted.map((s: any) => normCh(s.channel, s.utmSource));
      const revenue = Number(sorted[sorted.length - 1]?.revenue ?? 0);
      const firstTouched = sorted[0]?.touchedAt ? new Date(sorted[0].touchedAt) : null;
      const lastTouched = sorted[sorted.length - 1]?.touchedAt ? new Date(sorted[sorted.length - 1].touchedAt) : null;
      const diffMs = firstTouched && lastTouched ? lastTouched.getTime() - firstTouched.getTime() : 0;
      const diffHours = diffMs / 3600000;
      const timeToPurchase = sorted.length === 1
        ? "Same session"
        : diffHours < 1 ? "< 1 hour"
        : diffHours < 24 ? `${Math.round(diffHours)}h`
        : `${Math.round(diffHours / 24)}d`;

      return {
        orderId: String(orderId).split("/").pop() || orderId,
        channels,
        touchpoints: sorted.length,
        revenue,
        timeToPurchase,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Date range label
  const dateLabel = `${since30.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return json({
    totalJourneys, multiTouchCount, totalRevenue, currency,
    topPath, topPaths, len1, len2, len3plus,
    recentJourneys, dateLabel,
  });
}

// ─── Source config ────────────────────────────────────────────────────────────

const SOURCE_CFG: Record<string, { color: string; label: string; icon: string; textColor?: string }> = {
  direct:    { color: "#4B5563", label: "Direct visit", icon: "↗" },
  google:    { color: "#4285F4", label: "Google",       icon: "G" },
  meta:      { color: "#0866FF", label: "Meta",         icon: "M" },
  instagram: { color: "#C13584", label: "Instagram",    icon: "IG" },
  email:     { color: "#F59E0B", label: "Email",        icon: "✉" },
  tiktok:    { color: "#010101", label: "TikTok",       icon: "T" },
  snapchat:  { color: "#FFFC00", label: "Snapchat",     icon: "S", textColor: "#000" },
  bing:      { color: "#00A4EF", label: "Bing",         icon: "B" },
  yahoo:     { color: "#6001D2", label: "Yahoo",        icon: "Y" },
};

function fmt(v: number, currency = "NOK") {
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
  const r = 60;
  const circ = 2 * Math.PI * r;
  const cx = 80, cy = 80;

  // Segments: [value, color]
  const segments = [
    { value: len1, color: "#3B82F6" },
    { value: len2, color: "#22C55E" },
    { value: len3plus, color: "#F59E0B" },
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
        <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#6B7280">1 touchpoint</text>
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
  const { totalJourneys, multiTouchCount, totalRevenue, currency, topPath, topPaths, len1, len2, len3plus, recentJourneys, dateLabel } = data;

  const topPathLabel = topPath
    ? topPath.channels.map((ch: string) => SOURCE_CFG[ch]?.label || ch).join(" → ") + " → Purchase"
    : "—";

  const topPathShare = topPath && totalJourneys > 0
    ? Math.round((topPath.count / totalJourneys) * 100)
    : 0;

  return (
    <Page>
      <BlockStack gap="500">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <BlockStack gap="100">
            <Text as="h1" variant="headingXl" fontWeight="bold">Customer Journey</Text>
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
            <Button size="slim" icon={<span style={{ fontSize: 13 }}>⊞</span>}>Filters</Button>
          </InlineStack>
        </div>

        {/* ── Tracking status banner ─────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderRadius: 10,
          background: "#F0FDF4", border: "1px solid #BBF7D0", gap: 16,
        }}>
          <InlineStack gap="300" blockAlign="center">
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: "#16A34A",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 16, fontWeight: 800, flexShrink: 0,
            }}>✓</div>
            <BlockStack gap="025">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="headingSm" fontWeight="semibold">Tracking customer journeys</Text>
                <Badge tone="success">Active</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Journeys are being recorded. The more customers return through different channels, the more insights you'll see here.
              </Text>
            </BlockStack>
          </InlineStack>
          <Button size="slim" onClick={() => navigate("/app/settings")}>View tracking setup</Button>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {/* Tracked journeys */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Tracked journeys</Text>
                <span style={{ fontSize: 22 }}>👥</span>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">{totalJourneys}</Text>
              <Text as="p" variant="bodySm" tone="subdued">customer journeys captured</Text>
            </BlockStack>
          </Card>

          {/* Revenue mapped */}
          <Card>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="start">
                <Text as="p" variant="bodySm" tone="subdued">Revenue mapped</Text>
                <span style={{ fontSize: 22 }}>💰</span>
              </InlineStack>
              <Text as="p" variant="heading2xl" fontWeight="bold">{fmt(totalRevenue, currency)}</Text>
              <Text as="p" variant="bodySm" tone="subdued">from tracked journeys</Text>
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
              <Text as="p" variant="bodySm" tone="subdued">most common path</Text>
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
              <Text as="p" variant="bodySm" tone="subdued">returning visitors yet</Text>
            </BlockStack>
          </Card>
        </div>

        {/* ── Two-column middle section ─────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>

          {/* LEFT */}
          <BlockStack gap="400">

            {/* Most common path */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="025">
                  <Text as="h2" variant="headingMd">Most common path</Text>
                  <Text as="p" variant="bodySm" tone="subdued">This is the path most customers took before purchasing.</Text>
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
                        { label: "of recorded journeys", value: `${topPathShare}%` },
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
                        <Text as="p" variant="bodySm" fontWeight="semibold">Most purchases currently happen in a single visit.</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          When customers return from ads, email, Google, or social, those touchpoints will appear here.
                        </Text>
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
                      <Text as="h2" variant="headingMd">Recent order journeys</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Every touchpoint captured before each purchase, in order.</Text>
                    </BlockStack>
                    <Button size="slim" variant="plain" onClick={() => {}}>View all journeys</Button>
                  </InlineStack>

                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 90px 90px 110px", gap: 8, paddingBottom: 8, borderBottom: "1px solid #F0F0F0" }}>
                    {["Order", "Journey", "Touchpoints", "Revenue", "Time to purchase"].map(h => (
                      <Text key={h} as="p" variant="bodySm" tone="subdued" fontWeight="semibold">{h}</Text>
                    ))}
                  </div>

                  {/* Table rows */}
                  {recentJourneys.map((j, i) => (
                    <div key={j.orderId} style={{
                      display: "grid", gridTemplateColumns: "130px 1fr 90px 90px 110px",
                      gap: 8, alignItems: "center",
                      paddingBottom: i < recentJourneys.length - 1 ? 12 : 0,
                      borderBottom: i < recentJourneys.length - 1 ? "1px solid #F9F9F9" : "none",
                    }}>
                      <Text as="p" variant="bodySm" tone="subdued">#{j.orderId}</Text>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {j.channels.map((ch: string, ci: number) => (
                          <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <ChannelBox channel={ch} size={26} />
                            <Arrow size={14} />
                          </div>
                        ))}
                        <PurchaseBox size={26} />
                      </div>
                      <Text as="p" variant="bodySm">{j.touchpoints}</Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{fmt(j.revenue, currency)}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{j.timeToPurchase}</Text>
                    </div>
                  ))}

                  <Text as="p" variant="bodySm" tone="subdued">
                    Showing {recentJourneys.length} of {totalJourneys} journeys
                  </Text>
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
                  <Text as="p" variant="bodySm" tone="subdued">Distribution of journey lengths</Text>
                </BlockStack>

                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart len1={len1} len2={len2} len3plus={len3plus} total={totalJourneys} />
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
                            ({totalJourneys > 0 ? Math.round((item.value / totalJourneys) * 100) : 0}%)
                          </Text>
                        </InlineStack>
                      </div>
                    ))}
                  </BlockStack>
                </div>

                {multiTouchCount === 0 && (
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
                    Keep tracking active and connect more channels to unlock deeper insights.
                  </Text>

                  <Button onClick={() => navigate("/app/integrations/google")}>Connect Google Ads</Button>
                </BlockStack>
              </Card>
            )}

          </BlockStack>
        </div>

      </BlockStack>
    </Page>
  );
}
